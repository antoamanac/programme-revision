"use strict";

const { app, BrowserWindow, ipcMain, dialog, Menu, shell, nativeImage } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const net = require("net");
const http = require("http");

// ── Config ────────────────────────────────────────────────────────────────────
const configPath = path.join(app.getPath("userData"), "config.json");

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return {};
  }
}

function saveConfig(config) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function findFreePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function waitForServer(port, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      const req = http.get(`http://127.0.0.1:${port}/api/auth/me`, (res) => {
        resolve();
      });
      req.on("error", () => {
        if (Date.now() > deadline) {
          reject(new Error("Le serveur n'a pas démarré dans le délai imparti."));
        } else {
          setTimeout(check, 500);
        }
      });
      req.setTimeout(500, () => req.destroy());
      req.end();
    };
    setTimeout(check, 1000);
  });
}

function getAppRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath)
    : path.join(__dirname, "..");
}

// ── Windows ───────────────────────────────────────────────────────────────────
let mainWindow = null;
let setupWindow = null;
let loadingWindow = null;
let serverProcess = null;
let serverPort = null;

function createLoadingWindow() {
  loadingWindow = new BrowserWindow({
    width: 420,
    height: 320,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    webPreferences: { contextIsolation: true },
  });
  loadingWindow.loadFile(path.join(__dirname, "loading.html"));
}

function createSetupWindow() {
  setupWindow = new BrowserWindow({
    width: 560,
    height: 500,
    resizable: false,
    title: "Configuration – Programme de Révision",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  setupWindow.loadFile(path.join(__dirname, "setup.html"));
  setupWindow.setMenu(null);
}

function createMainWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "Programme de Révision",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.once("ready-to-show", () => {
    if (loadingWindow && !loadingWindow.isDestroyed()) loadingWindow.close();
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Open external links in the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  buildMenu(port);
}

function buildMenu(port) {
  const template = [
    {
      label: "Application",
      submenu: [
        {
          label: "Paramètres de base de données…",
          click: () => openSettings(),
        },
        { type: "separator" },
        {
          label: "Quitter",
          accelerator: process.platform === "darwin" ? "Cmd+Q" : "Alt+F4",
          click: () => app.quit(),
        },
      ],
    },
    {
      label: "Affichage",
      submenu: [
        { label: "Recharger", accelerator: "CmdOrCtrl+R", role: "reload" },
        { label: "Plein écran", accelerator: "F11", role: "togglefullscreen" },
        { type: "separator" },
        { label: "Zoom +", accelerator: "CmdOrCtrl+=", role: "zoomIn" },
        { label: "Zoom -", accelerator: "CmdOrCtrl+-", role: "zoomOut" },
        { label: "Taille réelle", accelerator: "CmdOrCtrl+0", role: "resetZoom" },
      ],
    },
    {
      label: "Aide",
      submenu: [
        {
          label: "Fichier de configuration",
          click: () => shell.showItemInFolder(configPath),
        },
        {
          label: "Dossier de données",
          click: () => shell.openPath(app.getPath("userData")),
        },
        { type: "separator" },
        {
          label: `Version ${app.getVersion()}`,
          enabled: false,
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function openSettings() {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.focus();
    return;
  }
  createSetupWindow();
}

// ── IPC handlers ──────────────────────────────────────────────────────────────
ipcMain.handle("get-config", () => loadConfig());

ipcMain.handle("save-config", (event, newConfig) => {
  saveConfig(newConfig);
  dialog.showMessageBox({
    type: "info",
    title: "Configuration sauvegardée",
    message: "Les paramètres ont été enregistrés. Redémarrez l'application pour les appliquer.",
    buttons: ["OK"],
  });
  if (setupWindow && !setupWindow.isDestroyed()) setupWindow.close();
});

ipcMain.handle("get-version", () => app.getVersion());

ipcMain.handle("get-config-path", () => configPath);

// ── Boot sequence ─────────────────────────────────────────────────────────────
async function startApp() {
  const config = loadConfig();

  // First-run: no DATABASE_URL configured and not in env
  const dbUrl = config.databaseUrl || process.env.DATABASE_URL;
  if (!dbUrl) {
    createSetupWindow();
    return;
  }

  createLoadingWindow();

  serverPort = await findFreePort();
  const appRoot = getAppRoot();
  const serverEntry = path.join(appRoot, "dist", "index.cjs");

  if (!fs.existsSync(serverEntry)) {
    dialog.showErrorBox(
      "Fichiers manquants",
      `Le fichier serveur est introuvable : ${serverEntry}\n\nAssurez-vous d'avoir lancé 'npm run build' avant de packager l'application.`
    );
    app.quit();
    return;
  }

  // Mirror uploads folder from resources to writable userData
  const srcUploads = path.join(appRoot, "uploads");
  const dstUploads = path.join(app.getPath("userData"), "uploads");
  if (!fs.existsSync(dstUploads)) {
    fs.mkdirSync(dstUploads, { recursive: true });
  }

  serverProcess = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(serverPort),
      DATABASE_URL: dbUrl,
      SESSION_SECRET: config.sessionSecret || "desktop-app-secret-change-me",
      UPLOAD_DIR: dstUploads,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverProcess.stdout.on("data", (d) => console.log("[server]", d.toString().trim()));
  serverProcess.stderr.on("data", (d) => console.error("[server]", d.toString().trim()));

  serverProcess.on("exit", (code) => {
    if (code !== 0 && mainWindow) {
      dialog.showErrorBox(
        "Erreur serveur",
        `Le serveur s'est arrêté de manière inattendue (code ${code}).\nConsultez la console pour plus de détails.`
      );
    }
  });

  try {
    await waitForServer(serverPort);
  } catch (err) {
    if (loadingWindow && !loadingWindow.isDestroyed()) loadingWindow.close();
    dialog.showErrorBox(
      "Démarrage impossible",
      `Impossible de démarrer le serveur.\n\n${err.message}\n\nVérifiez votre connexion à la base de données dans Paramètres.`
    );
    createSetupWindow();
    return;
  }

  createMainWindow(serverPort);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
app.whenReady().then(startApp);

app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill("SIGTERM");
    serverProcess = null;
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (serverProcess) serverProcess.kill("SIGTERM");
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) startApp();
});

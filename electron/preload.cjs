"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getConfig: () => ipcRenderer.invoke("get-config"),
  saveConfig: (config) => ipcRenderer.invoke("save-config", config),
  getVersion: () => ipcRenderer.invoke("get-version"),
  getConfigPath: () => ipcRenderer.invoke("get-config-path"),
});

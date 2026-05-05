# Construire l'application desktop (.exe / .dmg / AppImage)

## Ce que ça produit

| Plateforme | Fichier de sortie | Description |
|---|---|---|
| **Windows** | `Programme-de-Revision-Setup-1.0.0.exe` | Installeur Windows (NSIS) |
| **macOS** | `Programme-de-Revision-1.0.0.dmg` | Image disque macOS |
| **Linux** | `Programme-de-Revision-1.0.0.AppImage` | AppImage portable |

---

## Pré-requis

- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **Git** (pour cloner le projet)
- **PostgreSQL** accessible depuis la machine cible (ou hébergé en cloud : Supabase, Neon, Railway…)

> Pour builder le `.exe` sur **Linux/macOS**, installez [Wine](https://www.winehq.org/) et
> `npm install -g electron-builder` installera automatiquement les dépendances NSIS.

---

## Étapes

### 1. Cloner et installer

```bash
git clone <url-du-repo>
cd <dossier>
npm install
```

### 2. Builder l'application web

```bash
npm run build
# Génère : dist/index.cjs + dist/public/
```

### 3. Installer les dépendances Electron

```bash
cd electron
npm install
```

### 4. Construire le package

```bash
# Windows (.exe)
npm run dist

# macOS (.dmg)
npm run dist:mac

# Linux (.AppImage)
npm run dist:linux

# Toutes les plateformes à la fois
npm run dist:all
```

Les fichiers générés se trouvent dans `electron/release/`.

---

## Première utilisation

Au premier lancement, l'application affiche une fenêtre de **configuration** :

1. Entrez l'**URL de connexion PostgreSQL** :  
   `postgresql://utilisateur:motdepasse@hote:5432/nom_base`

2. (Optionnel) Entrez une clé secrète de session.

3. Cliquez **Enregistrer et démarrer**.

La configuration est sauvegardée dans le dossier utilisateur :
- **Windows** : `%APPDATA%\programme-revision-desktop\config.json`
- **macOS** : `~/Library/Application Support/programme-revision-desktop/config.json`
- **Linux** : `~/.config/programme-revision-desktop/config.json`

---

## Icônes (recommandé)

Placez vos icônes dans `electron/build/` :

| Fichier | Format | Taille | Pour |
|---|---|---|---|
| `icon.ico` | ICO multi-taille | 256×256+ | Windows |
| `icon.icns` | ICNS | 512×512 | macOS |
| `icon.png` | PNG | 512×512 | Linux |

> Si les icônes sont absentes, electron-builder utilise l'icône Electron par défaut.

---

## Export PDF (fonctionnalité Puppeteer)

La fonctionnalité d'export PDF utilise Puppeteer (Chrome headless). En mode desktop packagé, cette fonctionnalité nécessite que Chrome soit installé sur la machine.

Pour l'activer dans le package final, ajoutez à `electron/package.json` dans `extraResources` :
```json
{ "from": "../node_modules/puppeteer", "to": "node_modules/puppeteer" }
```

---

## Dépannage

| Problème | Solution |
|---|---|
| "Fichiers manquants" au démarrage | Relancer `npm run build` depuis la racine |
| Connexion DB refusée | Vérifier que PostgreSQL est accessible + URL correcte |
| Fenêtre blanche | Ouvrir DevTools (Ctrl+Shift+I) et inspecter les erreurs |
| `.exe` non signé | Windows affiche un avertissement SmartScreen — cliquer "Plus d'infos" → "Exécuter quand même" |

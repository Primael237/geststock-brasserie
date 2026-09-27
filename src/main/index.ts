// ============================================================
// GestStock Brasserie v1.0 — Main Process Entry
// ============================================================

import { app, BrowserWindow } from 'electron';
import path from 'path';
import { initDatabase } from './database';
import { isFirstRun, createSuperAdmin } from './auth';
import { registerIpcHandlers } from './ipc-handlers';

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

const isDev = !app.isPackaged;
const INITIAL_SUPERADMIN_PASSWORD = 'Admin@2024';

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'GestStock Brasserie v1.0',
    icon: path.join(__dirname, '../../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    autoHideMenuBar: true,
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Initialiser la base de données (async avec sql.js)
  await initDatabase();

  // Premier lancement : créer le Super Admin
  if (isFirstRun()) {
    console.log('Premier lancement détecté — Création du Super Admin...');
    createSuperAdmin(INITIAL_SUPERADMIN_PASSWORD);
    console.log('Super Admin créé : superadmin /', INITIAL_SUPERADMIN_PASSWORD);
  }

  // Enregistrer les handlers IPC
  registerIpcHandlers(getMainWindow);

  // Créer la fenêtre
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
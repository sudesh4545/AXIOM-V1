const { app, BrowserWindow, shell, session } = require('electron');
const path = require('node:path');

const APP_URL = 'https://axiom-v1.sudeshmehar3.workers.dev/';
const APP_ORIGIN = new URL(APP_URL).origin;
const AUTH_HOSTS = new Set(['axiom-v1.firebaseapp.com', 'accounts.google.com', 'github.com']);

function appIcon() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'brand', 'axiom-icon.png')
    : path.join(__dirname, '..', '..', 'web', 'public', 'brand', 'axiom-core-mark-v1-256.png');
}

function safeHttps(rawUrl) {
  try { return new URL(rawUrl).protocol === 'https:'; } catch { return false; }
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    title: 'AXIOM V1',
    width: 1500,
    height: 940,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#020711',
    icon: appIcon(),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    try {
      if (new URL(targetUrl).origin === APP_ORIGIN) return;
    } catch {}
    event.preventDefault();
    if (safeHttps(targetUrl)) void shell.openExternal(targetUrl);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url);
      if (target.protocol === 'https:' && AUTH_HOSTS.has(target.hostname)) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            parent: mainWindow,
            autoHideMenuBar: true,
            webPreferences: {
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true,
              webSecurity: true
            }
          }
        };
      }
    } catch {}
    if (safeHttps(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  void mainWindow.loadURL(APP_URL);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    createMainWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });
}

app.on('certificate-error', (event, _contents, _url, _error, _certificate, callback) => {
  event.preventDefault();
  callback(false);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

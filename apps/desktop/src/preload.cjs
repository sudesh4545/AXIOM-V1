const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('axiomDesktop', Object.freeze({
  isDesktopApp: true,
  platform: process.platform
}));

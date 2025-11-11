const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { createDataService } = require('./backend/services/dataService');
const { createHologramBridge } = require('./hologram/hologramBridge');

const store = new Store({
  name: 'sun3d-pro',
  defaults: {
    window: {
      width: 280,
      height: 280,
      alwaysOnTop: true,
      frameRate: 30,
      fov: 45,
      quality: 'balanced'
    },
    rendering: {
      source: 'auto',
      band: 'auto',
      view: 'norm',
      side: 'near'
    },
    hologram: {
      preset: 'off',
      streaming: false,
      webrtc: false
    }
  }
});

let mainWindow;
let dataService;
let hologramBridge;

app.commandLine.appendSwitch('enable-transparent-visuals');

async function createWindow() {
  const windowConfig = store.get('window');

  mainWindow = new BrowserWindow({
    width: windowConfig.width,
    height: windowConfig.height,
    minWidth: 220,
    minHeight: 220,
    maxWidth: 640,
    maxHeight: 640,
    frame: false,
    transparent: true,
    alwaysOnTop: windowConfig.alwaysOnTop,
    resizable: true,
    hasShadow: false,
    show: false,
    roundedCorners: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      sandbox: false,
      backgroundThrottling: false,
      webSecurity: true
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  await ensureDataService();

  mainWindow.loadFile(path.join(__dirname, 'app/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function ensureDataService() {
  if (dataService) {
    return dataService;
  }
  dataService = await createDataService({
    cacheTtlMs: 5 * 60 * 1000,
    logger: createLogger('DataService')
  });
  hologramBridge = createHologramBridge({
    logger: createLogger('HologramBridge'),
    dataService
  });
  return dataService;
}

function createLogger(scope) {
  return {
    info: (...args) => console.log(`[${scope}]`, ...args),
    warn: (...args) => console.warn(`[${scope}]`, ...args),
    error: (...args) => console.error(`[${scope}]`, ...args)
  };
}

app.whenReady().then(async () => {
  await createWindow();

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

ipcMain.handle('sun:data:get-base-url', async () => {
  const service = await ensureDataService();
  return service.getBaseUrl();
});

ipcMain.handle('sun:data:snapshot', async () => {
  const service = await ensureDataService();
  return service.getSnapshot();
});

ipcMain.handle('sun:data:alerts', async () => {
  const service = await ensureDataService();
  return service.getAlerts();
});

ipcMain.handle('sun:data:cme', async () => {
  const service = await ensureDataService();
  return service.getCme();
});

ipcMain.handle('sun:data:planets', async () => {
  const service = await ensureDataService();
  return service.getPlanets();
});

ipcMain.handle('sun:data:markers', async () => {
  const service = await ensureDataService();
  return service.getMarkers();
});

ipcMain.handle('sun:control:setSource', async (_event, mode) => {
  store.set('rendering.source', mode);
  hologramBridge?.setSource?.(mode);
  return { success: true };
});

ipcMain.handle('sun:control:setBand', async (_event, band) => {
  store.set('rendering.band', band);
  hologramBridge?.setBand?.(band);
  return { success: true };
});

ipcMain.handle('sun:control:setView', async (_event, view) => {
  store.set('rendering.view', view);
  return { success: true };
});

ipcMain.handle('sun:control:setSide', async (_event, side) => {
  store.set('rendering.side', side);
  return { success: true };
});

ipcMain.handle('sun:hologram:setPreset', async (_event, preset) => {
  store.set('hologram.preset', preset);
  hologramBridge?.setPreset?.(preset);
  return { success: true };
});

ipcMain.handle('sun:hologram:setStreaming', async (_event, enabled) => {
  store.set('hologram.streaming', Boolean(enabled));
  hologramBridge?.toggleStreaming?.(Boolean(enabled));
  return { success: true };
});

ipcMain.handle('sun:hologram:setWebRTC', async (_event, enabled) => {
  store.set('hologram.webrtc', Boolean(enabled));
  hologramBridge?.toggleWebRTC?.(Boolean(enabled));
  return { success: true };
});

ipcMain.handle('sun:config:get', () => {
  return store.store;
});

ipcMain.handle('sun:config:apply', async (_event, incomingConfig = {}) => {
  const currentWindowConfig = store.get('window');
  const nextWindowConfig = {
    ...currentWindowConfig,
    ...incomingConfig.window
  };
  store.set('window', nextWindowConfig);

  if (mainWindow) {
    if (incomingConfig.window?.width && incomingConfig.window?.height) {
      mainWindow.setSize(
        Math.max(220, Math.min(640, Math.round(incomingConfig.window.width))),
        Math.max(220, Math.min(640, Math.round(incomingConfig.window.height)))
      );
    }
    if (typeof incomingConfig.window?.alwaysOnTop === 'boolean') {
      mainWindow.setAlwaysOnTop(incomingConfig.window.alwaysOnTop, 'screen-saver');
    }
  }

  if (incomingConfig.rendering) {
    store.set('rendering', { ...store.get('rendering'), ...incomingConfig.rendering });
  }

  if (incomingConfig.hologram) {
    store.set('hologram', { ...store.get('hologram'), ...incomingConfig.hologram });
    if (typeof incomingConfig.hologram.streaming === 'boolean') {
      hologramBridge?.toggleStreaming?.(incomingConfig.hologram.streaming);
    }
    if (typeof incomingConfig.hologram.webrtc === 'boolean') {
      hologramBridge?.toggleWebRTC?.(incomingConfig.hologram.webrtc);
    }
    if (incomingConfig.hologram.preset) {
      hologramBridge?.setPreset?.(incomingConfig.hologram.preset);
    }
  }

  return { success: true };
});

app.on('before-quit', () => {
  hologramBridge?.dispose?.();
  dataService?.dispose?.();
});

const { contextBridge, ipcRenderer } = require('electron');

function invoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload).catch((error) => {
    console.error(`[preload] invoke failed for ${channel}`, error);
    return null;
  });
}

contextBridge.exposeInMainWorld('sunAPI', {
  getBaseUrl: () => invoke('sun:data:get-base-url'),
  getSnapshot: () => invoke('sun:data:snapshot'),
  getAlerts: () => invoke('sun:data:alerts'),
  getCMEWarnings: () => invoke('sun:data:cme'),
  getPlanets: () => invoke('sun:data:planets'),
  getMarkers: () => invoke('sun:data:markers'),
  setSource: (mode) => invoke('sun:control:setSource', mode),
  setBand: (band) => invoke('sun:control:setBand', band),
  setViewMode: (view) => invoke('sun:control:setView', view),
  setSide: (side) => invoke('sun:control:setSide', side),
  setHologramPreset: (preset) => invoke('sun:hologram:setPreset', preset),
  setHoloStreaming: (enabled) => invoke('sun:hologram:setStreaming', enabled),
  toggleWebRTC: (enabled) => invoke('sun:hologram:setWebRTC', enabled),
  applyConfig: (config) => invoke('sun:config:apply', config),
  getConfig: () => invoke('sun:config:get')
});

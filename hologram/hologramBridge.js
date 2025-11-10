const { wait } = require('../backend/utils/net');

function createHologramBridge({ logger = console, dataService }) {
  let streaming = false;
  let webrtc = false;
  let preset = 'off';
  let pumpHandle;

  async function pumpFrames() {
    logger.info?.('Hologram pump started');
    while (streaming) {
      try {
        const snapshot = await dataService.getSnapshot();
        logger.info?.('Hologram frame ready', {
          preset,
          pulse: snapshot?.pulse,
          markers: snapshot?.markers?.length || 0
        });
        // Placeholder for future WebRTC / network distribution hook.
      } catch (error) {
        logger.warn?.('Hologram frame generation failed', error);
      }
      await wait(1500);
    }
    logger.info?.('Hologram pump stopped');
  }

  function ensurePump() {
    if (streaming && !pumpHandle) {
      pumpHandle = pumpFrames().finally(() => {
        pumpHandle = null;
      });
    }
  }

  return {
    setSource: (mode) => {
      logger.info?.(`Hologram source mode -> ${mode}`);
    },
    setBand: (band) => {
      logger.info?.(`Hologram spectral band -> ${band}`);
    },
    setPreset: (nextPreset) => {
      preset = nextPreset;
      logger.info?.(`Hologram preset -> ${preset}`);
    },
    toggleStreaming: (enabled) => {
      streaming = Boolean(enabled);
      logger.info?.(`Hologram streaming ${streaming ? 'enabled' : 'disabled'}`);
      if (streaming) {
        ensurePump();
      }
    },
    toggleWebRTC: (enabled) => {
      webrtc = Boolean(enabled);
      logger.info?.(`Hologram WebRTC ${webrtc ? 'enabled' : 'disabled'}`);
    },
    dispose: () => {
      streaming = false;
    }
  };
}

module.exports = { createHologramBridge };

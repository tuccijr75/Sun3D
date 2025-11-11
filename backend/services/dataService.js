const http = require('http');
const { URL } = require('url');
const { createCache } = require('../utils/cache');
const { createSolarSources } = require('./solarSources');

async function createDataService({ cacheTtlMs = 300000, logger = console } = {}) {
  const cache = createCache(cacheTtlMs);
  const sources = createSolarSources({ logger });

  const server = http.createServer(async (req, res) => {
    const sendJson = (statusCode, payload) => {
      res.statusCode = statusCode;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(payload));
    };

    if (!req || !req.url) {
      sendJson(400, { error: 'bad_request' });
      return;
    }

    const parsedUrl = new URL(req.url, 'http://127.0.0.1');

    if (req.method !== 'GET') {
      sendJson(405, { error: 'method_not_allowed' });
      return;
    }

    try {
      switch (parsedUrl.pathname) {
        case '/health': {
          sendJson(200, { status: 'ok', generatedAt: Date.now() });
          break;
        }
        case '/snapshot': {
          const snapshot = await cache.wrap('snapshot', () => sources.fetchSnapshot());
          sendJson(200, snapshot);
          break;
        }
        case '/alerts': {
          const alerts = await cache.wrap('alerts', () => sources.fetchAlerts(), 120000);
          sendJson(200, alerts);
          break;
        }
        case '/cme': {
          const cme = await cache.wrap('cme', () => sources.fetchCme(), 120000);
          sendJson(200, cme);
          break;
        }
        case '/planets': {
          const planets = await cache.wrap('planets', () => sources.fetchPlanets(), 900000);
          sendJson(200, planets);
          break;
        }
        case '/markers': {
          const markers = await cache.wrap('markers', () => sources.fetchMarkers(), 300000);
          sendJson(200, markers);
          break;
        }
        default: {
          sendJson(404, { error: 'not_found' });
        }
      }
    } catch (error) {
      logger.error?.('Data service request failure', error);
      sendJson(500, { error: 'internal_error' });
    }
  });

  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', (err) => {
      if (err) {
        reject(err);
      } else {
        const address = server.address();
        logger.info?.(`Data service listening on port ${address.port}`);
        resolve();
      }
    });
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    getBaseUrl: () => baseUrl,
    getSnapshot: () => sources.fetchSnapshot(),
    getAlerts: () => sources.fetchAlerts(),
    getCme: () => sources.fetchCme(),
    getPlanets: () => sources.fetchPlanets(),
    getMarkers: () => sources.fetchMarkers(),
    dispose: () => {
      server.close();
      cache.clear();
    }
  };
}

module.exports = { createDataService };

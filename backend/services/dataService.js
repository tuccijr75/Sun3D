const express = require('express');
const http = require('http');
const { createCache } = require('../utils/cache');
const { createSolarSources } = require('./solarSources');

async function createDataService({ cacheTtlMs = 300000, logger = console } = {}) {
  const app = express();
  const cache = createCache(cacheTtlMs);
  const sources = createSolarSources({ logger });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', generatedAt: Date.now() });
  });

  app.get('/snapshot', async (_req, res) => {
    try {
      const snapshot = await cache.wrap('snapshot', () => sources.fetchSnapshot());
      res.json(snapshot);
    } catch (error) {
      logger.error?.('Snapshot endpoint failure', error);
      res.status(500).json({ error: 'snapshot_unavailable' });
    }
  });

  app.get('/alerts', async (_req, res) => {
    try {
      const alerts = await cache.wrap('alerts', () => sources.fetchAlerts(), 120000);
      res.json(alerts);
    } catch (error) {
      logger.error?.('Alerts endpoint failure', error);
      res.status(500).json({ error: 'alerts_unavailable' });
    }
  });

  app.get('/cme', async (_req, res) => {
    try {
      const cme = await cache.wrap('cme', () => sources.fetchCme(), 120000);
      res.json(cme);
    } catch (error) {
      logger.error?.('CME endpoint failure', error);
      res.status(500).json({ error: 'cme_unavailable' });
    }
  });

  app.get('/planets', async (_req, res) => {
    try {
      const planets = await cache.wrap('planets', () => sources.fetchPlanets(), 900000);
      res.json(planets);
    } catch (error) {
      logger.error?.('Planets endpoint failure', error);
      res.status(500).json({ error: 'planets_unavailable' });
    }
  });

  app.get('/markers', async (_req, res) => {
    try {
      const markers = await cache.wrap('markers', () => sources.fetchMarkers(), 300000);
      res.json(markers);
    } catch (error) {
      logger.error?.('Markers endpoint failure', error);
      res.status(500).json({ error: 'markers_unavailable' });
    }
  });

  app.use((err, _req, res, _next) => {
    logger.error?.('Unhandled data service error', err);
    res.status(500).json({ error: 'internal_error' });
  });

  const server = http.createServer(app);
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

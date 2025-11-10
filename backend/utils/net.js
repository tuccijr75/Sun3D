const { setTimeout: sleep } = require('timers/promises');

async function fetchWithTimeout(url, { timeoutMs = 8000, logger, ...options } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } catch (error) {
    if (logger) {
      logger.warn?.(`Fetch failed for ${url}: ${error.message}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function tryJson(url, { logger, timeoutMs, transform } = {}) {
  try {
    const res = await fetchWithTimeout(url, { timeoutMs, logger });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json = await res.json();
    return transform ? transform(json) : json;
  } catch (error) {
    if (logger) {
      logger.warn?.(`JSON fetch fallback triggered for ${url}: ${error.message}`);
    }
    return null;
  }
}

async function tryText(url, { logger, timeoutMs } = {}) {
  try {
    const res = await fetchWithTimeout(url, { timeoutMs, logger });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.text();
  } catch (error) {
    if (logger) {
      logger.warn?.(`Text fetch fallback triggered for ${url}: ${error.message}`);
    }
    return null;
  }
}

async function tryCsv(url, { logger, timeoutMs } = {}) {
  const text = await tryText(url, { logger, timeoutMs });
  if (!text) {
    return null;
  }
  const rows = text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(','));
  return rows;
}

async function wait(ms) {
  await sleep(ms);
}

module.exports = {
  fetchWithTimeout,
  tryJson,
  tryText,
  tryCsv,
  wait
};

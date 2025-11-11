function createCache(defaultTtlMs = 300000) {
  const store = new Map();

  function set(key, value, ttlMs = defaultTtlMs) {
    const expiresAt = Date.now() + ttlMs;
    store.set(key, { value, expiresAt });
  }

  function get(key) {
    const entry = store.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt < Date.now()) {
      store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  async function wrap(key, fn, ttlMs = defaultTtlMs) {
    const cached = get(key);
    if (cached !== undefined) {
      return cached;
    }
    const result = await fn();
    set(key, result, ttlMs);
    return result;
  }

  function clear() {
    store.clear();
  }

  return { set, get, wrap, clear };
}

module.exports = { createCache };

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function resolveStorePath(name, logger) {
  const filename = `${name || 'config'}.json`;
  const fallbacks = [];

  try {
    const userDataDir = app.getPath('userData');
    if (userDataDir) {
      fallbacks.push(path.join(userDataDir, filename));
    }
  } catch (error) {
    logger?.warn?.('Failed to resolve userData path, will fallback to local storage.', error);
  }

  fallbacks.push(path.join(process.cwd(), 'user-data', filename));

  for (const candidate of fallbacks) {
    try {
      fs.mkdirSync(path.dirname(candidate), { recursive: true });
      return candidate;
    } catch (error) {
      logger?.warn?.('Unable to prepare store directory', candidate, error);
    }
  }

  throw new Error('Unable to determine persistent store location.');
}

function getNested(source, key) {
  if (!key) {
    return source;
  }
  return key.split('.').reduce((acc, part) => {
    if (acc && Object.prototype.hasOwnProperty.call(acc, part)) {
      return acc[part];
    }
    return undefined;
  }, source);
}

function setNested(target, key, value) {
  if (!key) {
    return;
  }
  const parts = key.split('.');
  let cursor = target;

  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (typeof cursor[part] !== 'object' || cursor[part] === null) {
      cursor[part] = {};
    }
    cursor = cursor[part];
  }

  cursor[parts[parts.length - 1]] = value;
}

class PersistentStore {
  constructor({ name = 'config', defaults = {}, logger } = {}) {
    this.name = name;
    this.logger = logger;
    this.defaults = clone(defaults);
    this.data = clone(defaults);
    this.filePath = resolveStorePath(this.name, this.logger);
    this.loadFromDisk();
  }

  loadFromDisk() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        if (raw) {
          const parsed = JSON.parse(raw);
          this.data = { ...clone(this.defaults), ...parsed };
        }
      }
    } catch (error) {
      this.logger?.warn?.('Failed to load store from disk, using defaults.', error);
      this.data = clone(this.defaults);
    }
  }

  persist() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (error) {
      this.logger?.warn?.('Failed to persist store to disk.', error);
    }
  }

  get(key) {
    const value = getNested(this.data, key);
    if (typeof value === 'undefined') {
      return getNested(this.defaults, key);
    }
    return value;
  }

  set(key, value) {
    setNested(this.data, key, value);
    this.persist();
  }

  get store() {
    return this.data;
  }
}

module.exports = PersistentStore;

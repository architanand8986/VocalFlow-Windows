/**
 * Lightweight settings store backed by a JSON file in the Electron user-data folder.
 * No external dependencies — uses only Node.js built-ins.
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

class Store {
  /**
   * @param {string} name - Filename without extension (default: "settings")
   * @param {object} defaults - Default values for all keys
   */
  constructor(name = 'settings', defaults = {}) {
    this._path = path.join(app.getPath('userData'), `${name}.json`);
    this._defaults = defaults;
    this._data = this._load();
  }

  get(key) {
    return this._data[key] !== undefined ? this._data[key] : this._defaults[key];
  }

  set(key, value) {
    this._data[key] = value;
    this._save();
  }

  setAll(obj) {
    Object.assign(this._data, obj);
    this._save();
  }

  getAll() {
    return { ...this._defaults, ...this._data };
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(this._path, 'utf8'));
    } catch {
      return {};
    }
  }

  _save() {
    try {
      fs.writeFileSync(this._path, JSON.stringify(this._data, null, 2), 'utf8');
    } catch (err) {
      console.error('[Store] Failed to save settings:', err.message);
    }
  }
}

module.exports = Store;

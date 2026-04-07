/**
 * Global hotkey manager using Electron's built-in globalShortcut.
 * Toggle mode: press once to START recording, press again to STOP.
 */

const { globalShortcut } = require('electron');

class HotkeyManager {
  constructor(onToggle) {
    this._onToggle = onToggle;
    this._currentShortcut = null;
  }

  /**
   * Register a global shortcut.
   * @param {string} accelerator - Electron accelerator string, e.g. 'Ctrl+Shift+Space'
   * @returns {boolean} true if registration succeeded
   */
  register(accelerator) {
    this.unregister();

    if (!accelerator) return false;

    const ok = globalShortcut.register(accelerator, () => {
      this._onToggle();
    });

    if (ok) {
      this._currentShortcut = accelerator;
      console.log(`[Hotkey] Registered: ${accelerator}`);
    } else {
      console.warn(`[Hotkey] Failed to register: ${accelerator} (may be in use by another app)`);
    }

    return ok;
  }

  unregister() {
    if (this._currentShortcut) {
      globalShortcut.unregister(this._currentShortcut);
      this._currentShortcut = null;
    }
  }

  unregisterAll() {
    globalShortcut.unregisterAll();
    this._currentShortcut = null;
  }

  get current() {
    return this._currentShortcut;
  }
}

module.exports = HotkeyManager;

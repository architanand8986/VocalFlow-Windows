/**
 * Preload script — runs in renderer context with Node.js access.
 * Exposes a minimal, safe IPC bridge via contextBridge.
 * All renderer files use window.api.* instead of ipcRenderer directly.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  /** Send a one-way message to the main process */
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),

  /** Send a message and await a reply (returns Promise) */
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),

  /** Listen for a message from the main process */
  on: (channel, listener) => {
    const wrapped = (event, ...args) => listener(...args);
    ipcRenderer.on(channel, wrapped);
    // Return a cleanup function
    return () => ipcRenderer.removeListener(channel, wrapped);
  },

  /** Listen exactly once */
  once: (channel, listener) => {
    ipcRenderer.once(channel, (event, ...args) => listener(...args));
  },

  /** Remove all listeners for a channel */
  off: (channel) => ipcRenderer.removeAllListeners(channel),

  /** Forward a log message to the main-process terminal */
  log: (...args) => ipcRenderer.send('worker-log', ...args),
});

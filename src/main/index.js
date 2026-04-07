/**
 * VocalFlow Windows — Main Process
 *
 * Responsibilities:
 *  - Create and manage all BrowserWindows (worker, settings, overlay)
 *  - System tray icon with context menu
 *  - Global hotkey (toggle recording)
 *  - Route IPC messages between windows
 *  - Text injection after transcription
 */

const {
  app, BrowserWindow, ipcMain, Tray, Menu, shell, session, nativeImage,
} = require('electron');
const path = require('path');

const Store = require('./store');
const HotkeyManager = require('./hotkeyManager');
const { injectText } = require('./textInjector');
const { ICONS } = require('./icons');
const config = require('../config');

// ─── App state ───────────────────────────────────────────────────────────────

let workerWin = null;
let settingsWin = null;
let overlayWin = null;
let tray = null;
let store = null;
let hotkey = null;
let recordingState = 'idle'; // idle | recording | transcribing | error

// ─── Initialization ──────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Suppress Electron's default menu
  Menu.setApplicationMenu(null);

  store = new Store('settings', buildDefaults());

  // Grant microphone permission to renderer windows automatically
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    callback(permission === 'media');
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission) => {
    return permission === 'media';
  });

  createWorkerWindow();
  createOverlayWindow();
  createTray();
  registerHotkey();
});

app.on('will-quit', () => {
  if (hotkey) hotkey.unregisterAll();
});

// Keep app alive even if all visible windows are closed
app.on('window-all-closed', (e) => e.preventDefault());

// ─── Window factories ─────────────────────────────────────────────────────────

function createWorkerWindow() {
  workerWin = new BrowserWindow({
    width: 1,
    height: 1,
    x: -200,
    y: -200,
    show: false,
    frame: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false, // Critical: keep audio running when hidden
    },
  });

  workerWin.loadFile(path.join(__dirname, '../renderer/worker.html'));

  workerWin.webContents.once('did-finish-load', () => {
    workerWin.webContents.send('init-settings', buildSettingsPayload());
  });

}

function createSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus();
    return;
  }

  settingsWin = new BrowserWindow({
    width: 480,
    height: 680,
    title: 'VocalFlow Settings',
    resizable: false,
    center: true,
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  settingsWin.loadFile(path.join(__dirname, '../renderer/settings.html'));

  settingsWin.webContents.once('did-finish-load', () => {
    // Push current settings + latest balance to the settings page
    settingsWin.webContents.send('init-settings', buildSettingsPayload());
    // Ask worker for fresh balance
    if (workerWin && !workerWin.isDestroyed()) {
      workerWin.webContents.send('fetch-balance');
    }
  });

  settingsWin.on('closed', () => { settingsWin = null; });
}

function createOverlayWindow() {
  overlayWin = new BrowserWindow({
    width: 220,
    height: 56,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  overlayWin.loadFile(path.join(__dirname, '../renderer/overlay.html'));
  positionOverlay();
}

// Place overlay at bottom-center of the primary display
function positionOverlay() {
  const { screen } = require('electron');
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  overlayWin.setPosition(
    Math.floor((width - 220) / 2),
    height - 80,
  );
}

// ─── Tray ─────────────────────────────────────────────────────────────────────

function createTray() {
  tray = new Tray(ICONS.idle);
  tray.setToolTip('VocalFlow — Press Ctrl+Shift+Space to dictate');
  rebuildTrayMenu();
  tray.on('double-click', () => createSettingsWindow());
}

function rebuildTrayMenu() {
  const stateLabel = {
    idle: 'Idle — ready to record',
    recording: '🔴 Recording...',
    transcribing: '⏳ Transcribing...',
    error: '⚠️ Error',
  }[recordingState] || 'Unknown';

  const menu = Menu.buildFromTemplate([
    { label: 'VocalFlow', enabled: false },
    { label: stateLabel, enabled: false },
    { type: 'separator' },
    {
      label: recordingState === 'idle' ? 'Start Recording' : 'Stop Recording',
      accelerator: store ? store.get('hotkey') : '',
      click: () => toggleRecording(),
      enabled: recordingState === 'idle' || recordingState === 'recording',
    },
    { type: 'separator' },
    { label: 'Settings', click: () => createSettingsWindow() },
    { type: 'separator' },
    { label: 'Quit VocalFlow', click: () => app.quit() },
  ]);

  tray.setContextMenu(menu);
}

function setTrayState(state) {
  recordingState = state;
  tray.setImage(ICONS[state] || ICONS.idle);
  const tips = {
    idle: 'VocalFlow — Press hotkey to dictate',
    recording: 'VocalFlow — Recording... press hotkey to stop',
    transcribing: 'VocalFlow — Transcribing...',
    error: 'VocalFlow — Error occurred',
  };
  tray.setToolTip(tips[state] || 'VocalFlow');
  rebuildTrayMenu();
}

// ─── Hotkey ───────────────────────────────────────────────────────────────────

function registerHotkey() {
  hotkey = new HotkeyManager(toggleRecording);
  const accelerator = store.get('hotkey') || config.DEFAULT_HOTKEY;
  hotkey.register(accelerator);
}

function toggleRecording() {
  if (!workerWin || workerWin.isDestroyed()) return;

  if (recordingState === 'idle') {
    workerWin.webContents.send('start-recording');
  } else if (recordingState === 'recording') {
    workerWin.webContents.send('stop-recording');
  }
  // Ignore toggle during transcribing — wait for it to finish
}

// ─── IPC handlers ────────────────────────────────────────────────────────────

// Worker → Main: recording state changed
ipcMain.on('state-changed', (event, state, detail) => {
  setTrayState(state);

  if (overlayWin && !overlayWin.isDestroyed()) {
    if (state === 'recording' || state === 'transcribing') {
      overlayWin.webContents.send('set-state', state);
      overlayWin.show();
    } else {
      overlayWin.hide();
    }
  }

  // Forward to settings window if open
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send('state-changed', state, detail);
  }
});

// Worker → Main: inject transcribed text
ipcMain.on('inject-text', (event, text) => {
  console.log('[Main] Injecting:', text);
  injectText(text);
});

// Worker → Main: balance data received
ipcMain.on('balance-update', (event, balanceData) => {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send('balance-update', balanceData);
  }
});

// Settings → Main: save new settings
ipcMain.on('save-settings', (event, newSettings) => {
  store.setAll(newSettings);

  // Re-register hotkey if it changed
  if (newSettings.hotkey && hotkey) {
    const ok = hotkey.register(newSettings.hotkey);
    if (!ok) {
      event.reply('hotkey-error', `Could not register "${newSettings.hotkey}" — may be in use`);
    }
  }

  // Push updated settings to worker
  if (workerWin && !workerWin.isDestroyed()) {
    workerWin.webContents.send('update-settings', buildSettingsPayload());
  }

  event.reply('settings-saved');
});

// Settings → Main: fetch Deepgram models
ipcMain.on('fetch-deepgram-models', () => {
  if (workerWin && !workerWin.isDestroyed()) {
    workerWin.webContents.send('fetch-deepgram-models');
  }
});

// Settings → Main: fetch Groq models
ipcMain.on('fetch-groq-models', () => {
  if (workerWin && !workerWin.isDestroyed()) {
    workerWin.webContents.send('fetch-groq-models');
  }
});

// Settings → Main: refresh balance
ipcMain.on('refresh-balance', () => {
  if (workerWin && !workerWin.isDestroyed()) {
    workerWin.webContents.send('fetch-balance');
  }
});

// Worker → Main: models fetched
ipcMain.on('deepgram-models', (event, models) => {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send('deepgram-models', models);
  }
});

ipcMain.on('groq-models', (event, models) => {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send('groq-models', models);
  }
});

// Worker → Main: forward console logs to terminal for debugging
ipcMain.on('worker-log', (event, ...args) => {
  console.log('[Worker]', ...args);
});

// Any window → open external link safely
ipcMain.on('open-external', (event, url) => {
  const allowed = ['https://console.deepgram.com', 'https://console.groq.com'];
  if (allowed.some(prefix => url.startsWith(prefix))) {
    shell.openExternal(url);
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildDefaults() {
  return {
    deepgramAPIKey: config.DEEPGRAM_API_KEY,
    groqAPIKey: config.GROQ_API_KEY,
    selectedModel: config.DEFAULT_DEEPGRAM_MODEL,
    selectedLanguage: config.DEFAULT_LANGUAGE,
    selectedGroqModel: config.DEFAULT_GROQ_MODEL,
    hotkey: config.DEFAULT_HOTKEY,
    correctionModeEnabled: config.DEFAULT_CORRECTION_MODE,
    grammarCorrectionEnabled: config.DEFAULT_GRAMMAR_CORRECTION,
    codeMixEnabled: config.DEFAULT_CODE_MIX,
    selectedCodeMix: config.DEFAULT_CODE_MIX_LANG,
    targetLanguageEnabled: config.DEFAULT_TARGET_LANGUAGE_ENABLED,
    selectedTargetLanguage: config.DEFAULT_TARGET_LANGUAGE,
  };
}

function buildSettingsPayload() {
  return { ...store.getAll(), APP_VERSION: config.APP_VERSION };
}

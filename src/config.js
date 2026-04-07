/**
 * VocalFlow Windows — Central Configuration
 *
 * IMPORTANT: Replace DEEPGRAM_API_KEY with your own key from https://console.deepgram.com
 * The GROQ_API_KEY is optional — only needed for spelling/grammar correction and translation.
 * Get a free Groq key at https://console.groq.com
 *
 * Both keys can also be changed at runtime via the Settings window.
 * Keys entered in Settings are saved to the user data folder and take precedence over these values.
 */

module.exports = {
  // ─── API Keys (hardcoded defaults) ─────────────────────────────────────────
  DEEPGRAM_API_KEY: '8e17c3b882f204185d1ac34fdee900b1d97a7127',
  GROQ_API_KEY: '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',   // Optional

  // ─── Deepgram Defaults ─────────────────────────────────────────────────────
  DEFAULT_DEEPGRAM_MODEL: 'nova-2-general', // nova-2 stays English; nova-3 multi can output Arabic/Urdu
  DEFAULT_LANGUAGE: 'en-US',

  // ─── Groq Defaults ─────────────────────────────────────────────────────────
  DEFAULT_GROQ_MODEL: 'llama-3.1-8b-instant',

  // ─── Hotkey ────────────────────────────────────────────────────────────────
  // Electron globalShortcut format. Toggle: press once to start, press again to stop.
  // Common options: 'Ctrl+Shift+Space', 'Ctrl+Alt+Space', 'F9', 'Alt+`'
  DEFAULT_HOTKEY: 'Ctrl+Shift+Space',

  // ─── Post-Processing Defaults ──────────────────────────────────────────────
  DEFAULT_CORRECTION_MODE: false,
  DEFAULT_GRAMMAR_CORRECTION: false,
  DEFAULT_CODE_MIX: false,
  DEFAULT_CODE_MIX_LANG: '',
  DEFAULT_TARGET_LANGUAGE_ENABLED: false,
  DEFAULT_TARGET_LANGUAGE: 'English',

  // ─── App Info ──────────────────────────────────────────────────────────────
  APP_VERSION: '1.0.0',
  DEEPGRAM_CONSOLE_URL: 'https://console.deepgram.com',
  GROQ_CONSOLE_URL: 'https://console.groq.com',
};

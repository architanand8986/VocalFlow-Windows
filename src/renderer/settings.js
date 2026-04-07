/**
 * Settings window logic.
 * Reads initial state from main process, handles user interactions,
 * and displays Deepgram balance + Groq balance.
 */

/* global api */

// ─── Element references ───────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const dgKey           = $('dgKey');
const dgToggleKey     = $('dgToggleKey');
const dgSaveKey       = $('dgSaveKey');
const dgSaveStatus    = $('dgSaveStatus');
const dgBalance       = $('dgBalance');
const dgRefreshBal    = $('dgRefreshBalance');
const dgModel         = $('dgModel');
const dgFetchModels   = $('dgFetchModels');
const dgModelStatus   = $('dgModelStatus');
const dgLang          = $('dgLang');
const dgLangRow       = $('dgLangRow');

const groqKey         = $('groqKey');
const groqToggleKey   = $('groqToggleKey');
const groqSaveKey     = $('groqSaveKey');
const groqSaveStatus  = $('groqSaveStatus');
const groqBalance     = $('groqBalance');
const groqModel       = $('groqModel');
const groqFetchModels = $('groqFetchModels');
const groqModelStatus = $('groqModelStatus');

const spellingToggle  = $('spellingToggle');
const grammarToggle   = $('grammarToggle');
const codeMixToggle   = $('codeMixToggle');
const codeMixLangRow  = $('codeMixLangRow');
const codeMixLang     = $('codeMixLang');
const translateToggle = $('translateToggle');
const translateLangRow= $('translateLangRow');
const translateLang   = $('translateLang');

const hotkeySelect    = $('hotkeySelect');
const saveHotkey      = $('saveHotkey');
const hotkeyStatus    = $('hotkeyStatus');

const saveAll         = $('saveAll');
const saveAllStatus   = $('saveAllStatus');
const statusBar       = $('statusBar');
const statusBarText   = $('statusBarText');
const appVersion      = $('appVersion');

// Stored model lists from worker
let deepgramModels = [];
let groqModels = [];

// ─── IPC listeners ────────────────────────────────────────────────────────────

api.on('init-settings', (settings) => {
  applySettings(settings);
});

api.on('balance-update', (data) => {
  updateDeepgramBalance(data.deepgram);
  updateGroqBalance(data.groq);
});

api.on('deepgram-models', (models) => {
  deepgramModels = models || [];
  populateDeepgramModels(deepgramModels);
  dgModelStatus.textContent = models.length ? `${models.length} models` : 'No models found';
  dgModelStatus.className = 'status-msg ' + (models.length ? 'ok' : 'err');
  dgFetchModels.disabled = false;
  dgFetchModels.textContent = 'Refresh';
  clearAfter(dgModelStatus, 3000);
});

api.on('groq-models', (models) => {
  groqModels = models || [];
  populateGroqModels(groqModels);
  groqModelStatus.textContent = models.length ? `${models.length} models` : 'No models found';
  groqModelStatus.className = 'status-msg ' + (models.length ? 'ok' : 'err');
  groqFetchModels.disabled = false;
  groqFetchModels.textContent = 'Refresh';
  clearAfter(groqModelStatus, 3000);
});

api.on('state-changed', (state) => {
  statusBar.className = '';
  if (state === 'recording') {
    statusBar.classList.add('recording');
    statusBarText.textContent = '🔴 Recording — press hotkey to stop';
  } else if (state === 'transcribing') {
    statusBar.classList.add('transcribing');
    statusBarText.textContent = '⏳ Transcribing…';
  } else {
    statusBar.style.display = 'none';
  }
});

api.on('settings-saved', () => {
  saveAllStatus.textContent = 'Saved!';
  saveAllStatus.className = 'status-msg ok';
  clearAfter(saveAllStatus, 2000);
});

api.on('hotkey-error', (msg) => {
  hotkeyStatus.textContent = msg;
  hotkeyStatus.className = 'status-msg err';
  clearAfter(hotkeyStatus, 4000);
});

// ─── Balance display ──────────────────────────────────────────────────────────

function updateDeepgramBalance(value) {
  dgBalance.textContent = value || '—';
  if (!value || value === 'No API key set') {
    dgBalance.className = 'balance-chip loading';
  } else if (value.startsWith('Error') || value === 'Network error') {
    dgBalance.className = 'balance-chip error';
  } else {
    dgBalance.className = 'balance-chip';
  }
}

function updateGroqBalance(value) {
  if (value === 'dashboard') {
    groqBalance.innerHTML = '<span style="font-size:11px; color: var(--text-muted)">Not exposed via API —</span>&nbsp;';
    groqBalance.className = 'balance-chip loading';
    // Add a dashboard link inside the chip
    const link = document.createElement('button');
    link.className = 'btn-link';
    link.textContent = 'View Dashboard';
    link.style.fontSize = '11px';
    link.addEventListener('click', () => openExternal('https://console.groq.com'));
    groqBalance.appendChild(link);
  } else {
    groqBalance.textContent = value || '—';
    groqBalance.className = 'balance-chip loading';
  }
}

// ─── Populate selects ─────────────────────────────────────────────────────────

function populateDeepgramModels(models) {
  const current = dgModel.value;
  dgModel.innerHTML = '';
  for (const m of models) {
    const opt = document.createElement('option');
    opt.value = m.canonicalName;
    opt.textContent = m.canonicalName;
    dgModel.appendChild(opt);
  }
  if (current && [...dgModel.options].some((o) => o.value === current)) {
    dgModel.value = current;
  } else if (models.length) {
    dgModel.value = models[0].canonicalName;
  }
  updateLanguageOptions();
}

function updateLanguageOptions() {
  const selected = deepgramModels.find((m) => m.canonicalName === dgModel.value);
  const langs = selected?.languages || [];
  dgLang.innerHTML = '';
  if (langs.length === 0) {
    const opt = document.createElement('option');
    opt.value = 'en-US'; opt.textContent = 'en-US';
    dgLang.appendChild(opt);
    return;
  }
  for (const l of langs) {
    const opt = document.createElement('option');
    opt.value = l;
    opt.textContent = l === 'multi' ? 'multi (Code-switching)' : l;
    dgLang.appendChild(opt);
  }
}

function populateGroqModels(models) {
  const current = groqModel.value;
  groqModel.innerHTML = '<option value="">— select model —</option>';
  for (const m of models) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.displayName;
    groqModel.appendChild(opt);
  }
  if (current && [...groqModel.options].some((o) => o.value === current)) {
    groqModel.value = current;
  } else if (models.length) {
    groqModel.value = models[0].id;
  }
}

// ─── Apply saved settings to UI ───────────────────────────────────────────────

function applySettings(s) {
  if (!s) return;

  appVersion.textContent = `v${s.APP_VERSION || '1.0.0'}`;

  dgKey.value = s.deepgramAPIKey || '';
  groqKey.value = s.groqAPIKey || '';

  // Model / language
  if (s.selectedModel) {
    const opt = [...dgModel.options].find((o) => o.value === s.selectedModel);
    if (!opt) {
      const newOpt = document.createElement('option');
      newOpt.value = s.selectedModel;
      newOpt.textContent = s.selectedModel;
      dgModel.insertBefore(newOpt, dgModel.firstChild);
    }
    dgModel.value = s.selectedModel;
  }

  if (s.selectedLanguage) {
    const opt = [...dgLang.options].find((o) => o.value === s.selectedLanguage);
    if (!opt) {
      const newOpt = document.createElement('option');
      newOpt.value = s.selectedLanguage;
      newOpt.textContent = s.selectedLanguage;
      dgLang.insertBefore(newOpt, dgLang.firstChild);
    }
    dgLang.value = s.selectedLanguage;
  }

  // Groq model
  if (s.selectedGroqModel) {
    const opt = [...groqModel.options].find((o) => o.value === s.selectedGroqModel);
    if (!opt) {
      const newOpt = document.createElement('option');
      newOpt.value = s.selectedGroqModel;
      newOpt.textContent = s.selectedGroqModel;
      groqModel.appendChild(newOpt);
    }
    groqModel.value = s.selectedGroqModel;
  }

  // Toggles
  spellingToggle.checked = !!s.correctionModeEnabled;
  grammarToggle.checked = !!s.grammarCorrectionEnabled;
  codeMixToggle.checked = !!s.codeMixEnabled;
  codeMixLangRow.style.display = s.codeMixEnabled ? 'flex' : 'none';
  if (s.selectedCodeMix) codeMixLang.value = s.selectedCodeMix;

  translateToggle.checked = !!s.targetLanguageEnabled;
  translateLangRow.style.display = s.targetLanguageEnabled ? 'flex' : 'none';
  if (s.selectedTargetLanguage) translateLang.value = s.selectedTargetLanguage;

  // Hotkey
  const hk = s.hotkey || 'Ctrl+Shift+Space';
  const opt = [...hotkeySelect.options].find((o) => o.value === hk);
  if (!opt) {
    const newOpt = document.createElement('option');
    newOpt.value = hk; newOpt.textContent = hk;
    hotkeySelect.appendChild(newOpt);
  }
  hotkeySelect.value = hk;
}

// ─── Event handlers ───────────────────────────────────────────────────────────

dgToggleKey.addEventListener('click', () => {
  const isPassword = dgKey.type === 'password';
  dgKey.type = isPassword ? 'text' : 'password';
  dgToggleKey.textContent = isPassword ? 'Hide' : 'Show';
});

dgSaveKey.addEventListener('click', () => {
  api.send('save-settings', { deepgramAPIKey: dgKey.value.trim() });
  dgSaveStatus.textContent = 'Saved!';
  dgSaveStatus.className = 'status-msg ok';
  clearAfter(dgSaveStatus, 2000);
  // Fetch fresh balance with new key
  setTimeout(() => api.send('refresh-balance'), 300);
});

dgRefreshBal.addEventListener('click', () => {
  dgBalance.textContent = 'Loading…';
  dgBalance.className = 'balance-chip loading';
  api.send('refresh-balance');
});

dgFetchModels.addEventListener('click', () => {
  dgFetchModels.disabled = true;
  dgFetchModels.textContent = 'Loading…';
  dgModelStatus.textContent = '';
  api.send('fetch-deepgram-models');
});

dgModel.addEventListener('change', () => {
  updateLanguageOptions();
});

groqToggleKey.addEventListener('click', () => {
  const isPassword = groqKey.type === 'password';
  groqKey.type = isPassword ? 'text' : 'password';
  groqToggleKey.textContent = isPassword ? 'Hide' : 'Show';
});

groqSaveKey.addEventListener('click', () => {
  api.send('save-settings', { groqAPIKey: groqKey.value.trim() });
  groqSaveStatus.textContent = 'Saved!';
  groqSaveStatus.className = 'status-msg ok';
  clearAfter(groqSaveStatus, 2000);
  setTimeout(() => api.send('refresh-balance'), 300);
});

groqFetchModels.addEventListener('click', () => {
  groqFetchModels.disabled = true;
  groqFetchModels.textContent = 'Loading…';
  groqModelStatus.textContent = '';
  api.send('fetch-groq-models');
});

codeMixToggle.addEventListener('change', () => {
  codeMixLangRow.style.display = codeMixToggle.checked ? 'flex' : 'none';
});

translateToggle.addEventListener('change', () => {
  translateLangRow.style.display = translateToggle.checked ? 'flex' : 'none';
});

saveHotkey.addEventListener('click', () => {
  const val = hotkeySelect.value;
  api.send('save-settings', { hotkey: val });
  hotkeyStatus.textContent = `Applied: ${val}`;
  hotkeyStatus.className = 'status-msg ok';
  clearAfter(hotkeyStatus, 2000);
});

saveAll.addEventListener('click', () => {
  const settings = {
    deepgramAPIKey: dgKey.value.trim(),
    groqAPIKey: groqKey.value.trim(),
    selectedModel: dgModel.value,
    selectedLanguage: dgLang.value,
    selectedGroqModel: groqModel.value,
    hotkey: hotkeySelect.value,
    correctionModeEnabled: spellingToggle.checked,
    grammarCorrectionEnabled: grammarToggle.checked,
    codeMixEnabled: codeMixToggle.checked,
    selectedCodeMix: codeMixLang.value,
    targetLanguageEnabled: translateToggle.checked,
    selectedTargetLanguage: translateLang.value,
  };
  api.send('save-settings', settings);
});

// External links
$('dgDashboardLink').addEventListener('click', () => openExternal('https://console.deepgram.com'));
$('dgSignupLink').addEventListener('click', () => openExternal('https://console.deepgram.com/signup'));
$('groqDashboardLink').addEventListener('click', () => openExternal('https://console.groq.com'));
$('groqSignupLink').addEventListener('click', () => openExternal('https://console.groq.com'));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function openExternal(url) {
  api.send('open-external', url);
}

function clearAfter(el, ms) {
  setTimeout(() => { el.textContent = ''; }, ms);
}

/**
 * VocalFlow Worker — runs inside a hidden BrowserWindow.
 *
 * Handles:
 *  - Microphone capture via Web Audio API (16 kHz mono PCM)
 *  - Deepgram real-time WebSocket streaming
 *  - Groq LLM post-processing (spelling, grammar, code-mix, translation)
 *  - Deepgram balance fetch
 *  - Notifies main process of state changes and results via IPC
 */

/* global api */

// ─── State ────────────────────────────────────────────────────────────────────

let settings = {};
let appState = 'idle'; // idle | recording | transcribing | error

// Audio
let audioContext = null;
let mediaStream = null;
let workletNode = null;

// Deepgram
let websocket = null;
let accumulatedTranscript = '';
let transcribeTimeoutId = null;

// ─── IPC event listeners ──────────────────────────────────────────────────────

api.on('init-settings', (data) => {
  settings = data || {};
  console.log('[Worker] Settings received, fetching balance...');
  fetchBalance();
});

api.on('update-settings', (data) => {
  settings = data || {};
});

api.on('start-recording', () => {
  if (appState !== 'idle') return;
  startRecording();
});

api.on('stop-recording', () => {
  if (appState !== 'recording') return;
  stopRecordingAndTranscribe();
});

api.on('fetch-balance', () => {
  fetchBalance();
});

api.on('fetch-deepgram-models', () => {
  fetchDeepgramModels();
});

api.on('fetch-groq-models', () => {
  fetchGroqModels();
});

// ─── Recording ────────────────────────────────────────────────────────────────

async function startRecording() {
  try {
    setState('recording');

    // ── Step 1: open the microphone first ──────────────────────────────────
    // We need the real microphone sample rate BEFORE connecting to Deepgram,
    // because Windows often ignores the sampleRate constraint and the AudioContext
    // may be created at 44100/48000 Hz instead of 16000 Hz.
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // ── Step 2: create AudioContext and detect actual sample rate ───────────
    audioContext = new AudioContext({ sampleRate: 16000 });
    await audioContext.resume(); // Hidden windows start suspended

    const actualSampleRate = audioContext.sampleRate;
    console.log(`[Worker] AudioContext sample rate: ${actualSampleRate} Hz`);

    // ── Step 3: wait 200 ms so the initial mic-open noise burst is discarded─
    await new Promise((r) => setTimeout(r, 200));

    // ── Step 4: connect to Deepgram with the *actual* sample rate ───────────
    await connectDeepgram(actualSampleRate);

    // ── Step 5: wire up AudioWorklet ────────────────────────────────────────
    await audioContext.audioWorklet.addModule('worklets/pcm-processor.js');

    const source = audioContext.createMediaStreamSource(mediaStream);
    workletNode = new AudioWorkletNode(audioContext, 'pcm-processor');

    // Each message is an Int16 PCM buffer at actualSampleRate; forward to Deepgram
    workletNode.port.onmessage = (e) => {
      if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.send(e.data);
      }
    };

    source.connect(workletNode);
    workletNode.connect(audioContext.destination); // silent — keeps graph alive

    // Tell main process we are in recording state so the next hotkey press stops it
    api.send('state-changed', 'recording');
    console.log('[Worker] Recording started');
  } catch (err) {
    console.error('[Worker] startRecording error:', err);
    setState('error');
    api.send('state-changed', 'error', err.message);
    cleanup();
  }
}

async function stopRecordingAndTranscribe() {
  setState('transcribing');
  api.send('state-changed', 'transcribing');

  // Tear down audio capture
  stopAudio();

  // Signal Deepgram end-of-stream with an empty binary frame
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    try { websocket.send(new ArrayBuffer(0)); } catch (_) {}
  }

  // Safety timeout: if Deepgram doesn't respond in 3s, use what we have
  transcribeTimeoutId = setTimeout(() => {
    console.warn('[Worker] Transcription timeout — using accumulated transcript');
    finalizeTranscript(accumulatedTranscript.trim());
  }, 3000);
}

function stopAudio() {
  if (workletNode) {
    try { workletNode.disconnect(); } catch (_) {}
    workletNode = null;
  }
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
}

// ─── Deepgram WebSocket ───────────────────────────────────────────────────────

function connectDeepgram(sampleRate = 16000) {
  return new Promise((resolve, reject) => {
    const apiKey = settings.deepgramAPIKey;
    if (!apiKey) { reject(new Error('No Deepgram API key configured')); return; }

    accumulatedTranscript = '';

    // Safe language selection: block 'multi' and known RTL/non-Latin codes that
    // cause Arabic/Urdu script output when the user hasn't explicitly set them.
    const SAFE_LANGS = /^(en|fr|de|es|pt|it|nl|pl|ru|ja|ko|zh|hi|tr|id|ms|uk|sv|no|da|fi|ro|cs|sk|hu|bg|hr|lt|lv|et|sl|el|vi|th)/i;
    const rawLang = settings.selectedLanguage || '';
    const language = (rawLang && rawLang !== 'multi' && SAFE_LANGS.test(rawLang))
      ? rawLang
      : 'en-US';
    const model = settings.selectedModel || 'nova-2-general';

    const params = new URLSearchParams({
      encoding: 'linear16',
      sample_rate: String(Math.round(sampleRate)),
      channels: '1',
      model,
      language,
      punctuate: 'true',
      interim_results: 'true',
    });

    const url = `wss://api.deepgram.com/v1/listen?${params}`;
    api.log(`Deepgram connecting: model=${model} language=${language} sampleRate=${Math.round(sampleRate)}`);

    // Authenticate via WebSocket subprotocol (Deepgram's recommended browser approach)
    websocket = new WebSocket(url, ['token', apiKey]);
    websocket.binaryType = 'arraybuffer';

    const connectionTimeout = setTimeout(() => {
      reject(new Error('Deepgram connection timeout'));
      websocket.close();
    }, 6000);

    websocket.onopen = () => {
      clearTimeout(connectionTimeout);
      console.log('[Deepgram] Connected');
      resolve();
    };

    websocket.onerror = (e) => {
      clearTimeout(connectionTimeout);
      console.error('[Deepgram] WebSocket error');
      reject(new Error('WebSocket error — check your API key and network'));
    };

    websocket.onmessage = (event) => {
      handleDeepgramMessage(event.data);
    };

    websocket.onclose = () => {
      console.log('[Deepgram] Closed');
      if (appState === 'transcribing') {
        // Connection closed before we got speech_final — deliver what we have
        finalizeTranscript(accumulatedTranscript.trim());
      }
    };
  });
}

function handleDeepgramMessage(raw) {
  try {
    const msg = JSON.parse(raw);
    const transcript = msg.channel?.alternatives?.[0]?.transcript || '';

    // Forward every transcript to the main terminal for debugging
    if (transcript) {
      api.log(`Deepgram is_final=${msg.is_final} transcript="${transcript}"`);
    }

    if (msg.is_final && transcript) {
      accumulatedTranscript += (accumulatedTranscript ? ' ' : '') + transcript;
    }

    // speech_final = true means Deepgram received our empty-frame flush signal
    if (appState === 'transcribing' && msg.is_final && msg.speech_final) {
      clearTimeout(transcribeTimeoutId);
      finalizeTranscript(accumulatedTranscript.trim());
    }
  } catch (e) {
    console.warn('[Deepgram] Failed to parse message:', e.message);
  }
}

// ─── Transcript finalization ─────────────────────────────────────────────────

async function finalizeTranscript(transcript) {
  if (appState !== 'transcribing') return;

  disconnectDeepgram();

  if (!transcript) {
    setState('idle');
    api.send('state-changed', 'idle');
    console.log('[Worker] Empty transcript — nothing to inject');
    return;
  }

  console.log('[Worker] Raw transcript:', transcript);

  // Groq post-processing (optional)
  const hasGroq = settings.groqAPIKey && settings.selectedGroqModel;
  const hasProcessing =
    settings.correctionModeEnabled ||
    settings.grammarCorrectionEnabled ||
    (settings.codeMixEnabled && settings.selectedCodeMix) ||
    (settings.targetLanguageEnabled && settings.selectedTargetLanguage);

  let finalText = transcript;

  if (hasGroq && hasProcessing) {
    try {
      finalText = await processWithGroq(transcript);
      console.log('[Worker] Groq processed:', finalText);
    } catch (err) {
      console.warn('[Worker] Groq failed, using raw transcript:', err.message);
    }
  }

  setState('idle');
  api.send('state-changed', 'idle');
  api.send('inject-text', finalText);
}

function disconnectDeepgram() {
  if (websocket) {
    try { websocket.close(); } catch (_) {}
    websocket = null;
  }
}

// ─── Groq post-processing ─────────────────────────────────────────────────────

async function processWithGroq(text) {
  const steps = [];
  let n = 1;

  if (settings.codeMixEnabled && settings.selectedCodeMix) {
    steps.push(`${n++}. The input is in ${settings.selectedCodeMix}. Transliterate any non-Roman script to Roman script. Keep English words as-is. Do not translate.`);
  }
  if (settings.correctionModeEnabled) {
    steps.push(`${n++}. Fix any spelling mistakes. Do not change meaning or structure.`);
  }
  if (settings.grammarCorrectionEnabled) {
    steps.push(`${n++}. Fix any grammar mistakes. Do not change meaning or add content.`);
  }
  if (settings.targetLanguageEnabled && settings.selectedTargetLanguage) {
    const lang = settings.selectedTargetLanguage;
    steps.push(`${n++}. Translate the entire text to ${lang}. Every word must be in ${lang}.`);
  }

  if (steps.length === 0) return text;

  const systemPrompt =
    'Process the following text by applying these steps in order:\n' +
    steps.join('\n') +
    '\nReturn only the final processed text with no explanation.';

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.groqAPIKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.selectedGroqModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      temperature: 0,
    }),
  });

  if (!resp.ok) throw new Error(`Groq API ${resp.status}`);
  const data = await resp.json();
  const result = data.choices?.[0]?.message?.content;
  return result && result.trim() ? result.trim() : text;
}

// ─── Balance fetch ────────────────────────────────────────────────────────────

async function fetchBalance() {
  const balanceData = { deepgram: null, groq: null };

  // Deepgram balance
  const dgKey = settings.deepgramAPIKey;
  if (dgKey && dgKey !== 'YOUR_DEEPGRAM_API_KEY_HERE') {
    try {
      const projResp = await fetch('https://api.deepgram.com/v1/projects', {
        headers: { Authorization: `Token ${dgKey}` },
      });
      if (projResp.ok) {
        const projData = await projResp.json();
        const projectId = projData.projects?.[0]?.project_id;

        if (projectId) {
          const balResp = await fetch(
            `https://api.deepgram.com/v1/projects/${projectId}/balances`,
            { headers: { Authorization: `Token ${dgKey}` } },
          );
          if (balResp.ok) {
            const balData = await balResp.json();
            const bal = balData.balances?.[0];
            if (bal) {
              const amount = parseFloat(bal.amount).toFixed(4);
              const unit = (bal.units || 'usd').toUpperCase();
              balanceData.deepgram = `$${amount} ${unit}`;
            }
          }
        }
      } else {
        balanceData.deepgram = `Error ${projResp.status} — check API key`;
      }
    } catch (err) {
      balanceData.deepgram = 'Network error';
      console.warn('[Balance] Deepgram fetch error:', err.message);
    }
  } else {
    balanceData.deepgram = 'No API key set';
  }

  // Groq — no public balance endpoint; direct user to dashboard
  const gqKey = settings.groqAPIKey;
  if (gqKey) {
    balanceData.groq = 'dashboard'; // Special marker — UI will render a link
  } else {
    balanceData.groq = 'No API key set';
  }

  api.send('balance-update', balanceData);
}

// ─── Model fetching ───────────────────────────────────────────────────────────

async function fetchDeepgramModels() {
  const apiKey = settings.deepgramAPIKey;
  if (!apiKey || apiKey === 'YOUR_DEEPGRAM_API_KEY_HERE') {
    api.send('deepgram-models', []);
    return;
  }

  try {
    const resp = await fetch('https://api.deepgram.com/v1/models', {
      headers: { Authorization: `Token ${apiKey}` },
    });
    if (!resp.ok) { api.send('deepgram-models', []); return; }

    const root = await resp.json();
    const streamMap = {};
    const displayMap = {};
    const langMap = {};

    for (const m of root.stt || []) {
      const canonical = m.canonical_name;
      if (!canonical) continue;
      streamMap[canonical] = (streamMap[canonical] ?? false) || (m.streaming ?? false);
      if (!displayMap[canonical]) displayMap[canonical] = m.name || canonical;
      const existing = langMap[canonical] || [];
      const newLangs = (m.languages || []).filter((l) => !existing.includes(l));
      langMap[canonical] = [...existing, ...newLangs];
    }

    const models = Object.entries(streamMap)
      .filter(([, streaming]) => streaming)
      .map(([canonical]) => {
        let langs = (langMap[canonical] || []).sort();
        if (canonical.startsWith('nova-2') || canonical.startsWith('nova-3')) {
          langs = [...langs, 'multi'];
        }
        return { canonicalName: canonical, displayName: displayMap[canonical] || canonical, languages: langs };
      })
      .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));

    api.send('deepgram-models', models);
  } catch (err) {
    console.warn('[Worker] fetchDeepgramModels error:', err.message);
    api.send('deepgram-models', []);
  }
}

async function fetchGroqModels() {
  const apiKey = settings.groqAPIKey;
  if (!apiKey) { api.send('groq-models', []); return; }

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!resp.ok) { api.send('groq-models', []); return; }

    const root = await resp.json();
    const models = (root.data || [])
      .filter((m) => m.object === 'model')
      .map((m) => ({ id: m.id, displayName: m.id }))
      .sort((a, b) => a.id.localeCompare(b.id));

    api.send('groq-models', models);
  } catch (err) {
    console.warn('[Worker] fetchGroqModels error:', err.message);
    api.send('groq-models', []);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setState(newState) {
  appState = newState;
}

function cleanup() {
  stopAudio();
  disconnectDeepgram();
  clearTimeout(transcribeTimeoutId);
}

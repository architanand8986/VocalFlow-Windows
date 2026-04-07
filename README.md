# VocalFlow — Windows

A lightweight Windows system-tray dictation app. Press a hotkey, speak, press it again — your words are instantly typed at the cursor in any application.

Powered by **[Deepgram](https://deepgram.com)** for real-time speech-to-text and optionally **[Groq](https://groq.com)** for LLM post-processing (spelling correction, grammar, translation).

---

## Features

- **Toggle hotkey** — press once to start, press again to stop (default: `Ctrl+Shift+Space`)
- **Real-time streaming ASR** — Deepgram WebSocket, 16 kHz mono PCM
- **Deepgram balance display** — see your remaining credit directly in the Settings window
- **Groq LLM post-processing** (optional)
  - Spelling correction
  - Grammar correction
  - Code-mix transliteration — Hinglish, Tanglish, Spanglish, and 13 more
  - Translation to any target language
- **Works in any app** — text is pasted via simulated Ctrl+V (Notepad, browser, Word, VS Code, etc.)
- **System tray** — lives in the Windows notification area, no taskbar clutter
- **Floating overlay** — pill indicator at the bottom of your screen shows recording / transcribing state
- **Zero runtime dependencies** — only Electron itself, no native modules to compile

---

## Requirements

| Requirement      | Details                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------- |
| OS               | Windows 10 or Windows 11                                                                 |
| Node.js          | v18 or later — [nodejs.org](https://nodejs.org)                                          |
| Deepgram API key | Free tier available — [console.deepgram.com/signup](https://console.deepgram.com/signup) |
| Groq API key     | Optional, for post-processing — [console.groq.com](https://console.groq.com)             |

---

## Installation & First Run

### Step 1 — Get the code

**Option A — Git clone:**

```bash
git clone https://github.com/YOUR_USERNAME/vocalflow-windows.git
cd vocalflow-windows
```

**Option B — Download ZIP:**

1. Download and extract the ZIP
2. Open a terminal inside the extracted folder

---

### Step 2 — Add your Deepgram API key(Already added in config)

Open [`src/config.js`](src/config.js) in any text editor and replace the placeholder on line 14:

```js
DEEPGRAM_API_KEY: 'YOUR_DEEPGRAM_API_KEY_HERE',
```

with your actual key, e.g.:

```js
DEEPGRAM_API_KEY: 'dg_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
```

> You can also skip this step and enter the key inside the Settings window after the app launches.

---

### Step 3 — Install dependencies

```bash
npm install
```

This installs Electron (~100 MB). It only needs to run once.

---

### Step 4 — Start the app

```bash
npm start
```

A small **gray square** icon appears in the **system tray** (bottom-right corner of your taskbar, near the clock). That's VocalFlow running.

> If you don't see it, click the **`^`** arrow in the taskbar to reveal hidden notification icons.

---

## Settings Setup (first launch)

Double-click the tray icon (or right-click → **Settings**) to open the Settings window.

### Deepgram (required)

1. Paste your **Deepgram API key**(already added will be shown there) into the API Key field
2. Click **Save**
3. Click **Fetch** — this loads the list of available models
4. Select a model (default: `nova-2-general` — recommended for English)
5. Select a language (default: `en-US`)
6. Your **balance** appears automatically in the Balance row

### Groq (optional — for corrections & translation)

1. Paste your **Groq API key**(already added will be shown there).
2. Click **Save**
3. Click **Fetch** to load available models, select one (e.g. `llama-3.1-8b-instant`)
4. Enable the features you want:
   - **Spelling Correction** — fixes typos
   - **Grammar Correction** — fixes sentence structure
   - **Code-Mix Input** — transliterates mixed-script speech (e.g. Hinglish) to Roman script
   - **Translate Output** — converts transcript to a target language

### Hotkey

Choose your preferred shortcut from the dropdown. Click **Apply**.

Available options:
| Shortcut | Notes |
|----------|-------|
| `Ctrl+Shift+Space` | Default |
| `Ctrl+Alt+Space` | Alternative |
| `F9` / `F10` | Single key |
| `Ctrl+Shift+R` | R for Record |
| `Ctrl+Shift+D` | D for Dictate |

### Save

Click **Save All Settings** when done.

---

## How to Dictate

1. **Click** into the text field where you want to type (Notepad, browser, Word, etc.) — make sure the cursor is blinking there
2. **Press** `Ctrl+Shift+Space` — tray turns **red**, overlay appears at the bottom of your screen saying "Recording"
3. **Speak** clearly
4. **Press** `Ctrl+Shift+Space` again — tray turns **amber**, overlay shows "Transcribing…"
5. Wait ~1–2 seconds — text appears at your cursor

> Do not click anywhere between steps 2 and 5. The text goes to whichever window was focused when you pressed the hotkey.

---

## How It Works (under the hood)

```
Press hotkey (1st time)
  ├── Microphone opens
  ├── AudioContext created at actual system sample rate
  ├── 200 ms silence discarded (avoids mic-open noise burst)
  ├── Deepgram WebSocket connects (model + language from settings)
  └── Audio streamed in real-time as 16-bit PCM

Press hotkey (2nd time)
  ├── Audio capture stops
  ├── Empty frame sent to Deepgram → triggers final transcript flush
  ├── [Optional] Groq post-processes the transcript
  ├── Text written to clipboard
  ├── PowerShell simulates Ctrl+V to paste at cursor
  └── Clipboard restored to previous content
```

---

## Tray Icon States

| Color    | Meaning                             |
| -------- | ----------------------------------- |
| Gray     | Idle — ready to record              |
| Red      | Recording — listening to your mic   |
| Amber    | Transcribing — waiting for Deepgram |
| Dark red | Error — check terminal for details  |

---

## Deepgram & Groq Balance

Open **Settings** at any time to see your balances:

- **Deepgram balance** — fetched live via the Deepgram API. Click **Refresh** to update. Also refreshed automatically each time Settings opens.
- **Groq balance** — Groq does not expose a billing API. The Settings window shows a **Dashboard** link that opens [console.groq.com](https://console.groq.com) in your browser.

---

## Resetting Settings

Settings are saved to:

```
C:\Users\<you>\AppData\Roaming\vocalflow-windows\settings.json
```

To reset to defaults, delete that file and restart the app. A fresh `settings.json` will be created from the defaults in `src/config.js`.

---

## Project Structure

```
vocalflow-windows/
├── src/
│   ├── config.js                  ← API keys & app defaults
│   ├── preload.js                 ← Secure IPC bridge (contextBridge)
│   ├── main/
│   │   ├── index.js               ← Main process: tray, hotkey, IPC routing
│   │   ├── store.js               ← JSON settings persistence (no external deps)
│   │   ├── icons.js               ← Tray icons generated in-code (no image files)
│   │   ├── hotkeyManager.js       ← Global shortcut registration / unregistration
│   │   └── textInjector.js        ← Clipboard write + PowerShell Ctrl+V paste
│   └── renderer/
│       ├── worker.html            ← Hidden window — always running in background
│       ├── worker.js              ← Audio capture, Deepgram WS, Groq API, balance
│       ├── worklets/
│       │   └── pcm-processor.js   ← AudioWorklet: Float32 samples → Int16 PCM
│       ├── settings.html          ← Settings UI (API keys, models, toggles, balance)
│       ├── settings.js            ← Settings page logic
│       └── overlay.html           ← Floating pill shown during recording/transcribing
├── package.json
├── .gitignore
└── README.md
```

---

## Build a Distributable Installer

To package the app as a Windows `.exe` installer:

```bash
npm run build
```

The installer is output to `dist/`. Requires [electron-builder](https://www.electron.build) (already listed in `devDependencies`).

> Note: `assets/icon.ico` must exist before building. See electron-builder docs for icon requirements.

---

## License

[MIT](../LICENSE)

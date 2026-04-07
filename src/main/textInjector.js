/**
 * Text injection for Windows.
 *
 * Strategy:
 *   1. Save the current clipboard contents
 *   2. Write the transcribed text to the clipboard
 *   3. Write a tiny VBScript to %TEMP% and run it with wscript.exe
 *      (wscript starts ~5× faster than PowerShell and is always available)
 *   4. Restore the previous clipboard contents after the paste
 */

const { clipboard } = require('electron');
const { exec } = require('child_process');
const { writeFileSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');

const VBS_PATH = join(tmpdir(), 'vocalflow_inject.vbs');

// Write the VBScript once at startup (reused on every injection)
writeFileSync(
  VBS_PATH,
  'Set WshShell = CreateObject("WScript.Shell")\r\nWshShell.SendKeys "^v"\r\n',
  'utf8',
);

/**
 * Inject text at the current cursor position in any focused Windows application.
 * @param {string} text
 */
function injectText(text) {
  if (!text || !text.trim()) return;

  const previous = clipboard.readText();
  clipboard.writeText(text);

  // Small delay lets the previous window reclaim focus after the hotkey fires.
  // wscript.exe launches the VBScript synchronously and sends Ctrl+V.
  setTimeout(() => {
    exec(`wscript.exe //nologo //b "${VBS_PATH}"`, (err) => {
      if (err) {
        console.error('[TextInjector] wscript error:', err.message);
      }
      // Restore clipboard ~700 ms after paste so apps have time to consume it
      setTimeout(() => clipboard.writeText(previous), 700);
    });
  }, 150);
}

module.exports = { injectText };

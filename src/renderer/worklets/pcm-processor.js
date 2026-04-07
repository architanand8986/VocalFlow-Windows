/**
 * AudioWorklet processor — runs on the audio thread.
 *
 * Converts each Float32 audio frame to Int16 PCM and posts the buffer
 * back to the main thread (worker.js) for forwarding to Deepgram.
 *
 * Deepgram expects: linear16, 16 kHz, mono (matching the AudioContext
 * sample rate set in worker.js).
 */

class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const samples = input[0]; // Float32Array, one channel
    const pcm = new Int16Array(samples.length);

    for (let i = 0; i < samples.length; i++) {
      // Clamp to [-1, 1] then scale to Int16 range
      const clamped = Math.max(-1, Math.min(1, samples[i]));
      pcm[i] = clamped < 0 ? clamped * 32768 : clamped * 32767;
    }

    // Transfer the buffer to avoid copying (zero-copy transfer)
    this.port.postMessage(pcm.buffer, [pcm.buffer]);

    return true; // Keep processor alive
  }
}

registerProcessor('pcm-processor', PCMProcessor);

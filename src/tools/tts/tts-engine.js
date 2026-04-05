/**
 * TTS Engine — kokoro-js integration
 */

let ttsInstance = null;
let voices = [];

/**
 * Initialize Kokoro TTS
 * @param {function} onProgress - progress callback ({ progress: 0-1, status: string })
 * @returns {Promise<void>}
 */
export async function initTTS(onProgress) {
  if (ttsInstance) return;

  const { KokoroTTS } = await import('kokoro-js');

  // Check for WebGPU
  let device = 'wasm';
  if (navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) device = 'webgpu';
    } catch {
      // fall back to wasm
    }
  }

  ttsInstance = await KokoroTTS.from_pretrained(
    'onnx-community/Kokoro-82M-v1.0-ONNX',
    {
      dtype: 'q8',
      device,
      progress_callback: (p) => {
        if (onProgress && p.progress !== undefined) {
          onProgress({
            progress: p.progress,
            status: p.status || 'Downloading model...',
          });
        }
      },
    }
  );

  // Get available voices
  try {
    voices = ttsInstance.list_voices ? ttsInstance.list_voices() : [];
  } catch {
    voices = [
      'af_heart', 'af_alloy', 'af_aoede', 'af_bella', 'af_jessica',
      'af_kore', 'af_nicole', 'af_nova', 'af_river', 'af_sarah', 'af_sky',
      'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam', 'am_michael',
      'am_onyx', 'am_puck',
      'bf_emma', 'bf_isabella',
      'bm_george', 'bm_lewis',
    ];
  }
}

/**
 * Get list of available voices
 */
export function getVoices() {
  return voices;
}

/**
 * Check if TTS has been initialized
 */
export function isTTSReady() {
  return ttsInstance !== null;
}

/**
 * Generate speech from text
 * @param {string} text
 * @param {object} opts
 * @param {string} opts.voice - voice ID
 * @param {number} opts.speed - playback speed (0.5 - 2.0)
 * @returns {Promise<Blob>} WAV audio blob
 */
export async function generateSpeech(text, { voice = 'af_heart', speed = 1.0 } = {}) {
  if (!ttsInstance) throw new Error('TTS not initialized');

  // For long text, split into chunks at sentence boundaries
  const chunks = splitText(text);
  const audioBuffers = [];

  for (const chunk of chunks) {
    const audio = await ttsInstance.generate(chunk, { voice, speed });

    // audio.save() returns a Blob-like; we need the raw audio data
    // The generate method returns an object with toBlob() or similar
    if (audio.data) {
      audioBuffers.push(audio.data);
    } else if (audio instanceof Blob) {
      audioBuffers.push(audio);
    } else {
      // Try to convert to WAV blob
      const blob = await audioToBlob(audio);
      audioBuffers.push(blob);
    }
  }

  // If multiple chunks, concatenate
  if (audioBuffers.length === 1) {
    if (audioBuffers[0] instanceof Blob) return audioBuffers[0];
    return new Blob([audioBuffers[0]], { type: 'audio/wav' });
  }

  // Concatenate all buffers
  const allParts = audioBuffers.map(b => b instanceof Blob ? b : new Blob([b], { type: 'audio/wav' }));
  return new Blob(allParts, { type: 'audio/wav' });
}


/**
 * Convert audio output to Blob
 */
async function audioToBlob(audio) {
  if (typeof audio.toBlob === 'function') {
    return audio.toBlob('audio/wav');
  }
  if (typeof audio.save === 'function') {
    // kokoro-js .save() method - try to get blob
    const blob = new Blob([audio], { type: 'audio/wav' });
    return blob;
  }
  return new Blob([audio], { type: 'audio/wav' });
}


/**
 * Split text into manageable chunks for TTS
 * Splits at sentence boundaries, keeping chunks under ~400 chars
 */
function splitText(text, maxLen = 400) {
  if (text.length <= maxLen) return [text];

  const sentences = text.match(/[^.!?]+[.!?]+[\s]*/g) || [text];
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length > maxLen && current.length > 0) {
      chunks.push(current.trim());
      current = '';
    }
    current += sentence;
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text];
}

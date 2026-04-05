/**
 * STT Engine — Whisper via Transformers.js
 */

let transcriber = null;
let currentModelId = null;

const MODEL_MAP = {
  tiny: 'Xenova/whisper-tiny',
  base: 'Xenova/whisper-base',
  small: 'Xenova/whisper-small',
};

/**
 * Initialize the Whisper transcription pipeline
 * @param {string} modelSize - 'tiny', 'base', or 'small'
 * @param {function} onProgress - ({ progress: 0-1, status: string })
 */
export async function initSTT(modelSize = 'tiny', onProgress) {
  const modelId = MODEL_MAP[modelSize] || MODEL_MAP.tiny;

  // Skip if same model already loaded
  if (transcriber && currentModelId === modelId) return;

  const { pipeline } = await import('@huggingface/transformers');

  transcriber = await pipeline('automatic-speech-recognition', modelId, {
    progress_callback: (p) => {
      if (onProgress && p.progress !== undefined) {
        onProgress({
          progress: p.progress / 100,
          status: p.status || 'Downloading model...',
        });
      }
    },
  });

  currentModelId = modelId;
}

/**
 * Check if STT is ready
 */
export function isSTTReady() {
  return transcriber !== null;
}

/**
 * Transcribe audio data to text
 * @param {Float32Array} audioData - 16kHz mono audio
 * @param {object} opts
 * @param {string} [opts.language='english']
 * @returns {Promise<string>} transcribed text
 */
export async function transcribeAudio(audioData, { language = 'english' } = {}) {
  if (!transcriber) throw new Error('STT not initialized');

  const result = await transcriber(audioData, {
    language,
    task: 'transcribe',
  });

  return result.text || '';
}

/**
 * Transcribe audio with timestamps (for SRT generation)
 * @param {Float32Array} audioData - 16kHz mono audio
 * @param {object} opts
 * @param {string} [opts.language='english']
 * @param {number} [opts.chunk_length_s=30]
 * @returns {Promise<Array<{text: string, timestamp: [number, number]}>>}
 */
export async function transcribeWithTimestamps(audioData, {
  language = 'english',
  chunk_length_s = 30,
  stride_length_s = 5,
} = {}) {
  if (!transcriber) throw new Error('STT not initialized');

  const result = await transcriber(audioData, {
    language,
    task: 'transcribe',
    return_timestamps: true,
    chunk_length_s,
    stride_length_s,
  });

  return result.chunks || [];
}

/**
 * Get current model ID
 */
export function getCurrentModelId() {
  return currentModelId;
}

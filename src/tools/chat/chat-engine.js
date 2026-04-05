/**
 * Chat Engine — wllama (llama.cpp WASM) integration
 * Works on ALL browsers via WebAssembly — no WebGPU required
 */

import { Wllama } from '@wllama/wllama';

let wllama = null;
let currentModel = null;
let isLoading = false;

export const CHAT_MODELS = [
  {
    id: 'qwen2.5-0.5b',
    name: 'Qwen2.5 0.5B',
    size: '~400 MB',
    description: 'Fastest, lightweight — great for quick tasks',
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
  },
  {
    id: 'qwen2.5-1.5b',
    name: 'Qwen2.5 1.5B',
    size: '~1.0 GB',
    description: 'Good balance of speed and quality',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
  },
  {
    id: 'smollm2-360m',
    name: 'SmolLM2 360M',
    size: '~230 MB',
    description: 'Ultra-light, instant responses',
    url: 'https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/resolve/main/smollm2-360m-instruct-q8_0.gguf',
  },
  {
    id: 'phi-3.5-mini',
    name: 'Phi 3.5 Mini 3.8B',
    size: '~2.4 GB',
    description: 'Strong reasoning, needs more RAM',
    url: 'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf',
  },
  {
    id: 'llama-3.2-1b',
    name: 'Llama 3.2 1B',
    size: '~750 MB',
    description: 'Meta\'s compact model, well-rounded',
    url: 'https://huggingface.co/hugging-quants/Llama-3.2-1B-Instruct-Q4_K_M-GGUF/resolve/main/llama-3.2-1b-instruct-q4_k_m.gguf',
  },
];

// We explicitly bypass local node_modules wasm resolution due to Vite bundling issues with wllama.
// We fetch the WASM files directly from unpkg to ensure they always load properly.
const WLLAMA_CDN_BASE = 'https://unpkg.com/@wllama/wllama@2.3.7/esm';

export async function initChatModel(modelId, onProgress) {
  if (isLoading) return;
  isLoading = true;

  try {
    // If switching models, clean up old instance
    if (wllama && currentModel !== modelId) {
      try { await wllama.exit(); } catch {}
      wllama = null;
      currentModel = null;
    }

    if (wllama && currentModel === modelId) {
      isLoading = false;
      return;
    }

    const model = CHAT_MODELS.find(m => m.id === modelId);
    if (!model) throw new Error('Unknown model: ' + modelId);

    // Create wllama instance using hardcoded CDN paths to avoid Vite path resolution issues
    wllama = new Wllama({
      'single-thread/wllama.wasm': `${WLLAMA_CDN_BASE}/single-thread/wllama.wasm`,
      'multi-thread/wllama.wasm': `${WLLAMA_CDN_BASE}/multi-thread/wllama.wasm`,
    });

    // Load model from URL
    await wllama.loadModelFromUrl(model.url, {
      n_ctx: 2048,
      progressCallback: ({ loaded, total }) => {
        if (onProgress && total > 0) {
          const p = loaded / total;
          onProgress({
            progress: p,
            text: `Downloading model... ${Math.round(p * 100)}%`,
          });
        }
      },
    });

    currentModel = modelId;
  } finally {
    isLoading = false;
  }
}

/**
 * Check if chat engine is ready
 */
export function isChatReady() {
  return wllama !== null && currentModel !== null && !isLoading;
}

/**
 * Get current model ID
 */
export function getCurrentChatModel() {
  return currentModel;
}

/**
 * Send a chat message and get a streaming response
 * @param {Array<{role:string, content:string}>} messages
 * @param {object} opts
 * @param {number} [opts.temperature=0.7]
 * @param {number} [opts.max_tokens=2048]
 * @param {function} opts.onToken - called with each token string
 * @returns {Promise<string>} full response text
 */
export async function chatStream(messages, { temperature = 0.7, max_tokens = 2048, onToken } = {}) {
  if (!wllama) throw new Error('Chat model not initialized');

  const decoder = new TextDecoder('utf-8');

  const result = await wllama.createChatCompletion(messages, {
    nPredict: max_tokens,
    sampling: {
      temp: temperature,
      penalty_repeat: 1.1,
    },
    onNewToken: (_token, piece) => {
      if (onToken) {
        const bytes = piece instanceof Uint8Array ? piece : new Uint8Array(piece);
        // stream: true ensures multi-byte characters split across tokens are decoded properly
        const text = decoder.decode(bytes, { stream: true });
        onToken(text);
      }
    },
  });

  return result;
}

/**
 * Reset the chat context
 */
export async function resetChat() {
  // wllama doesn't have a built-in resetChat — 
  // each createChatCompletion call handles context from the messages array
  // No action needed since we manage conversation history in the panel
}

/**
 * Check if WebGPU is available (informational only — wllama works without it)
 */
export async function isWebGPUAvailable() {
  if (!navigator.gpu) return false;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return adapter !== null;
  } catch { return false; }
}

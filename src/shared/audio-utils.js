/**
 * Web Audio API + MediaRecorder helpers
 */

let audioContext = null;

/**
 * Get or create the shared AudioContext
 */
export function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 16000, // Whisper expects 16kHz
    });
  }
  return audioContext;
}


/**
 * Decode an audio file (File or Blob) to Float32Array at 16kHz mono
 * This is the format Whisper expects
 * @param {File|Blob} file
 * @returns {Promise<Float32Array>}
 */
export async function decodeAudioToFloat32(file) {
  const arrayBuffer = await file.arrayBuffer();

  // Use an OfflineAudioContext to decode and resample to 16kHz mono
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer);

  // Resample to 16kHz mono
  const offlineCtx = new OfflineAudioContext(1, decoded.duration * 16000, 16000);
  const source = offlineCtx.createBufferSource();
  source.buffer = decoded;
  source.connect(offlineCtx.destination);
  source.start(0);

  const rendered = await offlineCtx.startRendering();
  audioCtx.close();

  return rendered.getChannelData(0);
}


/**
 * Get duration of an audio file in seconds
 * @param {File|Blob} file
 * @returns {Promise<number>}
 */
export async function getAudioDuration(file) {
  const arrayBuffer = await file.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer);
  const duration = decoded.duration;
  audioCtx.close();
  return duration;
}


/**
 * Format seconds to mm:ss or hh:mm:ss
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}


/**
 * Play a Blob of audio
 * @param {Blob} blob
 * @returns {{ audio: HTMLAudioElement, stop: function }}
 */
export function playAudioBlob(blob) {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.play();

  audio.addEventListener('ended', () => {
    URL.revokeObjectURL(url);
  });

  return {
    audio,
    stop: () => {
      audio.pause();
      audio.currentTime = 0;
      URL.revokeObjectURL(url);
    },
  };
}


// --- Microphone Recording ---

let mediaRecorder = null;
let recordedChunks = [];

/**
 * Check if microphone access is available
 * @returns {Promise<boolean>}
 */
export async function isMicAvailable() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some(d => d.kind === 'audioinput');
  } catch {
    return false;
  }
}


/**
 * Request microphone permission
 * @returns {Promise<boolean>} true if granted
 */
export async function requestMicPermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
    return true;
  } catch {
    return false;
  }
}


/**
 * Start recording from the microphone
 * @param {function} onDataAvailable - called with Blob chunks
 * @returns {Promise<boolean>} true if recording started
 */
export async function startRecording(onDataAvailable) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm',
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        recordedChunks.push(e.data);
        if (onDataAvailable) onDataAvailable(e.data);
      }
    };

    mediaRecorder.start(1000); // Collect data every 1s
    return true;
  } catch {
    return false;
  }
}


/**
 * Stop recording and return the recorded audio as a Blob
 * @returns {Promise<Blob>}
 */
export function stopRecording() {
  return new Promise((resolve) => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      resolve(null);
      return;
    }

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'audio/webm' });
      recordedChunks = [];

      // Stop all tracks
      mediaRecorder.stream.getTracks().forEach(t => t.stop());
      mediaRecorder = null;

      resolve(blob);
    };

    mediaRecorder.stop();
  });
}


/**
 * Check if currently recording
 * @returns {boolean}
 */
export function isRecording() {
  return mediaRecorder !== null && mediaRecorder.state === 'recording';
}

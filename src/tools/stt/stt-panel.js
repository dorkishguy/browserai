/**
 * STT Panel — Speech to Text UI
 */

import { initSTT, transcribeAudio, isSTTReady } from './stt-engine.js';
import { uploadFile, downloadText } from '../../shared/file-utils.js';
import { decodeAudioToFloat32, startRecording, stopRecording, isRecording, requestMicPermission, formatDuration } from '../../shared/audio-utils.js';
import { getPreference, setPreference } from '../../shared/storage.js';
import { getIcon, createControlGroup, createSelect, showToast, copyToClipboard } from '../../shared/ui-utils.js';

export function createSTTPanel() {
  const panel = document.createElement('div');
  panel.className = 'tool-panel active';
  panel.id = 'stt-panel';

  const savedModel = getPreference('stt_model', 'tiny');
  const savedLang = getPreference('stt_language', 'english');

  panel.innerHTML = `
    <div class="tool-header">
      <h2>Speech to Text</h2>
    </div>

    <!-- Model loader -->
    <div id="stt-loader">
      <div class="model-loader">
        <div class="spinner" id="stt-spinner" style="display:none;"></div>
        <h3 id="stt-loader-title">Ready to load Whisper</h3>
        <p class="text-caption text-muted" id="stt-loader-desc">
          The Whisper model will be downloaded on first use and cached.
        </p>
        <div class="progress-wrap" id="stt-progress" style="display:none;">
          <div class="progress-bar"><div class="progress-fill" id="stt-progress-fill"></div></div>
          <div class="progress-label">
            <span id="stt-progress-status">Preparing...</span>
            <span id="stt-progress-percent">0%</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Tool UI -->
    <div id="stt-tool" style="display:none;" class="flex flex-col gap-lg">
      <!-- Input mode -->
      <div class="flex gap-sm" style="flex-wrap:wrap;">
        <button class="btn btn-primary" id="stt-record-btn">
          ${getIcon('mic')} Record
        </button>
        <button class="btn btn-secondary" id="stt-upload-btn">
          ${getIcon('upload')} Upload Audio
        </button>
        <span class="text-caption text-muted" id="stt-file-info" style="align-self:center;"></span>
      </div>

      <!-- Recording indicator -->
      <div id="stt-recording-indicator" style="display:none;" class="flex items-center gap-sm">
        <span class="recording-dot"></span>
        <span class="text-caption">Recording...</span>
        <button class="btn btn-sm btn-primary" id="stt-stop-record">Stop</button>
      </div>

      <!-- Controls -->
      <div class="controls" id="stt-controls"></div>

      <!-- Transcribe button -->
      <button class="btn btn-cta" id="stt-transcribe" disabled>
        Transcribe
      </button>

      <!-- Output -->
      <div id="stt-output" style="display:none;">
        <div class="output-area">
          <p class="text-body" id="stt-result-text"></p>
        </div>
        <div class="output-actions mt-md">
          <button class="btn btn-primary btn-sm" id="stt-copy">
            ${getIcon('copy')} Copy
          </button>
          <button class="btn btn-secondary btn-sm" id="stt-download">
            ${getIcon('download')} Download .txt
          </button>
        </div>
      </div>
    </div>
  `;

  // State
  let audioData = null; // Float32Array
  let audioFile = null; // File object
  let transcriptionText = '';

  // --- Model loading ---
  async function loadModel() {
    const modelSize = panel.querySelector('#stt-model-select')?.value || savedModel;

    const spinner = panel.querySelector('#stt-spinner');
    const progress = panel.querySelector('#stt-progress');
    const title = panel.querySelector('#stt-loader-title');

    spinner.style.display = 'block';
    title.textContent = 'Loading Whisper...';
    progress.style.display = 'flex';

    try {
      await initSTT(modelSize, ({ progress: p, status }) => {
        const pct = Math.round((p || 0) * 100);
        panel.querySelector('#stt-progress-fill').style.width = pct + '%';
        panel.querySelector('#stt-progress-percent').textContent = pct + '%';
        panel.querySelector('#stt-progress-status').textContent = status || 'Downloading...';
      });

      panel.querySelector('#stt-loader').style.display = 'none';
      panel.querySelector('#stt-tool').style.display = 'flex';
      buildControls();
      checkMicPermission();
    } catch (err) {
      spinner.style.display = 'none';
      progress.style.display = 'none';
      title.textContent = 'Failed to load model';
      panel.querySelector('#stt-loader-desc').textContent = err.message;
    }
  }

  function buildControls() {
    const controlsEl = panel.querySelector('#stt-controls');
    controlsEl.innerHTML = '';

    const modelSelect = createSelect(
      [
        { value: 'tiny', label: 'Tiny (~39 MB)' },
        { value: 'base', label: 'Base (~74 MB)' },
        { value: 'small', label: 'Small (~244 MB)' },
      ],
      savedModel,
      (val) => setPreference('stt_model', val),
    );
    modelSelect.id = 'stt-model-select';
    controlsEl.appendChild(createControlGroup('Model', modelSelect));

    const langSelect = createSelect(
      [
        { value: 'english', label: 'English' },
        { value: 'spanish', label: 'Spanish' },
        { value: 'french', label: 'French' },
        { value: 'german', label: 'German' },
        { value: 'japanese', label: 'Japanese' },
        { value: 'chinese', label: 'Chinese' },
        { value: 'hindi', label: 'Hindi' },
        { value: 'portuguese', label: 'Portuguese' },
        { value: 'italian', label: 'Italian' },
      ],
      savedLang,
      (val) => setPreference('stt_language', val),
    );
    langSelect.id = 'stt-lang-select';
    controlsEl.appendChild(createControlGroup('Language', langSelect));
  }

  async function checkMicPermission() {
    const granted = await requestMicPermission();
    if (!granted) {
      panel.querySelector('#stt-record-btn').style.display = 'none';
      panel.querySelector('#stt-file-info').textContent = 'Mic access denied — use file upload';
    }
  }

  // --- Upload ---
  panel.querySelector('#stt-upload-btn').addEventListener('click', async () => {
    const file = await uploadFile('audio/*,.mp3,.wav,.ogg,.m4a,.webm');
    if (!file) return;

    audioFile = file;
    panel.querySelector('#stt-file-info').textContent = file.name;
    panel.querySelector('#stt-transcribe').disabled = false;

    try {
      audioData = await decodeAudioToFloat32(file);
    } catch (err) {
      showToast('Could not decode audio file');
      audioData = null;
      panel.querySelector('#stt-transcribe').disabled = true;
    }
  });

  // --- Recording ---
  panel.querySelector('#stt-record-btn').addEventListener('click', async () => {
    if (isRecording()) return;

    const started = await startRecording();
    if (!started) {
      showToast('Could not start recording');
      return;
    }

    panel.querySelector('#stt-recording-indicator').style.display = 'flex';
    panel.querySelector('#stt-record-btn').disabled = true;
    panel.querySelector('#stt-transcribe').disabled = true;
  });

  panel.querySelector('#stt-stop-record').addEventListener('click', async () => {
    const blob = await stopRecording();
    panel.querySelector('#stt-recording-indicator').style.display = 'none';
    panel.querySelector('#stt-record-btn').disabled = false;

    if (blob) {
      audioFile = new File([blob], 'recording.webm', { type: blob.type });
      panel.querySelector('#stt-file-info').textContent = 'Recording captured';
      try {
        audioData = await decodeAudioToFloat32(blob);
        panel.querySelector('#stt-transcribe').disabled = false;
      } catch (err) {
        showToast('Could not process recording');
      }
    }
  });

  // --- Transcribe ---
  panel.querySelector('#stt-transcribe').addEventListener('click', async () => {
    if (!audioData) {
      showToast('No audio loaded');
      return;
    }

    const btn = panel.querySelector('#stt-transcribe');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Transcribing...';

    try {
      // Check if we need to reload a different model
      const selectedModel = panel.querySelector('#stt-model-select')?.value || 'tiny';
      if (!isSTTReady()) {
        await initSTT(selectedModel);
      }

      const lang = panel.querySelector('#stt-lang-select')?.value || 'english';
      transcriptionText = await transcribeAudio(audioData, { language: lang });

      panel.querySelector('#stt-result-text').textContent = transcriptionText;
      panel.querySelector('#stt-output').style.display = 'block';
      showToast('Transcription complete!');
    } catch (err) {
      showToast('Error: ' + (err.message || 'Transcription failed'));
      console.error('STT error:', err);
    } finally {
      btn.disabled = false;
      btn.innerHTML = 'Transcribe';
    }
  });

  // --- Copy & Download ---
  panel.querySelector('#stt-copy').addEventListener('click', () => {
    copyToClipboard(transcriptionText);
  });

  panel.querySelector('#stt-download').addEventListener('click', () => {
    if (transcriptionText) {
      downloadText(transcriptionText, 'transcription.txt');
    }
  });

  // Load model
  loadModel();

  return panel;
}

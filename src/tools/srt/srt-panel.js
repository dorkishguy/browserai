/**
 * SRT Panel — Subtitle Generator UI
 */

import { initSTT, transcribeWithTimestamps, isSTTReady } from '../stt/stt-engine.js';
import { uploadFile, downloadText } from '../../shared/file-utils.js';
import { decodeAudioToFloat32, getAudioDuration, formatDuration } from '../../shared/audio-utils.js';
import { formatFileSize, isFileLargerThan } from '../../shared/file-utils.js';
import { getPreference, setPreference } from '../../shared/storage.js';
import { getIcon, createControlGroup, createSelect, showToast } from '../../shared/ui-utils.js';

export function createSRTPanel() {
  const panel = document.createElement('div');
  panel.className = 'tool-panel active';
  panel.id = 'srt-panel';

  const savedModel = getPreference('srt_model', 'base');
  const savedLang = getPreference('srt_language', 'english');
  const savedMaxChars = getPreference('srt_maxchars', 42);

  panel.innerHTML = `
    <div class="tool-header">
      <h2>Subtitle Generator</h2>
    </div>

    <!-- Model loader -->
    <div id="srt-loader">
      <div class="model-loader">
        <div class="spinner" id="srt-spinner" style="display:none;"></div>
        <h3 id="srt-loader-title">Ready to load Whisper</h3>
        <p class="text-caption text-muted" id="srt-loader-desc">
          Uses the same Whisper model as Speech to Text, with timestamp output.
        </p>
        <div class="progress-wrap" id="srt-progress" style="display:none;">
          <div class="progress-bar"><div class="progress-fill" id="srt-progress-fill"></div></div>
          <div class="progress-label">
            <span id="srt-progress-status">Preparing...</span>
            <span id="srt-progress-percent">0%</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Tool UI -->
    <div id="srt-tool" style="display:none;" class="flex flex-col gap-lg">
      <!-- Upload -->
      <div>
        <button class="btn btn-primary" id="srt-upload-btn">
          ${getIcon('upload')} Upload Audio
        </button>
        <span class="text-caption text-muted" id="srt-file-info" style="margin-left:12px;"></span>
      </div>

      <!-- File details -->
      <div id="srt-file-details" style="display:none;" class="card-surface">
        <p><strong id="srt-file-name"></strong></p>
        <p class="text-caption text-muted">Duration: <span id="srt-file-duration">—</span> · Size: <span id="srt-file-size">—</span></p>
      </div>

      <!-- Controls -->
      <div class="controls" id="srt-controls"></div>

      <!-- Generate -->
      <button class="btn btn-cta" id="srt-generate" disabled>
        Generate Subtitles
      </button>

      <!-- Progress -->
      <div id="srt-gen-progress" style="display:none;">
        <div class="progress-wrap">
          <div class="progress-bar"><div class="progress-fill" id="srt-gen-fill"></div></div>
          <div class="progress-label">
            <span id="srt-gen-status">Processing...</span>
            <span id="srt-gen-percent">0%</span>
          </div>
        </div>
      </div>

      <!-- Output / Preview -->
      <div id="srt-output" style="display:none;">
        <div class="output-area">
          <pre class="code-block" id="srt-preview" style="max-height:300px;overflow-y:auto;white-space:pre-wrap;font-size:0.8125rem;"></pre>
        </div>
        <div class="output-actions mt-md">
          <button class="btn btn-primary btn-sm" id="srt-download">
            ${getIcon('download')} Download .srt
          </button>
        </div>
      </div>
    </div>
  `;

  // State
  let audioData = null;
  let audioFile = null;
  let srtContent = '';

  // --- Model loading ---
  async function loadModel() {
    const modelSize = savedModel;

    const spinner = panel.querySelector('#srt-spinner');
    const progress = panel.querySelector('#srt-progress');
    const title = panel.querySelector('#srt-loader-title');

    spinner.style.display = 'block';
    title.textContent = 'Loading Whisper...';
    progress.style.display = 'flex';

    try {
      await initSTT(modelSize, ({ progress: p, status }) => {
        const pct = Math.round((p || 0) * 100);
        panel.querySelector('#srt-progress-fill').style.width = pct + '%';
        panel.querySelector('#srt-progress-percent').textContent = pct + '%';
        panel.querySelector('#srt-progress-status').textContent = status || 'Downloading...';
      });

      panel.querySelector('#srt-loader').style.display = 'none';
      panel.querySelector('#srt-tool').style.display = 'flex';
      buildControls();
    } catch (err) {
      spinner.style.display = 'none';
      progress.style.display = 'none';
      title.textContent = 'Failed to load model';
      panel.querySelector('#srt-loader-desc').textContent = err.message;
    }
  }

  function buildControls() {
    const controlsEl = panel.querySelector('#srt-controls');
    controlsEl.innerHTML = '';

    const modelSelect = createSelect(
      [
        { value: 'tiny', label: 'Tiny (~39 MB)' },
        { value: 'base', label: 'Base (~74 MB)' },
        { value: 'small', label: 'Small (~244 MB)' },
      ],
      savedModel,
      (val) => setPreference('srt_model', val),
    );
    modelSelect.id = 'srt-model-select';
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
      (val) => setPreference('srt_language', val),
    );
    langSelect.id = 'srt-lang-select';
    controlsEl.appendChild(createControlGroup('Language', langSelect));

    // Max chars per line
    const maxCharsInput = document.createElement('input');
    maxCharsInput.type = 'number';
    maxCharsInput.className = 'input';
    maxCharsInput.value = savedMaxChars;
    maxCharsInput.min = 20;
    maxCharsInput.max = 80;
    maxCharsInput.style.width = '80px';
    maxCharsInput.style.padding = '6px 12px';
    maxCharsInput.style.borderRadius = 'var(--radius-pill)';
    maxCharsInput.id = 'srt-maxchars';
    maxCharsInput.addEventListener('change', () => {
      setPreference('srt_maxchars', parseInt(maxCharsInput.value) || 42);
    });
    controlsEl.appendChild(createControlGroup('Max chars/line', maxCharsInput));
  }

  // --- Upload ---
  panel.querySelector('#srt-upload-btn').addEventListener('click', async () => {
    const file = await uploadFile('audio/*,.mp3,.wav,.ogg,.m4a');
    if (!file) return;

    // Large file warning
    if (isFileLargerThan(file, 100)) {
      if (!confirm(`This file is ${formatFileSize(file.size)}. Processing may take a while. Continue?`)) {
        return;
      }
    }

    audioFile = file;

    // Show file details
    panel.querySelector('#srt-file-details').style.display = 'block';
    panel.querySelector('#srt-file-name').textContent = file.name;
    panel.querySelector('#srt-file-size').textContent = formatFileSize(file.size);

    try {
      const duration = await getAudioDuration(file);
      panel.querySelector('#srt-file-duration').textContent = formatDuration(duration);

      // Warn for very long audio
      if (duration > 3600) {
        showToast('Long audio detected — processing may take several minutes');
      }

      audioData = await decodeAudioToFloat32(file);
      panel.querySelector('#srt-generate').disabled = false;
    } catch (err) {
      showToast('Could not decode audio file');
      audioData = null;
      panel.querySelector('#srt-generate').disabled = true;
    }
  });

  // --- Generate SRT ---
  panel.querySelector('#srt-generate').addEventListener('click', async () => {
    if (!audioData) {
      showToast('No audio loaded');
      return;
    }

    const btn = panel.querySelector('#srt-generate');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Generating...';
    panel.querySelector('#srt-gen-progress').style.display = 'block';

    try {
      const lang = panel.querySelector('#srt-lang-select')?.value || 'english';
      const maxChars = parseInt(panel.querySelector('#srt-maxchars')?.value) || 42;

      const chunks = await transcribeWithTimestamps(audioData, {
        language: lang,
        chunk_length_s: 30,
        stride_length_s: 5,
      });

      // Convert chunks to SRT
      srtContent = chunksToSRT(chunks, maxChars);

      // Show preview
      panel.querySelector('#srt-preview').textContent = srtContent;
      panel.querySelector('#srt-output').style.display = 'block';
      panel.querySelector('#srt-gen-progress').style.display = 'none';
      showToast('Subtitles generated!');
    } catch (err) {
      showToast('Error: ' + (err.message || 'Generation failed'));
      console.error('SRT error:', err);
      panel.querySelector('#srt-gen-progress').style.display = 'none';
    } finally {
      btn.disabled = false;
      btn.innerHTML = 'Generate Subtitles';
    }
  });

  // --- Download ---
  panel.querySelector('#srt-download').addEventListener('click', () => {
    if (srtContent) {
      const filename = audioFile
        ? audioFile.name.replace(/\.[^.]+$/, '.srt')
        : 'subtitles.srt';
      downloadText(srtContent, filename);
    }
  });

  // Load model
  loadModel();

  return panel;
}


/**
 * Convert Whisper chunks to SRT format
 * @param {Array<{text: string, timestamp: [number, number]}>} chunks
 * @param {number} maxCharsPerLine
 * @returns {string} SRT content
 */
function chunksToSRT(chunks, maxCharsPerLine = 42) {
  return chunks.map((chunk, index) => {
    const [start, end] = chunk.timestamp;
    const startTime = formatSRTTime(start);
    const endTime = formatSRTTime(end ?? start + 3);
    const text = wrapText(chunk.text.trim(), maxCharsPerLine);

    return `${index + 1}\n${startTime} --> ${endTime}\n${text}\n`;
  }).join('\n');
}


/**
 * Format seconds to SRT timestamp: HH:MM:SS,mmm
 */
function formatSRTTime(seconds) {
  if (seconds == null || isNaN(seconds)) seconds = 0;
  const date = new Date(seconds * 1000);
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  const mmm = String(date.getUTCMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss},${mmm}`;
}


/**
 * Wrap text to a maximum character width per line
 */
function wrapText(text, maxChars) {
  if (text.length <= maxChars) return text;

  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 > maxChars && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = currentLine ? currentLine + ' ' + word : word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines.join('\n');
}

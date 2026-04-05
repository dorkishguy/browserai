/**
 * TTS Panel — Text to Speech UI
 */

import { initTTS, generateSpeech, getVoices, isTTSReady } from './tts-engine.js';
import { downloadBlob } from '../../shared/file-utils.js';
import { getPreference, setPreference } from '../../shared/storage.js';
import { getIcon, createControlGroup, createSelect, createSlider, showToast } from '../../shared/ui-utils.js';
import { formatDuration } from '../../shared/audio-utils.js';

export function createTTSPanel() {
  const panel = document.createElement('div');
  panel.className = 'tool-panel active';
  panel.id = 'tts-panel';

  const savedVoice = getPreference('tts_voice', 'af_heart');
  const savedSpeed = getPreference('tts_speed', 1.0);

  panel.innerHTML = `
    <div class="tool-header">
      <h2>Text to Speech</h2>
    </div>

    <!-- Model loader area -->
    <div id="tts-loader">
      <div class="model-loader">
        <div class="spinner" id="tts-spinner" style="display:none;"></div>
        <h3 id="tts-loader-title">Ready to load Kokoro TTS</h3>
        <p class="text-caption text-muted" id="tts-loader-desc">
          The Kokoro TTS model (~80 MB) will be downloaded on first use and cached for later.
        </p>
        <div class="progress-wrap" id="tts-progress" style="display:none;">
          <div class="progress-bar"><div class="progress-fill" id="tts-progress-fill"></div></div>
          <div class="progress-label">
            <span id="tts-progress-status">Preparing...</span>
            <span id="tts-progress-percent">0%</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Main tool UI (hidden until model loaded) -->
    <div id="tts-tool" style="display:none;" class="flex flex-col gap-lg">
      <textarea
        class="textarea"
        id="tts-input"
        placeholder="Enter or paste your text here..."
        rows="6"
      ></textarea>

      <div class="controls" id="tts-controls"></div>

      <button class="btn btn-cta" id="tts-generate">
        Generate Speech
      </button>

      <div id="tts-output" style="display:none;">
        <div class="output-area">
          <div class="audio-player" id="tts-player">
            <button id="tts-play-btn" title="Play">${getIcon('play')}</button>
            <div class="audio-progress">
              <div class="audio-progress-fill" id="tts-audio-fill"></div>
            </div>
            <span class="audio-time" id="tts-audio-time">0:00 / 0:00</span>
          </div>
          <div class="output-actions mt-md">
            <button class="btn btn-primary btn-sm" id="tts-download">
              ${getIcon('download')} Download WAV
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // State
  let audioBlob = null;
  let audioEl = null;
  let isPlaying = false;
  let animFrame = null;

  // --- Initialize model on panel creation ---
  async function loadModel() {
    const spinner = panel.querySelector('#tts-spinner');
    const progress = panel.querySelector('#tts-progress');
    const title = panel.querySelector('#tts-loader-title');
    const desc = panel.querySelector('#tts-loader-desc');

    spinner.style.display = 'block';
    title.textContent = 'Loading Kokoro TTS...';
    progress.style.display = 'flex';

    try {
      await initTTS(({ progress: p, status }) => {
        const pct = Math.round((p || 0) * 100);
        panel.querySelector('#tts-progress-fill').style.width = pct + '%';
        panel.querySelector('#tts-progress-percent').textContent = pct + '%';
        panel.querySelector('#tts-progress-status').textContent = status || 'Downloading...';
      });

      // Model loaded — show tool UI
      panel.querySelector('#tts-loader').style.display = 'none';
      panel.querySelector('#tts-tool').style.display = 'flex';
      buildControls();
    } catch (err) {
      spinner.style.display = 'none';
      progress.style.display = 'none';
      title.textContent = 'Failed to load model';
      desc.textContent = err.message || 'An unknown error occurred.';
      desc.style.display = 'block';
    }
  }

  function buildControls() {
    const controlsEl = panel.querySelector('#tts-controls');
    controlsEl.innerHTML = '';

    // Voice selector
    const voices = getVoices();
    const voiceOptions = (Array.isArray(voices) ? voices : []).map(v => ({
      value: typeof v === 'string' ? v : v.id || v.name || String(v),
      label: typeof v === 'string' ? formatVoiceName(v) : v.name || String(v),
    }));

    if (voiceOptions.length === 0) {
      voiceOptions.push({ value: 'af_heart', label: 'Heart (US Female)' });
    }

    const voiceSelect = createSelect(voiceOptions, savedVoice, (val) => {
      setPreference('tts_voice', val);
    });
    voiceSelect.id = 'tts-voice-select';
    controlsEl.appendChild(createControlGroup('Voice', voiceSelect));

    // Speed slider
    const { container: speedContainer, input: speedInput } = createSlider({
      min: 0.5,
      max: 2.0,
      value: savedSpeed,
      step: 0.1,
      onChange: (val) => setPreference('tts_speed', val),
    });
    speedInput.id = 'tts-speed-input';
    controlsEl.appendChild(createControlGroup('Speed', speedContainer));
  }

  // --- Generate ---
  panel.querySelector('#tts-generate').addEventListener('click', async () => {
    const text = panel.querySelector('#tts-input').value.trim();
    if (!text) {
      showToast('Please enter some text');
      return;
    }

    if (!isTTSReady()) {
      showToast('Model is still loading...');
      return;
    }

    const btn = panel.querySelector('#tts-generate');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Generating...';

    try {
      const voice = panel.querySelector('#tts-voice-select')?.value || 'af_heart';
      const speed = parseFloat(panel.querySelector('#tts-speed-input')?.value || '1.0');

      audioBlob = await generateSpeech(text, { voice, speed });

      // Show output
      panel.querySelector('#tts-output').style.display = 'block';
      setupAudioPlayer();
      showToast('Speech generated!');
    } catch (err) {
      showToast('Error: ' + (err.message || 'Generation failed'));
      console.error('TTS error:', err);
    } finally {
      btn.disabled = false;
      btn.innerHTML = 'Generate Speech';
    }
  });

  // --- Audio player ---
  function setupAudioPlayer() {
    if (audioEl) {
      audioEl.pause();
      URL.revokeObjectURL(audioEl.src);
    }

    const url = URL.createObjectURL(audioBlob);
    audioEl = new Audio(url);
    isPlaying = false;

    audioEl.addEventListener('loadedmetadata', () => {
      updateTimeDisplay();
    });

    audioEl.addEventListener('ended', () => {
      isPlaying = false;
      panel.querySelector('#tts-play-btn').innerHTML = getIcon('play');
      cancelAnimationFrame(animFrame);
      updateTimeDisplay();
    });
  }

  function updateTimeDisplay() {
    if (!audioEl) return;
    const current = formatDuration(audioEl.currentTime || 0);
    const total = formatDuration(audioEl.duration || 0);
    panel.querySelector('#tts-audio-time').textContent = `${current} / ${total}`;

    const pct = audioEl.duration ? (audioEl.currentTime / audioEl.duration) * 100 : 0;
    panel.querySelector('#tts-audio-fill').style.width = pct + '%';
  }

  function tickPlayer() {
    updateTimeDisplay();
    if (isPlaying) {
      animFrame = requestAnimationFrame(tickPlayer);
    }
  }

  // Play/pause
  panel.querySelector('#tts-play-btn').addEventListener('click', () => {
    if (!audioEl) return;

    if (isPlaying) {
      audioEl.pause();
      isPlaying = false;
      panel.querySelector('#tts-play-btn').innerHTML = getIcon('play');
      cancelAnimationFrame(animFrame);
    } else {
      audioEl.play();
      isPlaying = true;
      panel.querySelector('#tts-play-btn').innerHTML = getIcon('pause');
      tickPlayer();
    }
  });

  // Download
  panel.querySelector('#tts-download').addEventListener('click', () => {
    if (audioBlob) {
      downloadBlob(audioBlob, 'antigravity-tts-output.wav');
    }
  });

  // Kick off model loading
  loadModel();

  return panel;
}


/**
 * Format voice ID to friendly name
 * e.g. "af_heart" → "Heart (US Female)"
 */
function formatVoiceName(id) {
  const langMap = {
    a: 'US', b: 'UK', j: 'JP', z: 'CN',
    e: 'ES', f: 'FR', h: 'HI', i: 'IT', p: 'BR',
  };
  const genderMap = { f: 'Female', m: 'Male' };

  if (id.length < 3 || id[2] !== '_') return id;

  const lang = langMap[id[0]] || '??';
  const gender = genderMap[id[1]] || '??';
  const name = id.substring(3).charAt(0).toUpperCase() + id.substring(4);

  return `${name} (${lang} ${gender})`;
}

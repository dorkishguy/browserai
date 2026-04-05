/**
 * Reusable model download / loading UI component
 * Shows progress bar, size warnings, and offline detection
 */

import { formatBytes } from './storage.js';

/**
 * Create a model loader UI element
 * @param {object} opts
 * @param {string} opts.modelName - Display name of the model
 * @param {string} opts.sizeEstimate - Human-readable size string, e.g. "~80 MB"
 * @param {function} opts.onConfirm - Called when user confirms download
 * @param {function} opts.onCancel - Called when user cancels
 * @returns {HTMLElement}
 */
export function createModelLoader({ modelName, sizeEstimate, onConfirm, onCancel }) {
  const el = document.createElement('div');
  el.className = 'model-loader';
  el.id = 'model-loader';

  el.innerHTML = `
    <div class="spinner" id="model-loader-spinner" style="display:none;"></div>
    <h3 id="model-loader-title">Download Required</h3>
    <p class="text-caption" id="model-loader-desc">
      <strong>${modelName}</strong> needs to be downloaded (${sizeEstimate}).
      It will be cached for future use.
    </p>
    <div class="progress-wrap" id="model-loader-progress" style="display:none;">
      <div class="progress-bar"><div class="progress-fill" id="model-loader-fill"></div></div>
      <div class="progress-label">
        <span id="model-loader-status">Preparing...</span>
        <span id="model-loader-percent">0%</span>
      </div>
    </div>
    <div id="model-loader-actions" style="display:flex;gap:8px;">
      <button class="btn btn-cta" id="model-loader-confirm">Download</button>
      ${onCancel ? '<button class="btn btn-secondary" id="model-loader-cancel">Cancel</button>' : ''}
    </div>
    <p class="text-small text-silver" id="model-loader-offline" style="display:none;">
      You appear to be offline. Connect to the internet to download this model.
    </p>
  `;

  // Wire up buttons
  el.querySelector('#model-loader-confirm').addEventListener('click', () => {
    if (!navigator.onLine) {
      el.querySelector('#model-loader-offline').style.display = 'block';
      return;
    }
    if (onConfirm) onConfirm();
  });

  if (onCancel) {
    const cancelBtn = el.querySelector('#model-loader-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', onCancel);
  }

  // Check online status
  if (!navigator.onLine) {
    el.querySelector('#model-loader-offline').style.display = 'block';
    el.querySelector('#model-loader-confirm').disabled = true;
  }

  window.addEventListener('online', () => {
    el.querySelector('#model-loader-offline').style.display = 'none';
    el.querySelector('#model-loader-confirm').disabled = false;
  });

  window.addEventListener('offline', () => {
    el.querySelector('#model-loader-offline').style.display = 'block';
  });

  return el;
}


/**
 * Update model loader progress
 * @param {HTMLElement} loaderEl - The model loader element
 * @param {object} progress
 * @param {number} progress.progress - 0 to 1
 * @param {string} [progress.status] - Status text
 */
export function updateModelLoaderProgress(loaderEl, { progress, status }) {
  const fill = loaderEl.querySelector('#model-loader-fill');
  const statusEl = loaderEl.querySelector('#model-loader-status');
  const percentEl = loaderEl.querySelector('#model-loader-percent');
  const progressWrap = loaderEl.querySelector('#model-loader-progress');
  const actions = loaderEl.querySelector('#model-loader-actions');
  const spinner = loaderEl.querySelector('#model-loader-spinner');
  const title = loaderEl.querySelector('#model-loader-title');
  const desc = loaderEl.querySelector('#model-loader-desc');

  // Show progress, hide actions
  progressWrap.style.display = 'flex';
  actions.style.display = 'none';
  spinner.style.display = 'block';
  title.textContent = 'Downloading Model...';
  desc.style.display = 'none';

  const pct = Math.round(progress * 100);
  fill.style.width = pct + '%';
  percentEl.textContent = pct + '%';
  if (status) statusEl.textContent = status;
}


/**
 * Show model loader as "ready" (model loaded successfully)
 */
export function setModelLoaderReady(loaderEl, message = 'Model loaded') {
  loaderEl.querySelector('#model-loader-progress').style.display = 'none';
  loaderEl.querySelector('#model-loader-actions').style.display = 'none';
  loaderEl.querySelector('#model-loader-spinner').style.display = 'none';
  loaderEl.querySelector('#model-loader-title').textContent = message;
  loaderEl.querySelector('#model-loader-desc').style.display = 'none';
}


/**
 * Show model loader error
 */
export function setModelLoaderError(loaderEl, errorMsg) {
  loaderEl.querySelector('#model-loader-spinner').style.display = 'none';
  loaderEl.querySelector('#model-loader-title').textContent = 'Error';
  loaderEl.querySelector('#model-loader-desc').style.display = 'block';
  loaderEl.querySelector('#model-loader-desc').textContent = errorMsg;
  loaderEl.querySelector('#model-loader-progress').style.display = 'none';
  loaderEl.querySelector('#model-loader-actions').style.display = 'flex';
}

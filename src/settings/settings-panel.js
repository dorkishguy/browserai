/**
 * Settings Panel — Cache management, storage info, browser compatibility
 */

import { getStorageEstimate, formatBytes, isIndexedDBAvailable } from '../shared/storage.js';
import { getIcon, showToast } from '../shared/ui-utils.js';

export function createSettingsPanel() {
  const panel = document.createElement('div');
  panel.className = 'tool-panel active';
  panel.id = 'settings-panel';

  panel.innerHTML = `
    <div class="tool-header">
      <h2>Settings</h2>
    </div>

    <!-- Storage -->
    <div class="settings-section flex flex-col gap-md">
      <h3 style="font-size:1.125rem;">Storage</h3>
      <p class="text-caption text-muted">Models are cached in your browser so they don't need to be re-downloaded.</p>

      <div class="card" id="settings-storage-info">
        <div class="storage-item">
          <span class="storage-item-name">Total storage used</span>
          <span class="storage-item-size" id="settings-usage">Calculating...</span>
        </div>
        <div class="storage-item">
          <span class="storage-item-name">Storage quota</span>
          <span class="storage-item-size" id="settings-quota">—</span>
        </div>
      </div>

      <div class="flex gap-sm">
        <button class="btn btn-primary btn-sm" id="settings-clear-cache">${getIcon('trash')} Clear All Cached Models</button>
        <button class="btn btn-secondary btn-sm" id="settings-refresh">${getIcon('settings')} Refresh</button>
      </div>
    </div>

    <!-- Browser Compatibility -->
    <div class="settings-section flex flex-col gap-md mt-lg">
      <h3 style="font-size:1.125rem;">Browser Compatibility</h3>
      <div class="card" id="settings-compat">
        <div class="storage-item">
          <span class="storage-item-name">WebGPU</span>
          <span class="storage-item-size" id="compat-webgpu">Checking...</span>
        </div>
        <div class="storage-item">
          <span class="storage-item-name">WebAssembly</span>
          <span class="storage-item-size" id="compat-wasm">Checking...</span>
        </div>
        <div class="storage-item">
          <span class="storage-item-name">Web Workers</span>
          <span class="storage-item-size" id="compat-workers">Checking...</span>
        </div>
        <div class="storage-item">
          <span class="storage-item-name">IndexedDB</span>
          <span class="storage-item-size" id="compat-indexeddb">Checking...</span>
        </div>
        <div class="storage-item">
          <span class="storage-item-name">Web Audio</span>
          <span class="storage-item-size" id="compat-webaudio">Checking...</span>
        </div>
        <div class="storage-item">
          <span class="storage-item-name">Status</span>
          <span class="storage-item-size" id="compat-status">—</span>
        </div>
      </div>
    </div>

    <!-- About -->
    <div class="settings-section flex flex-col gap-md mt-lg">
      <h3 style="font-size:1.125rem;">About</h3>
      <p class="text-body">
        <strong>Antigravity</strong> is a collection of free AI tools that run entirely in your browser.
        No data ever leaves your device. No accounts, no servers, no tracking.
      </p>
      <p class="text-caption text-muted">
        Works offline once models are downloaded. Host it yourself by cloning the repo and opening index.html.
      </p>
    </div>
  `;

  // --- Load storage info ---
  async function refreshStorage() {
    const est = await getStorageEstimate();
    if (est) {
      panel.querySelector('#settings-usage').textContent = formatBytes(est.usage || 0);
      panel.querySelector('#settings-quota').textContent = formatBytes(est.quota || 0);
    } else {
      panel.querySelector('#settings-usage').textContent = 'Unavailable';
      panel.querySelector('#settings-quota').textContent = 'Unavailable';
    }
  }

  // --- Check compatibility ---
  async function checkCompat() {
    // WebGPU
    let webgpu = false;
    if (navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        webgpu = adapter !== null;
      } catch {}
    }
    panel.querySelector('#compat-webgpu').textContent = webgpu ? '✓ Supported' : '✗ Not available';

    // WASM
    const wasm = typeof WebAssembly !== 'undefined';
    panel.querySelector('#compat-wasm').textContent = wasm ? '✓ Supported' : '✗ Not available';

    // Workers
    const workers = typeof Worker !== 'undefined';
    panel.querySelector('#compat-workers').textContent = workers ? '✓ Supported' : '✗ Not available';

    // IndexedDB
    const idb = isIndexedDBAvailable();
    panel.querySelector('#compat-indexeddb').textContent = idb ? '✓ Supported' : '✗ Not available';

    // Web Audio
    const audio = typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined';
    panel.querySelector('#compat-webaudio').textContent = audio ? '✓ Supported' : '✗ Not available';

    // Overall
    const allGood = wasm && workers && idb && audio;
    panel.querySelector('#compat-status').textContent = allGood
      ? (webgpu ? '✓ All features available (GPU accelerated)' : '✓ All features available (CPU mode)')
      : '✗ Some features may not work';
  }

  // --- Clear cache ---
  panel.querySelector('#settings-clear-cache').addEventListener('click', async () => {
    if (!confirm('This will delete all cached models. You will need to re-download them. Continue?')) return;
    try {
      const dbs = await indexedDB.databases();
      for (const db of dbs) {
        if (db.name) indexedDB.deleteDatabase(db.name);
      }
      // Also clear cache storage
      if ('caches' in window) {
        const keys = await caches.keys();
        for (const key of keys) { await caches.delete(key); }
      }
      showToast('All cached models cleared');
      refreshStorage();
    } catch (err) {
      showToast('Error clearing cache: ' + err.message);
    }
  });

  panel.querySelector('#settings-refresh').addEventListener('click', refreshStorage);

  // Init
  refreshStorage();
  checkCompat();

  return panel;
}

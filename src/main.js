/**
 * Antigravity — Main App Shell
 * Handles navigation, panel switching, and landing page
 */

import { getPreference, setPreference } from './shared/storage.js';
import { getIcon } from './shared/ui-utils.js';
import { createTTSPanel } from './tools/tts/tts-panel.js';
import { createSTTPanel } from './tools/stt/stt-panel.js';
import { createSRTPanel } from './tools/srt/srt-panel.js';
import { createChatPanel } from './tools/chat/chat-panel.js';
import { createSettingsPanel } from './settings/settings-panel.js';
import { initLogger, showLogModal } from './shared/logger.js';

const TOOLS = [
  {
    id: 'tts',
    name: 'Text to Speech',
    shortName: 'TTS',
    icon: 'tts',
    desc: 'Convert text to natural-sounding speech using Kokoro TTS.',
    size: '~80 MB model',
    create: createTTSPanel,
  },
  {
    id: 'stt',
    name: 'Speech to Text',
    shortName: 'STT',
    icon: 'stt',
    desc: 'Transcribe audio to text using Whisper, right in your browser.',
    size: '~40–250 MB model',
    create: createSTTPanel,
  },
  {
    id: 'srt',
    name: 'Subtitle Generator',
    shortName: 'SRT',
    icon: 'srt',
    desc: 'Generate .srt subtitle files from audio with timestamps.',
    size: '~40–250 MB model',
    create: createSRTPanel,
  },
  {
    id: 'chat',
    name: 'Chat with LLMs',
    shortName: 'Chat',
    icon: 'chat',
    desc: 'Chat with open-source language models running locally.',
    size: '~900 MB–4 GB model',
    create: createChatPanel,
  },
];

let currentTool = null;
let panelCache = {};
let mobileMenuOpen = false;

function init() {
  const app = document.getElementById('app');
  app.innerHTML = '';

  // Initialize global logger early
  initLogger();

  // --- Navigation ---
  const header = document.createElement('header');
  header.innerHTML = `
    <nav class="nav" id="main-nav">
      <a href="#" class="nav-brand" id="nav-brand">
        ${getIcon('arrowUp')}
        <span>Antigravity</span>
      </a>
      <div class="nav-links" id="nav-links">
        ${TOOLS.map(t => `
          <button class="nav-link" data-tool="${t.id}" id="nav-${t.id}">
            ${t.shortName}
          </button>
        `).join('')}
      </div>
      <div class="nav-right">
        <button class="btn-icon" id="nav-logs" title="System Logs">
          ${getIcon('terminal')}
        </button>
        <button class="btn-icon" id="nav-settings" title="Settings">
          ${getIcon('settings')}
        </button>
        <button class="nav-hamburger" id="nav-hamburger" title="Menu">
          ${getIcon('menu')}
        </button>
      </div>
    </nav>
  `;
  app.appendChild(header);

  // Mobile menu
  const mobileMenu = document.createElement('div');
  mobileMenu.className = 'nav-mobile-menu';
  mobileMenu.id = 'mobile-menu';
  mobileMenu.innerHTML = `
    ${TOOLS.map(t => `
      <button class="nav-link" data-tool="${t.id}">
        ${t.shortName}
      </button>
    `).join('')}
    <button class="nav-link" data-tool="settings">Settings</button>
  `;
  app.appendChild(mobileMenu);

  // --- Main Content ---
  const main = document.createElement('main');
  main.className = 'main';
  main.id = 'main-content';
  app.appendChild(main);

  // --- Event Listeners ---

  // Brand click → landing
  document.getElementById('nav-brand').addEventListener('click', (e) => {
    e.preventDefault();
    showLanding();
  });

  // Nav link clicks
  document.getElementById('nav-links').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tool]');
    if (btn) switchTool(btn.dataset.tool);
  });

  // Logs
  document.getElementById('nav-logs').addEventListener('click', () => {
    showLogModal();
  });

  // Settings
  document.getElementById('nav-settings').addEventListener('click', () => {
    switchTool('settings');
  });

  // Hamburger
  document.getElementById('nav-hamburger').addEventListener('click', () => {
    mobileMenuOpen = !mobileMenuOpen;
    const menu = document.getElementById('mobile-menu');
    menu.classList.toggle('open', mobileMenuOpen);
    document.getElementById('nav-hamburger').innerHTML = mobileMenuOpen ? getIcon('x') : getIcon('menu');
  });

  // Mobile menu clicks
  mobileMenu.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tool]');
    if (btn) {
      switchTool(btn.dataset.tool);
      mobileMenuOpen = false;
      mobileMenu.classList.remove('open');
      document.getElementById('nav-hamburger').innerHTML = getIcon('menu');
    }
  });

  // Restore last tool or show landing
  const lastTool = getPreference('lastTool');
  if (lastTool && TOOLS.some(t => t.id === lastTool)) {
    switchTool(lastTool);
  } else {
    showLanding();
  }
}


function showLanding() {
  currentTool = null;
  updateNavHighlight(null);
  setPreference('lastTool', null);

  const main = document.getElementById('main-content');
  main.innerHTML = '';

  const landing = document.createElement('div');
  landing.className = 'landing';
  landing.innerHTML = `
    <div class="landing-icon">${getIcon('arrowUp')}</div>
    <h1>AI tools that respect you</h1>
    <p class="landing-subtitle">
      Free forever. Runs entirely in your browser. No accounts, no servers, no tracking.
    </p>
    <div class="tool-grid" id="tool-grid">
      ${TOOLS.map(t => `
        <div class="tool-card" data-tool="${t.id}" id="landing-${t.id}" tabindex="0" role="button">
          <span class="tool-card-icon">${getIcon(t.icon)}</span>
          <span class="tool-card-title">${t.name}</span>
          <span class="tool-card-desc">${t.desc}</span>
          <span class="tool-card-size">${t.size}</span>
        </div>
      `).join('')}
    </div>
  `;

  // Scale the landing icon
  const iconEl = landing.querySelector('.landing-icon');
  if (iconEl) {
    const svg = iconEl.querySelector('svg');
    if (svg) {
      svg.setAttribute('width', '80');
      svg.setAttribute('height', '80');
    }
  }

  // Card clicks
  landing.querySelector('#tool-grid').addEventListener('click', (e) => {
    const card = e.target.closest('[data-tool]');
    if (card) switchTool(card.dataset.tool);
  });

  // Keyboard support
  landing.querySelector('#tool-grid').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const card = e.target.closest('[data-tool]');
      if (card) {
        e.preventDefault();
        switchTool(card.dataset.tool);
      }
    }
  });

  main.appendChild(landing);
}


function switchTool(toolId) {
  const main = document.getElementById('main-content');
  main.innerHTML = '';

  if (toolId === 'settings') {
    currentTool = 'settings';
    updateNavHighlight('settings');

    if (!panelCache.settings) {
      panelCache.settings = createSettingsPanel();
    }
    main.appendChild(panelCache.settings);
    return;
  }

  const tool = TOOLS.find(t => t.id === toolId);
  if (!tool) {
    showLanding();
    return;
  }

  currentTool = toolId;
  updateNavHighlight(toolId);
  setPreference('lastTool', toolId);

  // Create panel if not cached
  if (!panelCache[toolId]) {
    panelCache[toolId] = tool.create();
  }

  main.appendChild(panelCache[toolId]);
}


function updateNavHighlight(toolId) {
  // Desktop nav
  document.querySelectorAll('#nav-links .nav-link').forEach(link => {
    link.classList.toggle('nav-link-active', link.dataset.tool === toolId);
  });

  // Settings button
  const settingsBtn = document.getElementById('nav-settings');
  if (settingsBtn) {
    settingsBtn.style.background = toolId === 'settings' ? 'var(--color-snow)' : 'transparent';
  }
}


// Boot
init();

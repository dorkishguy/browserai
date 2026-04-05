/**
 * Global Logger
 * Intercepts console logs to display in an internal terminal viewer.
 */

import { getIcon } from './ui-utils.js';

const MAX_LOGS = 2000;
const logBuffer = [];
let modalContainer = null;
let logContentEl = null;

// True native references so we don't mute actual devtools
const nativeConsoles = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
};

/**
 * Monkey-patches console to record logs
 */
export function initLogger() {
  ['log', 'warn', 'error', 'info', 'debug'].forEach(level => {
    console[level] = function (...args) {
      // 1. Call original
      nativeConsoles[level](...args);

      // 2. Format
      const msg = args.map(formatLogArg).join(' ');
      addLog(level, msg);
    };
  });
}

/**
 * Format various types nicely into strings
 */
function formatLogArg(arg) {
  if (arg === null) return 'null';
  if (arg === undefined) return 'undefined';
  if (arg instanceof Error) return arg.stack || arg.toString();
  if (typeof arg === 'object') {
    try {
      return JSON.stringify(arg);
    } catch {
      return '[Object]';
    }
  }
  return String(arg);
}

/**
 * Add a log and update UI if open
 */
function addLog(level, text) {
  const time = new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3
  });
  
  const entry = { level, text, time };
  logBuffer.push(entry);

  if (logBuffer.length > MAX_LOGS) {
    logBuffer.shift(); // remove oldest
  }

  // If UI is open, append
  if (logContentEl) {
    appendLogUI(entry);
  }
}

/**
 * Show the internal floating terminal modal
 */
export function showLogModal() {
  if (modalContainer) return; // already open

  modalContainer = document.createElement('div');
  modalContainer.className = 'log-modal-backdrop';
  
  modalContainer.innerHTML = `
    <div class="log-modal-window">
      <div class="log-modal-header">
        <span class="log-modal-title">${getIcon('terminal')} System Logs</span>
        <div class="flex gap-sm">
          <button class="btn btn-sm btn-secondary" id="log-clear-btn">Clear</button>
          <button class="btn-icon" id="log-close-btn" title="Close">${getIcon('x')}</button>
        </div>
      </div>
      <div class="log-modal-content" id="log-modal-content"></div>
    </div>
  `;

  document.body.appendChild(modalContainer);

  logContentEl = modalContainer.querySelector('#log-modal-content');
  
  // Render existing
  logBuffer.forEach(appendLogUI);

  // Scroll to bottom immediately
  scrollToBottom();

  // Events
  modalContainer.querySelector('#log-close-btn').addEventListener('click', closeLogModal);
  modalContainer.querySelector('#log-clear-btn').addEventListener('click', () => {
    logBuffer.length = 0;
    if (logContentEl) logContentEl.innerHTML = '';
  });

  // Close on backdrop click
  modalContainer.addEventListener('click', (e) => {
    if (e.target === modalContainer) closeLogModal();
  });
}

function closeLogModal() {
  if (modalContainer) {
    modalContainer.remove();
    modalContainer = null;
    logContentEl = null;
  }
}

// Keep track of scroll state so we don't aggressively scroll if user scrolled up
let isScrolledUp = false;

function appendLogUI({ level, text, time }) {
  if (!logContentEl) return;

  const div = document.createElement('div');
  div.className = `log-line log-${level}`;
  
  const timeSpan = document.createElement('span');
  timeSpan.className = 'log-time';
  timeSpan.textContent = `[${time}] `;

  const textNode = document.createTextNode(text);

  div.appendChild(timeSpan);
  div.appendChild(textNode);

  // Check scroll position before appending
  isScrolledUp = logContentEl.scrollHeight - logContentEl.clientHeight > logContentEl.scrollTop + 10;

  logContentEl.appendChild(div);

  // Auto-scroll unless the user is actively reading old logs
  if (!isScrolledUp) {
    scrollToBottom();
  }
}

function scrollToBottom() {
  if (logContentEl) {
    logContentEl.scrollTop = logContentEl.scrollHeight;
  }
}

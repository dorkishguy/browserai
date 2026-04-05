/**
 * Chat Panel — Chat with LLMs UI
 */

import { CHAT_MODELS, initChatModel, chatStream, isChatReady, resetChat, getCurrentChatModel } from './chat-engine.js';
import { downloadText } from '../../shared/file-utils.js';
import { getPreference, setPreference } from '../../shared/storage.js';
import { getIcon, createControlGroup, createSelect, createSlider, showToast } from '../../shared/ui-utils.js';

export function createChatPanel() {
  const panel = document.createElement('div');
  panel.className = 'tool-panel active';
  panel.id = 'chat-panel';

  const savedModel = getPreference('chat_model', CHAT_MODELS[0].id);
  const savedTemp = getPreference('chat_temp', 0.7);
  const savedMaxTokens = getPreference('chat_max_tokens', 2048);
  const savedSystem = getPreference('chat_system', 'You are a helpful assistant.');

  panel.innerHTML = `
    <div class="tool-header">
      <h2>Chat</h2>
      <div class="flex gap-sm">
        <button class="btn btn-secondary btn-sm" id="chat-new" title="New chat">${getIcon('trash')} New</button>
        <button class="btn btn-secondary btn-sm" id="chat-export" title="Export">${getIcon('download')} Export</button>
      </div>
    </div>

    <!-- Runs on all browsers via WASM — no WebGPU needed -->

    <!-- Model loader -->
    <div id="chat-loader">
      <div class="model-loader">
        <div class="spinner" id="chat-spinner" style="display:none;"></div>
        <h3 id="chat-loader-title">Select a model to begin</h3>
        <p class="text-caption text-muted" id="chat-loader-desc">Choose a model below and it will be downloaded on first use.</p>
        <div id="chat-model-picker" class="flex flex-col gap-sm mt-md" style="width:100%;max-width:400px;"></div>
        <div class="progress-wrap mt-md" id="chat-progress" style="display:none;">
          <div class="progress-bar"><div class="progress-fill" id="chat-progress-fill"></div></div>
          <div class="progress-label">
            <span id="chat-progress-status">Preparing...</span>
            <span id="chat-progress-percent">0%</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Chat UI -->
    <div id="chat-tool" style="display:none;" class="flex flex-col">
      <!-- System prompt (collapsible) -->
      <details class="mt-sm" style="margin-bottom:8px;">
        <summary class="text-caption text-muted" style="cursor:pointer;">System prompt</summary>
        <textarea class="textarea mt-sm" id="chat-system-prompt" rows="2" style="min-height:60px;">${savedSystem}</textarea>
      </details>

      <!-- Model info bar -->
      <div class="flex items-center justify-between" style="margin-bottom:8px;">
        <span class="tag" id="chat-model-tag"></span>
        <div class="controls" id="chat-controls" style="gap:8px;"></div>
      </div>

      <!-- Messages -->
      <div class="chat-container">
        <div class="chat-messages" id="chat-messages">
          <div class="empty-state" id="chat-empty">
            <span class="empty-state-icon">${getIcon('chat')}</span>
            <p class="text-muted">Send a message to start chatting</p>
          </div>
        </div>

        <!-- Input -->
        <div class="chat-input-wrap">
          <input class="input" id="chat-input" placeholder="Type a message..." autocomplete="off" />
          <button class="btn btn-cta" id="chat-send" style="padding:10px 16px;">${getIcon('send')}</button>
        </div>
      </div>
    </div>
  `;

  // State
  let messages = [];
  let isGenerating = false;

  // --- Build model picker ---
  const pickerEl = panel.querySelector('#chat-model-picker');
  CHAT_MODELS.forEach(model => {
    const card = document.createElement('button');
    card.className = 'card';
    card.style.cssText = 'cursor:pointer;text-align:left;padding:16px;';
    card.innerHTML = `
      <strong>${model.name}</strong>
      <span class="text-caption text-muted" style="margin-left:8px;">${model.size}</span>
      <p class="text-small text-muted" style="margin-top:4px;">${model.description}</p>
    `;
    card.addEventListener('click', () => loadModel(model.id));
    pickerEl.appendChild(card);
  });

  // No WebGPU check needed — wllama runs on WASM (all browsers)

  // --- Load model ---
  async function loadModel(modelId) {
    const spinner = panel.querySelector('#chat-spinner');
    const progress = panel.querySelector('#chat-progress');
    const title = panel.querySelector('#chat-loader-title');
    const desc = panel.querySelector('#chat-loader-desc');

    spinner.style.display = 'block';
    title.textContent = 'Loading model...';
    desc.style.display = 'none';
    pickerEl.style.display = 'none';
    progress.style.display = 'flex';

    try {
      await initChatModel(modelId, ({ progress: p, text }) => {
        const pct = Math.round((p || 0) * 100);
        panel.querySelector('#chat-progress-fill').style.width = pct + '%';
        panel.querySelector('#chat-progress-percent').textContent = pct + '%';
        panel.querySelector('#chat-progress-status').textContent = text || 'Downloading...';
      });

      setPreference('chat_model', modelId);
      panel.querySelector('#chat-loader').style.display = 'none';
      panel.querySelector('#chat-tool').style.display = 'flex';

      const model = CHAT_MODELS.find(m => m.id === modelId);
      panel.querySelector('#chat-model-tag').textContent = model?.name || modelId;

      buildChatControls();
    } catch (err) {
      spinner.style.display = 'none';
      progress.style.display = 'none';
      title.textContent = 'Failed to load model';
      desc.style.display = 'block';
      desc.textContent = err.message;
      pickerEl.style.display = 'flex';
    }
  }

  function buildChatControls() {
    const controls = panel.querySelector('#chat-controls');
    controls.innerHTML = '';

    const { container: tempContainer } = createSlider({
      min: 0, max: 2, value: savedTemp, step: 0.1,
      onChange: (val) => setPreference('chat_temp', val),
    });
    controls.appendChild(createControlGroup('Temp', tempContainer));
  }

  // --- Send message ---
  async function sendMessage() {
    const input = panel.querySelector('#chat-input');
    const text = input.value.trim();
    if (!text || isGenerating || !isChatReady()) return;

    input.value = '';
    isGenerating = true;

    // Hide empty state
    const empty = panel.querySelector('#chat-empty');
    if (empty) empty.style.display = 'none';

    // Add user message
    messages.push({ role: 'user', content: text });
    appendBubble('user', text);

    // Add assistant bubble (streaming)
    const assistantBubble = appendBubble('assistant', '');
    panel.querySelector('#chat-send').disabled = true;

    try {
      const systemPrompt = panel.querySelector('#chat-system-prompt').value.trim();
      const temp = getPreference('chat_temp', 0.7);
      const allMessages = [
        { role: 'system', content: systemPrompt },
        ...messages,
      ];

      const fullText = await chatStream(allMessages, {
        temperature: temp,
        max_tokens: savedMaxTokens,
        onToken: (token) => {
          assistantBubble.textContent += token;
          scrollToBottom();
        },
      });

      messages.push({ role: 'assistant', content: fullText });

      // Save system prompt
      setPreference('chat_system', systemPrompt);
    } catch (err) {
      assistantBubble.textContent = 'Error: ' + (err.message || 'Failed to generate response');
      console.error('Chat error:', err);
    } finally {
      isGenerating = false;
      panel.querySelector('#chat-send').disabled = false;
      input.focus();
    }
  }

  function appendBubble(role, text) {
    const messagesEl = panel.querySelector('#chat-messages');
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble chat-bubble-${role}`;
    bubble.textContent = text;
    messagesEl.appendChild(bubble);
    scrollToBottom();
    return bubble;
  }

  function scrollToBottom() {
    const messagesEl = panel.querySelector('#chat-messages');
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // --- Event listeners ---
  panel.querySelector('#chat-send').addEventListener('click', sendMessage);
  panel.querySelector('#chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // New chat
  panel.querySelector('#chat-new').addEventListener('click', async () => {
    messages = [];
    panel.querySelector('#chat-messages').innerHTML = `
      <div class="empty-state" id="chat-empty">
        <span class="empty-state-icon">${getIcon('chat')}</span>
        <p class="text-muted">Send a message to start chatting</p>
      </div>`;
    await resetChat();
    showToast('Chat cleared');
  });

  // Export
  panel.querySelector('#chat-export').addEventListener('click', () => {
    if (messages.length === 0) { showToast('No messages to export'); return; }
    const text = messages.map(m => `[${m.role}]\n${m.content}`).join('\n\n---\n\n');
    downloadText(text, 'chat-export.txt');
  });

  // Auto-load saved model
  const savedModelObj = CHAT_MODELS.find(m => m.id === savedModel);
  if (savedModelObj) {
    // Don't auto-load on first visit, let user pick
  }

  return panel;
}

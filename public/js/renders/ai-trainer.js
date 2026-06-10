/**
 * @fileoverview AI Trainer tab renderer — chat, plan, health check
 */

import { state, STORAGE_KEYS } from '../state.js';
import { $, escapeHtml } from '../utils.js';
import { generateDailyPlan, fetchAIResponse, trackAIUsage, getChatHistory, saveChatHistory, clearChatHistory } from '../ai.js';
import { toast } from '../render.js';

// ===== CHAT STATE =====
let isStreaming = false;
let abortController = null;

// ===== RENDER =====

export function render() {
  renderAIPlan();
  bindQuickActions();
  bindChatForm();
  bindHealthPrompts();
  renderChatHistory();
}

// ===== AI PLAN =====

async function renderAIPlan() {
  const card = $('aiPlanCard');
  const content = $('aiPlanContent');
  if (!card || !content) return;

  const pet = state.pet.data;
  if (!pet?.name) {
    content.innerHTML = '<p class="text-muted">Спочатку додайте дані песика в профілі 🐾</p>';
    return;
  }

  try {
    const lines = await generateDailyPlan();
    if (lines.length > 0) {
      content.innerHTML = lines.map(l => `<div class="ai-plan-item">${escapeHtml(l)}</div>`).join('');
    } else {
      content.innerHTML = '<p class="text-muted">Натисніть 🔄 для оновлення</p>';
    }
  } catch {
    content.innerHTML = '<p class="text-muted">Не вдалося завантажити план</p>';
  }
}

// ===== QUICK ACTIONS =====

function bindQuickActions() {
  document.querySelectorAll('#tabAITrainer [data-ai-prompt]').forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';

    btn.addEventListener('click', () => {
      const prompt = btn.dataset.aiPrompt;
      sendMessage(prompt);
    });
  });
}

function bindHealthPrompts() {
  document.querySelectorAll('.ai-health-prompts [data-ai-prompt]').forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';

    btn.addEventListener('click', () => {
      const prompt = btn.dataset.aiPrompt;
      sendMessage(prompt);
    });
  });
}

// ===== CHAT =====

function bindChatForm() {
  const form = $('aiForm');
  const input = $('aiInput');
  const stopBtn = $('stopAI');
  const clearBtn = $('clearChatBtn');

  if (!form || !input) return;

  // Prevent double binding
  if (form.dataset.bound) return;
  form.dataset.bound = '1';

  // Submit
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const txt = input.value.trim();
    if (!txt || isStreaming) return;
    input.value = '';
    sendMessage(txt);
  });

  // Stop button
  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
      isStreaming = false;
      updateStreamUI(false);
    });
  }

  // Clear
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearChatHistory();
      renderChatHistory();
      toast('Чат очищено', 'success');
    });
  }

  // Auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
  });
}

async function sendMessage(text) {
  if (isStreaming || !text.trim()) return;
  isStreaming = true;
  updateStreamUI(true);
  abortController = new AbortController();

  // Add user message
  addChatMessage('user', text);
  saveChatHistory('user', text);

  // Add loading placeholder
  const loadingEl = addChatMessage('loading', '');

  // Track usage
  trackAIUsage();

  try {
    const response = await fetchAIResponse(text, {
      stream: true,
      signal: abortController.signal,
      onToken: (token) => {
        // Remove loading and show streaming
        if (loadingEl.classList.contains('loading')) {
          loadingEl.classList.remove('loading');
          loadingEl.classList.add('assistant', 'streaming');
        }
        loadingEl.textContent += token;
        // Auto-scroll
        const chatBox = $('aiChat');
        if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
      }
    });

    // Done streaming
    loadingEl.classList.remove('streaming');
    const finalText = loadingEl.textContent;
    saveChatHistory('assistant', finalText);
  } catch (err) {
    if (err.name === 'AbortError') {
      loadingEl.classList.remove('loading', 'streaming');
      if (loadingEl.textContent) {
        loadingEl.classList.add('assistant');
        saveChatHistory('assistant', loadingEl.textContent + ' ⏹');
      } else {
        loadingEl.classList.add('error');
        loadingEl.textContent = '⏹ Зупинено';
      }
    } else {
      loadingEl.classList.remove('loading', 'streaming');
      loadingEl.classList.add('error');
      loadingEl.textContent = err.message || 'Помилка. Спробуйте ще раз.';
    }
  } finally {
    isStreaming = false;
    abortController = null;
    updateStreamUI(false);
  }
}

function addChatMessage(role, text) {
  const chatBox = $('aiChat');
  if (!chatBox) return document.createElement('div');

  const el = document.createElement('div');
  el.className = `ai-msg ${role}`;
  if (text) el.textContent = text;
  chatBox.appendChild(el);

  // Auto-scroll
  requestAnimationFrame(() => {
    chatBox.scrollTop = chatBox.scrollHeight;
  });

  // Trim old messages
  while (chatBox.children.length > 50) {
    chatBox.firstChild.remove();
  }

  return el;
}

function renderChatHistory() {
  const chatBox = $('aiChat');
  if (!chatBox) return;

  const history = getChatHistory();
  chatBox.innerHTML = '';

  if (history.length === 0) {
    chatBox.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💬</div><div class="empty-state-desc">Оберіть тему або напишіть запитання про тренування, здоров\'я чи поведінку.</div></div>';
    return;
  }

  history.forEach(msg => {
    const el = document.createElement('div');
    el.className = `ai-msg ${msg.role}`;
    el.textContent = msg.content;
    chatBox.appendChild(el);
  });

  requestAnimationFrame(() => {
    chatBox.scrollTop = chatBox.scrollHeight;
  });
}

function updateStreamUI(streaming) {
  const sendBtn = document.querySelector('#aiForm .btn-send');
  const stopBtn = $('stopAI');
  const input = $('aiInput');

  if (sendBtn) sendBtn.disabled = streaming;
  if (stopBtn) stopBtn.style.display = streaming ? '' : 'none';
  if (input) input.disabled = streaming;
}

// ===== INIT =====
const refreshPlanBtn = $('refreshPlanBtn');
if (refreshPlanBtn) {
  refreshPlanBtn.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEYS.aiPlan);
    renderAIPlan();
    toast('План оновлено 🔄', 'success');
  });
}
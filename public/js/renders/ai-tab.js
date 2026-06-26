/**
 * @fileoverview AI tab — full-screen chat with Firestore sync + streaming
 */

import { state, subscribe } from '../state.js';
import { $, haptic, getAgeInWeeks, weekLabel } from '../utils.js';
import { fetchAIResponse, trackAIUsage } from '../ai.js';
import { saveAiMessage, clearAiMessages } from '../firebase.js';
import { toast, confirmDialog } from '../render.js';

const PROMPT_CATEGORIES = {
  training: {
    label: 'Тренування',
    prompts: [
      'Як навчити команду Сидіти?',
      'Як зупинити гавкіт?',
      'Не тягнути повідок на прогулянці',
      'Команда До мене — покроково',
    ],
  },
  toilet: {
    label: 'Туалет',
    prompts: [
      'Як привчити до пелюшки?',
      'Переходимо з пелюшки на вулицю',
      'Що робити після промаху?',
      'Скільки разів виводити цуценя?',
    ],
  },
  health: {
    label: 'Здоров\'я',
    prompts: [
      'Собака блює — що робити?',
      'Коли потрібен ветеринар терміново?',
      'Графік вакцинації цуценя',
      'Чим годувати цуценя?',
    ],
  },
  behavior: {
    label: 'Поведінка',
    prompts: [
      'Що робити якщо гризе все?',
      'Соціалізація цуценя — з чого почати',
      'Puppy blues — це нормально?',
      'Боїться пилососа і гучних звуків',
    ],
  },
};

let bound = false;
let activeCategory = 'training';
let isStreaming = false;
let streamingText = '';
let isSubmitting = false;
let stateSubscribed = false;

export function render() {
  renderContext();
  renderCategoryTabs();
  renderPrompts();
  bindEvents();
  subscribeToChat();
  syncChatFromState();
}

export function submitPrompt(prompt) {
  if (!prompt?.trim()) return;
  handleSubmit(prompt);
}

function subscribeToChat() {
  if (stateSubscribed) return;
  stateSubscribed = true;
  subscribe('aiChat', () => {
    if (state.ui.activeTab === 'tabChat') {
      syncChatFromState();
    }
  });
}

function renderContext() {
  const el = $('aiContextLine');
  if (!el) return;

  const pet = state.pet.data;
  if (!pet?.name?.trim()) {
    el.textContent = 'Заповніть профіль собаки — AI дасть точніші поради';
    return;
  }

  const weeks = getAgeInWeeks(pet.birthDate);
  const parts = [pet.name, weekLabel(weeks)];
  if (pet.breed) parts.push(pet.breed);
  if (pet.issues) parts.push(`фокус: ${pet.issues.slice(0, 40)}${pet.issues.length > 40 ? '…' : ''}`);
  el.textContent = parts.join(' · ');
}

function renderCategoryTabs() {
  const container = $('aiCategoryTabs');
  if (!container || container.dataset.rendered) return;

  container.innerHTML = Object.entries(PROMPT_CATEGORIES).map(([key, cat]) => `
    <button type="button" class="ai-cat-tab ${key === activeCategory ? 'active' : ''}" data-ai-category="${key}">
      ${cat.label}
    </button>
  `).join('');

  container.querySelectorAll('[data-ai-category]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset.aiCategory;
      container.querySelectorAll('.ai-cat-tab').forEach(b =>
        b.classList.toggle('active', b.dataset.aiCategory === activeCategory)
      );
      renderPrompts();
      haptic();
    });
  });

  container.dataset.rendered = 'true';
}

function renderPrompts() {
  const container = $('aiPrompts');
  if (!container) return;

  const cat = PROMPT_CATEGORIES[activeCategory];
  container.innerHTML = cat.prompts.map(p => `
    <button type="button" class="ai-prompt-chip" data-ai-prompt="${p.replace(/"/g, '&quot;')}">${p}</button>
  `).join('');

  container.querySelectorAll('[data-ai-prompt]').forEach(btn => {
    btn.addEventListener('click', () => {
      handleSubmit(btn.dataset.aiPrompt);
      haptic();
    });
  });
}

function bindEvents() {
  if (bound) return;
  bound = true;

  const form = $('aiForm');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('aiInput');
    const msg = input?.value.trim();
    if (!msg) return;
    input.value = '';
    input.style.height = 'auto';
    handleSubmit(msg);
  });

  $('clearChatBtn')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Очистити чат?',
      message: 'Історія AI-повідомлень для цього простору буде видалена.',
      okText: 'Очистити',
      danger: true,
    });
    if (!ok) return;
    try {
      await clearAiMessages();
      isStreaming = false;
      streamingText = '';
      syncChatFromState();
      toast('Чат очищено', 'success');
    } catch {
      toast('Помилка очищення', 'error');
    }
  });

  initVoiceInput();

  const aiInput = $('aiInput');
  if (aiInput) {
    aiInput.addEventListener('input', () => {
      aiInput.style.height = 'auto';
      aiInput.style.height = `${Math.min(aiInput.scrollHeight, 120)}px`;
    });
    aiInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form?.dispatchEvent(new Event('submit'));
      }
    });
  }
}

function syncChatFromState() {
  const chat = $('aiChat');
  if (!chat) return;

  const items = state.aiChat.items;

  if (items.length === 0 && !isStreaming) {
    chat.innerHTML = '';
    showWelcomeIfEmpty();
    return;
  }

  chat.innerHTML = '';

  for (const msg of items) {
    appendMessageEl(msg.content, msg.role);
  }

  if (isStreaming) {
    const el = document.createElement('div');
    el.className = 'ai-msg assistant streaming';
    el.id = 'streamingMsg';
    el.textContent = streamingText || '…';
    chat.appendChild(el);
  }

  scrollChatToBottom();
}

function showWelcomeIfEmpty() {
  const chat = $('aiChat');
  if (!chat || chat.children.length > 0) return;

  const pet = state.pet.data;
  const name = pet?.name?.trim() || 'песика';

  const welcome = document.createElement('div');
  welcome.className = 'ai-welcome';
  welcome.innerHTML = `
    <div class="ai-welcome-icon">AI</div>
    <h4>Привіт! Я ваш AI-кінолог</h4>
    <p>Допоможу з тренуванням, туалетом, здоров'ям і поведінкою <strong>${name}</strong>. Оберіть тему вище або напишіть своє питання.</p>
    <div class="ai-welcome-tags">
      <span>Тренування</span>
      <span>Туалет</span>
      <span>Здоров'я</span>
      <span>Поведінка</span>
    </div>
  `;
  chat.appendChild(welcome);
}

async function handleSubmit(prompt) {
  if (!prompt.trim() || isSubmitting) return;
  isSubmitting = true;

  const input = $('aiInput');
  const sendBtn = $('aiForm')?.querySelector('.btn-send');
  if (input) input.disabled = true;
  if (sendBtn) sendBtn.disabled = true;

  try {
    await saveAiMessage({ role: 'user', content: prompt });
    trackAIUsage();

    isStreaming = true;
    streamingText = 'Думаю...';
    syncChatFromState();

    const response = await fetchAIResponse(prompt);

    isStreaming = false;
    streamingText = '';
    await saveAiMessage({ role: 'assistant', content: response });
  } catch {
    isStreaming = false;
    streamingText = '';
    syncChatFromState();
    appendMessageEl('Помилка з\'єднання. Спробуйте ще раз.', 'assistant');
    toast('Помилка AI', 'error');
  } finally {
    isSubmitting = false;
    if (input) input.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    input?.focus();
  }
}

function appendMessageEl(text, type) {
  const chat = $('aiChat');
  if (!chat) return;

  chat.querySelector('.ai-welcome')?.remove();

  const msg = document.createElement('div');
  msg.className = `ai-msg ${type}`;
  msg.textContent = text;
  chat.appendChild(msg);
  scrollChatToBottom();
}

function scrollChatToBottom() {
  const chat = $('aiChat');
  if (chat) chat.scrollTop = chat.scrollHeight;
}

function initVoiceInput() {
  const btn = $('voiceBtn');
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = 'true';

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    btn.style.display = 'none';
    return;
  }

  const rec = new SR();
  rec.lang = 'uk-UA';
  rec.continuous = false;
  rec.interimResults = false;
  let isRecording = false;

  btn.addEventListener('click', () => {
    if (isRecording) {
      rec.stop();
      btn.classList.remove('recording');
      isRecording = false;
    } else {
      rec.start();
      btn.classList.add('recording');
      isRecording = true;
      haptic();
    }
  });

  rec.onresult = (e) => {
    const text = e.results[0][0].transcript;
    const input = $('aiInput');
    if (input) {
      input.value = text;
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
    }
    btn.classList.remove('recording');
    isRecording = false;
  };

  rec.onerror = rec.onend = () => {
    btn.classList.remove('recording');
    isRecording = false;
  };
}

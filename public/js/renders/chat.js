/**
 * @fileoverview Dedicated AI coach chat renderer.
 */

import { state } from '../state.js';
import { $, haptic, getAgeInWeeks } from '../utils.js';
import { fetchAIResponse, trackAIUsage, clearChatHistory } from '../ai.js';

export function render() {
  bindChat();
}

export async function submitPrompt(prompt) {
  render();
  await handleAISubmit(prompt);
}

function bindChat() {
  const root = $('tabChat');
  const form = $('aiForm');
  if (!root || !form || form.dataset.bound === 'true') return;
  form.dataset.bound = 'true';

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('aiInput');
    const msg = input?.value.trim();
    if (!msg) return;
    input.value = '';
    input.style.height = 'auto';
    handleAISubmit(msg);
  });

  root.querySelectorAll('[data-ai-prompt]').forEach(btn => {
    btn.addEventListener('click', () => {
      handleAISubmit(btn.dataset.aiPrompt);
      haptic();
    });
  });

  $('clearChatBtn')?.addEventListener('click', () => {
    const chat = $('aiChat');
    if (chat) chat.innerHTML = '';
    clearChatHistory();
    showChatToast('Чат очищено', 'success');
  });

  initVoiceInput();

  const aiInput = $('aiInput');
  if (aiInput) {
    aiInput.addEventListener('input', () => {
      aiInput.style.height = 'auto';
      aiInput.style.height = `${Math.min(aiInput.scrollHeight, 100)}px`;
    });
    aiInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.dispatchEvent(new Event('submit'));
      }
    });
  }
}

async function handleAISubmit(prompt) {
  if (!prompt?.trim()) return;

  const pet = state.pet.data;
  const petName = pet?.name?.trim();
  const breed = pet?.breed?.trim();
  const age = pet?.birthDate ? getAgeInWeeks(pet.birthDate) : null;
  const sex = pet?.sex?.trim();
  const issues = pet?.issues?.trim();

  let personalizedPrompt = prompt;
  if (petName && !prompt.includes(petName)) {
    personalizedPrompt = personalizedPrompt.replace(/собака/gi, petName);
    personalizedPrompt = personalizedPrompt.replace(/Собака/gi, petName);
  }

  const contextParts = [];
  if (petName) contextParts.push(`Собака: ${petName}`);
  if (breed) contextParts.push(`Порода: ${breed}`);
  if (age) contextParts.push(`Вік: ${age} тижнів`);
  if (sex) contextParts.push(`Стать: ${sex}`);
  if (issues) contextParts.push(`Проблеми: ${issues}`);

  let fullPrompt = personalizedPrompt;
  if (contextParts.length > 0) {
    fullPrompt = `[${contextParts.join(', ')}] ${personalizedPrompt}`;
  }

  addChatMessage(prompt, 'user');
  trackAIUsage();

  const chat = $('aiChat');
  if (!chat) return;

  const msgEl = document.createElement('div');
  msgEl.className = 'ai-msg assistant streaming';
  msgEl.textContent = '';
  chat.appendChild(msgEl);
  chat.scrollTop = chat.scrollHeight;

  try {
    await fetchAIResponse(fullPrompt, (chunk) => {
      msgEl.textContent += chunk;
      chat.scrollTop = chat.scrollHeight;
    });
    msgEl.classList.remove('streaming');
    appendShareButton(msgEl, msgEl.textContent);
  } catch {
    msgEl.textContent = 'Помилка. Спробуйте ще раз';
    msgEl.classList.remove('streaming');
  }
}

function addChatMessage(text, type) {
  const chat = $('aiChat');
  if (!chat) return;

  const msg = document.createElement('div');
  msg.className = `ai-msg ${type}`;
  msg.textContent = text;

  if (type === 'assistant') appendShareButton(msg, text);

  chat.appendChild(msg);
  chat.scrollTop = chat.scrollHeight;
}

function appendShareButton(container, text) {
  const shareBtn = document.createElement('button');
  shareBtn.className = 'msg-share-btn';
  shareBtn.type = 'button';
  shareBtn.textContent = 'Поділитися';
  shareBtn.addEventListener('click', () => shareMessage(text));
  container.appendChild(shareBtn);
}

async function shareMessage(text) {
  const pet = state.pet.data;
  const petName = pet?.name || 'Мій песик';
  const shareText = `${petName} - порада від Dog Coach AI:\n\n${text}\n\nDog Coach AI`;

  if (navigator.share) {
    try {
      await navigator.share({ text: shareText, title: 'Dog Coach AI' });
      haptic();
    } catch {
      // User cancelled.
    }
    return;
  }

  try {
    await navigator.clipboard.writeText(shareText);
    showChatToast('Скопійовано в буфер обміну', 'success');
  } catch {
    showChatToast('Не вдалося скопіювати', 'error');
  }
}

function showChatToast(msg, type = '') {
  const box = $('toastContainer');
  if (!box) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 2800);
}

function initVoiceInput() {
  const btn = $('voiceBtn');
  if (!btn || btn.dataset.voiceBound) return;
  btn.dataset.voiceBound = 'true';

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { btn.style.display = 'none'; return; }

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
      input.style.height = `${Math.min(input.scrollHeight, 100)}px`;
    }
    btn.classList.remove('recording');
    isRecording = false;
  };

  rec.onerror = rec.onend = () => {
    btn.classList.remove('recording');
    isRecording = false;
  };
}

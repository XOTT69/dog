/**
 * @fileoverview Chat tab — AI coach UI, quick prompts, voice input, sharing
 */

import { state } from '../state.js';
import { $, $$, haptic, getAgeInWeeks } from '../utils.js';
import { fetchAIResponse, trackAIUsage, clearChatHistory } from '../ai.js';
import { toast } from '../render.js';

const PENDING_PROMPT_KEY = 'dc_pending_ai_prompt';
let globalPromptListenerBound = false;

export function render() {
  bindChatEvents();
  bindExternalPromptListener();
  consumePendingPrompt();
}

export function queuePrompt(prompt) {
  const cleanPrompt = prompt?.trim();
  if (!cleanPrompt) return;

  sessionStorage.setItem(PENDING_PROMPT_KEY, cleanPrompt);
  window.dispatchEvent(new CustomEvent('dogcoach:chat-prompt', {
    detail: { prompt: cleanPrompt },
  }));
}

function bindChatEvents() {
  const form = $('aiForm');
  if (!form || form.dataset.bound === 'true') return;
  form.dataset.bound = 'true';

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const input = $('aiInput');
    const msg = input?.value.trim();
    if (!msg) return;

    input.value = '';
    input.style.height = 'auto';
    handleAISubmit(msg);
  });

  $$('#tabChat [data-ai-prompt]').forEach((button) => {
    if (button.dataset.aiBound === 'true') return;
    button.dataset.aiBound = 'true';
    button.addEventListener('click', () => {
      const prompt = button.dataset.aiPrompt?.trim();
      if (!prompt) return;
      handleAISubmit(prompt);
      haptic();
    });
  });

  const clearBtn = $('clearChatBtn');
  if (clearBtn && clearBtn.dataset.bound !== 'true') {
    clearBtn.dataset.bound = 'true';
    clearBtn.addEventListener('click', () => {
      const chat = $('aiChat');
      if (chat) chat.innerHTML = '';
      clearChatHistory();
      toast('Чат очищено 🧹', 'success');
    });
  }

  bindTextareaAutosize(form);
  initVoiceInput();
}

function bindExternalPromptListener() {
  if (globalPromptListenerBound) return;
  globalPromptListenerBound = true;

  window.addEventListener('dogcoach:chat-prompt', (event) => {
    const prompt = event.detail?.prompt?.trim();
    if (!prompt) return;
    sessionStorage.removeItem(PENDING_PROMPT_KEY);
    setTimeout(() => handleAISubmit(prompt), 150);
  });
}

function consumePendingPrompt() {
  const prompt = sessionStorage.getItem(PENDING_PROMPT_KEY)?.trim();
  if (!prompt) return;

  sessionStorage.removeItem(PENDING_PROMPT_KEY);
  setTimeout(() => handleAISubmit(prompt), 150);
}

function bindTextareaAutosize(form) {
  const aiInput = $('aiInput');
  if (!aiInput || aiInput.dataset.bound === 'true') return;
  aiInput.dataset.bound = 'true';

  aiInput.addEventListener('input', () => {
    aiInput.style.height = 'auto';
    aiInput.style.height = `${Math.min(aiInput.scrollHeight, 104)}px`;
  });

  aiInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.dispatchEvent(new Event('submit'));
    }
  });
}

async function handleAISubmit(prompt) {
  const cleanPrompt = prompt?.trim();
  if (!cleanPrompt) return;

  const fullPrompt = buildPersonalizedPrompt(cleanPrompt);

  addChatMessage(cleanPrompt, 'user');
  trackAIUsage();

  const chat = $('aiChat');
  if (!chat) return;

  const msgEl = document.createElement('div');
  msgEl.className = 'ai-msg assistant streaming';
  msgEl.textContent = '';
  chat.appendChild(msgEl);
  scrollChatToBottom();

  try {
    await fetchAIResponse(fullPrompt, (chunk) => {
      msgEl.textContent += chunk;
      scrollChatToBottom();
    });

    msgEl.classList.remove('streaming');
    appendShareButton(msgEl, msgEl.textContent);
  } catch (error) {
    msgEl.textContent = error?.message || 'Помилка. Спробуйте ще раз 🔄';
    msgEl.classList.remove('streaming');
  }
}

function buildPersonalizedPrompt(prompt) {
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

  if (contextParts.length === 0) return personalizedPrompt;
  return `[${contextParts.join(', ')}] ${personalizedPrompt}`;
}

function addChatMessage(text, type) {
  const chat = $('aiChat');
  if (!chat) return;

  const msg = document.createElement('div');
  msg.className = `ai-msg ${type}`;
  msg.textContent = text;

  if (type === 'assistant') {
    appendShareButton(msg, text);
  }

  chat.appendChild(msg);
  scrollChatToBottom();
}

function appendShareButton(messageEl, text) {
  const shareBtn = document.createElement('button');
  shareBtn.className = 'msg-share-btn';
  shareBtn.type = 'button';
  shareBtn.textContent = '📤 Поділитися';
  shareBtn.addEventListener('click', () => shareMessage(text));
  messageEl.appendChild(shareBtn);
}

function scrollChatToBottom() {
  const chat = $('aiChat');
  if (!chat) return;
  chat.scrollTop = chat.scrollHeight;
}

async function shareMessage(text) {
  const pet = state.pet.data;
  const petName = pet?.name || 'Мій песик';
  const shareText = `🐕 ${petName} — порада від Dog Coach AI:\n\n${text}\n\n— Dog Coach AI`;

  if (navigator.share) {
    try {
      await navigator.share({ text: shareText, title: 'Dog Coach AI' });
      haptic();
    } catch {
      // User cancelled share sheet.
    }
    return;
  }

  try {
    await navigator.clipboard.writeText(shareText);
    toast('Скопійовано в буфер обміну 📋', 'success');
  } catch {
    toast('Не вдалося скопіювати', 'error');
  }
}

function initVoiceInput() {
  const btn = $('voiceBtn');
  if (!btn || btn.dataset.bound === 'true') return;
  btn.dataset.bound = 'true';

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    btn.style.display = 'none';
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'uk-UA';
  recognition.continuous = false;
  recognition.interimResults = false;
  let isRecording = false;

  btn.addEventListener('click', () => {
    if (isRecording) {
      recognition.stop();
      btn.classList.remove('recording');
      isRecording = false;
      return;
    }

    recognition.start();
    btn.classList.add('recording');
    isRecording = true;
    haptic();
  });

  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript;
    const input = $('aiInput');
    if (input) {
      input.value = text;
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 104)}px`;
    }
    btn.classList.remove('recording');
    isRecording = false;
  };

  recognition.onerror = recognition.onend = () => {
    btn.classList.remove('recording');
    isRecording = false;
  };
}

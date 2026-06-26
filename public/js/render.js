/**
 * @fileoverview Render orchestrator — only renders active tab, uses dirty flags
 */

import { state, subscribe } from './state.js';
import { weekLabel, getAgeInWeeks, avatarLetter, escapeHtml } from './utils.js';

const $ = (id) => document.getElementById(id);

// Lazy-loaded render modules
let homeRenderer = null;
let diaryRenderer = null;
let coursesRenderer = null;
let profileRenderer = null;
let calendarRenderer = null;
let aiRenderer = null;

/** @type {boolean} */
let renderScheduled = false;

// ===== TAB MANAGEMENT =====

/**
 * Switch active tab
 * @param {string} tabId
 */
export function setActiveTab(tabId) {
  const target = document.getElementById(tabId);
  if (!target?.classList.contains('tab')) return;

  state.ui.activeTab = tabId;

  document.querySelectorAll('.tab').forEach(panel => {
    const isActive = panel.id === tabId;
    panel.classList.toggle('active', isActive);
    panel.hidden = !isActive;
    panel.setAttribute('aria-hidden', String(!isActive));
    if ('inert' in panel) panel.inert = !isActive;
    panel.style.display = isActive ? (panel.id === 'tabChat' ? 'flex' : 'block') : 'none';
  });

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  const fab = $('fabAddEvent');
  const header = document.querySelector('.header');
  const nav = document.querySelector('.nav');
  const main = document.querySelector('.main');

  if (tabId === 'tabChat') {
    // Full-screen chat mode
    if (fab) fab.classList.add('hidden');
    if (header) header.classList.add('hidden');
    if (nav) nav.classList.add('hidden');
    if (main) {
      main.classList.add('main-chat');
      main.style.paddingBottom = '0';
    }
  } else {
    // Normal mode
    if (fab) fab.classList.toggle('hidden', tabId === 'tabProfile');
    if (header) header.classList.remove('hidden');
    if (nav) nav.classList.remove('hidden');
    if (main) {
      main.classList.remove('main-chat');
      main.style.paddingBottom = '';
    }
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });

  renderActiveTab();
}

// ===== RENDER SCHEDULING =====

/**
 * Schedule a render for the active tab (batched via rAF)
 */
export function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    renderActiveTab();
  });
}

/**
 * Render only the currently active tab
 */
async function renderActiveTab() {
  const tab = state.ui.activeTab;

  // Always render header (lightweight, sync)
  renderHeader();

  try {
    switch (tab) {
      case 'tabHome':
        if (!homeRenderer) {
          homeRenderer = await import('./renders/home.js');
        }
        homeRenderer.render();
        break;

      case 'tabDiary':
        if (!diaryRenderer) {
          diaryRenderer = await import('./renders/diary.js');
        }
        diaryRenderer.render();
        break;

      case 'tabCalendar':
        if (!calendarRenderer) {
          calendarRenderer = await import('./renders/calendar.js');
        }
        calendarRenderer.render();
        break;

      case 'tabCourses':
        if (!coursesRenderer) {
          coursesRenderer = await import('./renders/courses.js');
        }
        coursesRenderer.render();
        break;

      case 'tabChat':
        if (!aiRenderer) {
          aiRenderer = await import('./renders/ai-tab.js');
        }
        aiRenderer.render();
        break;

      case 'tabProfile':
        if (!profileRenderer) {
          profileRenderer = await import('./renders/profile.js');
        }
        profileRenderer.render();
        break;
    }
  } catch (e) {
    console.error('[Render] Failed to load tab module:', tab, e);
  }
}

// ===== HEADER (sync, no await) =====

function renderHeader() {
  const pet = state.pet.data;
  const user = state.auth.user;

  const nameEl = $('petNameHeader');
  const subEl = $('headerSub');
  const avatarEl = $('userAvatar');
  const streakBadge = $('streakBadge');
  const streakCount = $('streakCount');
  const profileName = $('profileName');
  const profileMeta = $('profileMeta');

  const petName = pet?.name?.trim() || 'Песик';
  const weeks = getAgeInWeeks(pet?.birthDate);
  const ageStr = weekLabel(weeks);

  if (nameEl) nameEl.textContent = petName;
  if (subEl) subEl.textContent = `${ageStr} · ${pet?.breed || 'Песик'}`;
  if (profileName) profileName.textContent = petName;
  if (profileMeta) {
    profileMeta.textContent = [pet?.breed || '', ageStr, pet?.sex || ''].filter(Boolean).join(' · ');
  }

  if (avatarEl) {
    if (user?.photoURL) {
      avatarEl.innerHTML = `<img src="${escapeHtml(user.photoURL)}" alt="" loading="lazy">`;
    } else {
      avatarEl.textContent = avatarLetter(user?.displayName || petName);
    }
  }

  // Streak badge
  const streak = state.gamification.streak;
  if (streakBadge && streakCount) {
    if (streak.count > 0) {
      streakBadge.classList.remove('hidden');
      streakCount.textContent = streak.count;
    } else {
      streakBadge.classList.add('hidden');
    }
  }
}

// ===== TOAST =====

/**
 * Show toast notification
 * @param {string} msg
 * @param {'success'|'error'|''} [type]
 * @param {Function} [undoCallback]
 */
export function toast(msg, type = '', undoCallback = null) {
  const box = $('toastContainer');
  if (!box) return;

  const el = document.createElement('div');
  el.className = `toast ${type} ${undoCallback ? 'undo' : ''}`;

  if (undoCallback) {
    el.innerHTML = `<span>${msg}</span><button class="undo-btn" type="button">Скасувати</button>`;
    el.querySelector('.undo-btn').addEventListener('click', () => {
      undoCallback();
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    });
  } else {
    el.textContent = msg;
  }

  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));

  const duration = undoCallback ? 4000 : 2800;
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ===== LOADING =====

export function showLoading() {
  const el = $('loadingOverlay');
  if (el) el.classList.remove('hidden');
}

export function hideLoading() {
  const el = $('loadingOverlay');
  if (el) el.classList.add('hidden');
}

// ===== CONFIRM DIALOG =====

/**
 * Show an app-native confirmation dialog.
 * @param {{title?: string, message?: string, okText?: string, cancelText?: string, danger?: boolean}} options
 * @returns {Promise<boolean>}
 */
export function confirmDialog(options = {}) {
  const dialog = $('confirmDialog');
  const title = $('confirmTitle');
  const message = $('confirmMessage');
  const ok = $('confirmOkBtn');
  const cancel = $('confirmCancelBtn');
  if (!dialog || !ok || !cancel) return Promise.resolve(false);

  if (title) title.textContent = options.title || 'Підтвердити дію';
  if (message) message.textContent = options.message || '';
  ok.textContent = options.okText || 'Підтвердити';
  cancel.textContent = options.cancelText || 'Скасувати';
  ok.classList.toggle('btn-danger', Boolean(options.danger));

  dialog.classList.remove('hidden');
  dialog.setAttribute('aria-hidden', 'false');

  return new Promise((resolve) => {
    const cleanup = (result) => {
      dialog.classList.add('hidden');
      dialog.setAttribute('aria-hidden', 'true');
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      dialog.querySelector('[data-confirm-cancel]')?.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onKey = (e) => {
      if (e.key === 'Escape') cleanup(false);
    };

    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    dialog.querySelector('[data-confirm-cancel]')?.addEventListener('click', onCancel);
    document.addEventListener('keydown', onKey);
    ok.focus();
  });
}

/**
 * Show an app-native text input dialog.
 * @param {{title?: string, message?: string, placeholder?: string, okText?: string, cancelText?: string}} options
 * @returns {Promise<string|null>}
 */
export function promptDialog(options = {}) {
  const dialog = $('confirmDialog');
  const title = $('confirmTitle');
  const message = $('confirmMessage');
  const ok = $('confirmOkBtn');
  const cancel = $('confirmCancelBtn');
  const actions = dialog?.querySelector('.modal-actions');
  if (!dialog || !ok || !cancel || !actions) return Promise.resolve(null);

  if (title) title.textContent = options.title || 'Введіть значення';
  if (message) message.textContent = options.message || '';
  ok.textContent = options.okText || 'Додати';
  cancel.textContent = options.cancelText || 'Скасувати';
  ok.classList.remove('btn-danger');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'modal-input';
  input.placeholder = options.placeholder || '';
  input.autocomplete = 'off';
  actions.before(input);

  dialog.classList.remove('hidden');
  dialog.setAttribute('aria-hidden', 'false');

  return new Promise((resolve) => {
    const cleanup = (value) => {
      dialog.classList.add('hidden');
      dialog.setAttribute('aria-hidden', 'true');
      input.remove();
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      dialog.querySelector('[data-confirm-cancel]')?.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onOk = () => cleanup(input.value.trim() || null);
    const onCancel = () => cleanup(null);
    const onKey = (e) => {
      if (e.key === 'Escape') cleanup(null);
      if (e.key === 'Enter') cleanup(input.value.trim() || null);
    };

    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    dialog.querySelector('[data-confirm-cancel]')?.addEventListener('click', onCancel);
    document.addEventListener('keydown', onKey);
    input.focus();
  });
}

// ===== SUBSCRIBE TO STATE =====

subscribe(['events', 'reminders', 'pet', 'gamification'], () => {
  scheduleRender();
});

subscribe('ui.activeTab', () => {
  renderActiveTab();
});

subscribe('ui.theme', () => {
  const theme = state.ui.theme;
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#0f0f1a' : '#0ea5e9';
});

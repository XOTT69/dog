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

/** @type {boolean} */
let renderScheduled = false;

// ===== TAB MANAGEMENT =====

/**
 * Switch active tab
 * @param {string} tabId
 */
export function setActiveTab(tabId) {
  state.ui.activeTab = tabId;

  document.querySelectorAll('.tab').forEach(panel => {
    panel.classList.toggle('active', panel.id === tabId);
  });

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  const fab = $('fabAddEvent');
  if (fab) fab.classList.toggle('hidden', tabId === 'tabProfile');

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

      case 'tabCourses':
        if (!coursesRenderer) {
          coursesRenderer = await import('./renders/courses.js');
        }
        coursesRenderer.render();
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

// ===== SUBSCRIBE TO STATE =====

subscribe(['events', 'pet', 'gamification'], () => {
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

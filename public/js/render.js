/**
 * @fileoverview Render orchestrator — only renders active tab, uses dirty flags
 */

import { state, subscribe } from './state.js';
import { weekLabel, getAgeInWeeks, avatarLetter, escapeHtml } from './utils.js';
import * as chatRenderer from './renders/chat.js';

const $ = (id) => document.getElementById(id);

// Lazy-loaded render modules
let homeRenderer = null;
let calendarRenderer = null;
let diaryRenderer = null;
let coursesRenderer = null;
let profileRenderer = null;

const TAB_ROUTES = {
  tabHome: 'today',
  tabCalendar: 'calendar',
  tabCourses: 'academy',
  tabDiary: 'diary',
  tabProfile: 'profile',
  tabChat: 'coach',
};

/** @type {boolean} */
let renderScheduled = false;

// ===== TAB MANAGEMENT =====

/**
 * Switch active tab
 * @param {string} tabId
 */
export function setActiveTab(tabId, options = {}) {
  if (!document.getElementById(tabId)) tabId = 'tabHome';
  state.ui.activeTab = tabId;
  localStorage.setItem('dc_active_tab', tabId);

  if (!options.skipHistory) {
    const route = TAB_ROUTES[tabId] || 'today';
    history.replaceState(null, '', `${location.pathname}${location.search}#${route}`);
  }

  document.querySelectorAll('.tab').forEach(panel => {
    setPanelVisibility(panel, panel.id === tabId);
  });

  document.querySelectorAll('.nav-item').forEach(btn => {
    const active = btn.dataset.tab === tabId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-current', active ? 'page' : 'false');
  });

  const fab = $('fabAddEvent');
  const header = document.querySelector('.header');
  const nav = document.querySelector('.nav');
  const main = document.querySelector('.main');

  if (main) main.classList.toggle('main-chat', tabId === 'tabChat');

  if (fab) fab.classList.toggle('hidden', tabId === 'tabProfile' || tabId === 'tabChat');
  if (header) header.classList.remove('hidden');
  if (nav) nav.classList.remove('hidden');

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (tabId === 'tabChat') {
    ensureChatRenderer();
  }

  renderActiveTab();
}

async function ensureChatRenderer() {
  try {
    chatRenderer.render();
  } catch (e) {
    console.error('[Render] Failed to prepare chat:', e);
  }
}

function setPanelVisibility(panel, active) {
  panel.classList.toggle('active', active);
  panel.hidden = !active;
  panel.setAttribute('aria-hidden', active ? 'false' : 'true');
  panel.style.display = active ? (panel.id === 'tabChat' ? 'flex' : 'block') : 'none';

  if (active) {
    panel.removeAttribute('inert');
    panel.inert = false;
  } else {
    panel.setAttribute('inert', '');
    panel.inert = true;
  }
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
        await ensureChatRenderer();
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
    const text = document.createElement('span');
    text.textContent = msg;
    const undoBtn = document.createElement('button');
    undoBtn.className = 'undo-btn';
    undoBtn.type = 'button';
    undoBtn.textContent = 'Скасувати';
    el.append(text, undoBtn);
    undoBtn.addEventListener('click', () => {
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

subscribe(['events', 'pet', 'calendar', 'gamification'], () => {
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

export function resolveTabFromRoute() {
  const route = location.hash.replace('#', '');
  const byRoute = Object.entries(TAB_ROUTES).find(([, value]) => value === route)?.[0];
  if (byRoute && document.getElementById(byRoute)) return byRoute;

  const saved = localStorage.getItem('dc_active_tab');
  if (saved && document.getElementById(saved)) return saved;
  return 'tabHome';
}

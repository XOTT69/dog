import { state, subscribe } from './state.js';
import { weekLabel, getAgeInWeeks, avatarLetter } from './utils.js';

const $ = (id) => document.getElementById(id);

let homeRenderer;
let calendarRenderer;
let diaryRenderer;
let coursesRenderer;
let chatRenderer;
let profileRenderer;
let renderScheduled = false;

const TAB_ROUTES = {
  tabHome: 'today',
  tabCalendar: 'calendar',
  tabCourses: 'academy',
  tabDiary: 'diary',
  tabProfile: 'profile',
  tabChat: 'coach',
};

function applyTabVisibility(tabId) {
  document.querySelectorAll('.tab').forEach((panel) => {
    const active = panel.id === tabId;
    panel.classList.toggle('active', active);
    panel.toggleAttribute('hidden', !active);
    panel.setAttribute('aria-hidden', String(!active));
    if ('inert' in panel) panel.inert = !active;
    panel.style.display = active ? (panel.id === 'tabChat' ? 'flex' : 'block') : 'none';
  });
}

export function setActiveTab(tabId, options = {}) {
  if (!document.getElementById(tabId)) tabId = 'tabHome';

  state.ui.activeTab = tabId;
  localStorage.setItem('dc_active_tab', tabId);

  if (!options.skipHistory) {
    const route = TAB_ROUTES[tabId] || 'today';
    history.replaceState(null, '', `${location.pathname}${location.search}#${route}`);
  }

  applyTabVisibility(tabId);
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  document.querySelector('.main')?.classList.toggle('main-chat', tabId === 'tabChat');
  $('fabAddEvent')?.classList.toggle('hidden', tabId === 'tabProfile' || tabId === 'tabChat');
  document.querySelector('.header')?.classList.remove('hidden');
  document.querySelector('.nav')?.classList.remove('hidden');

  window.scrollTo({ top: 0, behavior: 'auto' });
  renderActiveTab();
}

export function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    renderActiveTab();
  });
}

async function renderActiveTab() {
  const tab = state.ui.activeTab;
  applyTabVisibility(tab);
  renderHeader();

  try {
    if (tab === 'tabHome') {
      homeRenderer ||= await import('./renders/home.js');
      homeRenderer.render();
    } else if (tab === 'tabCalendar') {
      calendarRenderer ||= await import('./renders/calendar.js');
      calendarRenderer.render();
    } else if (tab === 'tabCourses') {
      coursesRenderer ||= await import('./renders/courses.js');
      coursesRenderer.render();
    } else if (tab === 'tabDiary') {
      diaryRenderer ||= await import('./renders/diary.js');
      diaryRenderer.render();
    } else if (tab === 'tabChat') {
      chatRenderer ||= await import('./renders/chat.js');
      chatRenderer.render();
    } else if (tab === 'tabProfile') {
      profileRenderer ||= await import('./renders/profile.js');
      profileRenderer.render();
    }
  } catch (error) {
    console.error('[Render] Failed to load tab module:', tab, error);
  }
}

function renderHeader() {
  const pet = state.pet.data;
  const user = state.auth.user;
  const petName = pet?.name?.trim() || 'Песик';
  const ageStr = weekLabel(getAgeInWeeks(pet?.birthDate));

  if ($('petNameHeader')) $('petNameHeader').textContent = petName;
  if ($('headerSub')) $('headerSub').textContent = `${ageStr} · ${pet?.breed || 'Песик'}`;
  if ($('profileName')) $('profileName').textContent = petName;
  if ($('profileMeta')) $('profileMeta').textContent = [pet?.breed || '', ageStr, pet?.sex || ''].filter(Boolean).join(' · ');
  if ($('userAvatar')) $('userAvatar').textContent = avatarLetter(user?.displayName || petName);

  const streak = state.gamification.streak;
  const badge = $('streakBadge');
  const count = $('streakCount');
  if (badge && count) {
    badge.classList.toggle('hidden', streak.count <= 0);
    if (streak.count > 0) count.textContent = streak.count;
  }
}

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
    undoBtn.addEventListener('click', () => {
      undoCallback();
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    });
    el.append(text, undoBtn);
  } else {
    el.textContent = msg;
  }

  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, undoCallback ? 4000 : 2800);
}

export function showLoading() {
  $('loadingOverlay')?.classList.remove('hidden');
}

export function hideLoading() {
  $('loadingOverlay')?.classList.add('hidden');
}

subscribe(['events', 'pet', 'calendar', 'gamification'], scheduleRender);
subscribe('ui.activeTab', renderActiveTab);
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

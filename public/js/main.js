/**
 * @fileoverview Application entry point — boots auth, binds global events, coordinates modules
 */

import { state, batch, subscribe, persistTheme, STORAGE_KEYS } from './state.js';
import { initAuth, loginGoogle, logout, ensureWorkspace, subscribePets, switchPet, addPet, subscribeEvents, subscribeMembers, subscribePush, subscribeAiMessages, subscribeReminders, savePetProfile } from './firebase.js';
import { setActiveTab, scheduleRender, toast, showLoading, hideLoading, confirmDialog } from './render.js';
import { startTimer, stopTimer, resetTimer, toggleTimer } from './timer.js';
import { unlock as unlockAudio } from './audio.js';
import { preloadAll } from './content-loader.js';
import { haptic } from './utils.js';
import { showConfetti } from './achievements.js';

const $ = (id) => document.getElementById(id);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const show = (el) => el?.classList.remove('hidden');
const hide = (el) => el?.classList.add('hidden');

// ===== BOOT =====

function boot() {
  applyTheme();
  bindGlobalEvents();
  initAuthFlow();
  updateOnlineStatus();
}

// ===== AUTH FLOW =====

function initAuthFlow() {
  initAuth(async (user) => {
    if (!user) {
      show($('authScreen'));
      hide($('appContent'));
      hide($('onboardingScreen'));
      hideLoading();
      return;
    }

    hide($('authScreen'));
    showLoading();

    try {
      await ensureWorkspace(user);
      subscribePets();
      subscribeMembers();
      subscribeEvents();
      subscribeReminders();
      subscribeAiMessages();

      // Wait for first data snapshot
      await waitForData();

      if (shouldShowOnboarding()) {
        hideLoading();
        showOnboarding();
      } else {
        show($('appContent'));
        hideLoading();
        scheduleRender();

        // Preload content in background
        setTimeout(() => preloadAll(), 1000);

        // Subscribe push if allowed
        if ('Notification' in window && Notification.permission === 'granted') {
          subscribePush();
        }
      }
    } catch (e) {
      console.error('[Boot] Error:', e);
      toast('Помилка завантаження', 'error');
      hideLoading();
      show($('authScreen'));
    }
  });
}

/**
 * Wait for pet data and events to arrive (max 3s timeout)
 */
function waitForData() {
  return new Promise((resolve) => {
    let resolved = false;

    const check = () => {
      if (!resolved && !state.pet.loading && !state.events.loading) {
        resolved = true;
        resolve();
      }
    };

    const unsub = subscribe(['pet', 'events'], check);

    // Fallback timeout
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        unsub();
        resolve();
      }
    }, 3000);
  });
}

// ===== ONBOARDING =====

function shouldShowOnboarding() {
  if (localStorage.getItem(STORAGE_KEYS.onboarded)) return false;
  if (state.pet.data?.name?.trim()) {
    localStorage.setItem(STORAGE_KEYS.onboarded, 'true');
    return false;
  }
  if (state.events.items.length > 0) {
    localStorage.setItem(STORAGE_KEYS.onboarded, 'true');
    return false;
  }
  return true;
}

function showOnboarding() {
  hide($('authScreen'));
  hide($('appContent'));
  show($('onboardingScreen'));
  setOnboardingStep(1);
}

function setOnboardingStep(step) {
  $$('.onboarding-step').forEach(s => s.classList.add('hidden'));
  const stepEl = $(`onboardingStep${step}`);
  if (stepEl) stepEl.classList.remove('hidden');
  $$('.ob-dot').forEach(d => d.classList.toggle('active', parseInt(d.dataset.step) === step));
}

function bindOnboarding() {
  $('obNext1')?.addEventListener('click', () => {
    if (!$('obName')?.value.trim()) {
      toast("Введіть ім'я 🐾", 'error');
      return;
    }
    setOnboardingStep(2);
    haptic();
  });

  $('obBack2')?.addEventListener('click', () => setOnboardingStep(1));

  $('obNext2')?.addEventListener('click', () => {
    const birthDate = $('obBirthDate')?.value;
    if (birthDate) {
      const date = new Date(birthDate);
      const now = new Date();
      if (date > now) {
        toast("Дата народження не може бути в майбутньому 📅", 'error');
        return;
      }
      const maxAge = new Date();
      maxAge.setFullYear(maxAge.getFullYear() - 20);
      if (date < maxAge) {
        toast("Собака занадто старий? Перевірте дату 🐕", 'error');
        return;
      }
    }
    setOnboardingStep(3);
    haptic();
  });

  $('obBack3')?.addEventListener('click', () => setOnboardingStep(2));

  // Toggle dog/cat fields in onboarding
  $('obPetType')?.addEventListener('change', () => {
    const isCat = $('obPetType')?.value === 'cat';
    const dogFields = $('obDogFields');
    const catFields = $('obCatFields');
    if (dogFields) dogFields.classList.toggle('hidden', isCat);
    if (catFields) catFields.classList.toggle('hidden', !isCat);
  });

  $('obFinish')?.addEventListener('click', async () => {
    showLoading();
    try {
      const isCat = $('obPetType')?.value === 'cat';
      const payload = {
        name: $('obName')?.value.trim() || '',
        birthDate: $('obBirthDate')?.value || '',
        sex: isCat ? ($('obCatSex')?.value || 'хлопчик') : ($('obSex')?.value || 'хлопчик'),
        breed: isCat ? ($('obCatBreed')?.value.trim() || '') : ($('obBreed')?.value.trim() || ''),
        toiletMode: isCat ? 'pad' : ($('obToiletMode')?.value || 'pad'),
        petType: isCat ? 'cat' : 'dog',
      };
      await savePetProfile(payload);
      localStorage.setItem(STORAGE_KEYS.onboarded, 'true');
      hide($('onboardingScreen'));
      show($('appContent'));
      toast(`${$('obName')?.value.trim()} додано! 🎉`, 'success');
      showConfetti();
      scheduleRender();

      // Preload content
      setTimeout(() => preloadAll(), 500);
    } catch (e) {
      console.error('[Onboarding] Error:', e);
      toast('Помилка', 'error');
    } finally {
      hideLoading();
    }
  });
}

// ===== SHEET =====

async function openSheet() {
  const sheetEl = $('eventSheet');
  if (sheetEl) sheetEl.classList.remove('hidden');
  state.ui.sheetOpen = true;
  state.ui.selectedEventType = null;
  state.ui.selectedSheetCategory = 'toilet';
  document.body.style.overflow = 'hidden';

  try {
    const sheetModule = await import('./renders/sheet.js');
    sheetModule.render();
  } catch (e) {
    console.error('[Sheet] Load error:', e);
  }
}

async function closeSheet() {
  try {
    const sheetModule = await import('./renders/sheet.js');
    sheetModule.closeSheet();
  } catch (e) {
    // Fallback: close manually
    hide($('eventSheet'));
    state.ui.sheetOpen = false;
    document.body.style.overflow = '';
  }
}

// ===== GLOBAL EVENTS =====

function bindGlobalEvents() {
  // Audio unlock on first touch (iOS PWA)
  const unlockHandler = () => {
    unlockAudio();
    document.removeEventListener('touchstart', unlockHandler);
    document.removeEventListener('click', unlockHandler);
  };
  document.addEventListener('touchstart', unlockHandler, { once: true });
  document.addEventListener('click', unlockHandler, { once: true });

  // Online/offline
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  // Theme toggle
  $$('[data-theme-toggle]').forEach(b => b.addEventListener('click', () => {
    state.ui.theme = state.ui.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    persistTheme();
    haptic();
  }));

  // Auth
  $('googleLoginBtn')?.addEventListener('click', async () => {
    showLoading();
    try {
      await loginGoogle();
    } catch (e) {
      toast(e.message || 'Помилка входу', 'error');
    } finally {
      hideLoading();
    }
  });

  $('logoutBtn')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Вийти з акаунта?',
      message: 'Дані залишаться у вашому просторі, ви зможете повернутися через Google.',
      okText: 'Вийти',
      danger: true,
    });
    if (ok) {
      stopTimer();
      logout();
      hide($('appContent'));
      show($('authScreen'));
    }
  });

  // Navigation
  $$('.nav-item').forEach(b => b.addEventListener('click', () => {
    setActiveTab(b.dataset.tab);
    haptic();
  }));

  // FAB
  $('fabAddEvent')?.addEventListener('click', () => {
    openSheet();
    haptic();
  });

  // Sheet backdrop
  $('sheetBackdrop')?.addEventListener('click', closeSheet);

  // "More actions" button
  $('showAllActionsBtn')?.addEventListener('click', () => {
    openSheet();
    haptic();
  });

  // Chat back button → go to home
  $('chatBackBtn')?.addEventListener('click', () => {
    setActiveTab('tabCourses');
    haptic();
  });

  // Chat settings → go to profile
  $('chatSettingsBtn')?.addEventListener('click', () => {
    setActiveTab('tabProfile');
    haptic();
  });

  // Timer
  $('timerStartBtn')?.addEventListener('click', () => {
    toggleTimer();
    haptic();
  });

  $('timerResetBtn')?.addEventListener('click', () => {
    resetTimer();
    haptic();
  });

  $$('[data-timer-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      startTimer(parseInt(btn.dataset.timerPreset) * 60);
      haptic();
    });
  });

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSheet();
  });

  // Resize → re-render chart
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (state.ui.activeTab === 'tabDiary') {
        import('./renders/diary.js').then(m => {
          if (m.invalidateChart) m.invalidateChart();
        }).catch(() => {});
      }
    }, 200);
  });

  // Diary filters
  $$('#diaryFilters .chip').forEach(btn => {
    btn.addEventListener('click', () => {
      state.ui.diaryFilter = btn.dataset.filter;
      $$('#diaryFilters .chip').forEach(b => b.classList.toggle('active', b === btn));
      scheduleRender();
      haptic();
    });
  });

  // Course filters
  $$('#courseFilters [data-course-level]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.ui.courseFilter = btn.dataset.courseLevel;
      $$('#courseFilters [data-course-level]').forEach(b => b.classList.toggle('active', b === btn));
      scheduleRender();
      haptic();
    });
  });

  // Weekly report dismiss
  $('closeWeeklyBtn')?.addEventListener('click', () => {
    hide($('weeklyReport'));
    localStorage.setItem('dc_weekly_dismissed', new Date().toISOString().slice(0, 10));
  });

  // AI plan refresh
  $('refreshPlanBtn')?.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEYS.aiPlan);
    scheduleRender();
    haptic();
  });

  // Onboarding
  bindOnboarding();
}

// ===== THEME =====

function applyTheme() {
  const theme = state.ui.theme;
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#0f0f1a' : '#e07a5f';
}

// ===== ONLINE STATUS =====

function updateOnlineStatus() {
  state.ui.online = navigator.onLine;
  const bar = $('offlineBar');
  if (bar) bar.classList.toggle('visible', !navigator.onLine);
}

// ===== INIT =====
boot();

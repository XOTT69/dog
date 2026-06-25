/**
 * @fileoverview Application entry point — boots auth, binds global events, coordinates modules
 */

import { state, subscribe, persistTheme, STORAGE_KEYS } from './state.js';
import {
  initAuth,
  loginGoogle,
  logout,
  ensureWorkspace,
  subscribePets,
  subscribeEvents,
  subscribeMembers,
  subscribeCalendarItems,
  subscribePush,
  savePetProfile,
  flushOfflineEvents,
} from './firebase.js';
import { setActiveTab, scheduleRender, toast, showLoading, hideLoading, resolveTabFromRoute } from './render.js';
import { confirmDialog } from './modal.js';
import { startTimer, stopTimer, resetTimer, toggleTimer } from './timer.js';
import { unlock as unlockAudio } from './audio.js';
import { preloadAll } from './content-loader.js';
import { haptic } from './utils.js';
import { showConfetti } from './achievements.js';

const $ = (id) => document.getElementById(id);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const show = (el) => el?.classList.remove('hidden');
const hide = (el) => el?.classList.add('hidden');
let launchActionHandled = false;

function boot() {
  if (normalizeLocalhostForFirebaseAuth()) return;
  applyTheme();
  bindGlobalEvents();
  setActiveTab(resolveTabFromRoute(), { skipHistory: true });
  initAuthFlow();
  updateOnlineStatus();
}

function normalizeLocalhostForFirebaseAuth() {
  if (window.location.hostname !== '127.0.0.1') return false;
  const target = new URL(window.location.href);
  target.hostname = 'localhost';
  window.location.replace(target.toString());
  return true;
}

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
    hide($('onboardingScreen'));
    showLoading();

    try {
      await prepareSignedInWorkspace(user);
      await waitForData();
      enterSignedInApp();
    } catch (error) {
      handleSignedInBootError(error);
    }
  });
}

async function prepareSignedInWorkspace(user) {
  await ensureWorkspace(user);
  subscribePets();
  subscribeMembers();
  subscribeEvents();
  subscribeCalendarItems();
}

function enterSignedInApp() {
  if (shouldShowOnboarding()) {
    hideLoading();
    showOnboarding();
    return;
  }

  hide($('authScreen'));
  hide($('onboardingScreen'));
  show($('appContent'));
  hideLoading();
  setActiveTab(resolveTabFromRoute(), { skipHistory: true });
  scheduleRender();
  handleLaunchAction();

  flushOfflineEvents().then((flushed) => {
    if (flushed > 0) toast(`Синхронізовано ${flushed} подій`, 'success');
  }).catch(() => {});

  setTimeout(() => preloadAll(), 1000);

  if ('Notification' in window && Notification.permission === 'granted') {
    subscribePush();
  }
}

function handleSignedInBootError(error) {
  console.error('[Boot] Signed-in load error:', error);
  hideLoading();
  hide($('authScreen'));

  const hasWorkspace = Boolean(state.workspace.id);
  const canShowApp = hasWorkspace && !shouldShowOnboarding();

  if (canShowApp) {
    show($('appContent'));
    hide($('onboardingScreen'));
    setActiveTab(resolveTabFromRoute(), { skipHistory: true });
    scheduleRender();
    toast('Дані частково завантажились. Спробуйте оновити сторінку.', 'error');
    return;
  }

  showOnboarding();
  toast('Вхід виконано. Завершіть профіль ще раз, дані збережемо в акаунт.', 'error');
}

function waitForData() {
  return new Promise((resolve) => {
    let resolved = false;
    let unsub = null;

    const check = () => {
      if (!resolved && !state.pets.loading && !state.pet.loading && !state.events.loading) {
        resolved = true;
        unsub?.();
        resolve();
      }
    };

    unsub = subscribe(['pets', 'pet', 'events'], check);
    check();

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        unsub?.();
        resolve();
      }
    }, 3500);
  });
}

function handleLaunchAction() {
  if (launchActionHandled) return;
  launchActionHandled = true;

  const params = new URLSearchParams(window.location.search);
  if (params.get('action') !== 'add') return;

  window.history.replaceState({}, '', window.location.pathname + window.location.hash);
  setTimeout(() => openSheet(), 350);
}

function shouldShowOnboarding() {
  const hasPetName = Boolean(state.pet.data?.name?.trim());
  if (hasPetName) {
    localStorage.setItem(STORAGE_KEYS.onboarded, 'true');
    return false;
  }

  if (state.pets.items.length > 0) {
    return true;
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
  $$('.onboarding-step').forEach((item) => item.classList.add('hidden'));
  $(`onboardingStep${step}`)?.classList.remove('hidden');
  $$('.ob-dot').forEach((dot) => dot.classList.toggle('active', parseInt(dot.dataset.step, 10) === step));
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
      const maxAge = new Date();
      maxAge.setFullYear(maxAge.getFullYear() - 20);

      if (date > now) {
        toast('Дата народження не може бути в майбутньому 📅', 'error');
        return;
      }
      if (date < maxAge) {
        toast('Собака занадто старий? Перевірте дату 🐕', 'error');
        return;
      }
    }
    setOnboardingStep(3);
    haptic();
  });

  $('obBack3')?.addEventListener('click', () => setOnboardingStep(2));

  $('obPetType')?.addEventListener('change', () => {
    const isCat = $('obPetType')?.value === 'cat';
    $('obDogFields')?.classList.toggle('hidden', isCat);
    $('obCatFields')?.classList.toggle('hidden', !isCat);
  });

  $('obFinish')?.addEventListener('click', async () => {
    showLoading();
    try {
      const isCat = $('obPetType')?.value === 'cat';
      const name = $('obName')?.value.trim() || '';
      const payload = {
        name,
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
      toast(`${name} додано! 🎉`, 'success');
      showConfetti();
      setActiveTab(resolveTabFromRoute(), { skipHistory: true });
      scheduleRender();
      handleLaunchAction();
      setTimeout(() => preloadAll(), 500);
    } catch (error) {
      console.error('[Onboarding] Error:', error);
      toast(error?.message || 'Не вдалося зберегти профіль', 'error');
      hide($('authScreen'));
      show($('onboardingScreen'));
    } finally {
      hideLoading();
    }
  });
}

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
  } catch (error) {
    console.error('[Sheet] Load error:', error);
  }
}

async function closeSheet() {
  try {
    const sheetModule = await import('./renders/sheet.js');
    sheetModule.closeSheet();
  } catch {
    hide($('eventSheet'));
    state.ui.sheetOpen = false;
    document.body.style.overflow = '';
  }
}

function bindGlobalEvents() {
  const unlockHandler = () => {
    unlockAudio();
    document.removeEventListener('touchstart', unlockHandler);
    document.removeEventListener('click', unlockHandler);
  };
  document.addEventListener('touchstart', unlockHandler, { once: true });
  document.addEventListener('click', unlockHandler, { once: true });

  window.addEventListener('online', async () => {
    updateOnlineStatus();
    const flushed = await flushOfflineEvents();
    if (flushed > 0) toast(`Синхронізовано ${flushed} подій`, 'success');
  });
  window.addEventListener('offline', updateOnlineStatus);

  $$('[data-theme-toggle]').forEach((button) => button.addEventListener('click', () => {
    state.ui.theme = state.ui.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    persistTheme();
    haptic();
  }));

  $('googleLoginBtn')?.addEventListener('click', async () => {
    showLoading();
    try {
      await loginGoogle();
    } catch (error) {
      const authMessages = {
        'auth/unauthorized-domain': 'Додайте цей домен у Firebase Auth → Authorized domains',
        'auth/popup-closed-by-user': 'Вхід скасовано',
        'auth/network-request-failed': 'Немає зʼєднання з Google/Firebase',
      };
      toast(authMessages[error.code] || error.message || 'Помилка входу', 'error');
      hideLoading();
    }
  });

  $('logoutBtn')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Вийти з акаунта?',
      message: 'Локальні чернетки й налаштування залишаться на пристрої.',
      confirmLabel: 'Вийти',
    });
    if (ok) {
      stopTimer();
      await logout();
      hide($('appContent'));
      hide($('onboardingScreen'));
      show($('authScreen'));
    }
  });

  $$('.nav-item').forEach((button) => button.addEventListener('click', () => {
    setActiveTab(button.dataset.tab);
    haptic();
  }));

  $$('[data-tab-jump]').forEach((button) => button.addEventListener('click', () => {
    setActiveTab(button.dataset.tabJump);
    haptic();
  }));

  window.addEventListener('hashchange', () => {
    setActiveTab(resolveTabFromRoute(), { skipHistory: true });
  });

  $('fabAddEvent')?.addEventListener('click', () => {
    openSheet();
    haptic();
  });

  $('sheetBackdrop')?.addEventListener('click', closeSheet);
  $('showAllActionsBtn')?.addEventListener('click', () => {
    openSheet();
    haptic();
  });

  $('chatSettingsBtn')?.addEventListener('click', () => {
    setActiveTab('tabProfile');
    haptic();
  });

  $('timerStartBtn')?.addEventListener('click', () => {
    toggleTimer();
    haptic();
  });

  $('timerResetBtn')?.addEventListener('click', () => {
    resetTimer();
    haptic();
  });

  $$('[data-timer-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      startTimer(parseInt(button.dataset.timerPreset, 10) * 60);
      haptic();
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSheet();
  });

  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (state.ui.activeTab === 'tabDiary') {
        import('./renders/diary.js').then((module) => {
          if (module.invalidateChart) module.invalidateChart();
        }).catch(() => {});
      }
    }, 200);
  });

  $$('#diaryFilters .chip').forEach((button) => {
    button.addEventListener('click', () => {
      state.ui.diaryFilter = button.dataset.filter;
      $$('#diaryFilters .chip').forEach((item) => item.classList.toggle('active', item === button));
      scheduleRender();
      haptic();
    });
  });

  $$('#courseFilters [data-course-level]').forEach((button) => {
    button.addEventListener('click', () => {
      state.ui.courseFilter = button.dataset.courseLevel;
      $$('#courseFilters [data-course-level]').forEach((item) => item.classList.toggle('active', item === button));
      scheduleRender();
      haptic();
    });
  });

  $('closeWeeklyBtn')?.addEventListener('click', () => {
    hide($('weeklyReport'));
    localStorage.setItem('dc_weekly_dismissed', new Date().toISOString().slice(0, 10));
  });

  $('refreshPlanBtn')?.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEYS.aiPlan);
    scheduleRender();
    haptic();
  });

  bindOnboarding();
}

function applyTheme() {
  const theme = state.ui.theme;
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#0f0f1a' : '#e07a5f';
}

function updateOnlineStatus() {
  state.ui.online = navigator.onLine;
  const bar = $('offlineBar');
  if (bar) bar.classList.toggle('visible', !navigator.onLine);
}

boot();

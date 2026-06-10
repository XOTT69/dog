/**
 * @fileoverview Application entry point — boots auth, binds global events, coordinates modules
 */

import { state, batch, subscribe, persistTheme, STORAGE_KEYS } from './state.js';
import { initAuth, loginGoogle, logout, ensureWorkspace, subscribePet, subscribeEvents, subscribeMembers, subscribePush, savePetProfile, syncQueuedEvents } from './firebase.js';
import { setActiveTab, scheduleRender, toast, showLoading, hideLoading, unsubscribeAll as unsubscribeRender } from './render.js';
import { startTimer, stopTimer, resetTimer, toggleTimer, loadTimerState } from './timer.js';
import { playClicker, playWhistle, unlock as unlockAudio } from './audio.js';
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
  loadTimerState();
  bindGlobalEvents();
  initAuthFlow();
  updateOnlineStatus();
  initPTR();
  hideSplash();
}

function hideSplash() {
  const splash = $('splashScreen');
  if (splash) {
    splash.classList.add('hide');
    setTimeout(() => splash.remove(), 500);
  }
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
      subscribePet();
      subscribeMembers();
      subscribeEvents();

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
    setOnboardingStep(3);
    haptic();
  });

  $('obBack3')?.addEventListener('click', () => setOnboardingStep(2));

  $('obFinish')?.addEventListener('click', async () => {
    showLoading();
    try {
      await savePetProfile({
        name: $('obName')?.value.trim() || '',
        birthDate: $('obBirthDate')?.value || '',
        sex: $('obSex')?.value || 'хлопчик',
        breed: $('obBreed')?.value.trim() || '',
        toiletMode: $('obToiletMode')?.value || 'pad',
      });
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
  window.addEventListener('online', () => {
    updateOnlineStatus();
    syncQueuedEvents();
  });
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
    }
    hideLoading();
  });

  $('logoutBtn')?.addEventListener('click', () => {
    if (confirm('Вийти?')) {
      stopTimer();
      logout();
      unsubscribeRender();
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

  // Clicker & Whistle
  bindClickerEvents();

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

  // Share invite button
  $('shareInviteBtn')?.addEventListener('click', async () => {
    const code = $('inviteCodeView')?.textContent;
    if (!code || code === '—' || !navigator.share) {
      if (code && code !== '—') {
        await navigator.clipboard.writeText(`🐕 Приєднуйтесь до моєї команди в Dog Coach!\n\nКод: ${code}\n\nhttps://dog-coach.vercel.app`);
        toast('Код скопійовано 📋', 'success');
      }
      return;
    }
    try {
      await navigator.share({
        title: 'Dog Coach AI',
        text: `🐕 Приєднуйтесь до моєї команди в Dog Coach!\n\nКод: ${code}`,
        url: 'https://dog-coach.vercel.app',
      });
    } catch {}
  });

  // Share progress button
  $('shareProgressBtn')?.addEventListener('click', async () => {
    const petName = state.pet.data?.name || 'Песик';
    const streak = state.gamification.streak.count;
    const text = `🐕 ${petName} — ось як ми тренуємося!\n🔥 Streak: ${streak} днів\n📊 Подій: ${state.events.items.length}\n🐾 Dog Coach AI`;
    if (!navigator.share) {
      await navigator.clipboard.writeText(text);
      toast('Скопійовано 📋', 'success');
      return;
    }
    try {
      await navigator.share({ title: 'Dog Coach AI', text });
    } catch {}
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

  // Badge API (PWA)
  updateBadge();
}

/**
 * Update PWA badge (unread reminders count)
 */
async function updateBadge() {
  if (!navigator.setAppBadge || !state.pet.data?.reminders) return;
  const reminders = state.pet.data.reminders || [];
  const overdue = reminders.filter(r => {
    if (!r.nextDate) return false;
    return new Date(r.nextDate) < new Date();
  });
  try {
    if (overdue.length > 0) {
      await navigator.setAppBadge(overdue.length);
    } else {
      await navigator.clearAppBadge();
    }
  } catch {}
}

/**
 * Pull-to-refresh logic
 */
function initPTR() {
  let startY = 0;
  let pulling = false;
  const indicator = $('ptrIndicator');
  if (!indicator) return;

  document.addEventListener('touchstart', (e) => {
    if (window.scrollY > 0) return;
    startY = e.touches[0].clientY;
    pulling = true;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!pulling || window.scrollY > 0) return;
    const dist = e.touches[0].clientY - startY;
    if (dist > 0) {
      indicator.classList.add('visible');
      if (dist > 120) {
        indicator.classList.add('ready');
      } else {
        indicator.classList.remove('ready');
      }
    }
  }, { passive: true });

  document.addEventListener('touchend', async () => {
    if (!pulling) return;
    pulling = false;
    if (indicator.classList.contains('ready')) {
      indicator.classList.remove('ready');
      indicator.classList.add('refreshing');
      scheduleRender();
      syncQueuedEvents();
      setTimeout(() => {
        indicator.classList.remove('refreshing', 'visible');
      }, 800);
    } else {
      indicator.classList.remove('visible');
    }
  });
}

// ===== CLICKER =====

function bindClickerEvents() {
  const clickerBtn = $('clickerBtn');
  const whistleBtn = $('whistleBtn');

  if (clickerBtn) {
    const handleClicker = (e) => {
      e.preventDefault();
      playClicker();
      const count = parseInt(localStorage.getItem(STORAGE_KEYS.clickerCount) || '0') + 1;
      localStorage.setItem(STORAGE_KEYS.clickerCount, String(count));
      clickerBtn.classList.add('clicked');
      setTimeout(() => clickerBtn.classList.remove('clicked'), 150);
    };

    clickerBtn.addEventListener('touchend', handleClicker);
    clickerBtn.addEventListener('click', (e) => {
      if (!('ontouchend' in window)) handleClicker(e);
    });
  }

  if (whistleBtn) {
    const handleWhistle = (e) => {
      e.preventDefault();
      playWhistle();
      whistleBtn.classList.add('clicked');
      setTimeout(() => whistleBtn.classList.remove('clicked'), 500);
    };

    whistleBtn.addEventListener('touchend', handleWhistle);
    whistleBtn.addEventListener('click', (e) => {
      if (!('ontouchend' in window)) handleWhistle(e);
    });
  }
}

// ===== THEME =====

function applyTheme() {
  const theme = state.ui.theme;
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#0f0f1a' : '#0ea5e9';
}

// ===== ONLINE STATUS =====

function updateOnlineStatus() {
  state.ui.online = navigator.onLine;
  const bar = $('offlineBar');
  if (bar) bar.classList.toggle('visible', !navigator.onLine);
}

// ===== INIT =====
boot();

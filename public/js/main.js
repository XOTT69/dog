/**
 * @fileoverview Application entry point — boots auth, binds global events, coordinates modules
 */

import { state, batch, subscribe, persistTheme } from './state.js';
import { initAuth, loginGoogle, logout, ensureWorkspace, subscribePet, subscribeEvents, subscribeMembers } from './firebase.js';
import { setActiveTab, scheduleRender, toast, showLoading, hideLoading } from './render.js';
import { startTimer, stopTimer, resetTimer, toggleTimer } from './timer.js';
import { playClicker, playWhistle, unlock as unlockAudio } from './audio.js';
import { preloadAll } from './content-loader.js';
import { $, $$, haptic, show, hide } from './utils.js';
import { STORAGE_KEYS } from './state.js';

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
          const { subscribePush } = await import('./firebase.js');
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

    const unsub = subscribe(['pet', 'events'], () => {
      if (!state.pet.loading || !state.events.loading) {
        if (!resolved) { resolved = true; unsub(); resolve(); }
      }
    });

    // Fallback timeout
    setTimeout(() => {
      if (!resolved) { resolved = true; unsub(); resolve(); }
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
  show($(`onboardingStep${step}`));
  $$('.ob-dot').forEach(d => d.classList.toggle('active', parseInt(d.dataset.step) === step));
}

function bindOnboarding() {
  $('obNext1')?.addEventListener('click', () => {
    if (!$('obName')?.value.trim()) { toast("Введіть ім'я 🐾", 'error'); return; }
    setOnboardingStep(2);
    haptic();
  });

  $('obBack2')?.addEventListener('click', () => setOnboardingStep(1));
  $('obNext2')?.addEventListener('click', () => { setOnboardingStep(3); haptic(); });
  $('obBack3')?.addEventListener('click', () => setOnboardingStep(2));

  $('obFinish')?.addEventListener('click', async () => {
    showLoading();
    try {
      const { savePetProfile } = await import('./firebase.js');
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

      const { showConfetti } = await import('./achievements.js');
      showConfetti();
      scheduleRender();
    } catch {
      toast('Помилка', 'error');
    } finally {
      hideLoading();
    }
  });
}

// ===== GLOBAL EVENTS =====

function bindGlobalEvents() {
  // Audio unlock on first touch (iOS PWA)
  const unlockHandler = () => { unlockAudio(); document.removeEventListener('touchstart', unlockHandler); document.removeEventListener('click', unlockHandler); };
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

  // Auth buttons
  $('googleLoginBtn')?.addEventListener('click', async () => {
    showLoading();
    try { await loginGoogle(); } catch (e) { toast(e.message || 'Помилка', 'error'); }
    hideLoading();
  });

  $('logoutBtn')?.addEventListener('click', () => {
    if (confirm('Вийти?')) {
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
  $('fabAddEvent')?.addEventListener('click', () => { openSheet(); haptic(); });
  $('sheetBackdrop')?.addEventListener('click', closeSheet);
  $('showAllActionsBtn')?.addEventListener('click', openSheet);

  // Clicker
  bindClickerEvents();

  // Timer
  $('timerStartBtn')?.addEventListener('click', () => { toggleTimer(); haptic(); });
  $('timerResetBtn')?.addEventListener('click', () => { resetTimer(); haptic(); });
  $$('[data-timer-preset]').forEach(btn => {
    btn.addEventListener('click', () => { startTimer(parseInt(btn.dataset.timerPreset) * 60); haptic(); });
  });

  // Keyboard
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

  // Resize → re-render chart
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (state.ui.activeTab === 'tabDiary') {
        import('./renders/diary.js').then(m => m.invalidateChart());
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
    clickerBtn.addEventListener('click', (e) => { if (!('ontouchend' in window)) handleClicker(e); });
  }

  if (whistleBtn) {
    const handleWhistle = (e) => {
      e.preventDefault();
      playWhistle();
      whistleBtn.classList.add('clicked');
      setTimeout(() => whistleBtn.classList.remove('clicked'), 500);
    };
    whistleBtn.addEventListener('touchend', handleWhistle);
    whistleBtn.addEventListener('click', (e) => { if (!('ontouchend' in window)) handleWhistle(e); });
  }
}

// ===== SHEET =====

function openSheet() {
  show($('eventSheet'));
  state.ui.sheetOpen = true;
  state.ui.selectedEventType = null;
  state.ui.selectedSheetCategory = 'toilet';
  document.body.style.overflow = 'hidden';

  import('./renders/sheet.js').then(m => m.render());
}

function closeSheet() {
  hide($('eventSheet'));
  state.ui.sheetOpen = false;
  document.body.style.overflow = '';
}

// Export for sheet module
export { closeSheet };

// ===== THEME =====

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.ui.theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = state.ui.theme === 'dark' ? '#0f0f1a' : '#0ea5e9';
}

// ===== ONLINE STATUS =====

function updateOnlineStatus() {
  state.ui.online = navigator.onLine;
  const bar = $('offlineBar');
  if (bar) bar.classList.toggle('visible', !navigator.onLine);
}

// ===== INIT =====
boot();

/**
 * @fileoverview Home tab renderer — restructured for progressive disclosure
 * Structure: Hero → Quick Actions → Today Stats → Progressive Cards
 */

import { state, STORAGE_KEYS } from '../state.js';
import { $, $$, escapeHtml, haptic, startOfToday, todayKey, localDateKey, tsToDate, getAgeInWeeks, weekLabel, isToiletSuccess, isToiletMiss, calcToiletStats, daysBetween } from '../utils.js';
import { MS_PER_DAY, MS_PER_WEEK, TOILET_MODES, STREAK_LEVELS, MAX_HEATMAP_DAYS } from '../constants.js';
import { addEvent, deleteEvent, restoreEvent } from '../firebase.js';
import { updateStreak, checkAchievements, showConfetti, ACHIEVEMENT_DEFS } from '../achievements.js';
import { startTimer, formatTimer, getTimerProgress } from '../timer.js';
import { generateDailyPlan } from '../ai.js';
import { playClicker, playWhistle } from '../audio.js';
import { toast, isDirty } from '../render.js';
import { getBreedProfile, getProtocols, getTips } from '../content-loader.js';

// ===== RENDER =====

export function render() {
  // Always update streak (lightweight)
  updateStreak();

  // Targeted rendering — only dirty sections re-render
  if (isDirty('hero')) renderHero();
  if (isDirty('streak')) renderStreak();
  if (isDirty('tip')) renderDailyTip();
  if (isDirty('kpi')) renderKpis();
  if (isDirty('onetap')) renderOneTap();
  if (isDirty('timer')) renderTimer();
  if (isDirty('dailyPlan')) renderDailyPlan();
  if (isDirty('heatmap')) renderHeatmap();
  if (isDirty('achievements')) renderAchievements();

  // Progressive disclosure cards (lazy, heavy — only if dirty)
  if (isDirty('breedCard')) renderBreedCard();
  if (isDirty('problemCards')) renderProblemCards();
  if (isDirty('recommendedCourses')) renderRecommendedCourses();
  if (isDirty('weeklyReport')) renderWeeklyReport();
  if (isDirty('foodGuide')) renderFoodGuide();
  if (isDirty('ageFocus')) renderAgeFocus();
  if (isDirty('heatInfo')) renderHeatInfo();
  if (isDirty('reminders')) renderReminders();

  // Check achievements after render
  const newAch = checkAchievements();
  if (newAch.length > 0) {
    newAch.forEach(a => toast(`${a.icon} ${a.label}!`, 'success'));
    showConfetti();
  }
}

// ===== HERO =====

function renderHero() {
  const pet = state.pet.data;
  const nameEl = $('heroName');
  const metaEl = $('heroMeta');
  const emojiEl = $('heroEmoji');
  const streakEl = $('heroStreak');
  const streakText = $('heroStreakText');

  const petName = pet?.name?.trim() || 'Песик';
  const weeks = getAgeInWeeks(pet?.birthDate);
  const ageStr = weekLabel(weeks);

  if (nameEl) nameEl.textContent = petName;
  if (metaEl) {
    metaEl.textContent = [pet?.breed || '', ageStr].filter(Boolean).join(' · ') || '—';
  }
  if (emojiEl) emojiEl.textContent = pet?.sex === 'дівчинка' ? '🐶' : '🐕';

  // Streak badge in hero
  const streak = state.gamification.streak;
  if (streakEl && streakText) {
    if (streak.count > 0) {
      streakEl.classList.remove('hidden');
      streakText.textContent = streak.count;
    } else {
      streakEl.classList.add('hidden');
    }
  }
}

// ===== STREAK =====

function renderStreak() {
  const streak = state.gamification.streak;
  const card = $('streakCard');
  if (!card) return;

  if (streak.count > 0) {
    card.classList.remove('hidden');
    const text = $('streakText');
    const sub = $('streakSub');
    if (text) {
      const suffix = streak.count === 1 ? ' день' : streak.count < 5 ? ' дні' : ' днів';
      text.textContent = `${streak.count}${suffix} поспіль!`;
    }
    if (sub) {
      if (streak.count >= STREAK_LEVELS.LEGENDARY) sub.textContent = '🏆 Легенда!';
      else if (streak.count >= STREAK_LEVELS.GREAT) sub.textContent = '💎 Рекорд!';
      else if (streak.count >= STREAK_LEVELS.GOOD) sub.textContent = '💪 Чудово!';
      else sub.textContent = 'Так тримати!';
    }
  } else {
    card.classList.add('hidden');
  }
}

// ===== DAILY TIP =====

async function renderDailyTip() {
  const el = $('dailyTipText');
  if (!el) return;

  const pet = state.pet.data;
  const weeks = getAgeInWeeks(pet?.birthDate);
  const toiletMode = pet?.toiletMode || 'pad';
  const events = state.events.items;

  // Calculate recent stats
  const weekAgo = Date.now() - 7 * MS_PER_DAY;
  const last7 = events.filter(e => {
    const ts = tsToDate(e.createdAt);
    return ts && ts.getTime() >= weekAgo;
  });
  const stats = calcToiletStats(last7);
  const trainings7 = last7.filter(e => e.eventType === 'training').length;

  const tips = [];

  // Contextual tips by toilet mode
  if (toiletMode === TOILET_MODES.TRANSITION) {
    tips.push(stats.rate !== null && stats.rate < 70
      ? '🌳 Перехід на вулицю: виходьте в "правильні" моменти — після сну і їжі!'
      : '🌳 Перехід: хваліть НА ВУЛИЦІ в 10 разів більше ніж за пелюшку!');
  } else if (toiletMode === TOILET_MODES.OUTDOOR) {
    tips.push('🚶 Графік прогулянок = графік туалету. Виходьте в однакові часи!');
  } else {
    if (stats.rate !== null && stats.rate >= 90) tips.push(`🎉 ${stats.rate}% горшик! Можна починати перехід на вулицю!`);
    else if (stats.rate !== null && stats.rate >= 70) tips.push(`📈 Горшик ${stats.rate}% — прогрес!`);
    else if (stats.rate !== null) tips.push(`💪 Горшик ${stats.rate}%. Менше простору + таймер!`);
  }

  if (trainings7 === 0) tips.push('🎓 0 тренувань цього тижня. 2 хв + клікер = результат!');
  if (stats.total === 0 && events.length < 5) tips.push('📝 Записуйте туалет — побачите патерн за 3 дні!');

  // Fallback to tips pool
  if (tips.length > 0) {
    el.textContent = tips[Math.floor(Date.now() / 3600000) % tips.length];
  } else {
    try {
      const tipsData = await getTips();
      const pool = tipsData.filter(t => t.condition === 'any' ||
        (t.condition === 'puppy' && weeks != null && weeks < 16) ||
        (t.condition === 'teen' && weeks != null && weeks >= 24 && weeks < 72)
      );
      el.textContent = pool[new Date().getDate() % pool.length]?.text || 'Натисніть + для запису 📝';
    } catch {
      el.textContent = 'Натисніть + для запису 📝';
    }
  }
}

// ===== KPIs =====

function renderKpis() {
  const today = startOfToday();
  const todayEvents = state.events.items.filter(e => {
    const ts = tsToDate(e.createdAt);
    return ts && ts >= today;
  });
  const stats = calcToiletStats(todayEvents);

  const setNum = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  setNum('kpiSuccess', stats.success);
  setNum('kpiMiss', stats.miss);
  setNum('kpiTotal', todayEvents.length);
  setNum('ringPct', `${stats.rate || 0}%`);

  const ring = $('ringFill');
  if (ring) {
    ring.style.strokeDashoffset = String(251.3 - (251.3 * (stats.rate || 0) / 100));
  }
}

// ===== ONE-TAP =====

function renderOneTap() {
  const grid = $('onetapGrid');
  if (!grid) return;

  const toiletMode = state.pet.data?.toiletMode || 'pad';
  let items;

  if (toiletMode === TOILET_MODES.OUTDOOR) {
    items = [
      { type: 'pee_success', icon: '💛', label: 'На вулиці ✓', cls: 'success' },
      { type: 'pee_miss', icon: '💛', label: 'Вдома', cls: 'danger' },
      { type: 'poo_success', icon: '💩', label: 'На вулиці ✓', cls: 'success' },
      { type: 'poo_miss', icon: '💩', label: 'Вдома', cls: 'danger' },
      { type: 'walk', icon: '🚶', label: 'Прогулянка', cls: '' },
      { type: 'training', icon: '🎓', label: 'Тренування', cls: '' },
    ];
  } else if (toiletMode === TOILET_MODES.TRANSITION) {
    items = [
      { type: 'pee_success', icon: '💛', label: 'На вулиці ✓', cls: 'success' },
      { type: 'pee_miss', icon: '💛', label: 'На пелюшці', cls: '' },
      { type: 'poo_success', icon: '💩', label: 'На вулиці ✓', cls: 'success' },
      { type: 'poo_miss', icon: '💩', label: 'Мимо', cls: 'danger' },
      { type: 'walk', icon: '🚶', label: 'Прогулянка', cls: '' },
      { type: 'training', icon: '🎓', label: 'Тренування', cls: '' },
    ];
  } else {
    items = [
      { type: 'pee_success', icon: '💛', label: 'На пелюшці ✓', cls: 'success' },
      { type: 'pee_miss', icon: '💛', label: 'Мимо', cls: 'danger' },
      { type: 'poo_success', icon: '💩', label: 'На пелюшці ✓', cls: 'success' },
      { type: 'poo_miss', icon: '💩', label: 'Мимо', cls: 'danger' },
      { type: 'training', icon: '🎓', label: 'Тренування', cls: '' },
      { type: 'walk', icon: '🚶', label: 'Прогулянка', cls: '' },
    ];
  }

  grid.innerHTML = items.map(i =>
    `<button type="button" class="onetap-btn ${i.cls}" data-onetap="${i.type}">
      <span class="onetap-icon">${i.icon}</span>${i.label}
    </button>`
  ).join('');

  // Bind clicks (event delegation would be better, but keeping simple)
  grid.querySelectorAll('[data-onetap]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.classList.contains('logged')) return;
      btn.classList.add('logged');
      haptic();

      try {
        const eventId = await addEvent({ eventType: btn.dataset.onetap });
        toast(`${items.find(i => i.type === btn.dataset.onetap)?.icon || '✓'} Записано`, 'success', () => {
          deleteEvent(eventId);
        });
      } catch (e) {
        toast('Помилка', 'error');
      }

      setTimeout(() => btn.classList.remove('logged'), 2500);
    });
  });
}

// ===== TIMER =====

function renderTimer() {
  const display = $('timerDisplay');
  const ring = $('timerRingProgress');
  const card = $('timerCard');
  const startBtn = $('timerStartBtn');

  if (display) {
    display.textContent = formatTimer(state.timer.seconds);
  }

  if (ring && state.timer.total > 0) {
    const progress = getTimerProgress();
    ring.style.strokeDashoffset = String(408.4 * (1 - progress));
    ring.classList.remove('warning', 'danger');
    if (progress < 0.15) ring.classList.add('danger');
    else if (progress < 0.35) ring.classList.add('warning');
  }

  if (card) card.classList.toggle('active', state.timer.running);
  if (startBtn) startBtn.textContent = state.timer.running ? '⏸ Пауза' : '▶ Старт';

  // Timer label based on toilet mode
  const timerLabel = card?.querySelector('.timer-label');
  if (timerLabel) {
    const toiletMode = state.pet.data?.toiletMode || 'pad';
    const labels = {
      [TOILET_MODES.OUTDOOR]: '⏱️ Таймер до прогулянки',
      [TOILET_MODES.TRANSITION]: '⏱️ Таймер — час на вулицю!',
      [TOILET_MODES.PAD]: '⏱️ Таймер горшика',
    };
    timerLabel.textContent = labels[toiletMode] || labels[TOILET_MODES.PAD];
  }
}

// ===== DAILY PLAN (checklist by age) =====

function renderDailyPlan() {
  const list = $('dailyItems');
  const badge = $('dailyProgressBadge');
  if (!list || !badge) return;

  const weeks = getAgeInWeeks(state.pet.data?.birthDate);
  const program = getAgeProgramByWeeks(weeks);
  const plan = program?.plan || [];
  const key = todayKey();
  const daily = state.gamification.daily;
  const done = daily[key] || {};

  badge.textContent = `${Object.values(done).filter(Boolean).length}/${plan.length}`;

  list.innerHTML = plan.map((item, i) =>
    `<label class="daily-item ${done[i] ? 'done' : ''}">
      <input type="checkbox" data-daily="${i}" ${done[i] ? 'checked' : ''}>
      <span>${item}</span>
    </label>`
  ).join('');

  list.querySelectorAll('[data-daily]').forEach(cb => {
    cb.addEventListener('change', () => {
      const k = todayKey();
      if (!state.gamification.daily[k]) state.gamification.daily[k] = {};
      state.gamification.daily[k][cb.dataset.daily] = cb.checked;
      haptic();
      renderDailyPlan();
    });
  });
}

// ===== HEATMAP =====

function renderHeatmap() {
  const grid = $('heatmapGrid');
  if (!grid) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let cells = '';

  for (let i = MAX_HEATMAP_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);

    const count = state.events.items.filter(e => {
      const ts = tsToDate(e.createdAt);
      return ts && ts >= d && ts < next;
    }).length;

    const level = count === 0 ? '' : count <= 2 ? 'level-1' : count <= 4 ? 'level-2' : count <= 7 ? 'level-3' : 'level-4';
    cells += `<div class="heatmap-cell ${level}${i === 0 ? ' today' : ''}" title="${count}"></div>`;
  }
  grid.innerHTML = cells;
}

// ===== ACHIEVEMENTS =====

function renderAchievements() {
  const grid = $('achievementsGrid');
  if (!grid) return;

  const achievements = state.gamification.achievements;
  const track = $('achievementsTrack');
  if (track) {
    track.innerHTML = ACHIEVEMENT_DEFS.map(a => {
      const unlocked = !!achievements[a.id];
      return `<div class="achievement ${unlocked ? 'unlocked' : 'locked'}">
        <span class="achievement-icon">${a.icon}</span>
        <span class="achievement-label">${a.label}</span>
      </div>`;
    }).join('');
  }
}

// ===== AI PLAN (moved to AI tab) =====

/** @type {number|null} */
let aiPlanReqId = null;

/**
 * Debounced wrapper: only fetch if 5s passed since last call
 */
async function renderAIPlan() {
  const card = $('aiPlanCard');
  const content = $('aiPlanContent');
  if (!card || !content) return;

  const pet = state.pet.data;
  if (!pet?.name) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');

  try {
    const lines = await generateDailyPlan();
    if (lines.length > 0) {
      content.innerHTML = lines.map(l => `<div class="ai-plan-item">${escapeHtml(l)}</div>`).join('');
    } else {
      content.innerHTML = '<p class="text-muted">Натисніть 🔄</p>';
    }
  } catch {
    content.innerHTML = '<p class="text-muted">Натисніть 🔄</p>';
  }
}

// ===== WEEKLY REPORT =====

function renderWeeklyReport() {
  const card = $('weeklyReport');
  const content = $('weeklyContent');
  if (!card || !content) return;

  const events = state.events.items;
  if (events.length < 5 || localStorage.getItem('dc_weekly_dismissed') === todayKey()) {
    card.classList.add('hidden');
    return;
  }

  const now = new Date();
  const twStart = new Date(now);
  twStart.setDate(now.getDate() - 7);
  twStart.setHours(0, 0, 0, 0);
  const lwStart = new Date(twStart);
  lwStart.setDate(lwStart.getDate() - 7);

  const tw = events.filter(e => { const ts = tsToDate(e.createdAt); return ts && ts >= twStart; });
  const lw = events.filter(e => { const ts = tsToDate(e.createdAt); return ts && ts >= lwStart && ts < twStart; });

  if (tw.length < 3) { card.classList.add('hidden'); return; }

  const twStats = calcToiletStats(tw);
  const lwStats = calcToiletStats(lw);
  const twTr = tw.filter(e => e.eventType === 'training').length;
  const lwTr = lw.filter(e => e.eventType === 'training').length;

  const change = (curr, prev) => {
    if (prev == null || curr == null) return '';
    const d = curr - prev;
    if (d > 0) return `<span class="ws-change up">+${d}↑</span>`;
    if (d < 0) return `<span class="ws-change down">${d}↓</span>`;
    return '';
  };

  card.classList.remove('hidden');
  content.innerHTML = `
    <div class="weekly-stat"><span class="ws-label">📊 Подій</span><span class="ws-value">${tw.length}${change(tw.length, lw.length)}</span></div>
    ${twStats.rate !== null ? `<div class="weekly-stat"><span class="ws-label">🚽 Горшик</span><span class="ws-value">${twStats.rate}%${change(twStats.rate, lwStats.rate)}</span></div>` : ''}
    <div class="weekly-stat"><span class="ws-label">🎓 Тренувань</span><span class="ws-value">${twTr}${change(twTr, lwTr)}</span></div>
    <div class="weekly-stat"><span class="ws-label">🔥 Streak</span><span class="ws-value">${state.gamification.streak.count} дн.</span></div>
  `;
}

// ===== BREED CARD =====

async function renderBreedCard() {
  const container = $('breedCard');
  if (!container) return;

  const pet = state.pet.data;
  const profile = getBreedProfile(pet?.breed);

  if (!profile) { container.style.display = 'none'; return; }
  container.style.display = '';

  const energyLabel = { low: '🟢 Низька', mid: '🟡 Середня', high: '🟠 Висока', very_high: '🔴 Дуже висока' };
  const trainLabel = { low: '🟠 Складна', mid: '🟡 Середня', high: '🟢 Легка', very_high: '🟢 Дуже легка' };

  container.innerHTML = `
    <h4 class="card-title">🐕 ${profile.name}</h4>
    <div class="breed-meta-grid">
      <div>⚡ ${energyLabel[profile.energy] || '?'}</div>
      <div>🎓 ${trainLabel[profile.trainability] || '?'}</div>
      <div>⚖️ ${profile.adultWeight || '?'}</div>
      <div>🏃 ${profile.activity || '?'}</div>
    </div>
    ${profile.traits?.length ? `<div class="breed-traits"><strong>Характер:</strong> ${profile.traits.join(', ')}</div>` : ''}
    ${profile.issues?.length ? `<div class="breed-issues"><strong>⚠️ Проблеми:</strong> ${profile.issues.join(', ')}</div>` : ''}
    ${profile.tips ? `<div class="breed-tip">💡 ${profile.tips}</div>` : ''}
  `;
}

// ===== PROBLEM PROTOCOLS =====

async function renderProblemCards() {
  const container = $('problemCards');
  if (!container) return;

  const issues = (state.pet.data?.issues || '').toLowerCase();
  if (!issues.trim()) { container.style.display = 'none'; return; }

  try {
    const protocols = await getProtocols();
    const active = protocols.filter(p => {
      const keywords = p.keywords || [];
      return keywords.some(kw => issues.includes(kw));
    });

    if (!active.length) { container.style.display = 'none'; return; }
    container.style.display = '';

    container.innerHTML = `<h4 class="card-title">🆘 Ваші проблеми → План</h4>` +
      active.map(p => `
        <details>
          <summary>${p.icon} ${p.name} <span class="text-muted">(${p.duration})</span></summary>
          <div class="detail-content">
            <ol class="protocol-steps">${p.steps.map(s => `<li>${s}</li>`).join('')}</ol>
            ${p.dailyTasks ? `<div class="protocol-daily"><strong>Щоденно:</strong>${p.dailyTasks.map(t => `<div>• ${t}</div>`).join('')}</div>` : ''}
          </div>
        </details>
      `).join('');
  } catch {
    container.style.display = 'none';
  }
}

// ===== RECOMMENDED COURSES =====

async function renderRecommendedCourses() {
  const container = $('recommendedCourses');
  if (!container) return;

  const pet = state.pet.data;
  if (!pet) { container.style.display = 'none'; return; }

  const weeks = getAgeInWeeks(pet.birthDate);
  const issues = (pet.issues || '').toLowerCase();
  const toiletMode = pet.toiletMode || 'pad';
  const rec = new Set();

  // By toilet mode
  if (toiletMode === 'pad') rec.add('pee-pad');
  else if (toiletMode === 'transition') rec.add('outdoor-switch');

  // By age
  if (weeks != null && weeks < 12) { rec.add('first-days'); rec.add('name-focus'); rec.add('hand-feeding'); }
  else if (weeks != null && weeks < 24) { rec.add('sit-command'); rec.add('leash-walking'); rec.add('recall'); }
  else if (weeks != null && weeks < 72) { rec.add('recall'); rec.add('alone-training'); rec.add('nose-games'); }
  else { rec.add('nose-games'); rec.add('settle-down'); }

  // By issues
  if (issues.includes('кусає')) rec.add('bite-control');
  if (issues.includes('тягне') || issues.includes('повідок')) rec.add('leash-walking');
  if (issues.includes('один') || issues.includes('розлук')) rec.add('alone-training');
  if (issues.includes('гавкає')) rec.add('settle-down');

  const unique = [...rec].slice(0, 6);
  if (!unique.length) { container.style.display = 'none'; return; }

  try {
    const { getCourses } = await import('../content-loader.js');
    const courses = await getCourses();
    container.style.display = '';
    container.innerHTML = `<h4 class="card-title">🎯 Рекомендовані для вас</h4>
      <div class="course-grid">${unique.map(id => {
        const c = courses.find(x => x.id === id);
        if (!c) return '';
        return `<button type="button" class="course-btn" data-rec-course="${c.id}">
          <span class="c-badge">${c.badge}</span><strong>${c.title}</strong>
          <div class="c-meta">${c.description}</div>
        </button>`;
      }).join('')}</div>`;
  } catch {
    container.style.display = 'none';
  }
}

// ===== FOOD GUIDE =====

function renderFoodGuide() {
  const container = $('foodGuideCard');
  if (!container) return;

  const pet = state.pet.data;
  const weight = parseFloat(pet?.weight) || 0;
  if (!weight) { container.style.display = 'none'; return; }

  const weeks = getAgeInWeeks(pet?.birthDate);
  const isPuppy = weeks != null && weeks < 52;

  // Simplified food guide inline (no need for separate JSON)
  const tables = {
    puppy: [
      { min: 0, max: 3, daily: '50–90 г', meals: 4, note: 'Мініатюрні: слідкуйте за гіпоглікемією!' },
      { min: 3, max: 5, daily: '80–130 г', meals: 4, note: 'Корм для цуценят малих порід.' },
      { min: 5, max: 10, daily: '120–200 г', meals: 3, note: 'Середні цуценята ростуть швидко!' },
      { min: 10, max: 20, daily: '200–350 г', meals: 3, note: 'Контролюйте швидкість росту.' },
      { min: 20, max: 999, daily: '350–500 г', meals: 3, note: 'Великі породи: повільний ріст = здорові суглоби.' },
    ],
    adult: [
      { min: 0, max: 5, daily: '40–100 г', meals: 2, note: 'Мініатюрні: схильні до ожиріння!' },
      { min: 5, max: 10, daily: '80–160 г', meals: 2, note: 'Маленькі: високий метаболізм.' },
      { min: 10, max: 25, daily: '160–320 г', meals: 2, note: 'Середні: золота середина.' },
      { min: 25, max: 40, daily: '300–450 г', meals: 2, note: 'Великі: слідкуйте за вагою!' },
      { min: 40, max: 999, daily: '400–600 г', meals: 2, note: 'Гігантські: менше калорій на кг ваги.' },
    ],
  };

  const table = isPuppy ? tables.puppy : tables.adult;
  const match = table.find(r => weight >= r.min && weight < r.max) || table[table.length - 1];

  container.style.display = '';
  container.innerHTML = `<h4 class="card-title">🍖 Рекомендації по їжі</h4>
    <div class="food-guide-grid">
      <div class="food-stat"><div class="food-stat-label">Норма/день</div><strong>${match.daily}</strong></div>
      <div class="food-stat"><div class="food-stat-label">Прийомів</div><strong>${match.meals} рази</strong></div>
    </div>
    <p class="text-muted" style="margin-top:0.5rem">💡 ${match.note}</p>`;
}

// ===== AGE FOCUS =====

function renderAgeFocus() {
  const box = $('periodFocus');
  if (!box) return;

  const weeks = getAgeInWeeks(state.pet.data?.birthDate);
  const program = getAgeProgramByWeeks(weeks);

  box.innerHTML = `
    <div class="plan-item">
      <strong>🎯 Пріоритети</strong>
      ${program.priorities.map(x => `<br>• ${x}`).join('')}
    </div>
    <div class="plan-item"><strong>💡</strong> ${program.tip}</div>
  `;
}

// ===== HEAT / REPRODUCTIVE =====

function renderHeatInfo() {
  const card = $('heatCard');
  if (!card) return;

  const pet = state.pet.data;
  if (!pet?.sex || pet.sex === 'хлопчик') {
    card.style.display = pet?.sex === 'хлопчик' ? '' : 'none';
    if (pet?.sex === 'хлопчик') {
      const info = $('heatInfo');
      if (info) info.innerHTML = '<div class="plan-item"><strong>✂️ Кастрація:</strong> рекомендовано від 6 міс</div>';
    }
    return;
  }

  card.style.display = '';
  const info = $('heatInfo');
  if (!info) return;

  let html = '';
  if (pet.lastHeat) {
    const nextDate = new Date(new Date(pet.lastHeat).getTime() + 180 * MS_PER_DAY);
    const daysUntil = daysBetween(new Date(), nextDate);
    if (daysUntil > 30) html += `<div class="plan-item">📅 Наступна ~${nextDate.toLocaleDateString('uk')}</div>`;
    else if (daysUntil > 0) html += `<div class="plan-item" style="color:var(--warning)">⚠️ Тічка через ~${daysUntil} днів!</div>`;
    else html += `<div class="plan-item" style="color:var(--danger)">🩸 Можливо зараз!</div>`;
  }
  html += '<div class="plan-item"><strong>✂️ Стерилізація:</strong> залежить від породи/розміру</div>';
  info.innerHTML = html;
}

// ===== REMINDERS =====

function renderReminders() {
  const card = $('remindersCard');
  const list = $('remindersList');
  if (!card || !list) return;

  const reminders = state.pet.data?.reminders || [];
  if (!reminders.length) { card.style.display = 'none'; return; }
  card.style.display = '';

  const now = new Date();
  list.innerHTML = reminders.map(r => {
    const d = new Date(r.nextDate);
    const days = daysBetween(now, d);
    const cls = days < 0 ? 'danger' : days <= 3 ? 'warning' : '';
    const txt = days < 0 ? `⚠️ Прострочено ${Math.abs(days)} дн.`
      : days === 0 ? '⏰ Сьогодні!'
      : days <= 3 ? `⏰ Через ${days} дн.`
      : d.toLocaleDateString('uk');
    return `<div class="feed-item"><div><strong>${escapeHtml(r.label)}</strong><div class="meta ${cls}">${txt}</div></div></div>`;
  }).join('');
}

// ===== AGE PROGRAM HELPER =====

const AGE_PROGRAMS = [
  { minWeeks: 0, maxWeeks: 8, stage: 'Адаптація', priorities: ['Спокій і передбачуваність 🏠', 'Ніжні дотики 🤲', 'Режим дня 🔄'], plan: ['Прокинулось — одразу на пелюшку', 'Погладити лапи/вуха', 'Не ховати від побутових звуків'], tip: 'Ніяких тренувань! Тільки безпека і рутина 🐣' },
  { minWeeks: 8, maxWeeks: 16, stage: 'Соціалізація', priorities: ['1–2 нові речі щодня 🌍', 'Реакція на ім\'я 👀', 'Туалет після сну/їжі/гри 🚽'], plan: ['Пелюшка → їжа → гра → відпочинок', 'Одне нове знайомство', '5–8 разів позвати по імені'], tip: 'Мозок дуже пластичний до 16 тижнів! 🧠' },
  { minWeeks: 16, maxWeeks: 24, stage: 'Звички', priorities: ['Чіткий розклад 📋', 'Прості команди 🎯', 'Вчимо чекати ⏸️'], plan: ['Мікро-тренування 2–3 хв', 'Записувати час туалету', 'Шлея + повідок з ласощами'], tip: 'Одна навичка щодня > п\'ять за раз! 🎓' },
  { minWeeks: 24, maxWeeks: 72, stage: 'Підліток', priorities: ['Не панікувати 🎢', 'Крок назад + підкріплення', 'Режим > нові вимоги 📅'], plan: ['Повторювати відоме в нових місцях', 'Нюхові ігри 10–15 хв 👃', 'Чекати 3 сек перед мискою'], tip: 'Підлітковий бунт — нормально. Тримайте рутину! 💪' },
  { minWeeks: 72, maxWeeks: Infinity, stage: 'Дорослий', priorities: ['Мозок потребує роботи 🧠', 'Слідкувати за стресом', 'Оновлювати правила'], plan: ['Нюхова гра 10 хв', 'Перевіряти апетит/енергію', 'Раз на тиждень: рефлексія'], tip: 'Дорослий теж потребує завдань! 🐕' },
];

function getAgeProgramByWeeks(weeks) {
  if (weeks == null) return AGE_PROGRAMS[1];
  return AGE_PROGRAMS.find(p => weeks >= p.minWeeks && weeks < p.maxWeeks) || AGE_PROGRAMS[AGE_PROGRAMS.length - 1];
}

export { getAgeProgramByWeeks };

/**
 * @fileoverview Achievement system with definitions, checking, confetti
 */

import { state, persistGamification, STORAGE_KEYS } from './state.js';
import { isToiletSuccess, isToiletMiss, todayKey, localDateKey, startOfToday, tsToDate } from './utils.js';
import { STREAK_LEVELS, ACHIEVEMENT_IDS, MS_PER_DAY } from './constants.js';

// ===== ACHIEVEMENT DEFINITIONS =====

/** @type {Array<{id: string, icon: string, label: string, condition: Function}>} */
export const ACHIEVEMENT_DEFS = [
  { id: ACHIEVEMENT_IDS.FIRST_EVENT, icon: '🎉', label: 'Перший запис', condition: () => state.events.items.length >= 1 },
  { id: ACHIEVEMENT_IDS.STREAK_3, icon: '🔥', label: '3 дні поспіль', condition: () => state.gamification.streak.count >= STREAK_LEVELS.GOOD },
  { id: ACHIEVEMENT_IDS.STREAK_7, icon: '💪', label: 'Тиждень!', condition: () => state.gamification.streak.count >= STREAK_LEVELS.GREAT },
  { id: ACHIEVEMENT_IDS.STREAK_30, icon: '🏆', label: 'Місяць!', condition: () => state.gamification.streak.count >= STREAK_LEVELS.LEGENDARY },
  { id: ACHIEVEMENT_IDS.EVENTS_10, icon: '📝', label: '10 подій', condition: () => state.events.items.length >= 10 },
  { id: ACHIEVEMENT_IDS.EVENTS_50, icon: '📊', label: '50 подій', condition: () => state.events.items.length >= 50 },
  { id: ACHIEVEMENT_IDS.EVENTS_100, icon: '⭐', label: '100 подій', condition: () => state.events.items.length >= 100 },
  {
    id: ACHIEVEMENT_IDS.TOILET_90, icon: '🚽', label: '90% горшик',
    condition: () => {
      const items = state.events.items;
      const s = items.filter(e => isToiletSuccess(e.eventType)).length;
      const m = items.filter(e => isToiletMiss(e.eventType)).length;
      const t = s + m;
      return t >= 10 && (s / t) >= 0.9;
    }
  },
  {
    id: ACHIEVEMENT_IDS.TRAINING_10, icon: '🎓', label: '10 тренувань',
    condition: () => state.events.items.filter(e => e.eventType === 'training').length >= 10
  },
  {
    id: ACHIEVEMENT_IDS.CLICKER_PRO, icon: '🔵', label: 'Клікер-про',
    condition: () => parseInt(localStorage.getItem(STORAGE_KEYS.clickerCount) || '0') >= 50
  },
  {
    id: ACHIEVEMENT_IDS.SOCIAL_5, icon: '🌍', label: '5 соціалізацій',
    condition: () => {
      const done = JSON.parse(localStorage.getItem(STORAGE_KEYS.social) || '{}');
      return Object.values(done).filter(Boolean).length >= 5;
    }
  },
  {
    id: ACHIEVEMENT_IDS.AI_USER, icon: '🤖', label: 'AI друг',
    condition: () => parseInt(localStorage.getItem(STORAGE_KEYS.aiCount) || '0') >= 5
  },
];

// ===== STREAK =====

/**
 * Update streak based on current events
 */
export function updateStreak() {
  const today = todayKey();
  const yesterday = localDateKey(new Date(Date.now() - MS_PER_DAY));
  const streak = state.gamification.streak;

  const todayHasEvents = state.events.items.some(e => {
    const ts = tsToDate(e.createdAt);
    return ts && ts >= startOfToday();
  });

  if (todayHasEvents) {
    if (streak.lastDate === today) return; // Already counted
    if (streak.lastDate === yesterday) {
      streak.count += 1;
    } else {
      streak.count = 1;
    }
    streak.lastDate = today;
  } else if (streak.lastDate !== today && streak.lastDate !== yesterday) {
    streak.count = 0;
  }

  persistGamification();
}

// ===== ACHIEVEMENT CHECK =====

/**
 * Check all achievements, return newly unlocked ones
 * @returns {Array<{id: string, icon: string, label: string}>}
 */
export function checkAchievements() {
  const achievements = state.gamification.achievements;
  const newlyUnlocked = [];

  for (const def of ACHIEVEMENT_DEFS) {
    if (!achievements[def.id] && def.condition()) {
      achievements[def.id] = Date.now();
      newlyUnlocked.push(def);
    }
  }

  if (newlyUnlocked.length > 0) {
    persistGamification();
  }

  return newlyUnlocked;
}

// ===== CONFETTI =====

/**
 * Show confetti animation
 */
export function showConfetti() {
  const container = document.createElement('div');
  container.className = 'confetti-container';
  document.body.appendChild(container);

  const colors = ['#0ea5e9', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#ec4899'];

  for (let i = 0; i < 40; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = `${Math.random() * 0.5}s`;
    piece.style.animationDuration = `${1.5 + Math.random()}s`;
    container.appendChild(piece);
  }

  setTimeout(() => container.remove(), 3000);
}

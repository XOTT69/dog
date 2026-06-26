/**
 * @fileoverview Pure utility functions — no side effects, no state dependency
 */

import { MS_PER_DAY, MS_PER_WEEK, TOILET_SUCCESS_TYPES, TOILET_MISS_TYPES } from './constants.js';

// ===== DOM =====
/** @param {string} id @returns {HTMLElement|null} */
export const $ = (id) => document.getElementById(id);

/** @param {string} sel @returns {HTMLElement[]} */
export const $$ = (sel) => [...document.querySelectorAll(sel)];

/** @param {HTMLElement|null} el */
export const show = (el) => el?.classList.remove('hidden');

/** @param {HTMLElement|null} el */
export const hide = (el) => el?.classList.add('hidden');

// ===== TIME =====
/** @returns {string} HH:MM */
export function nowTime() {
  return new Date().toTimeString().slice(0, 5);
}

/** @param {Date} [date] @returns {string} YYYY-MM-DD */
export function localDateKey(date) {
  const d = date || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** @returns {string} */
export function todayKey() {
  return localDateKey(new Date());
}

/** @returns {Date} */
export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** @param {Date} d1 @param {Date} d2 @returns {number} */
export function daysBetween(d1, d2) {
  return Math.floor((d2 - d1) / MS_PER_DAY);
}

// ===== PET =====
/**
 * @param {string|null} birthDate - ISO date string
 * @returns {number|null} weeks since birth
 */
export function getAgeInWeeks(birthDate) {
  if (!birthDate) return null;
  const diff = Date.now() - new Date(birthDate).getTime();
  return isNaN(diff) || diff < 0 ? null : Math.floor(diff / MS_PER_WEEK);
}

/**
 * @param {number|null} weeks
 * @returns {string}
 */
export function weekLabel(weeks) {
  if (weeks == null) return '—';
  if (weeks < 8) return `${weeks} тиж.`;
  if (weeks < 52) return `${Math.floor(weeks / 4.345)} міс.`;
  const y = weeks / 52;
  return y < 2 ? `${y.toFixed(1)} р.` : `${Math.floor(y)} р.`;
}

// ===== TOILET =====
/** @param {string} type @returns {boolean} */
export function isToiletSuccess(type) {
  return TOILET_SUCCESS_TYPES.includes(type);
}

/** @param {string} type @returns {boolean} */
export function isToiletMiss(type) {
  return TOILET_MISS_TYPES.includes(type);
}

/**
 * Calculate toilet success rate for events array
 * @param {Array} events
 * @returns {{ success: number, miss: number, total: number, rate: number|null }}
 */
export function calcToiletStats(events) {
  const success = events.filter(e => isToiletSuccess(e.eventType)).length;
  const miss = events.filter(e => isToiletMiss(e.eventType)).length;
  const total = success + miss;
  const rate = total > 0 ? Math.round((success / total) * 100) : null;
  return { success, miss, total, rate };
}

// ===== FIRESTORE =====
/**
 * Convert Firestore timestamp or ISO string to Date
 * @param {*} ts
 * @returns {Date|null}
 */
export function tsToDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}

// ===== STRING =====
/**
 * @param {string} name
 * @returns {string}
 */
export function avatarLetter(name) {
  return ((name || '').trim()[0] || 'П').toUpperCase();
}

/**
 * Escape HTML special chars to prevent XSS
 * @param {*} value
 * @returns {string}
 */
export function escapeHtml(value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, (ch) => map[ch]);
}

// ===== HAPTIC =====
export function haptic() {
  if (navigator.vibrate) navigator.vibrate(10);
}

// ===== DEBOUNCE =====
/**
 * @param {Function} fn
 * @param {number} ms
 * @returns {Function}
 */
export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/**
 * @param {Function} fn
 * @param {number} ms
 * @returns {Function}
 */
export function throttle(fn, ms) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    }
  };
}

/**
 * @fileoverview Vaccination schedule & health reminders
 * Generates automatic vaccination plan based on dog's age
 */

import { state, STORAGE_KEYS } from './state.js';
import { getAgeInWeeks, weekLabel, todayKey, daysBetween } from './utils.js';
import { MS_PER_DAY, DEWORMING_INTERVAL_DAYS, VACCINE_INTERVAL_DAYS } from './constants.js';

/**
 * Vaccine schedule definitions
 * Each entry: { weekOffset, name, description, done }
 */
const VACCINE_SCHEDULE = [
  { weekOffset: 8, name: 'DHPP — 1-ша доза', desc: 'Чума, гепатит, парвовірус, параґрип', type: 'vaccine' },
  { weekOffset: 12, name: 'DHPP — 2-га доза', desc: 'Ревакцинація', type: 'vaccine' },
  { weekOffset: 16, name: 'DHPP — 3-тя доза + Сказ', desc: 'Повна вакцинація + сказ', type: 'vaccine' },
  { weekOffset: 52, name: 'Ревакцинація (1 рік)', desc: 'Щорічна ревакцинація всіх', type: 'vaccine' },
  { weekOffset: 104, name: 'Ревакцинація (2 роки)', desc: 'Щорічна ревакцинація', type: 'vaccine' },
  { weekOffset: 156, name: 'Ревакцинація (3 роки)', desc: 'Щорічна ревакцинація', type: 'vaccine' },
];

/**
 * Deworming schedule (every 3 months after 6 months age)
 */
const DEWORMING_SCHEDULE = [
  { weekOffset: 26, name: 'Дегельмінтизація', desc: 'Перша після 6 міс', type: 'deworming' },
  { weekOffset: 39, name: 'Дегельмінтизація', desc: 'Кожні 3 місяці', type: 'deworming' },
  { weekOffset: 52, name: 'Дегельмінтизація', desc: 'Кожні 3 місяці', type: 'deworming' },
  { weekOffset: 65, name: 'Дегельмінтизація', desc: 'Кожні 3 місяці', type: 'deworming' },
  { weekOffset: 78, name: 'Дегельмінтизація', desc: 'Кожні 3 місяці', type: 'deworming' },
  { weekOffset: 91, name: 'Дегельмінтизація', desc: 'Кожні 3 місяці', type: 'deworming' },
  { weekOffset: 104, name: 'Дегельмінтизація', desc: 'Кожні 3 місяці', type: 'deworming' },
];

/**
 * Health check schedule
 */
const HEALTH_CHECKS = [
  { weekOffset: 8, name: 'Перший огляд ветеринара', desc: 'Повний огляд + вакцинація', type: 'vet' },
  { weekOffset: 16, name: 'Огляд після вакцинації', desc: 'Перевірка + чипування', type: 'vet' },
  { weekOffset: 26, name: 'Піврічний огляд', desc: 'Загальний стан', type: 'vet' },
  { weekOffset: 52, name: 'Річний огляд', desc: 'Повний огляд + вакцинація', type: 'vet' },
];

/**
 * Generate full health schedule for the dog
 * @returns {Array<{date: Date, name: string, desc: string, type: string, status: string}>}
 */
export function generateHealthSchedule() {
  const pet = state.pet.data;
  if (!pet?.birthDate) return [];

  const birthDate = new Date(pet.birthDate);
  const now = new Date();
  const schedule = [];

  // Combine all schedules
  const allItems = [...VACCINE_SCHEDULE, ...DEWORMING_SCHEDULE, ...HEALTH_CHECKS];

  for (const item of allItems) {
    const date = new Date(birthDate.getTime() + item.weekOffset * 7 * MS_PER_DAY);
    const daysUntil = daysBetween(now, date);

    let status = 'upcoming';
    if (daysUntil < -7) status = 'past';
    else if (daysUntil < 0) status = 'overdue';
    else if (daysUntil <= 7) status = 'soon';
    else if (daysUntil <= 30) status = 'thisMonth';

    schedule.push({
      date,
      name: item.name,
      desc: item.desc,
      type: item.type,
      status,
      daysUntil,
    });
  }

  return schedule.sort((a, b) => a.date - b.date);
}

/**
 * Get vaccine history from pet data
 * @returns {Array<{date: string, type: string, name: string}>}
 */
export function getVaccineHistory() {
  const pet = state.pet.data;
  if (!pet?.vaccineHistory) return [];
  return pet.vaccineHistory.sort((a, b) => new Date(b.date) - new Date(a.date));
}

/**
 * Add vaccine to history
 * @param {Object} entry - {date: string, type: string, name: string}
 */
export async function addVaccineEntry(entry) {
  const pet = state.pet.data;
  if (!pet) return;

  const history = pet.vaccineHistory || [];
  history.push({
    date: entry.date,
    type: entry.type || 'vaccine',
    name: entry.name,
  });

  await savePetProfile({ vaccineHistory: history });
}

/**
 * Calculate next vaccine date based on history
 * @param {string} type - 'vaccine' | 'deworming' | 'vet'
 * @returns {Date|null}
 */
export function getNextScheduledDate(type) {
  const pet = state.pet.data;
  if (!pet?.birthDate) return null;

  const birthDate = new Date(pet.birthDate);
  const schedules = {
    vaccine: VACCINE_SCHEDULE,
    deworming: DEWORMING_SCHEDULE,
    vet: HEALTH_CHECKS,
  };

  const items = schedules[type] || [];
  const now = new Date();

  // Find next upcoming item
  for (const item of items) {
    const date = new Date(birthDate.getTime() + item.weekOffset * 7 * MS_PER_DAY);
    if (date >= now) return date;
  }

  return null;
}

/**
 * Get next upcoming health events
 * @param {number} limit
 * @returns {Array}
 */
export function getNextHealthEvents(limit = 5) {
  const schedule = generateHealthSchedule();
  const now = new Date();
  return schedule
    .filter(e => e.date >= now || e.status === 'overdue')
    .slice(0, limit);
}

/**
 * Get overdue health events
 * @returns {Array}
 */
export function getOverdueHealthEvents() {
  const schedule = generateHealthSchedule();
  return schedule.filter(e => e.status === 'overdue');
}

/**
 * Check if deworming is needed based on last recorded event
 * @returns {boolean}
 */
export function isDewormingDue() {
  const pet = state.pet.data;
  if (!pet?.lastDeworming) return false;

  const lastDeworming = new Date(pet.lastDeworming);
  const now = new Date();
  const daysSince = daysBetween(lastDeworming, now);

  return daysSince >= DEWORMING_INTERVAL_DAYS;
}

/**
 * Check if annual vaccination is due
 * @returns {boolean}
 */
export function isVaccinationDue() {
  const pet = state.pet.data;
  if (!pet?.lastVaccine) return false;

  const lastVaccine = new Date(pet.lastVaccine);
  const now = new Date();
  const daysSince = daysBetween(lastVaccine, now);

  return daysSince >= VACCINE_INTERVAL_DAYS;
}

/**
 * Generate reminders from health schedule
 * @returns {Array<{id: string, label: string, nextDate: string, type: string}>}
 */
export function generateHealthReminders() {
  const schedule = generateHealthSchedule();
  const now = new Date();

  return schedule
    .filter(e => e.status !== 'past')
    .map(e => ({
      id: `health_${e.type}_${e.date.getTime()}`,
      label: e.name,
      nextDate: e.date.toISOString().slice(0, 10),
      type: e.type,
      daysUntil: e.daysUntil,
    }));
}

/**
 * Render health schedule in profile
 * @param {HTMLElement} container
 */
export function renderHealthSchedule(container) {
  if (!container) return;

  const schedule = generateHealthSchedule();
  const now = new Date();
  const upcoming = schedule.filter(e => e.date >= now).slice(0, 8);

  if (!upcoming.length) {
    container.innerHTML = '<p class="text-muted">Встановіть дату народження для графіка</p>';
    return;
  }

  container.innerHTML = upcoming.map(e => {
    const dateStr = e.date.toLocaleDateString('uk', { day: 'numeric', month: 'short', year: 'numeric' });
    const typeIcon = { vaccine: '💉', deworming: '💊', vet: '🏥' }[e.type] || '📋';
    const statusClass = { overdue: 'danger', soon: 'warning', thisMonth: 'info', upcoming: '' }[e.status] || '';
    const statusText = {
      overdue: '⚠️ Прострочено!',
      soon: '⏰ Через кілька днів',
      thisMonth: '📅 Цього місяця',
      upcoming: '',
    }[e.status] || '';

    return `
      <div class="health-schedule-item ${statusClass}">
        <div class="health-schedule-icon">${typeIcon}</div>
        <div class="health-schedule-info">
          <strong>${e.name}</strong>
          <div class="text-muted">${e.desc}</div>
        </div>
        <div class="health-schedule-date">
          <div>${dateStr}</div>
          ${statusText ? `<div class="${statusClass}">${statusText}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}
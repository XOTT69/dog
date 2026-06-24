/**
 * @fileoverview Medication tracker — log, schedule, reminders for pet medications
 * Supports: deworming, vaccines, antibiotics, vitamins, flea/tick treatment, etc.
 */

import { state } from './state.js';
import { todayKey, tsToDate, haptic, safeJsonParse } from './utils.js';
import { MS_PER_DAY } from './constants.js';
import { syncMedicationsToFirestore, loadMedicationsFromFirestore } from './firebase.js';

// ===== STORAGE =====
const STORAGE_KEY = 'dc_medications';
const LOG_KEY = 'dc_medication_log';

/**
 * Medication definition
 * @typedef {Object} Medication
 * @property {string} id - unique id
 * @property {string} name - medication name
 * @property {string} type - 'deworming'|'vaccine'|'antibiotic'|'vitamin'|'flea_tick'|'other'
 * @property {string} [dosage] - dosage info
 * @property {number} intervalDays - repeat interval in days (0 = one-time)
 * @property {string} [notes]
 * @property {string} createdAt - ISO date string
 */

/**
 * Medication log entry
 * @typedef {Object} MedLogEntry
 * @property {string} id
 * @property {string} medicationId
 * @property {string} date - ISO date string
 * @property {string} time - time string
 * @property {string} [note]
 * @property {number} timestamp
 */

/**
 * Load medications from localStorage
 * @returns {Medication[]}
 */
function loadMedications() {
  return safeJsonParse(localStorage.getItem(STORAGE_KEY), []);
}

/**
 * Save medications to localStorage
 * @param {Medication[]} meds
 */
function saveMedications(meds) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(meds));
}

/**
 * Load medication log entries
 * @returns {MedLogEntry[]}
 */
function loadLog() {
  return safeJsonParse(localStorage.getItem(LOG_KEY), []);
}

/**
 * Save medication log entries
 * @param {MedLogEntry[]} log
 */
function saveLog(log) {
  localStorage.setItem(LOG_KEY, JSON.stringify(log));
}

/**
 * Get all medications
 * @returns {Medication[]}
 */
export function getMedications() {
  return loadMedications();
}

/**
 * Add a new medication
 * @param {Omit<Medication, 'id'|'createdAt'>} data
 * @returns {Medication}
 */
export function addMedication(data) {
  const meds = loadMedications();
  const med = {
    ...data,
    id: 'med_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    createdAt: new Date().toISOString(),
  };
  meds.push(med);
  saveMedications(meds);
  haptic();
  return med;
}

/**
 * Update an existing medication
 * @param {string} id
 * @param {Partial<Medication>} data
 */
export function updateMedication(id, data) {
  const meds = loadMedications();
  const idx = meds.findIndex(m => m.id === id);
  if (idx === -1) return;
  meds[idx] = { ...meds[idx], ...data };
  saveMedications(meds);
  haptic();
}

/**
 * Delete a medication
 * @param {string} id
 */
export function deleteMedication(id) {
  let meds = loadMedications();
  meds = meds.filter(m => m.id !== id);
  saveMedications(meds);
  haptic();
}

/**
 * Log a medication dose
 * @param {string} medicationId
 * @param {string} [note]
 * @returns {MedLogEntry}
 */
export function logDose(medicationId, note = '') {
  const log = loadLog();
  const entry = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    medicationId,
    date: todayKey(),
    time: new Date().toLocaleTimeString('uk', { hour: '2-digit', minute: '2-digit' }),
    note,
    timestamp: Date.now(),
  };
  log.push(entry);
  saveLog(log);
  haptic();
  return entry;
}

/**
 * Get log entries for a specific medication
 * @param {string} medicationId
 * @param {number} [limit] - max entries to return
 * @returns {MedLogEntry[]}
 */
export function getMedicationLog(medicationId, limit = 10) {
  const log = loadLog();
  return log
    .filter(e => e.medicationId === medicationId)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

/**
 * Check if a medication is due today
 * @param {Medication} med
 * @returns {boolean}
 */
export function isMedicationDue(med) {
  if (med.intervalDays <= 0) return false;
  const log = loadLog();
  const entries = log.filter(e => e.medicationId === med.id);
  if (entries.length === 0) return true;
  
  const lastEntry = entries.sort((a, b) => b.timestamp - a.timestamp)[0];
  const lastDate = new Date(lastEntry.date);
  const now = new Date();
  const daysSince = Math.floor((now - lastDate) / MS_PER_DAY);
  
  return daysSince >= med.intervalDays;
}

/**
 * Get days since last dose for a medication
 * @param {string} medicationId
 * @returns {number|null} days since last dose, or null if never taken
 */
export function daysSinceLastDose(medicationId) {
  const log = loadLog();
  const entries = log.filter(e => e.medicationId === medicationId);
  if (entries.length === 0) return null;
  
  const lastEntry = entries.sort((a, b) => b.timestamp - a.timestamp)[0];
  const lastDate = new Date(lastEntry.date);
  const now = new Date();
  return Math.floor((now - lastDate) / MS_PER_DAY);
}

/**
 * Get medications that are due (overdue or due today)
 * @returns {Array<{med: Medication, daysSince: number|null}>}
 */
export function getDueMedications() {
  const meds = loadMedications();
  const due = [];
  
  for (const med of meds) {
    if (med.intervalDays <= 0) continue;
    const days = daysSinceLastDose(med.id);
    if (days === null || days >= med.intervalDays) {
      due.push({ med, daysSince: days });
    }
  }
  
  return due.sort((a, b) => {
    const aDays = a.daysSince ?? 999;
    const bDays = b.daysSince ?? 999;
    return bDays - aDays;
  });
}

/**
 * Get today's medication schedule
 * @returns {Array<{med: Medication, lastLog: MedLogEntry|null}>}
 */
export function getTodaySchedule() {
  const meds = loadMedications();
  const log = loadLog();
  const today = todayKey();
  
  return meds.map(med => {
    const todayEntries = log.filter(e => e.medicationId === med.id && e.date === today);
    const lastEntry = log
      .filter(e => e.medicationId === med.id)
      .sort((a, b) => b.timestamp - a.timestamp)[0] || null;
    
    return {
      med,
      takenToday: todayEntries.length > 0,
      lastLog: lastEntry,
      isDue: isMedicationDue(med),
    };
  }).sort((a, b) => {
    // Show due first, then taken
    if (a.isDue && !b.isDue) return -1;
    if (!a.isDue && b.isDue) return 1;
    return 0;
  });
}

/**
 * Get all log entries grouped by date (for history view)
 * @param {number} [days=30]
 * @returns {Object<string, MedLogEntry[]>}
 */
export function getMedicationHistory(days = 30) {
  const log = loadLog();
  const cutoff = Date.now() - days * MS_PER_DAY;
  const filtered = log.filter(e => e.timestamp >= cutoff);
  
  const grouped = {};
  for (const entry of filtered) {
    if (!grouped[entry.date]) grouped[entry.date] = [];
    grouped[entry.date].push(entry);
  }
  
  return grouped;
}

/**
 * Get medication type display info
 */
export const MEDICATION_TYPES = {
  deworming: { icon: '💊', label: 'Дегельмінтизація' },
  vaccine: { icon: '💉', label: 'Вакцинація' },
  antibiotic: { icon: '🦠', label: 'Антибіотик' },
  vitamin: { icon: '🧪', label: 'Вітаміни' },
  flea_tick: { icon: '🛡️', label: 'Від бліх/кліщів' },
  other: { icon: '💊', label: 'Інше' },
};

/**
 * Default interval suggestions
 */
export const INTERVAL_SUGGESTIONS = [
  { days: 0, label: 'Одноразово' },
  { days: 1, label: 'Щодня' },
  { days: 7, label: 'Щотижня' },
  { days: 14, label: 'Кожні 2 тижні' },
  { days: 30, label: 'Щомісяця' },
  { days: 90, label: 'Кожні 3 місяці' },
  { days: 180, label: 'Кожні 6 місяців' },
  { days: 365, label: 'Щороку' },
];
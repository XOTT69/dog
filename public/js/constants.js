/**
 * @fileoverview Named constants replacing magic numbers
 */

// ===== TIME =====
export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;
export const MS_PER_WEEK = 7 * MS_PER_DAY;
export const SECONDS_PER_DAY = 86400;

// ===== LIMITS =====
export const MAX_EVENTS_QUERY = 500;
export const MAX_FEED_DISPLAY = 60;
export const MAX_CHART_DAYS = 14;
export const MAX_HEATMAP_DAYS = 28;
export const MAX_AI_TOKENS = 600;
export const AI_TIMEOUT_MS = 25000;
export const MAX_CHAT_HISTORY = 12;

// ===== TIMER PRESETS =====
export const TIMER_PRESETS = [
  { minutes: 30, label: '30 хв' },
  { minutes: 60, label: '1 год' },
  { minutes: 90, label: '1.5 год' },
  { minutes: 120, label: '2 год' },
];

// ===== STREAK =====
export const STREAK_LEVELS = {
  GOOD: 3,
  GREAT: 7,
  LEGENDARY: 30,
};

// ===== TOILET =====
export const TOILET_SUCCESS_TYPES = ['pee_success', 'poo_success'];
export const TOILET_MISS_TYPES = ['pee_miss', 'poo_miss'];
export const TOILET_MODES = {
  PAD: 'pad',
  OUTDOOR: 'outdoor',
  TRANSITION: 'transition',
};

// ===== SIZES =====
export const PET_SIZES = {
  TINY: { key: 'tiny', maxWeight: 7, label: 'мініатюрна (до 7 кг)' },
  SMALL: { key: 'small', maxWeight: 12, label: 'маленька (7–12 кг)' },
  MEDIUM: { key: 'medium', maxWeight: 25, label: 'середня (12–25 кг)' },
  LARGE: { key: 'large', maxWeight: 40, label: 'велика (25–40 кг)' },
  GIANT: { key: 'giant', maxWeight: Infinity, label: 'гігантська (40+ кг)' },
};

// ===== DEWORMING =====
export const DEWORMING_INTERVAL_DAYS = 90;
export const VACCINE_INTERVAL_DAYS = 365;
export const HEAT_CYCLE_DAYS = 180;

// ===== CACHE =====
export const SW_CACHE_VERSION = 'dogcoach-v6';
export const AI_PLAN_CACHE_HOURS = 24;

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCY2SkRPpopi7mtsihrlqocxdgG8cBjNHI',
  authDomain: 'dogs-55f5e.firebaseapp.com',
  projectId: 'dogs-55f5e',
  storageBucket: 'dogs-55f5e.firebasestorage.app',
  messagingSenderId: '1053489833652',
  appId: '1:1053489833652:web:ddf53d87b0a4af4207d9e1',
};

// ===== VAPID KEY =====
export const VAPID_KEY = 'BFvGyG-w5R68xO2RS6gQbYSyAPQaviGnVsHedxjzXajvxg1OUdL1Xe6e4M38j0mewG-Yt3qKgbUnMHmf98PaCiA';

// ===== AI MODELS =====
export const AI_PRIMARY_MODEL = 'groq/llama-3.3-70b-versatile';

// ===== ACHIEVEMENTS =====
export const ACHIEVEMENT_IDS = {
  FIRST_EVENT: 'first_event',
  STREAK_3: 'streak_3',
  STREAK_7: 'streak_7',
  STREAK_30: 'streak_30',
  EVENTS_10: 'events_10',
  EVENTS_50: 'events_50',
  EVENTS_100: 'events_100',
  TOILET_90: 'toilet_90',
  TRAINING_10: 'training_10',
  CLICKER_PRO: 'clicker_pro',
  SOCIAL_5: 'social_5',
  AI_USER: 'ai_user',
};

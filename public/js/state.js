/**
 * @fileoverview Reactive state management via Proxy.
 * Subscribers are notified only when their watched keys change.
 * Supports nested paths and batch updates.
 */

/** @typedef {'auth'|'workspace'|'pet'|'events'|'reminders'|'routines'|'members'|'aiChat'|'ui'|'timer'|'achievements'} StateSection */

// ===== CONSTANTS =====
const STORAGE_KEYS = {
  theme: 'dc_theme',
  daily: 'dc_daily',
  streak: 'dc_streak',
  achievements: 'dc_achievements',
  courseProgress: 'dc_course_progress',
  social: 'dc_social',
  aiCount: 'dc_ai_count',
  aiPlan: 'dc_aiplan',
  weeklyPlan: 'dc_weekly_plan',
  dailyLesson: 'dc_daily_lesson',
  onboarded: 'dc_onboarded',
  weeklyDismissed: 'dc_weekly_dismissed',
  currentPetId: 'dc_current_pet_id',
};

/** @type {Map<string, Set<Function>>} */
const subscribers = new Map();

/** @type {Set<string>} */
let dirtyKeys = new Set();

/** @type {number|null} */
let batchFrame = null;

/**
 * Initial application state
 */
const initialState = {
  // Auth
  auth: {
    user: null,
    loading: true,
  },

  // Workspace
  workspace: {
    id: null,
    data: null,
  },

  // Pets (multi-pet support)
  pets: {
    items: [],
    loading: true,
  },

  // Current pet (derived from pets.items + currentPetId)
  pet: {
    data: null,
    loading: true,
  },

  // Events
  events: {
    items: [],
    loading: true,
  },

  // Calendar reminders/tasks
  reminders: {
    items: [],
    loading: true,
  },

  // Shared training routines / plans
  routines: {
    items: [],
    loading: true,
  },

  // Members
  members: {
    items: [],
  },

  // AI chat
  aiChat: {
    items: [],
    loading: true,
  },

  // UI state
  ui: {
    activeTab: 'tabHome',
    theme: _loadTheme(),
    online: navigator.onLine,
    sheetOpen: false,
    selectedSheetCategory: 'toilet',
    selectedEventType: null,
    diaryFilter: 'all',
    courseFilter: 'all',
    currentCourseId: 'pee-pad',
    academySection: 'programs',
    calendarFilter: 'all',
    contentLoaded: false,
  },

  // Timer
  timer: {
    seconds: 0,
    total: 0,
    running: false,
  },

  // Achievements & gamification
  gamification: {
    streak: _loadJSON(STORAGE_KEYS.streak, { count: 0, lastDate: '' }),
    daily: _loadJSON(STORAGE_KEYS.daily, {}),
    achievements: _loadJSON(STORAGE_KEYS.achievements, {}),
  },
};

/**
 * Deep clone for initial state
 */
function _loadTheme() {
  const saved = localStorage.getItem(STORAGE_KEYS.theme);
  if (saved) return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function _loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Create a deep reactive proxy that tracks changes
 * @param {Object} target
 * @param {string} path
 * @returns {Proxy}
 */
function createReactiveProxy(target, path = '') {
  return new Proxy(target, {
    get(obj, key) {
      const value = obj[key];
      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        return createReactiveProxy(value, path ? `${path}.${String(key)}` : String(key));
      }
      return value;
    },

    set(obj, key, value) {
      const oldValue = obj[key];
      if (oldValue === value) return true;

      obj[key] = value;
      const fullPath = path ? `${path}.${String(key)}` : String(key);

      // Mark dirty sections
      const section = fullPath.split('.')[0];
      dirtyKeys.add(section);
      dirtyKeys.add(fullPath);

      // Schedule notification
      _scheduleFlush();
      return true;
    },
  });
}

/**
 * Schedule a microtask flush for batched updates
 */
function _scheduleFlush() {
  if (batchFrame !== null) return;
  batchFrame = requestAnimationFrame(() => {
    _flush();
    batchFrame = null;
  });
}

/**
 * Notify all relevant subscribers
 */
function _flush() {
  const keys = new Set(dirtyKeys);
  dirtyKeys.clear();

  for (const [pattern, callbacks] of subscribers) {
    const shouldNotify = keys.has(pattern) ||
      [...keys].some(k => k.startsWith(pattern + '.')) ||
      [...keys].some(k => pattern.startsWith(k + '.'));

    if (shouldNotify) {
      for (const cb of callbacks) {
        try {
          cb(state);
        } catch (e) {
          console.error(`[State] Subscriber error for "${pattern}":`, e);
        }
      }
    }
  }
}

// ===== PUBLIC API =====

/** @type {Proxy} */
export const state = createReactiveProxy(structuredClone(initialState));

/**
 * Subscribe to state changes
 * @param {string|string[]} keys - State paths to watch (e.g., 'pet', 'ui.activeTab')
 * @param {Function} callback - Called with full state when watched keys change
 * @returns {Function} Unsubscribe function
 */
export function subscribe(keys, callback) {
  const keyList = Array.isArray(keys) ? keys : [keys];

  for (const key of keyList) {
    if (!subscribers.has(key)) {
      subscribers.set(key, new Set());
    }
    subscribers.get(key).add(callback);
  }

  return () => {
    for (const key of keyList) {
      subscribers.get(key)?.delete(callback);
    }
  };
}

/**
 * Batch multiple state updates into a single render cycle
 * @param {Function} fn - Function that modifies state
 */
export function batch(fn) {
  const prevFrame = batchFrame;
  if (prevFrame !== null) {
    cancelAnimationFrame(prevFrame);
    batchFrame = null;
  }

  fn();

  _scheduleFlush();
}

/**
 * Persist gamification state to localStorage
 */
export function persistGamification() {
  localStorage.setItem(STORAGE_KEYS.streak, JSON.stringify(state.gamification.streak));
  localStorage.setItem(STORAGE_KEYS.daily, JSON.stringify(state.gamification.daily));
  localStorage.setItem(STORAGE_KEYS.achievements, JSON.stringify(state.gamification.achievements));
}

/**
 * Persist theme
 */
export function persistTheme() {
  localStorage.setItem(STORAGE_KEYS.theme, state.ui.theme);
}

export { STORAGE_KEYS };

/**
 * @fileoverview Timer with state integration and localStorage persistence
 */

import { state } from './state.js';
import { playAlarm } from './audio.js';

const TIMER_STORAGE_KEY = 'dc_timer_state';

/** @type {number|null} */
let intervalId = null;

/**
 * Load timer state from localStorage
 */
export function loadTimerState() {
  try {
    const saved = localStorage.getItem(TIMER_STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      const now = Date.now();
      
      // Only restore if saved within last 24 hours
      if (now - data.timestamp < 24 * 60 * 60 * 1000) {
        // Calculate elapsed time
        const elapsed = Math.floor((now - data.timestamp) / 1000);
        const remaining = Math.max(0, data.seconds - elapsed);
        
        if (remaining > 0 && data.running) {
          state.timer.total = data.total;
          state.timer.seconds = remaining;
          state.timer.running = false; // Start paused
        } else if (remaining > 0) {
          state.timer.total = data.total;
          state.timer.seconds = remaining;
          state.timer.running = false;
        }
      }
      
      // Clear old state
      localStorage.removeItem(TIMER_STORAGE_KEY);
    }
  } catch (e) {
    console.warn('[Timer] Failed to load state:', e);
  }
}

/**
 * Save timer state to localStorage
 */
function saveTimerState() {
  try {
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify({
      total: state.timer.total,
      seconds: state.timer.seconds,
      running: state.timer.running,
      timestamp: Date.now(),
    }));
  } catch (e) {
    console.warn('[Timer] Failed to save state:', e);
  }
}

/**
 * Start timer with given duration
 * @param {number} seconds
 */
export function startTimer(seconds) {
  stopTimer();
  state.timer.total = seconds;
  state.timer.seconds = seconds;
  state.timer.running = true;
  saveTimerState();

  intervalId = setInterval(() => {
    state.timer.seconds--;
    if (state.timer.seconds <= 0) {
      stopTimer();
      onTimerComplete();
    }
    // Save timer state every 10 ticks (10 seconds) to reduce localStorage writes
    if (state.timer.seconds % 10 === 0) {
      saveTimerState();
    }
  }, 1000);
}

/**
 * Stop/pause timer
 */
export function stopTimer() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  state.timer.running = false;
  saveTimerState();
}

/**
 * Reset timer to zero
 */
export function resetTimer() {
  stopTimer();
  state.timer.seconds = 0;
  state.timer.total = 0;
  saveTimerState();
}

/**
 * Toggle timer play/pause
 */
export function toggleTimer() {
  if (state.timer.running) {
    stopTimer();
  } else if (state.timer.total > 0) {
    state.timer.running = true;
    saveTimerState();
    intervalId = setInterval(() => {
      state.timer.seconds--;
      if (state.timer.seconds <= 0) {
        stopTimer();
        onTimerComplete();
        return;
      }
      // Save timer state every 10 ticks (10 seconds) to reduce localStorage writes
      if (state.timer.seconds % 10 === 0) {
        saveTimerState();
      }
    }, 1000);
  }
}

/**
 * Handle timer completion
 */
function onTimerComplete() {
  playAlarm();
  localStorage.removeItem(TIMER_STORAGE_KEY);

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('⏰ Час горшика!', {
      body: 'Ведіть на пелюшку!',
      icon: '/assets/icon-192.png',
    });
  }
}

/**
 * Format seconds to MM:SS
 * @param {number} seconds
 * @returns {string}
 */
export function formatTimer(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Get timer progress (0-1)
 * @returns {number}
 */
export function getTimerProgress() {
  if (state.timer.total <= 0) return 0;
  return state.timer.seconds / state.timer.total;
}

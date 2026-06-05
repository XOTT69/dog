/**
 * @fileoverview Timer with state integration
 */

import { state } from './state.js';
import { playAlarm } from './audio.js';
import { $ } from './utils.js';

/** @type {number|null} */
let intervalId = null;

/**
 * Start timer with given duration
 * @param {number} seconds
 */
export function startTimer(seconds) {
  stopTimer();
  state.timer.total = seconds;
  state.timer.seconds = seconds;
  state.timer.running = true;

  intervalId = setInterval(() => {
    state.timer.seconds--;
    if (state.timer.seconds <= 0) {
      stopTimer();
      onTimerComplete();
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
}

/**
 * Reset timer to zero
 */
export function resetTimer() {
  stopTimer();
  state.timer.seconds = 0;
  state.timer.total = 0;
}

/**
 * Toggle timer play/pause
 */
export function toggleTimer() {
  if (state.timer.running) {
    stopTimer();
  } else if (state.timer  } else if (state.timer.total > 0) {
    // Resume
    state.timer.running = true;
    intervalId = setInterval(() => {
      state.timer.seconds--;
      if (state.timer.seconds <= 0) {
        stopTimer();
        onTimerComplete();
      }
    }, 1000);
  }
}

/**
 * Handle timer completion
 */
function onTimerComplete() {
  playAlarm();

  // Browser notification
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


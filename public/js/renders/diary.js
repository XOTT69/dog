/**
 * @fileoverview Diary tab — chart, feed with virtual scrolling, weight
 */

import { state } from '../state.js';
import { $, $$, escapeHtml, tsToDate, isToiletSuccess, isToiletMiss, calcToiletStats } from '../utils.js';
import { MAX_CHART_DAYS, MAX_FEED_DISPLAY, MS_PER_DAY } from '../constants.js';
import { deleteEvent, restoreEvent } from '../firebase.js';
import { toast } from '../render.js';

/** @type {IntersectionObserver|null} */
let chartObserver = null;
let chartRendered = false;

export function render() {
  renderFeed();
  renderWeight();
  observeChart();
}

// ===== CHART (Intersection Observer based) =====

function observeChart() {
  const canvas = $('progressChartDiary');
  if (!canvas) return;

  if (chartObserver) return; // Already observing

  chartObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting && !chartRendered) {
        chartRendered = true;
        renderChart(canvas);
      }
    }
  }, { threshold: 0.2 });

  chartObserver.observe(canvas);
}

function renderChart(canvas) {
  if (!canvas?.getContext) return;
  const parent = canvas.parentElement;
  if (!parent || parent.offsetHeight === 0) return;

  const parentWidth = parent.clientWidth - 32;
  const chartHeight = 180;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  canvas.style.width = `${parentWidth}px`;
  canvas.style.height = `${chartHeight}px`;
  canvas.width = parentWidth * dpr;
  canvas.height = chartHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const w = parentWidth;
  const h = chartHeight;
  ctx.clearRect(0, 0, w, h);

  const isDark = state.ui.theme === 'dark';
  const accent = isDark ? '#38bdf8' : '#0ea5e9';
  const danger = isDark ? '#f87171' : '#ef4444';
  const warning = isDark ? '#fbbf24' : '#f59e0b';
  const muted = isDark ? '#6c757d' : '#adb5bd';
  const border = isDark ? '#2a2a4a' : '#e9ecef';
  const textC = isDark ? '#adb5bd' : '#495057';

  // Gather data
  const days = [];
  let hasData = false;

  for (let i = MAX_CHART_DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);

    const dayEv = state.events.items.filter(e => {
      const ts = tsToDate(e.createdAt);
      return ts && ts >= d && ts < next;
    });
    const stats = calcToiletStats(dayEv);
    if (stats.total > 0) hasData = true;
    days.push({ date: d, pct: stats.rate, total: stats.total });
  }

  if (!hasData) {
    ctx.fillStyle = muted;
    ctx.font = '14px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('📝 Додайте записи горшика', w / 2, h / 2 - 10);
    ctx.font = '12px -apple-system, system-ui, sans-serif';
    ctx.fillText('щоб побачити графік', w / 2, h / 2 + 14);
    return;
  }

  const pad = { top: 24, right: 12, bottom: 32, left: 12 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;
  const bw = cw / days.length;

  // Grid lines
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  [0, 50, 100].forEach(v => {
    const y = pad.top + ch - (v / 100) * ch;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
  });
  ctx.setLineDash([]);

  // Bars
  days.forEach((day, i) => {
    const x = pad.left + i * bw + bw * 0.15;
    const barW = bw * 0.65;

    if (day.pct == null) {
      ctx.fillStyle = muted;
      ctx.beginPath();
      ctx.arc(x + barW / 2, pad.top + ch - 2, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const barH = Math.max(8, (day.pct / 100) * ch);
      const y = pad.top + ch - barH;
      const barColor = day.pct >= 70 ? accent : day.pct >= 40 ? warning : danger;

      ctx.fillStyle = barColor;
      const r = Math.min(4, barW / 2);
      ctx.beginPath();
      ctx.moveTo(x, pad.top + ch);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.lineTo(x + barW - r, y);
      ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
      ctx.lineTo(x + barW, pad.top + ch);
      ctx.closePath();
      ctx.fill();
      if (day.total >= 1) {
        ctx.fillStyle = textC;
        ctx.font = 'bold 9px -apple-system, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${day.pct}%`, x + barW / 2, y - 5);
      }
    }

    // Date labels
    if (i % 2 === 0 || i === days.length - 1) {
      ctx.fillStyle = muted;
      ctx.font = '9px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${day.date.getDate()}.${day.date.getMonth() + 1}`, x + bw * 0.65 / 2, h - 8);
    }
  });

  // Legend
  const lx = w - pad.right - 160;
  const ly = 8;
  ctx.font = '10px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'left';

  ctx.fillStyle = accent;
  ctx.fillRect(lx, ly, 10, 10);
  ctx.fillStyle = textC;
  ctx.fillText('≥70%', lx + 14, ly + 9);

  ctx.fillStyle = warning;
  ctx.fillRect(lx + 52, ly, 10, 10);
  ctx.fillStyle = textC;
  ctx.fillText('40-69%', lx + 66, ly + 9);

  ctx.fillStyle = danger;
  ctx.fillRect(lx + 116, ly, 10, 10);
  ctx.fillStyle = textC;
  ctx.fillText('<40%', lx + 130, ly + 9);
}

// ===== FEED (with virtual scrolling lite) =====

/** @type {Map<string, {icon:string, label:string}>} */
let typeConfigCache = null;

function getTypeConfig() {
  if (typeConfigCache) return typeConfigCache;
  typeConfigCache = new Map([
    ['pee_success', { icon: '💛', label: 'На місці ✓' }],
    ['pee_miss', { icon: '💛', label: 'Мимо' }],
    ['poo_success', { icon: '💩', label: 'На місці ✓' }],
    ['poo_miss', { icon: '💩', label: 'Мимо' }],
    ['meal_morning', { icon: '🍖', label: 'Сніданок' }],
    ['meal_day', { icon: '🍖', label: 'Обід' }],
    ['meal_evening', { icon: '🍖', label: 'Вечеря' }],
    ['treat', { icon: '🦴', label: 'Ласощі' }],
    ['water', { icon: '💧', label: 'Вода' }],
    ['walk', { icon: '🚶', label: 'Прогулянка' }],
    ['play', { icon: '🎾', label: 'Гра' }],
    ['training', { icon: '🎓', label: 'Тренування' }],
    ['nose_game', { icon: '👃', label: 'Нюхова гра' }],
    ['social', { icon: '🐕', label: 'Соціалізація' }],
    ['weight', { icon: '⚖️', label: 'Вага' }],
    ['medicine', { icon: '💊', label: 'Ліки' }],
    ['vaccine', { icon: '💉', label: 'Вакцина' }],
    ['vet_visit', { icon: '🏥', label: 'Ветеринар' }],
    ['heat', { icon: '🩸', label: 'Тічка' }],
    ['symptom', { icon: '🤒', label: 'Симптом' }],
    ['bath', { icon: '🛁', label: 'Купання' }],
    ['nails', { icon: '✂️', label: 'Нігті' }],
    ['ears', { icon: '👂', label: 'Вуха' }],
    ['teeth', { icon: '🦷', label: 'Зуби' }],
    ['grooming', { icon: '✨', label: 'Грумінг' }],
    ['sleep', { icon: '😴', label: 'Сон' }],
    ['note', { icon: '📝', label: 'Нотатка' }],
  ]);
  return typeConfigCache;
}

/** Filter category definitions */
const FILTER_TYPES = {
  all: null,
  toilet: ['pee_success', 'pee_miss', 'poo_success', 'poo_miss'],
  food: ['meal_morning', 'meal_day', 'meal_evening', 'treat', 'water'],
  activity: ['walk', 'play', 'training', 'nose_game', 'social'],
  health: ['weight', 'medicine', 'vaccine', 'vet_visit', 'heat', 'symptom'],
  hygiene: ['bath', 'nails', 'ears', 'teeth', 'grooming'],
};

function renderFeed() {
  const list = $('recentLogsDiary');
  if (!list) return;

  const filter = state.ui.diaryFilter;
  const typeConfig = getTypeConfig();
  let events = state.events.items;

  // Apply filter
  const allowedTypes = FILTER_TYPES[filter];
  if (allowedTypes) {
    events = events.filter(e => allowedTypes.includes(e.eventType));
  }

  if (!events.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📝</div>
        <div class="empty-state-title">Поки порожньо</div>
        <div class="empty-state-desc">Натисніть + щоб додати подію</div>
      </div>`;
    return;
  }

  // Limit display (virtual scrolling lite — show first N, load more on scroll)
  const visible = events.slice(0, MAX_FEED_DISPLAY);

  list.innerHTML = visible.map(item => {
    const conf = typeConfig.get(item.eventType) || { icon: '•', label: 'Подія' };
    const d = tsToDate(item.createdAt);
    const timeStr = d
      ? d.toLocaleString('uk', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '';
    const valStr = item.value ? ` · ${escapeHtml(item.value)} кг` : '';
    const noteStr = item.note ? ` · ${escapeHtml(item.note)}` : '';
    const pendingStr = item.pending ? ' · синхронізується' : '';

    return `
      <div class="feed-item" data-event-id="${escapeHtml(item.id)}">
        <div>
          <strong>${conf.icon} ${conf.label}</strong>
          <div class="meta">${escapeHtml(timeStr)}${valStr}${noteStr}${pendingStr}</div>
        </div>
        <button type="button" class="btn btn-ghost btn-sm feed-delete" data-delete="${escapeHtml(item.id)}" aria-label="Видалити">✕</button>
      </div>`;
  }).join('');

  // Show "load more" if truncated
  if (events.length > MAX_FEED_DISPLAY) {
    list.insertAdjacentHTML('beforeend', `
      <div class="feed-load-more">
        <button class="btn btn-ghost btn-sm" id="loadMoreBtn" type="button">
          Показати ще (${events.length - MAX_FEED_DISPLAY})
        </button>
      </div>
    `);
    $('loadMoreBtn')?.addEventListener('click', () => {
      renderFeedFull(events);
    });
  }

  // Bind delete buttons (event delegation) — remove old listener first
  list.removeEventListener('click', handleFeedClick);
  list.addEventListener('click', handleFeedClick);
}

/**
 * Render full feed (called when "load more" clicked)
 */
function renderFeedFull(events) {
  const list = $('recentLogsDiary');
  if (!list) return;

  const typeConfig = getTypeConfig();
  list.innerHTML = events.map(item => {
    const conf = typeConfig.get(item.eventType) || { icon: '•', label: 'Подія' };
    const d = tsToDate(item.createdAt);
    const timeStr = d
      ? d.toLocaleString('uk', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '';
    return `
      <div class="feed-item" data-event-id="${escapeHtml(item.id)}">
        <div>
          <strong>${conf.icon} ${conf.label}</strong>
          <div class="meta">${escapeHtml(timeStr)}${item.value ? ` · ${item.value} кг` : ''}${item.note ? ` · ${escapeHtml(item.note)}` : ''}</div>
        </div>
        <button type="button" class="btn btn-ghost btn-sm feed-delete" data-delete="${escapeHtml(item.id)}" aria-label="Видалити">✕</button>
      </div>`;
  }).join('');
}

/**
 * Handle feed click events (delegation)
 */
function handleFeedClick(e) {
  const btn = e.target.closest('[data-delete]');
  if (!btn) return;

  const eventId = btn.dataset.delete;
  const eventData = state.events.items.find(ev => ev.id === eventId);
  if (!eventData) return;

  deleteEvent(eventId).then(() => {
    toast('Видалено', 'success', () => {
      restoreEvent(eventData).then(() => {
        toast('Відновлено ✓', 'success');
      });
    });
  }).catch(() => {
    toast('Помилка видалення', 'error');
  });
}

// ===== WEIGHT =====

function renderWeight() {
  const container = $('weightHistory');
  if (!container) return;

  const weightEvents = state.events.items
    .filter(e => e.eventType === 'weight' && e.value)
    .slice(0, 20)
    .reverse(); // Oldest first for comparison

  if (!weightEvents.length) {
    container.innerHTML = '<p class="text-muted">+ → Здоров\'я → ⚖️ Вага</p>';
    return;
  }

  const latest = weightEvents[weightEvents.length - 1];
  const prev = weightEvents.length > 1 ? weightEvents[weightEvents.length - 2] : null;
  const diff = prev ? (latest.value - prev.value).toFixed(1) : null;

  let diffStr = '';
  if (diff) {
    if (diff > 0) diffStr = `<div class="weight-change up">+${diff} кг ↑</div>`;
    else if (diff < 0) diffStr = `<div class="weight-change down">${diff} кг ↓</div>`;
    else diffStr = '<div class="weight-change">=</div>';
  }

  container.innerHTML = `
    <div class="weight-display">
      <div class="weight-value">${escapeHtml(latest.value)} кг</div>
      ${diffStr}
    </div>
    ${weightEvents.length > 2 ? renderMiniWeightChart(weightEvents) : ''}
  `;
}

/**
 * Render a mini sparkline for weight history
 */
function renderMiniWeightChart(events) {
  const values = events.map(e => parseFloat(e.value)).filter(v => !isNaN(v));
  if (values.length < 3) return '';

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 200;
  const height = 40;
  const step = width / (values.length - 1);

  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * (height - 8) - 4;
    return `${x},${y}`;
  }).join(' ');

  return `
    <svg class="weight-sparkline" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <polyline points="${points}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${(values.length - 1) * step}" cy="${height - ((values[values.length - 1] - min) / range) * (height - 8) - 4}" r="3" fill="var(--accent)"/>
    </svg>
  `;
}

/**
 * Force re-render chart (called on tab switch / resize)
 */
export function invalidateChart() {
  chartRendered = false;
  const canvas = $('progressChartDiary');
  if (canvas) renderChart(canvas);
}

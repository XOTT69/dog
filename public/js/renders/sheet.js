/**
 * @fileoverview Bottom sheet for adding events
 */

import { state } from '../state.js';
import { nowTime, haptic, escapeHtml } from '../utils.js';
import { addEvent } from '../firebase.js';
import { toast } from '../render.js';

const $ = (id) => document.getElementById(id);
const show = (el) => el?.classList.remove('hidden');
const hide = (el) => el?.classList.add('hidden');

const EVENT_CATEGORIES = [
  { id: 'toilet', name: 'Горшик', icon: '🚽', events: [
    { type: 'pee_success', icon: '💛', label: 'На місці ✓', tone: 'success' },
    { type: 'pee_miss', icon: '💛', label: 'Мимо', tone: 'danger' },
    { type: 'poo_success', icon: '💩', label: 'На місці ✓', tone: 'success' },
    { type: 'poo_miss', icon: '💩', label: 'Мимо', tone: 'danger' },
  ]},
  { id: 'food', name: 'Їжа', icon: '🍖', events: [
    { type: 'meal_morning', icon: '🍖', label: 'Сніданок', tone: '' },
    { type: 'meal_day', icon: '🍖', label: 'Обід', tone: '' },
    { type: 'meal_evening', icon: '🍖', label: 'Вечеря', tone: '' },
    { type: 'treat', icon: '🦴', label: 'Ласощі', tone: '' },
    { type: 'water', icon: '💧', label: 'Вода', tone: '' },
  ]},
  { id: 'activity', name: 'Активність', icon: '🎾', events: [
    { type: 'walk', icon: '🚶', label: 'Прогулянка', tone: '' },
    { type: 'play', icon: '🎾', label: 'Гра', tone: '' },
    { type: 'training', icon: '🎓', label: 'Тренування', tone: '' },
    { type: 'nose_game', icon: '👃', label: 'Нюхова гра', tone: '' },
    { type: 'social', icon: '🐕', label: 'Соціалізація', tone: '' },
  ]},
  { id: 'health', name: "Здоров'я", icon: '🏥', events: [
    { type: 'weight', icon: '⚖️', label: 'Вага', tone: '', hasValue: true },
    { type: 'medicine', icon: '💊', label: 'Ліки', tone: '' },
    { type: 'vaccine', icon: '💉', label: 'Вакцина', tone: '' },
    { type: 'vet_visit', icon: '🏥', label: 'Ветеринар', tone: '' },
    { type: 'heat', icon: '🩸', label: 'Тічка', tone: '' },
    { type: 'symptom', icon: '🤒', label: 'Симптом', tone: '' },
  ]},
  { id: 'hygiene', name: 'Гігієна', icon: '🛁', events: [
    { type: 'bath', icon: '🛁', label: 'Купання', tone: '' },
    { type: 'nails', icon: '✂️', label: 'Нігті', tone: '' },
    { type: 'ears', icon: '👂', label: 'Вуха', tone: '' },
    { type: 'teeth', icon: '🦷', label: 'Зуби', tone: '' },
    { type: 'grooming', icon: '✨', label: 'Грумінг', tone: '' },
  ]},
  { id: 'other', name: 'Інше', icon: '📝', events: [
    { type: 'sleep', icon: '😴', label: 'Сон', tone: '' },
    { type: 'note', icon: '📝', label: 'Нотатка', tone: '' },
  ]},
];

/** @type {boolean} */
let saveButtonBound = false;

/**
 * Render sheet content
 */
export function render() {
  renderCategories();
  renderEvents();
  hide($('sheetExtraFields'));
  bindSaveButton();
}

/**
 * Close the sheet
 */
export function closeSheet() {
  hide($('eventSheet'));
  state.ui.sheetOpen = false;
  document.body.style.overflow = '';
}

// ===== CATEGORIES =====

function renderCategories() {
  const container = $('sheetCategories');
  if (!container) return;

  container.innerHTML = EVENT_CATEGORIES.map(cat =>
    `<button type="button" class="chip ${cat.id === state.ui.selectedSheetCategory ? 'active' : ''}" data-sheet-cat="${cat.id}">
      ${cat.icon} ${cat.name}
    </button>`
  ).join('');

  container.querySelectorAll('[data-sheet-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.ui.selectedSheetCategory = btn.dataset.sheetCat;
      state.ui.selectedEventType = null;
      renderCategories();
      renderEvents();
      hide($('sheetExtraFields'));
      haptic();
    });
  });
}

// ===== EVENTS =====

function renderEvents() {
  const container = $('sheetEvents');
  if (!container) return;

  const cat = EVENT_CATEGORIES.find(c => c.id === state.ui.selectedSheetCategory);
  if (!cat) return;

  container.innerHTML = `<div class="actions-grid">${cat.events.map(ev => {
    const selected = state.ui.selectedEventType === ev.type ? 'selected' : '';
    const toneClass = ev.tone === 'success' ? ' green' : ev.tone === 'danger' ? ' red' : '';
    return `<button type="button" class="action-btn ${selected}${toneClass}" data-sheet-event="${ev.type}">
      <span class="action-icon">${ev.icon}</span>${ev.label}
    </button>`;
  }).join('')}</div>`;

  container.querySelectorAll('[data-sheet-event]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.ui.selectedEventType = btn.dataset.sheetEvent;
      renderEvents();
      show($('sheetExtraFields'));

      // Set time to now
      const timeInput = $('eventTime');
      if (timeInput) timeInput.value = nowTime();

      // Show/hide value field
      const ev = cat.events.find(e => e.type === btn.dataset.sheetEvent);
      const vf = $('valueField');
      if (vf) vf.style.display = ev?.hasValue ? '' : 'none';

      haptic();
    });
  });
}

// ===== SAVE BUTTON =====

function bindSaveButton() {
  if (saveButtonBound) return;
  const saveBtn = $('saveEventBtn');
  if (!saveBtn) return;

  saveButtonBound = true;

  saveBtn.addEventListener('click', async () => {
    const eventType = state.ui.selectedEventType;
    if (!eventType) {
      toast('Оберіть тип', 'error');
      return;
    }

    const payload = {
      eventType,
      timeLabel: $('eventTime')?.value || nowTime(),
      note: $('eventNote')?.value?.trim() || '',
    };

    const val = $('eventValue')?.value;
    if (val) payload.value = parseFloat(val);

    try {
      const eventId = await addEvent(payload);
      toast(eventId.startsWith('local_') ? 'Збережено офлайн ✓' : 'Додано ✓', 'success');

      // Clear fields
      const noteEl = $('eventNote');
      const valEl = $('eventValue');
      if (noteEl) noteEl.value = '';
      if (valEl) valEl.value = '';

      // Close sheet
      closeSheet();
    } catch (e) {
      console.error('[Sheet] Save error:', e);
      toast('Помилка', 'error');
    }
  });
}

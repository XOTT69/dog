/**
 * @fileoverview Bottom sheet for adding events
 */

import { state } from '../state.js';
import { $, $$, nowTime, haptic, show, hide } from '../utils.js';
import { addEvent } from '../firebase.js';
import { toast } from '../render.js';

const EVENT_CATEGORIES = [
  { id: 'toilet', name: 'Горшик', icon: '🚽', events: [
    { type: 'pee_success', icon: '💛', label: 'На місці ✓', tone: 'success' },
    { type: 'pee_miss', icon: '💛', label: 'Мимо', tone: 'danger' },
    { type: 'poo_success', icon: '💩', label: 'На місці ✓', tone: 'success' },
    { type: 'poo_miss', icon: '💩', label: 'Мимо', tone: 'danger' },
  ]},
  { id: 'food', name: 'Їжа', icon: '🍖', events: [
    { type: 'meal_morning', icon: '🍖', label: 'Сніданок' },
    { type: 'meal_day', icon: '🍖', label: 'Обід' },
    { type: 'meal_evening', icon: '🍖', label: 'Вечеря' },
    { type: 'treat', icon: '🦴', label: 'Ласощі' },
    { type: 'water', icon: '💧', label: 'Вода' },
  ]},
  { id: 'activity', name: 'Активність', icon: '🎾', events: [
    { type: 'walk', icon: '🚶', label: 'Прогулянка' },
    { type: 'play', icon: '🎾', label: 'Гра' },
    { type: 'training', icon: '🎓', label: 'Тренування' },
    { type: 'nose_game', icon: '👃', label: 'Нюхова гра' },
    { type: 'social', icon: '🐕', label: 'Соціалізація' },
  ]},
  { id: 'health', name: "Здоров'я", icon: '🏥', events: [
    { type: 'weight', icon: '⚖️', label: 'Вага', hasValue: true },
    { type: 'medicine', icon: '💊', label: 'Ліки' },
    { type: 'vaccine', icon: '💉', label: 'Вакцина' },
    { type: 'vet_visit', icon: '🏥', label: 'Ветеринар' },
    { type: 'heat', icon: '🩸', label: 'Тічка' },
    { type: 'symptom', icon: '🤒', label: 'Симптом' },
  ]},
  { id: 'hygiene', name: 'Гігієна', icon: '🛁', events: [
    { type: 'bath', icon: '🛁', label: 'Купання' },
    { type: 'nails', icon: '✂️', label: 'Нігті' },
    { type: 'ears', icon: '👂', label: 'Вуха' },
    { type: 'teeth', icon: '🦷', label: 'Зуби' },
    { type: 'grooming', icon: '✨', label: 'Грумінг' },
  ]},
  { id: 'other', name: 'Інше', icon: '📝', events: [
    { type: 'sleep', icon: '😴', label: 'Сон' },
    { type: 'note', icon: '📝', label: 'Нотатка' },
  ]},
];

export function render() {
  renderCategories();
  renderEvents();
  hide($('sheetExtraFields'));
}

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

function renderEvents() {
  const container = $('sheetEvents');
  if (!container) return;

  const cat = EVENT_CATEGORIES.find(c => c.id === state.ui.selectedSheetCategory);
  if (!cat) return;

  container.innerHTML = `<div class="actions-grid">${cat.events.map(ev =>
    `<button type="button" class="action-btn ${state.ui.selectedEventType === ev.type ? 'selected' : ''}${ev.tone === 'success' ? ' green' : ev.tone === 'danger' ? ' red' : ''}" data-sheet-event="${ev.type}">
      <span class="action-icon">${ev.icon}</span>${ev.label}
    </button>`
  ).join('')}</div>`;

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

// ===== SAVE EVENT (bind once) =====

const saveBtn = $('saveEventBtn');
if (saveBtn && !saveBtn.dataset.bound) {
  saveBtn.dataset.bound = 'true';
  saveBtn.addEventListener('click', async () => {
    const eventType = state.ui.selectedEventType;
    if (!eventType) { toast('Оберіть тип', 'error'); return; }

    const payload = {
      eventType,
      timeLabel: $('eventTime')?.value || nowTime(),
      note: $('eventNote')?.value?.trim() || '',
    };

    const val = $('eventValue')?.value;
    if (val) payload.value = parseFloat(val);

    try {
      await addEvent(payload);
      toast('Додано ✓', 'success');

      // Clear fields
      if ($('eventNote')) $('eventNote').value = '';
      if ($('eventValue')) $('eventValue').value = '';

      // Close sheet
      const { closeSheet } = await import('../main.js');
      closeSheet();
    } catch {
      toast('Помилка', 'error');
    }
  });
}

/**
 * @fileoverview Calendar tab — daily agenda and planning categories.
 */

import { state } from '../state.js';
import { $, $$, escapeHtml, haptic, localDateKey, startOfToday, tsToDate } from '../utils.js';
import { addReminder, updateReminder, deleteReminder } from '../firebase.js';
import { toast, confirmDialog } from '../render.js';

const CATEGORY_MAP = {
  walk: ['walk'],
  food: ['food', 'water', 'meal_morning', 'meal_day', 'meal_evening', 'treat'],
  training: ['training'],
  health: ['medicine', 'vaccine', 'vet', 'vet_visit', 'grooming', 'heat', 'weight', 'symptom'],
};

const EVENT_LABELS = {
  pee_success: 'Туалет успішно',
  pee_miss: 'Промах туалету',
  poo_success: 'Туалет успішно',
  poo_miss: 'Промах туалету',
  walk: 'Прогулянка',
  training: 'Тренування',
  food: 'Годування',
  water: 'Вода',
  medicine: 'Ліки',
  vaccine: 'Вакцинація',
  vet: 'Ветеринар',
  vet_visit: 'Ветеринар',
  grooming: 'Грумінг',
  heat: 'Тічка',
  weight: 'Вага',
  meal_morning: 'Сніданок',
  meal_day: 'Обід',
  meal_evening: 'Вечеря',
  treat: 'Ласощі',
  symptom: 'Симптом',
};

const PLANNER_ITEMS = [
  { key: 'walk', title: 'Прогулянки', meta: 'ранок, день, вечір' },
  { key: 'food', title: 'Годування', meta: 'після їжі та вода' },
  { key: 'training', title: 'Тренування', meta: 'короткі сесії' },
  { key: 'medicine', title: 'Ліки', meta: 'дозування і час' },
  { key: 'vaccine', title: 'Вакцинації', meta: 'планові дати' },
  { key: 'grooming', title: 'Грумінг', meta: 'догляд і гігієна' },
  { key: 'vet', title: 'Ветеринар', meta: 'візити та процедури' },
  { key: 'heat', title: 'Тічка', meta: 'цикл і нотатки' },
  { key: 'custom', title: 'Своє нагадування', meta: 'разове або повторюване' },
];

let bound = false;

export function render() {
  bindCalendar();
  renderAgenda();
  renderPlannerGrid();
}

function bindCalendar() {
  if (bound) return;
  bound = true;

  $$('#calendarFilters [data-calendar-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.ui.calendarFilter = btn.dataset.calendarFilter;
      $$('#calendarFilters [data-calendar-filter]').forEach(b => {
        b.classList.toggle('active', b === btn);
      });
      renderAgenda();
      haptic();
    });
  });

  $('calendarAddBtn')?.addEventListener('click', () => openReminderModal('custom'));
  $('calendarReminderForm')?.addEventListener('submit', saveReminder);
  $('reminderCancelBtn')?.addEventListener('click', closeReminderModal);
  document.querySelector('[data-reminder-close]')?.addEventListener('click', closeReminderModal);
}

function renderAgenda() {
  const title = $('calendarTodayTitle');
  const agenda = $('calendarAgenda');
  if (!agenda) return;

  const today = startOfToday();
  const filter = state.ui.calendarFilter || 'all';
  const todaysEvents = state.events.items
    .filter(event => {
      const date = tsToDate(event.createdAt);
      if (!date || date < today) return false;
      if (filter === 'all') return true;
      return CATEGORY_MAP[filter]?.includes(event.eventType);
    })
    .map(event => ({
      kind: 'event',
      id: event.id,
      type: event.eventType,
      title: EVENT_LABELS[event.eventType] || event.eventType,
      note: event.note || 'Запис із щоденника',
      time: event.timeLabel || '',
      done: true,
    }));

  const todayKey = localDateKey(today);
  const todaysReminders = state.reminders.items
    .filter(reminder => {
      if (reminder.date !== todayKey) return false;
      if (filter === 'all') return true;
      if (filter === 'health') return CATEGORY_MAP.health.includes(reminder.type);
      return reminder.type === filter;
    })
    .map(reminder => ({
      kind: 'reminder',
      id: reminder.id,
      type: reminder.type,
      title: reminder.title,
      note: reminder.note || repeatLabel(reminder.repeat),
      time: reminder.time || '',
      done: Boolean(reminder.done),
    }));

  const agendaItems = [...todaysReminders, ...todaysEvents]
    .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'))
    .slice(0, 16);

  if (title) {
    const count = agendaItems.length;
    title.textContent = count ? `Сьогодні: ${count} подій` : 'Сьогодні';
  }

  if (!agendaItems.length) {
    agenda.innerHTML = `
      <div class="empty-state compact">
        <div class="empty-state-title">Поки немає запланованих подій</div>
        <div class="empty-state-desc">Додайте прогулянку, годування, тренування або медичне нагадування.</div>
      </div>
    `;
    return;
  }

  agenda.innerHTML = agendaItems.map(item => {
    const isReminder = item.kind === 'reminder';
    return `
      <div class="agenda-item ${item.done ? 'done' : ''}">
        ${isReminder ? `<input type="checkbox" data-reminder-done="${escapeHtml(item.id)}" ${item.done ? 'checked' : ''} aria-label="Виконано">` : '<span class="agenda-dot"></span>'}
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.note || 'Без нотатки')}</span>
        </div>
        <time>${escapeHtml(item.time || '—')}</time>
        ${isReminder ? `<button class="icon-mini" data-reminder-delete="${escapeHtml(item.id)}" type="button" aria-label="Видалити">×</button>` : ''}
      </div>
    `;
  }).join('');

  agenda.querySelectorAll('[data-reminder-done]').forEach(input => {
    input.addEventListener('change', async () => {
      await updateReminder(input.dataset.reminderDone, { done: input.checked });
      haptic();
    });
  });

  agenda.querySelectorAll('[data-reminder-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Видалити нагадування?',
        message: 'Ця задача зникне з календаря.',
        okText: 'Видалити',
        danger: true,
      });
      if (!ok) return;
      await deleteReminder(btn.dataset.reminderDelete);
      toast('Нагадування видалено', 'success');
    });
  });
}

function renderPlannerGrid() {
  const grid = $('calendarPlannerGrid');
  if (!grid || grid.dataset.rendered) return;

  grid.innerHTML = PLANNER_ITEMS.map(item => `
    <button class="planner-tile" type="button" data-planner="${item.key}">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.meta)}</span>
    </button>
  `).join('');

  grid.querySelectorAll('[data-planner]').forEach(btn => {
    btn.addEventListener('click', () => {
      openReminderModal(btn.dataset.planner);
      haptic();
    });
  });

  grid.dataset.rendered = 'true';
}

function openReminderModal(type = 'custom') {
  const modal = $('calendarReminderModal');
  if (!modal) return;

  const date = $('reminderDate');
  const typeEl = $('reminderType');
  const title = $('reminderTitle');
  const note = $('reminderNote');
  const time = $('reminderTime');
  const repeat = $('reminderRepeat');

  if (date) date.value = localDateKey();
  if (typeEl) typeEl.value = normalizeReminderType(type);
  if (title) title.value = defaultTitle(typeEl?.value || type);
  if (note) note.value = '';
  if (time) time.value = '';
  if (repeat) repeat.value = ['walk', 'food', 'training', 'medicine'].includes(typeEl?.value || type)
    ? 'daily'
    : 'once';

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  setTimeout(() => title?.focus(), 50);
}

function closeReminderModal() {
  const modal = $('calendarReminderModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

async function saveReminder(e) {
  e.preventDefault();
  const title = $('reminderTitle')?.value.trim();
  if (!title) {
    toast('Додайте назву', 'error');
    return;
  }

  try {
    await addReminder({
      title,
      type: $('reminderType')?.value || 'custom',
      date: $('reminderDate')?.value || localDateKey(),
      time: $('reminderTime')?.value || '',
      repeat: $('reminderRepeat')?.value || 'once',
      note: $('reminderNote')?.value.trim() || '',
    });
    toast('Додано в календар', 'success');
    closeReminderModal();
  } catch (err) {
    console.error('[Calendar] Reminder save error:', err);
    toast('Не вдалося додати', 'error');
  }
}

function normalizeReminderType(type) {
  if (type === 'medication') return 'medicine';
  if (['walk', 'food', 'training', 'medicine', 'vaccine', 'grooming', 'vet', 'heat', 'custom'].includes(type)) {
    return type;
  }
  return 'custom';
}

function defaultTitle(type) {
  const labels = {
    walk: 'Прогулянка',
    food: 'Годування',
    training: 'Тренування',
    medicine: 'Ліки',
    vaccine: 'Вакцинація',
    grooming: 'Грумінг',
    vet: 'Ветеринар',
    heat: 'Тічка',
    custom: 'Нагадування',
  };
  return labels[type] || labels.custom;
}

function repeatLabel(repeat) {
  return {
    once: 'Разово',
    daily: 'Щодня',
    weekly: 'Щотижня',
  }[repeat] || 'Разово';
}

/**
 * @fileoverview Calendar tab — planned tasks, health reminders, meds, event history.
 */

import { state, STORAGE_KEYS } from '../state.js';
import { $, escapeHtml, localDateKey, tsToDate } from '../utils.js';
import { addCalendarItem, addEvent, deleteCalendarItem, updateCalendarItem } from '../firebase.js';
import { generateHealthSchedule } from '../vaccination.js';
import { getMedications, getTodaySchedule } from '../medication.js';
import { formDialog, confirmDialog } from '../modal.js';
import { toast } from '../render.js';

const CALENDAR_KEY = STORAGE_KEYS.calendarItems;

const ITEM_TYPES = {
  walk: { label: 'Прогулянка', icon: 'Walk' },
  food: { label: 'Їжа', icon: 'Food' },
  training: { label: 'Тренування', icon: 'Train' },
  health: { label: "Здоров'я", icon: 'Care' },
  hygiene: { label: 'Гігієна', icon: 'Groom' },
  medication: { label: 'Ліки', icon: 'Meds' },
  note: { label: 'Нотатка', icon: 'Note' },
};

const REPEAT = {
  once: 'Разово',
  daily: 'Щодня',
  weekly: 'Щотижня',
};

let bound = false;
let selectedDate = localDateKey();

function loadLocalItems() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CALENDAR_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.map(item => ({ ...item, source: 'planned', localOnly: true }))
      : [];
  } catch {
    return [];
  }
}

function saveLocalItems(items) {
  localStorage.setItem(CALENDAR_KEY, JSON.stringify(items));
}

function loadItems() {
  const shared = state.calendar.items || [];
  const sharedIds = new Set(shared.map(item => item.id));
  const local = loadLocalItems().filter(item => !sharedIds.has(item.id));
  return [...shared, ...local];
}

function dayRange(days = 14) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });
}

function itemOccursOn(item, dateKey) {
  if (item.date === dateKey) return true;
  if (!item.date || item.repeat === 'once') return false;

  const start = new Date(item.date);
  const day = new Date(dateKey);
  if (Number.isNaN(start.getTime()) || Number.isNaN(day.getTime()) || day < start) return false;

  if (item.repeat === 'daily') return true;
  if (item.repeat === 'weekly') {
    return start.getDay() === day.getDay();
  }
  return false;
}

function eventToCalendarItem(event) {
  const date = tsToDate(event.createdAt);
  if (!date) return null;
  const typeMap = {
    walk: 'walk',
    training: 'training',
    meal_morning: 'food',
    meal_day: 'food',
    meal_evening: 'food',
    medicine: 'medication',
    vaccine: 'health',
    vet_visit: 'health',
    bath: 'hygiene',
    grooming: 'hygiene',
  };
  const type = typeMap[event.eventType] || 'note';
  return {
    id: `event_${event.id}`,
    source: 'event',
    title: event.note || ITEM_TYPES[type].label,
    date: localDateKey(date),
    time: event.timeLabel || date.toTimeString().slice(0, 5),
    type,
    done: true,
  };
}

function healthItems() {
  return generateHealthSchedule()
    .filter(item => item.status !== 'past')
    .slice(0, 18)
    .map(item => ({
      id: `health_${item.type}_${item.date.getTime()}`,
      source: 'health',
      title: item.name,
      subtitle: item.desc,
      date: localDateKey(item.date),
      time: '',
      type: 'health',
      status: item.status,
    }));
}

function medicationItems() {
  const meds = getMedications();
  if (!meds.length) return [];
  return getTodaySchedule().map(item => ({
    id: `med_${item.med.id}`,
    source: 'medication',
    title: item.med.name,
    subtitle: item.med.dosage || '',
    date: localDateKey(),
    time: '',
    type: 'medication',
    done: item.takenToday,
  }));
}

function getAllItems() {
  const planned = loadItems();
  const eventItems = state.events.items.map(eventToCalendarItem).filter(Boolean);
  return [...planned, ...healthItems(), ...medicationItems(), ...eventItems];
}

function itemsForDate(dateKey) {
  return getAllItems()
    .filter(item => item.source === 'planned' ? itemOccursOn(item, dateKey) : item.date === dateKey)
    .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
}

export function render() {
  renderSummary();
  renderDays();
  renderSelectedDay();
  if (!bound) bindEvents();
}

function renderSummary() {
  const el = $('calendarSummary');
  if (!el) return;

  const todayItems = itemsForDate(localDateKey());
  const upcoming = dayRange(7).flatMap(d => itemsForDate(localDateKey(d)));
  const open = upcoming.filter(i => !i.done).length;

  el.innerHTML = `
    <div class="workspace-hero">
      <div>
        <span class="eyebrow">Календар</span>
        <h3>${open} активних задач</h3>
        <p>Плануйте прогулянки, їжу, тренування, ліки, догляд і візити.</p>
      </div>
      <div class="hero-metric">
        <strong>${todayItems.length}</strong>
        <span>сьогодні</span>
      </div>
    </div>
  `;
}

function renderDays() {
  const el = $('calendarDays');
  if (!el) return;

  el.innerHTML = dayRange(14).map((date) => {
    const key = localDateKey(date);
    const items = itemsForDate(key);
    const weekday = date.toLocaleDateString('uk', { weekday: 'short' });
    const label = date.toLocaleDateString('uk', { day: '2-digit', month: '2-digit' });
    return `
      <button class="calendar-day ${key === selectedDate ? 'selected' : ''}" data-calendar-date="${key}" type="button">
        <span>${escapeHtml(weekday)}</span>
        <strong>${escapeHtml(label)}</strong>
        <em>${items.length}</em>
      </button>
    `;
  }).join('');
}

function renderSelectedDay() {
  const list = $('calendarItems');
  const title = $('calendarDateTitle');
  if (!list || !title) return;

  const date = new Date(selectedDate);
  title.textContent = date.toLocaleDateString('uk', { weekday: 'long', day: 'numeric', month: 'long' });

  const items = itemsForDate(selectedDate);
  if (!items.length) {
    list.innerHTML = `
      <div class="empty-state compact">
        <div class="empty-state-title">День вільний</div>
        <div class="empty-state-desc">Додайте задачу або перенесіть тренування з Академії.</div>
      </div>
    `;
    return;
  }

  list.innerHTML = items.map((item) => {
    const type = ITEM_TYPES[item.type] || ITEM_TYPES.note;
    const sourceClass = item.source === 'health' ? 'warning' : item.done ? 'done' : '';
    const repeat = item.repeat && item.repeat !== 'once' ? ` · ${REPEAT[item.repeat]}` : '';
    return `
      <div class="calendar-item ${sourceClass}" data-calendar-item="${escapeHtml(item.id)}">
        <div class="calendar-item-icon">${escapeHtml(type.icon)}</div>
        <div class="calendar-item-main">
          <strong>${escapeHtml(item.title)}</strong>
          <div class="meta">${escapeHtml(item.time || 'Без часу')}${repeat}${item.subtitle ? ` · ${escapeHtml(item.subtitle)}` : ''}</div>
        </div>
        ${item.source === 'planned' ? `
          <button class="btn btn-ghost btn-sm" data-calendar-done="${escapeHtml(item.id)}" type="button">${item.done ? 'Готово' : '✓'}</button>
          <button class="btn btn-ghost btn-sm" data-calendar-delete="${escapeHtml(item.id)}" type="button">×</button>
        ` : ''}
      </div>
    `;
  }).join('');
}

function bindEvents() {
  bound = true;

  $('addCalendarItemBtn')?.addEventListener('click', showAddDialog);

  $('calendarDays')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-calendar-date]');
    if (!btn) return;
    selectedDate = btn.dataset.calendarDate;
    renderDays();
    renderSelectedDay();
  });

  $('calendarQuickActions')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-calendar-quick]');
    if (!btn) return;
    const type = btn.dataset.calendarQuick;
    await addPlannedItem({
      title: ITEM_TYPES[type]?.label || 'Задача',
      type,
      date: selectedDate,
      time: '',
      repeat: 'once',
    });
  });

  $('calendarItems')?.addEventListener('click', async (e) => {
    const doneBtn = e.target.closest('[data-calendar-done]');
    if (doneBtn) {
      await toggleDone(doneBtn.dataset.calendarDone);
      return;
    }

    const delBtn = e.target.closest('[data-calendar-delete]');
    if (delBtn) {
      const ok = await confirmDialog({
        title: 'Видалити задачу?',
        message: 'Це прибере її з календаря.',
        confirmLabel: 'Видалити',
        danger: true,
      });
      if (!ok) return;
      await removePlannedItem(delBtn.dataset.calendarDelete);
    }
  });
}

async function showAddDialog() {
  const values = await formDialog({
    title: 'Нова задача',
    submitLabel: 'Додати',
    fields: [
      { name: 'title', label: 'Назва', required: true, placeholder: 'Наприклад: прогулянка перед сном' },
      { name: 'type', label: 'Тип', type: 'select', options: Object.entries(ITEM_TYPES).map(([value, cfg]) => ({ value, label: cfg.label })) },
      { name: 'date', label: 'Дата', type: 'date', value: selectedDate, required: true },
      { name: 'time', label: 'Час', type: 'time' },
      { name: 'repeat', label: 'Повтор', type: 'select', options: Object.entries(REPEAT).map(([value, label]) => ({ value, label })) },
      { name: 'note', label: 'Нотатка', type: 'textarea', rows: 2 },
    ],
  });
  if (!values) return;
  await addPlannedItem(values);
}

async function addPlannedItem(values) {
  const item = {
    source: 'planned',
    title: values.title,
    type: values.type || 'note',
    date: values.date || selectedDate,
    time: values.time || '',
    note: values.note || '',
    repeat: values.repeat || 'once',
    done: false,
  };

  let savedLocally = false;
  try {
    if (!state.workspace.id || !state.auth.user || !navigator.onLine) throw new Error('No online workspace');
    await addCalendarItem(item);
  } catch (e) {
    const localItem = {
      ...item,
      id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      localOnly: true,
    };
    const items = loadLocalItems();
    items.push(localItem);
    saveLocalItems(items);
    savedLocally = true;
  }

  if (item.type === 'walk' || item.type === 'training') {
    try {
      await addEvent({
        eventType: item.type === 'walk' ? 'walk' : 'training',
        note: item.title,
        timeLabel: item.time || undefined,
      });
    } catch {
      // addEvent has its own offline queue; the planned item still remains visible.
    }
  }

  toast(savedLocally ? 'Додано локально' : 'Додано в календар', 'success');
  render();
}

async function toggleDone(id) {
  const items = loadItems();
  const item = items.find(i => i.id === id);
  if (!item) return;

  if (item.localOnly || id.startsWith('local_')) {
    const local = loadLocalItems();
    const target = local.find(i => i.id === id);
    if (!target) return;
    target.done = !target.done;
    saveLocalItems(local);
    render();
    return;
  }

  try {
    await updateCalendarItem(id, { done: !item.done });
  } catch (e) {
    toast('Не вдалося оновити задачу', 'error');
  }
}

async function removePlannedItem(id) {
  const item = loadItems().find(i => i.id === id);
  if (!item) return;

  if (item.localOnly || id.startsWith('local_')) {
    saveLocalItems(loadLocalItems().filter(local => local.id !== id));
    render();
    return;
  }

  try {
    await deleteCalendarItem(id);
  } catch (e) {
    toast('Не вдалося видалити задачу', 'error');
  }
}

export { loadItems as loadCalendarItems };

/**
 * @fileoverview Calendar tab — daily agenda and planning categories.
 */

import { state } from '../state.js';
import { $, $$, escapeHtml, haptic, startOfToday, tsToDate } from '../utils.js';

const CATEGORY_MAP = {
  walk: ['walk'],
  food: ['food', 'water'],
  training: ['training'],
  health: ['medicine', 'vaccine', 'vet', 'grooming', 'heat', 'weight'],
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
  grooming: 'Грумінг',
  heat: 'Тічка',
  weight: 'Вага',
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

  $('calendarAddBtn')?.addEventListener('click', openEventSheet);
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
    .slice(0, 12);

  if (title) {
    const count = todaysEvents.length;
    title.textContent = count ? `Сьогодні: ${count} подій` : 'Сьогодні';
  }

  if (!todaysEvents.length) {
    agenda.innerHTML = `
      <div class="empty-state compact">
        <div class="empty-state-title">Поки немає запланованих подій</div>
        <div class="empty-state-desc">Додайте прогулянку, годування, тренування або медичне нагадування.</div>
      </div>
    `;
    return;
  }

  agenda.innerHTML = todaysEvents.map(event => {
    const label = EVENT_LABELS[event.eventType] || event.eventType;
    return `
      <div class="agenda-item">
        <div>
          <strong>${escapeHtml(label)}</strong>
          <span>${escapeHtml(event.note || 'Без нотатки')}</span>
        </div>
        <time>${escapeHtml(event.timeLabel || '—')}</time>
      </div>
    `;
  }).join('');
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
      openEventSheet();
      haptic();
    });
  });

  grid.dataset.rendered = 'true';
}

function openEventSheet() {
  document.getElementById('fabAddEvent')?.click();
}

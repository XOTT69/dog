/**
 * @fileoverview Weekly training plan — AI-generated based on dog's age, breed, issues
 */

import { state, STORAGE_KEYS } from './state.js';
import { getAgeInWeeks, weekLabel, todayKey } from './utils.js';
import { fetchAIResponse } from './ai.js';

/**
 * Get or generate weekly training plan
 * @returns {Promise<Array<{day: string, tasks: Array<{title: string, done: boolean}>}>>}
 */
export async function getWeeklyPlan() {
  // Check cache
  const cached = localStorage.getItem(STORAGE_KEYS.weeklyPlan);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      const weekStart = getWeekStart(new Date());
      if (parsed.weekStart === weekStart && Array.isArray(parsed.days)) {
        return parsed.days;
      }
    } catch { /* ignore */ }
  }

  // Generate new plan
  const pet = state.pet.data;
  if (!pet?.name) return getDefaultPlan();

  const weeks = getAgeInWeeks(pet.birthDate);
  const prompt = `Створи тижневий план тренувань для собаки:
- Ім'я: ${pet.name}
- Вік: ${weekLabel(weeks)}
- Порода: ${pet.breed || 'метис'}
- Проблеми: ${pet.issues || 'немає'}
- Режим туалету: ${pet.toiletMode || 'pad'}

Дай план на 7 днів (Пн-Нд). Кожен день: 2-3 завдання, кожне 1 речення.
Формат: JSON масив з полем "day" (назва дня) та "tasks" (масив об'єктів з "title" та "done": false).
Відповідай ТІЛЬКИ JSON, без пояснень.`;

  try {
    const response = await fetchAIResponse(prompt);
    // Try to parse JSON from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const days = JSON.parse(jsonMatch[0]);
      const weekStart = getWeekStart(new Date());
      localStorage.setItem(STORAGE_KEYS.weeklyPlan, JSON.stringify({ weekStart, days }));
      return days;
    }
  } catch { /* ignore */ }

  return getDefaultPlan();
}

/**
 * Save weekly plan progress
 * @param {number} dayIndex
 * @param {number} taskIndex
 * @param {boolean} done
 */
export function saveWeeklyPlanProgress(dayIndex, taskIndex, done) {
  const cached = localStorage.getItem(STORAGE_KEYS.weeklyPlan);
  if (!cached) return;

  try {
    const parsed = JSON.parse(cached);
    if (parsed.days[dayIndex]?.tasks[taskIndex]) {
      parsed.days[dayIndex].tasks[taskIndex].done = done;
      localStorage.setItem(STORAGE_KEYS.weeklyPlan, JSON.stringify(parsed));
    }
  } catch { /* ignore */ }
}

/**
 * Get default plan based on age
 * @returns {Array}
 */
function getDefaultPlan() {
  const weeks = getAgeInWeeks(state.pet.data?.birthDate);
  
  if (weeks != null && weeks < 16) {
    return [
      { day: 'Понеділок', tasks: [
        { title: 'Виклик по імені 5 разів', done: false },
        { title: 'Пелюшка → їжа → гра', done: false },
      ]},
      { day: 'Вівторок', tasks: [
        { title: 'Нове знайомство (з безпечної відстані)', done: false },
        { title: 'Дотик до лап 3 рази', done: false },
      ]},
      { day: 'Середа', tasks: [
        { title: 'Нюхова гра 5 хв', done: false },
        { title: 'Привчання до поверхонь', done: false },
      ]},
      { day: 'Четвер', tasks: [
        { title: 'Сидіти 3 рази', done: false },
        { title: 'Знайомство зі звуком пилососа', done: false },
      ]},
      { day: "П'ятниця", tasks: [
        { title: 'Виклик по імені 5 разів', done: false },
        { title: 'Нюхова гра 5 хв', done: false },
      ]},
      { day: 'Субота', tasks: [
        { title: 'Нове знайомство', done: false },
        { title: 'Привчання до поверхонь', done: false },
      ]},
      { day: 'Неділя', tasks: [
        { title: 'Повторення всього тижня', done: false },
        { title: 'Вільна гра з ласощами', done: false },
      ]},
    ];
  }

  if (weeks != null && weeks < 24) {
    return [
      { day: 'Понеділок', tasks: [
        { title: 'Сидіти 5 разів (2 хв)', done: false },
        { title: 'Виклик по імені 10 разів', done: false },
      ]},
      { day: 'Вівторок', tasks: [
        { title: 'Повідок вдома 5 хв', done: false },
        { title: 'Залишатись 3 сек', done: false },
      ]},
      { day: 'Середа', tasks: [
        { title: 'Нюхова гра 10 хв', done: false },
        { title: 'Соціалізація (1 знайомство)', done: false },
      ]},
      { day: 'Четвер', tasks: [
        { title: 'Сидіти + Лежати', done: false },
        { title: 'Дай лапу 5 разів', done: false },
      ]},
      { day: "П'ятниця", tasks: [
        { title: 'Повідок на вулиці 10 хв', done: false },
        { title: 'Залишатись 5 сек', done: false },
      ]},
      { day: 'Субота', tasks: [
        { title: 'Нюхова гра 10 хв', done: false },
        { title: 'Нове місце для прогулянки', done: false },
      ]},
      { day: 'Неділя', tasks: [
        { title: 'Повторення всього тижня', done: false },
        { title: 'Вільна гра', done: false },
      ]},
    ];
  }

  return [
    { day: 'Понеділок', tasks: [
      { title: 'Нюхова гра 15 хв', done: false },
      { title: 'Тренування команд 5 хв', done: false },
    ]},
    { day: 'Вівторок', tasks: [
      { title: 'Прогулянка з тренуванням', done: false },
      { title: 'Підклик на вулиці', done: false },
    ]},
    { day: 'Середа', tasks: [
      { title: 'Нюхова гра 15 хв', done: false },
      { title: 'Settle / Місце 5 хв', done: false },
    ]},
    { day: 'Четвер', tasks: [
      { title: 'Прогулянка з дистанцією', done: false },
      { title: 'Контроль імпульсів', done: false },
    ]},
    { day: "П'ятниця", tasks: [
      { title: 'Нюхова гра 15 хв', done: false },
      { title: 'Тренування команд', done: false },
    ]},
    { day: 'Субота', tasks: [
      { title: 'Нове місце для прогулянки', done: false },
      { title: 'Соціалізація', done: false },
    ]},
    { day: 'Неділя', tasks: [
      { title: 'Вільна гра', done: false },
      { title: 'Рефлексія тижня', done: false },
    ]},
  ];
}

/**
 * Get start of current week (Monday)
 * @param {Date} date
 * @returns {string}
 */
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Render weekly plan in home tab
 * @param {HTMLElement} container
 */
export async function renderWeeklyPlan(container) {
  if (!container) return;

  const plan = await getWeeklyPlan();
  const today = new Date().getDay();
  const todayIndex = today === 0 ? 6 : today - 1; // Convert to Mon=0

  container.innerHTML = plan.map((day, dayIdx) => {
    const isToday = dayIdx === todayIndex;
    const doneCount = day.tasks.filter(t => t.done).length;
    const total = day.tasks.length;

    return `
      <div class="weekly-day ${isToday ? 'today' : ''}">
        <div class="weekly-day-header">
          <strong>${day.day}</strong>
          <span class="text-muted">${doneCount}/${total}</span>
        </div>
        <div class="weekly-tasks">
          ${day.tasks.map((task, taskIdx) => `
            <label class="weekly-task ${task.done ? 'done' : ''}">
              <input type="checkbox" data-weekly="${dayIdx}:${taskIdx}" ${task.done ? 'checked' : ''}>
              <span>${task.title}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  // Bind checkboxes
  container.querySelectorAll('[data-weekly]').forEach(cb => {
    cb.addEventListener('change', () => {
      const [dayIdx, taskIdx] = cb.dataset.weekly.split(':').map(Number);
      saveWeeklyPlanProgress(dayIdx, taskIdx, cb.checked);
      renderWeeklyPlan(container);
    });
  });
}
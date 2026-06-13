/**
 * @fileoverview Daily AI lesson — short training task based on dog's age and progress
 */

import { state, STORAGE_KEYS } from './state.js';
import { getAgeInWeeks, weekLabel, todayKey } from './utils.js';
import { fetchAIResponse } from './ai.js';

/**
 * Get or generate daily lesson
 * @returns {Promise<{title: string, description: string, steps: string[], tip: string}|null>}
 */
export async function getDailyLesson() {
  // Check cache
  const cached = localStorage.getItem(STORAGE_KEYS.dailyLesson);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed.date === todayKey() && parsed.lesson) {
        return parsed.lesson;
      }
    } catch { /* ignore */ }
  }

  // Generate new lesson
  const pet = state.pet.data;
  if (!pet?.name) return null;

  const weeks = getAgeInWeeks(pet.birthDate);
  const prompt = `Створи короткий щоденний урок тренування для собаки:
- Ім'я: ${pet.name}
- Вік: ${weekLabel(weeks)}
- Порода: ${pet.breed || 'метис'}
- Проблеми: ${pet.issues || 'немає'}

Дай ОДИН конкретний урок на сьогодні. Формат JSON:
{
  "title": "Назва уроку (1 слово)",
  "description": "Що робимо сьогодні (1 речення)",
  "steps": ["Крок 1", "Крок 2", "Крок 3"],
  "tip": "Корисна порада (1 речення)"
}
Відповідай ТІЛЬКИ JSON, без пояснень.`;

  try {
    const response = await fetchAIResponse(prompt);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const lesson = JSON.parse(jsonMatch[0]);
      if (lesson.title && lesson.steps) {
        localStorage.setItem(STORAGE_KEYS.dailyLesson, JSON.stringify({ 
          date: todayKey(), 
          lesson 
        }));
        return lesson;
      }
    }
  } catch { /* ignore */ }

  return getDefaultLesson(weeks);
}

/**
 * Get default lesson based on age
 * @param {number|null} weeks
 * @returns {object}
 */
function getDefaultLesson(weeks) {
  if (weeks != null && weeks < 16) {
    return {
      title: 'Знайомство',
      description: 'Вчимо собаку реагувати на своє ім\'я',
      steps: [
        'Візьміть ласощі',
        'Скажіть ім\'я спокійно',
        'Подивилось → ласощі',
        'Повторіть 5 разів',
      ],
      tip: 'Не кличте по імені більше 2 разів підряд!',
    };
  }

  if (weeks != null && weeks < 24) {
    return {
      title: 'Сидіти',
      description: 'Закріплюємо команду "Сидіти" в новому місці',
      steps: [
        'Ласощі біля носа',
        'Підніміть руку вгору',
        'Сідає → клікер + ласощі',
        '5 разів, потім перерва',
      ],
      tip: 'Тренуйте в різних кімнатах для генералізації!',
    };
  }

  return {
    title: 'Нюхова гра',
    description: 'Розумова втома = спокійна собака',
    steps: [
      'Розкидайте корм по кімнаті',
      'Собака шукає носом',
      '10-15 хвилин',
      'Не допомагайте!',
    ],
    tip: '10 хв нюхання = 1 година бігу по розумовому навантаженню!',
  };
}

/**
 * Render daily lesson in home tab
 * @param {HTMLElement} container
 */
export async function renderDailyLesson(container) {
  if (!container) return;

  const lesson = await getDailyLesson();
  if (!lesson) {
    container.style.display = 'none';
    return;
  }

  container.style.display = '';
  container.innerHTML = `
    <div class="daily-lesson">
      <div class="daily-lesson-header">
        <span class="daily-lesson-icon">🎯</span>
        <div>
          <strong>${lesson.title}</strong>
          <div class="text-muted">${lesson.description}</div>
        </div>
      </div>
      <div class="daily-lesson-steps">
        ${lesson.steps.map((step, i) => `
          <div class="daily-lesson-step">
            <span class="daily-lesson-num">${i + 1}</span>
            <span>${step}</span>
          </div>
        `).join('')}
      </div>
      ${lesson.tip ? `<div class="daily-lesson-tip">💡 ${lesson.tip}</div>` : ''}
    </div>
  `;
}
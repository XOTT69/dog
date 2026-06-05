/**
 * @fileoverview AI interaction — context building, API calls, fallback
 */

import { state, STORAGE_KEYS } from './state.js';
import { getIdToken } from './firebase.js';
import { AI_PRIMARY_MODEL, MAX_AI_TOKENS, AI_TIMEOUT_MS } from './constants.js';
import { getAgeInWeeks, weekLabel, calcToiletStats, todayKey } from './utils.js';
import { getBreedProfile } from './content-loader.js';
import { MS_PER_DAY } from './constants.js';

/**
 * Build system prompt with pet context
 * @returns {string}
 */
function buildSystemPrompt() {
  const pet = state.pet.data;
  const weeks = getAgeInWeeks(pet?.birthDate);
  const breed = getBreedProfile(pet?.breed);
  const toiletMode = pet?.toiletMode || 'pad';
  const toiletLabel = { pad: 'пелюшка вдома', outdoor: 'вулиця', transition: 'перехід з пелюшки на вулицю' }[toiletMode] || 'пелюшка';

  let petContext = '';
  if (pet) {
    petContext = `Собака: ${pet.name || '?'}, ${weekLabel(weeks)}, ${pet.breed || 'метис'}, стать: ${pet.sex || '?'}, туалет: ${toiletLabel}`;
    if (pet.issues) petContext += `, проблеми: ${pet.issues}`;
    if (breed) petContext += `, енергія: ${breed.energy}, навчання: ${breed.trainability}`;

    // Last 7 days stats
    const now = Date.now();
    const weekAgo = now - 7 * MS_PER_DAY;
    const last7 = state.events.items.filter(e => {
      const ts = e.createdAt?.toDate ? e.createdAt.toDate() : new Date(e.createdAt);
      return ts && ts.getTime() >= weekAgo;
    });
    const stats = calcToiletStats(last7);
    if (stats.rate !== null) petContext += `, горшик за тиждень: ${stats.rate}%`;
    const trainings = last7.filter(e => e.eventType === 'training').length;
    petContext += `, тренувань за тиждень: ${trainings}`;
  }

  return `Ти — професійний український кінолог з 15-річним досвідом.

ОБОВ'ЯЗКОВІ ПРАВИЛА:
1. Відповідай ТІЛЬКИ українською мовою, грамотно.
2. Давай конкретні покрокові інструкції (3–6 кроків).
3. Кожен крок — одне речення, зрозуміле навіть новачку.
4. Враховуй вік, породу, розмір, режим туалету, проблеми.
5. Для цуценят до 16 тижнів — ТІЛЬКИ адаптація і соціалізація, без вимог.
6. Ніяких покарань, крику, фізичного впливу.
7. Використовуй клікер/маркер "Так!" як основний інструмент.
8. Якщо проблема серйозна (агресія з кров'ю, травми) — рекомендуй кінолога.

${petContext}`;
}

/**
 * Call AI API with retry/fallback
 * @param {string} userPrompt
 * @returns {Promise<string>}
 */
export async function fetchAIResponse(userPrompt) {
  const systemPrompt = buildSystemPrompt();

  try {
    const token = await getIdToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    const response = await fetch('/api/proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: AI_PRIMARY_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: MAX_AI_TOKENS,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    if (data.choices?.[0]?.message?.content) {
      return data.choices[0].message.content.trim();
    }
    throw new Error('Empty response');
  } catch (e) {
    console.warn('[AI] Error, using fallback:', e.message);
    return getLocalFallback(userPrompt);
  }
}

/**
 * Generate AI plan for today (cached)
 * @returns {Promise<string[]>}
 */
export async function generateDailyPlan() {
  const cached = localStorage.getItem(STORAGE_KEYS.aiPlan);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed.date === todayKey() && Array.isArray(parsed.lines)) {
        return parsed.lines;
      }
    } catch { /* ignore */ }
  }

  const pet = state.pet.data;
  if (!pet?.name) return [];

  const weeks = getAgeInWeeks(pet.birthDate);
  const prompt = `Створи план на СЬОГОДНІ для собаки:
- ${pet.name}, ${weekLabel(weeks)}, ${pet.breed || '?'}, туалет: ${pet.toiletMode || 'pad'}
${pet.issues ? `- Проблеми: ${pet.issues}` : ''}
Дай 4-5 пунктів, кожен 1 речення.`;

  try {
    const response = await fetchAIResponse(prompt);
    const lines = response.split('\n').filter(l => l.trim()).slice(0, 8);
    localStorage.setItem(STORAGE_KEYS.aiPlan, JSON.stringify({ date: todayKey(), lines }));
    return lines;
  } catch {
    return [];
  }
}

/**
 * Local fallback responses when AI is unavailable
 * @param {string} prompt
 * @returns {string}
 */
function getLocalFallback(prompt) {
  const l = prompt.toLowerCase();
  const toiletMode = state.pet.data?.toiletMode || 'pad';

  const responses = {
    sit: '1. Візьміть ласощі в руку, покажіть собаці.\n2. Повільно підніміть руку над головою — собака сяде автоматично.\n3. В момент коли сіла — клікер/маркер "Так!" + ласощі.\n4. Повторіть 5–8 разів. Перерва 30 хв.\n5. Коли стабільно сідає за рукою — додайте слово "Сидіти" перед жестом.\n6. Тренуйте 2–3 рази на день по 2 хвилини.',
    biting: '1. Кусає → завмріть як статуя. Не відсмикуйте руку!\n2. Скажіть "Ай" спокійно + відверніться на 3–5 секунд.\n3. Після паузи — запропонуйте іграшку.\n4. Жує іграшку спокійно → клікер + "Молодець!"\n5. Не зупиняється після 3 спроб → вийдіть з кімнати на 30 сек.\n6. Перевірте: чи достатньо спить? Перевтомлене цуценя ЗАВЖДИ кусається!',
    barking: '1. Визначте що тригерить гавкіт (двері, вікно, самотність, увага).\n2. Не кричіть "тихо!" — для собаки це ви "гавкаєте разом".\n3. Зачекайте ПАУЗУ в гавкоті (хоч 1 секунду) → клікер + ласощі.\n4. Перенаправте увагу ДО початку: побачила тригер → кличте до себе.\n5. Закрийте візуальний доступ до тригера (штори, плівка).\n6. Розумове навантаження зменшує потребу гавкати: нюхові ігри 15 хв/день.',
    toilet_pad: '1. Обмежте простір: манеж або одна кімната.\n2. Після сну/їжі/гри — мовчки несіть на пелюшку.\n3. Стійте тихо поруч, чекайте до 5 хвилин.\n4. Зробила → ОДРАЗУ клікер + ласощі + свято!\n5. Промах → 0 емоцій. Мовчки прибрати ензимним засобом.\n6. Записуйте час кожного туалету. Через 3 дні побачите патерн.',
    toilet_outdoor: '1. Виходьте за графіком: після сну, через 20 хв після їжі, після гри.\n2. Завжди в одне й те саме місце — запах допомагає.\n3. Стійте тихо, не гуляйте поки не зробить.\n4. Зробила → СВЯТО! Клікер + ласощі + похвала голосом.\n5. Зробила вдома → мовчки прибрати ензимним засобом.\n6. Записуйте час — знайдете патерн за 3–5 днів.',
    toilet_transition: '1. Визначте час коли собака зазвичай ходить в туалет (після сну, їжі, гри).\n2. В ЦІ моменти — одразу на вулицю. Не чекайте.\n3. На вулиці стійте тихо в одному місці до 5 хвилин.\n4. Зробила НА ВУЛИЦІ → свято! Клікер + суперласощі + голос!\n5. На пелюшку вдома — без реакції (не хвалити, не карати).\n6. Пелюшку НЕ забирайте різко. Зменшуйте поступово.',
    leash: '1. Тягне = ви ЗУПИНЯЄТЕСЬ. Стоїте як стовп.\n2. Повідок провис (вільний) = йдемо далі. Це нагорода!\n3. Кожні 10–15 кроків без натягу — ласощі біля вашої ноги.\n4. Несподівано змініть напрямок — хай слідкує за ВАМИ.\n5. Ніяких рулеток! Тільки фіксований повідок 1.5–2м.\n6. Перші тижні тренувальні прогулянки — лише 10–15 хвилин.',
  };

  if (l.includes('сидіти') || l.includes('сідати')) return responses.sit;
  if (l.includes('кусає') || l.includes('кусат')) return responses.biting;
  if (l.includes('гавк')) return responses.barking;
  if (l.includes('повідок') || l.includes('тягне')) return responses.leash;
  if (l.includes('пелюшк') || l.includes('туалет')) {
    return responses[`toilet_${toiletMode}`] || responses.toilet_pad;
  }

  return 'Задайте конкретне питання — наприклад "Як навчити сидіти?" або "Чому кусається?" 🐾';
}

/**
 * Track AI usage
 */
export function trackAIUsage() {
  const count = parseInt(localStorage.getItem(STORAGE_KEYS.aiCount) || '0') + 1;
  localStorage.setItem(STORAGE_KEYS.aiCount, String(count));
}

/**
 * Clean Dog Coach app controller.
 * Preserves Firebase auth/data contracts, replaces the legacy UI/render stack.
 */

import { state, subscribe, persistTheme } from './state.js';
import {
  initAuth, loginGoogle, logout, ensureWorkspace,
  subscribePets, subscribeEvents, subscribeReminders, subscribeMembers, subscribeAiMessages,
  switchPet, addPet, savePetProfile, addEvent,
  addReminder, updateReminder, deleteReminder,
  subscribePush, saveAiMessage, clearAiMessages, getIdToken,
} from './firebase.js';
import { getCourses, getKnowledge, getProtocols, preloadAll } from './content-loader.js';
import { fetchAIResponse, clearChatHistory } from './ai.js';
import { unlock as unlockAudio } from './audio.js';
import { getNextHealthEvents, getOverdueHealthEvents, renderHealthSchedule } from './vaccination.js';
import {
  $, $$, escapeHtml, haptic, localDateKey, nowTime, startOfToday, todayKey,
  tsToDate, getAgeInWeeks, weekLabel, avatarLetter, calcToiletStats, daysBetween,
} from './utils.js';

const EVENT_TYPES = [
  { id: 'pee_success', label: 'Пісяв правильно', group: 'toilet', short: 'Туалет', value: false },
  { id: 'pee_miss', label: 'Промах', group: 'toilet', short: 'Промах', value: false },
  { id: 'poo_success', label: 'Какав правильно', group: 'toilet', short: 'Туалет', value: false },
  { id: 'poo_miss', label: 'Мимо', group: 'toilet', short: 'Мимо', value: false },
  { id: 'walk', label: 'Прогулянка', group: 'activity', short: 'Прогулянка', value: false },
  { id: 'training', label: 'Тренування', group: 'activity', short: 'Тренування', value: false },
  { id: 'meal_morning', label: 'Сніданок', group: 'food', short: 'Сніданок', value: false },
  { id: 'meal_evening', label: 'Вечеря', group: 'food', short: 'Вечеря', value: false },
  { id: 'water', label: 'Вода', group: 'food', short: 'Вода', value: false },
  { id: 'weight', label: 'Вага', group: 'health', short: 'Вага', value: true },
  { id: 'medicine', label: 'Ліки', group: 'health', short: 'Ліки', value: false },
  { id: 'vet_visit', label: 'Ветеринар', group: 'health', short: 'Ветеринар', value: false },
  { id: 'grooming', label: 'Грумінг', group: 'care', short: 'Грумінг', value: false },
  { id: 'note', label: 'Нотатка', group: 'other', short: 'Нотатка', value: false },
];

const REMINDER_TYPES = [
  { id: 'walk', label: 'Прогулянка', repeat: 'daily' },
  { id: 'food', label: 'Годування', repeat: 'daily' },
  { id: 'training', label: 'Тренування', repeat: 'daily' },
  { id: 'medicine', label: 'Ліки', repeat: 'daily' },
  { id: 'vaccine', label: 'Вакцинація', repeat: 'once' },
  { id: 'grooming', label: 'Грумінг', repeat: 'weekly' },
  { id: 'vet', label: 'Ветеринар', repeat: 'once' },
  { id: 'heat', label: 'Тічка', repeat: 'once' },
  { id: 'custom', label: 'Своє', repeat: 'once' },
];

const app = {
  tab: 'tabToday',
  eventType: 'pee_success',
  academySection: 'programs',
  diaryFilter: 'all',
  calendarFilter: 'all',
  petModalMode: 'edit',
  aiPending: false,
  renderQueued: false,
};

boot();

function boot() {
  applyTheme();
  bindGlobalEvents();
  bindForms();
  initAuthFlow();
  updateOnlineStatus();
}

function initAuthFlow() {
  initAuth(async (user) => {
    if (!user) {
      showAuth();
      return;
    }

    hideAuth();
    showLoading();

    try {
      await ensureWorkspace(user);
      subscribePets();
      subscribeEvents();
      subscribeReminders();
      subscribeMembers();
      subscribeAiMessages();
      await waitForInitialData();

      $('appContent')?.classList.remove('hidden');
      renderApp();
      setTimeout(() => preloadAll(), 500);

      if (!state.pet.data?.name?.trim()) {
        openPetModal('edit', { force: true });
      }
      if ('Notification' in window && Notification.permission === 'granted') {
        subscribePush();
      }
    } catch (err) {
      console.error('[Boot]', err);
      toast('Помилка завантаження', 'error');
      showAuth();
    } finally {
      hideLoading();
    }
  });
}

function waitForInitialData() {
  return new Promise((resolve) => {
    const done = () => !state.pets.loading && !state.events.loading;
    if (done()) { resolve(); return; }
    const unsub = subscribe(['pets', 'events'], () => {
      if (done()) {
        unsub();
        resolve();
      }
    });
    setTimeout(() => {
      unsub();
      resolve();
    }, 2500);
  });
}

function bindGlobalEvents() {
  document.addEventListener('click', handleClick);
  document.addEventListener('submit', handleDelegatedSubmit);
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  const unlock = () => {
    unlockAudio();
    document.removeEventListener('touchstart', unlock);
    document.removeEventListener('click', unlock);
  };
  document.addEventListener('touchstart', unlock, { once: true });
  document.addEventListener('click', unlock, { once: true });

  subscribe(['pet', 'pets', 'events', 'reminders', 'members', 'aiChat', 'ui.theme'], scheduleRender);
}

async function handleDelegatedSubmit(e) {
  if (e.target?.id !== 'joinWorkspaceForm') return;
  e.preventDefault();
  await joinWorkspaceByCode();
}

function bindForms() {
  $('googleLoginBtn')?.addEventListener('click', async () => {
    showLoading();
    try {
      await loginGoogle();
    } catch (err) {
      toast(err.message || 'Помилка входу', 'error');
    } finally {
      hideLoading();
    }
  });

  $('eventForm')?.addEventListener('submit', saveEventFromForm);
  $('reminderForm')?.addEventListener('submit', saveReminderFromForm);
  $('petForm')?.addEventListener('submit', savePetFromForm);
  $('aiForm')?.addEventListener('submit', submitAi);
}

async function handleClick(e) {
  const closeId = e.target.closest('[data-close-modal]')?.dataset.closeModal;
  if (closeId) {
    closeModal(closeId);
    return;
  }

  const tabBtn = e.target.closest('[data-tab]');
  if (tabBtn) {
    setTab(tabBtn.dataset.tab);
    haptic();
    return;
  }

  const petBtn = e.target.closest('[data-pet-id]');
  if (petBtn) {
    switchPet(petBtn.dataset.petId);
    renderApp();
    haptic();
    return;
  }

  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action) {
    await runAction(action, e.target.closest('[data-action]'));
    return;
  }

  const quick = e.target.closest('[data-quick-event]');
  if (quick) {
    await quickAddEvent(quick.dataset.quickEvent);
    return;
  }

  const eventType = e.target.closest('[data-event-type]');
  if (eventType) {
    app.eventType = eventType.dataset.eventType;
    renderEventTypes();
    $('eventValueWrap')?.classList.toggle('hidden', !getEventDef(app.eventType)?.value);
    return;
  }

  const reminderType = e.target.closest('[data-reminder-type]');
  if (reminderType) {
    openReminderModal(reminderType.dataset.reminderType);
    return;
  }

  const reminderDone = e.target.closest('[data-reminder-done]');
  if (reminderDone) {
    await updateReminder(reminderDone.dataset.reminderDone, { done: reminderDone.checked });
    return;
  }

  const reminderDelete = e.target.closest('[data-reminder-delete]');
  if (reminderDelete) {
    const ok = await confirmDialog('Видалити задачу?', 'Вона зникне з календаря.', 'Видалити', true);
    if (ok) await deleteReminder(reminderDelete.dataset.reminderDelete);
    return;
  }

  const academy = e.target.closest('[data-academy]');
  if (academy) {
    app.academySection = academy.dataset.academy;
    renderAcademy();
    return;
  }

  const diaryFilter = e.target.closest('[data-diary-filter]');
  if (diaryFilter) {
    app.diaryFilter = diaryFilter.dataset.diaryFilter;
    renderDiary();
    return;
  }

  const calendarFilter = e.target.closest('[data-calendar-filter]');
  if (calendarFilter) {
    app.calendarFilter = calendarFilter.dataset.calendarFilter;
    renderCalendar();
    return;
  }
}

async function runAction(action) {
  switch (action) {
    case 'open-event': openEventModal(); break;
    case 'open-reminder': openReminderModal('custom'); break;
    case 'open-pet': openPetModal('edit'); break;
    case 'add-pet': openPetModal('new'); break;
    case 'open-ai': openAiModal(); break;
    case 'logout': await logoutFlow(); break;
    case 'theme': toggleTheme(); break;
    case 'export': exportData(); break;
    case 'copy-invite': copyInvite(); break;
    case 'enable-push': enablePush(); break;
    case 'clear-ai': clearAi(); break;
  }
}

function renderApp() {
  renderHeader();
  renderPetSwitcher();
  renderActiveTab();
  renderAiMessages();
}

function scheduleRender() {
  if (app.renderQueued) return;
  app.renderQueued = true;
  requestAnimationFrame(() => {
    app.renderQueued = false;
    renderApp();
  });
}

function setTab(tabId) {
  app.tab = tabId;
  $$('.screen').forEach((screen) => {
    const active = screen.id === tabId;
    screen.classList.toggle('active', active);
    screen.hidden = !active;
    screen.setAttribute('aria-hidden', String(!active));
  });
  $$('.nav-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabId));
  renderActiveTab();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderActiveTab() {
  if (app.tab === 'tabToday') renderToday();
  else if (app.tab === 'tabCalendar') renderCalendar();
  else if (app.tab === 'tabAcademy') renderAcademy();
  else if (app.tab === 'tabDiary') renderDiary();
  else if (app.tab === 'tabProfile') renderProfile();
}

function renderHeader() {
  const pet = state.pet.data;
  const user = state.auth.user;
  const name = pet?.name?.trim() || 'Додайте тварину';
  const weeks = getAgeInWeeks(pet?.birthDate);
  const meta = [pet?.petType === 'cat' ? 'Кіт' : 'Собака', weekLabel(weeks), pet?.breed].filter(Boolean).join(' · ');

  setText('headerPetName', name);
  setText('headerPetMeta', meta || user?.email || 'Профіль');
  setText('petAvatarBtn', avatarLetter(name));
  $('petAvatarBtn')?.setAttribute('data-action', 'open-pet');
}

function renderPetSwitcher() {
  const box = $('petSwitcher');
  if (!box) return;
  const pets = state.pets.items;
  box.innerHTML = pets.map((pet) => `
    <button class="pet-chip ${pet.id === state.ui.currentPetId ? 'active' : ''}" data-pet-id="${escapeHtml(pet.id)}" type="button">
      ${escapeHtml(pet.data?.name || 'Без імені')}
    </button>
  `).join('') + '<button class="pet-chip" data-action="add-pet" type="button">+ Додати</button>';
}

function renderToday() {
  const view = $('todayView');
  if (!view) return;
  const pet = state.pet.data || {};
  const todayEvents = getTodayEvents();
  const stats = calcToiletStats(todayEvents);
  const reminders = getTodayReminders();
  const next = reminders.find((r) => !r.done);

  view.innerHTML = `
    <section class="hero-card">
      <div class="hero-top">
        <div>
          <span class="overline">Сьогодні</span>
          <h2>${next ? escapeHtml(next.title) : 'План на день чистий'}</h2>
          <p>${next ? `${escapeHtml(next.time || 'Без часу')} · ${repeatLabel(next.repeat)}` : 'Додайте прогулянку, годування або тренування.'}</p>
        </div>
        <button class="secondary-btn" data-action="open-ai" type="button">AI</button>
      </div>
      <div class="hero-actions">
        <button class="primary-btn" data-action="open-event" type="button">Швидкий запис</button>
        <button class="secondary-btn" data-action="open-reminder" type="button">Задача</button>
      </div>
    </section>

    <section class="metrics-grid">
      <div class="metric-card"><strong>${todayEvents.length}</strong><span>записів</span></div>
      <div class="metric-card"><strong>${stats.rate ?? 0}%</strong><span>туалет</span></div>
      <div class="metric-card"><strong>${todayEvents.filter(e => e.eventType === 'training').length}</strong><span>тренувань</span></div>
    </section>

    <section class="emergency-card">
      <span class="overline">Екстрено</span>
      <h2>Коли не чекати</h2>
      <p>Їдьте до ветеринара зараз, якщо є проблеми з диханням, судоми, кров, сильна млявість, багаторазова блювота, здуття живота або підозра на отруєння.</p>
      <ul>
        <li>Людські ліки не давати без ветеринара.</li>
        <li>При отруєнні або сторонньому предметі час критичний.</li>
      </ul>
    </section>

    <div class="section-head"><div><h2>Швидкий запис</h2><p>Найчастіші дії для ${escapeHtml(pet.name || 'тварини')}</p></div></div>
    <section class="quick-grid">
      ${quickButtons().map(btn => `
        <button class="quick-btn" data-quick-event="${btn.id}" type="button">
          <strong>${escapeHtml(btn.title)}</strong><span>${escapeHtml(btn.meta)}</span>
        </button>
      `).join('')}
    </section>

    <div class="section-head"><div><h2>Нагадування</h2><p>Найближчі задачі</p></div><button class="text-btn" data-action="open-reminder" type="button">Додати</button></div>
    <section class="agenda-list">${renderReminderRows(reminders.slice(0, 6))}</section>
  `;
}

function renderCalendar() {
  const view = $('calendarView');
  if (!view) return;
  const reminders = getCalendarReminders();
  view.innerHTML = `
    <section class="hero-card">
      <div class="hero-top">
        <div><span class="overline">Календар</span><h2>${reminders.length} задач у плані</h2><p>Прогулянки, їжа, ліки, тренування і ветеринарні дати.</p></div>
        <button class="primary-btn" data-action="open-reminder" type="button">Додати</button>
      </div>
    </section>
    <div class="filters">
      ${['all:Усе','walk:Прогулянки','food:Їжа','training:Тренування','health:Здоровʼя'].map(item => {
        const [id, label] = item.split(':');
        return `<button class="filter-pill ${app.calendarFilter === id ? 'active' : ''}" data-calendar-filter="${id}" type="button">${label}</button>`;
      }).join('')}
    </div>
    <section class="agenda-list">${renderReminderRows(reminders)}</section>
    <div class="section-head"><div><h2>Шаблони</h2><p>Додайте задачу в один дотик</p></div></div>
    <section class="calendar-type-grid">
      ${REMINDER_TYPES.map(t => `<button class="type-btn" data-reminder-type="${t.id}" type="button"><strong>${t.label}</strong><span>${repeatLabel(t.repeat)}</span></button>`).join('')}
    </section>
  `;
}

async function renderAcademy() {
  const view = $('academyView');
  if (!view) return;
  view.innerHTML = `
    <section class="hero-card">
      <div class="hero-top">
        <div><span class="overline">Академія</span><h2>Навчання без хаосу</h2><p>Програми, проблеми поведінки, урок дня і база знань окремо.</p></div>
        <button class="secondary-btn" data-action="open-ai" type="button">AI coach</button>
      </div>
    </section>
    <div class="tabs">
      ${['programs:Програми','problems:Проблеми','lesson:Урок дня','knowledge:База'].map(item => {
        const [id, label] = item.split(':');
        return `<button class="tab-pill ${app.academySection === id ? 'active' : ''}" data-academy="${id}" type="button">${label}</button>`;
      }).join('')}
    </div>
    <div id="academyContent"><div class="empty-state">Завантаження...</div></div>
  `;
  await renderAcademyContent();
}

async function renderAcademyContent() {
  const box = $('academyContent');
  if (!box) return;
  try {
    if (app.academySection === 'programs') {
      const courses = await getCourses();
      box.innerHTML = courses.slice(0, 8).map(c => `
        <article class="course-card">
          <h3>${escapeHtml(c.title)}</h3><p>${escapeHtml(c.description)}</p>
          <footer><span>${escapeHtml(c.level || 'курс')}</span><button class="text-btn" data-action="open-ai" type="button">Питання</button></footer>
        </article>
      `).join('');
    } else if (app.academySection === 'problems') {
      const protocols = await getProtocols();
      box.innerHTML = protocols.slice(0, 8).map(p => `
        <article class="course-card">
          <h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.duration || 'Покроковий план')}</p>
          <ol class="steps-list">${(p.steps || []).slice(0, 4).map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ol>
        </article>
      `).join('');
    } else if (app.academySection === 'lesson') {
      box.innerHTML = `
        <article class="panel">
          <span class="overline">5 хвилин</span>
          <h2>Контакт перед рухом</h2>
          <p>Дочекайтесь погляду, скажіть маркер “Так”, дайте ласощі. Зробіть один крок і нагородіть за спокійний контакт. 5 повторів достатньо.</p>
        </article>
      `;
    } else {
      const knowledge = await getKnowledge();
      box.innerHTML = knowledge.map(k => `
        <article class="course-card"><h3>${escapeHtml(k.title)}</h3><p>${escapeHtml(k.text)}</p><footer><span>${escapeHtml(k.tag || 'знання')}</span></footer></article>
      `).join('');
    }
  } catch {
    box.innerHTML = '<div class="empty-state">Не вдалося завантажити матеріали.</div>';
  }
}

function renderDiary() {
  const view = $('diaryView');
  if (!view) return;
  const events = filteredEvents();
  view.innerHTML = `
    <section class="hero-card">
      <div><span class="overline">Щоденник</span><h2>${events.length} записів</h2><p>Історія, фільтри і базова аналітика.</p></div>
    </section>
    <div class="filters">
      ${['all:Усе','toilet:Туалет','food:Їжа','activity:Активність','health:Здоровʼя'].map(item => {
        const [id, label] = item.split(':');
        return `<button class="filter-pill ${app.diaryFilter === id ? 'active' : ''}" data-diary-filter="${id}" type="button">${label}</button>`;
      }).join('')}
    </div>
    <section class="panel">
      ${events.length ? events.slice(0, 60).map(renderEventRow).join('') : '<div class="empty-state">Поки немає записів.</div>'}
    </section>
  `;
}

function renderProfile() {
  const view = $('profileView');
  if (!view) return;
  const pet = state.pet.data || {};
  view.innerHTML = `
    <section class="hero-card">
      <div class="hero-top">
        <div><span class="overline">Профіль</span><h2>${escapeHtml(pet.name || 'Тварина')}</h2><p>${escapeHtml([pet.breed, weekLabel(getAgeInWeeks(pet.birthDate)), pet.sex].filter(Boolean).join(' · ') || 'Заповніть профіль')}</p></div>
        <button class="primary-btn" data-action="open-pet" type="button">Редагувати</button>
      </div>
    </section>
    <div class="profile-grid">
      <article class="profile-card">
        <h3>Команда</h3>
        <p>${state.members.items.length || 1} учасник(ів) · код ${escapeHtml(state.workspace.data?.inviteCode || '—')}</p>
        <button class="text-btn" data-action="copy-invite" type="button">Копіювати код</button>
        <form id="joinWorkspaceForm" class="inline-form">
          <input id="joinWorkspaceCode" type="text" placeholder="Код запрошення" maxlength="12" autocomplete="off">
          <button class="secondary-btn" type="submit">Приєднатися</button>
        </form>
        <div class="member-list">
          ${state.members.items.map(member => `<span>${escapeHtml(member.displayName || member.email || 'Учасник')}</span>`).join('') || '<span>Тільки ви</span>'}
        </div>
      </article>
      <article class="profile-card"><h3>Сповіщення</h3><p>${pushStatus()}</p><button class="text-btn" data-action="enable-push" type="button">Увімкнути</button></article>
      <article class="profile-card"><h3>Дані</h3><p>Експорт щоденника і профілю.</p><button class="text-btn" data-action="export" type="button">Експорт JSON</button></article>
    </div>
    <div class="section-head"><div><h2>Здоров'я</h2><p>Автоматичний графік за віком</p></div></div>
    <section class="panel"><div id="healthScheduleMount"></div></section>
  `;
  renderHealthSchedule($('healthScheduleMount'));
}

function renderReminderRows(items) {
  if (!items.length) return '<div class="empty-state">Немає задач. Додайте першу в календар.</div>';
  return items.map(r => `
    <article class="agenda-row ${r.done ? 'done' : ''}">
      ${r.virtual ? '<span class="agenda-dot"></span>' : `<input class="agenda-check" type="checkbox" data-reminder-done="${escapeHtml(r.id)}" ${r.done ? 'checked' : ''} aria-label="Виконано">`}
      <div><strong>${escapeHtml(r.title)}</strong><small>${escapeHtml([r.date, r.note || repeatLabel(r.repeat)].filter(Boolean).join(' · '))}</small></div>
      <time>${escapeHtml(r.time || '—')}</time>
    </article>
  `).join('');
}

function renderEventRow(e) {
  const def = getEventDef(e.eventType);
  return `<article class="diary-item"><div><strong>${escapeHtml(def?.label || e.eventType)}</strong><small>${escapeHtml([formatEventDate(e), e.note].filter(Boolean).join(' · '))}</small></div><small>${escapeHtml(e.timeLabel || '')}</small></article>`;
}

function openEventModal(type = 'pee_success') {
  app.eventType = type;
  renderEventTypes();
  $('eventTime').value = nowTime();
  $('eventNote').value = '';
  $('eventValue').value = '';
  $('eventValueWrap')?.classList.toggle('hidden', !getEventDef(type)?.value);
  openModal('eventModal');
}

function renderEventTypes() {
  const grid = $('eventTypeGrid');
  if (!grid) return;
  grid.innerHTML = EVENT_TYPES.map(t => `<button class="type-btn ${app.eventType === t.id ? 'active' : ''}" data-event-type="${t.id}" type="button"><strong>${escapeHtml(t.short)}</strong><span>${escapeHtml(t.label)}</span></button>`).join('');
}

function openReminderModal(type = 'custom') {
  const def = REMINDER_TYPES.find(t => t.id === type) || REMINDER_TYPES.at(-1);
  const select = $('reminderType');
  select.innerHTML = REMINDER_TYPES.map(t => `<option value="${t.id}">${t.label}</option>`).join('');
  select.value = def.id;
  $('reminderTitle').value = def.label;
  $('reminderDate').value = localDateKey();
  $('reminderTime').value = '';
  $('reminderRepeat').value = def.repeat;
  $('reminderNote').value = '';
  openModal('reminderModal');
}

function openPetModal(mode = 'edit', opts = {}) {
  app.petModalMode = mode;
  const pet = mode === 'new' ? {} : (state.pet.data || {});
  setText('petModalTitle', mode === 'new' ? 'Нова тварина' : 'Профіль тварини');
  $('petNameInput').value = pet.name || '';
  $('petTypeInput').value = pet.petType || 'dog';
  $('petBirthInput').value = pet.birthDate || '';
  $('petSexInput').value = pet.sex || 'хлопчик';
  $('petBreedInput').value = pet.breed || '';
  $('petWeightInput').value = pet.weight || '';
  $('petToiletInput').value = pet.toiletMode || 'pad';
  $('petVaccineInput').value = pet.lastVaccine || '';
  $('petDewormingInput').value = pet.lastDeworming || '';
  $('petHeatInput').value = pet.lastHeat || '';
  $('petIssuesInput').value = pet.issues || '';
  openModal('petModal');
  if (opts.force) $('petModal').dataset.force = 'true';
}

function openAiModal() {
  renderAiMessages();
  openModal('aiModal');
  $('aiInput')?.focus();
}

async function saveEventFromForm(e) {
  e.preventDefault();
  const payload = {
    eventType: app.eventType,
    timeLabel: $('eventTime').value || nowTime(),
    note: $('eventNote').value.trim(),
  };
  const value = $('eventValue').value;
  if (value) payload.value = Number(value);
  try {
    await addEvent(payload);
    closeModal('eventModal');
    toast('Запис додано', 'success');
  } catch (err) {
    console.error(err);
    toast('Не вдалося зберегти', 'error');
  }
}

async function saveReminderFromForm(e) {
  e.preventDefault();
  try {
    await addReminder({
      title: $('reminderTitle').value.trim(),
      type: $('reminderType').value,
      date: $('reminderDate').value || localDateKey(),
      time: $('reminderTime').value,
      repeat: $('reminderRepeat').value,
      note: $('reminderNote').value.trim(),
    });
    closeModal('reminderModal');
    toast('Задачу додано', 'success');
  } catch (err) {
    console.error(err);
    toast('Не вдалося додати задачу', 'error');
  }
}

async function savePetFromForm(e) {
  e.preventDefault();
  const payload = {
    name: $('petNameInput').value.trim(),
    petType: $('petTypeInput').value,
    birthDate: $('petBirthInput').value,
    sex: $('petSexInput').value,
    breed: $('petBreedInput').value.trim(),
    weight: $('petWeightInput').value,
    toiletMode: $('petToiletInput').value,
    lastVaccine: $('petVaccineInput').value,
    lastDeworming: $('petDewormingInput').value,
    lastHeat: $('petHeatInput').value,
    issues: $('petIssuesInput').value.trim(),
  };
  if (!payload.name) {
    toast('Додайте імʼя', 'error');
    return;
  }
  try {
    if (app.petModalMode === 'new') {
      const petId = await addPet(payload);
      await savePetProfile(payload, petId);
    } else {
      await savePetProfile(payload);
    }
    $('petModal').dataset.force = '';
    closeModal('petModal');
    toast('Профіль збережено', 'success');
  } catch (err) {
    console.error(err);
    toast('Не вдалося зберегти профіль', 'error');
  }
}

async function submitAi(e) {
  e.preventDefault();
  const input = $('aiInput');
  const prompt = input.value.trim();
  if (!prompt || app.aiPending) return;
  input.value = '';
  app.aiPending = true;
  renderAiMessages('Думаю...');
  try {
    await saveAiMessage({ role: 'user', content: prompt });
    const response = await fetchAIResponse(prompt);
    await saveAiMessage({ role: 'assistant', content: response });
  } catch (err) {
    console.error(err);
    toast('AI тимчасово недоступний', 'error');
  } finally {
    app.aiPending = false;
    renderAiMessages();
  }
}

function renderAiMessages(pendingText = '') {
  const context = $('aiContext');
  const list = $('aiMessages');
  if (context) {
    const pet = state.pet.data;
    context.textContent = pet?.name ? `${pet.name} · ${weekLabel(getAgeInWeeks(pet.birthDate))}${pet.issues ? ` · фокус: ${pet.issues}` : ''}` : 'Заповніть профіль для точніших порад.';
  }
  if (!list) return;
  const items = state.aiChat.items;
  if (!items.length && !pendingText) {
    list.innerHTML = '<div class="empty-state">Напишіть питання про поведінку, здоровʼя або тренування.</div>';
    return;
  }
  list.innerHTML = items.map(m => `<div class="ai-msg ${m.role === 'user' ? 'user' : 'assistant'}">${escapeHtml(m.content)}</div>`).join('') +
    (pendingText ? `<div class="ai-msg assistant">${escapeHtml(pendingText)}</div>` : '');
  list.scrollTop = list.scrollHeight;
}

async function quickAddEvent(type) {
  try {
    await addEvent({ eventType: type });
    toast('Записано', 'success');
    haptic();
  } catch {
    toast('Не вдалося записати', 'error');
  }
}

async function logoutFlow() {
  const ok = await confirmDialog('Вийти з акаунта?', 'Дані залишаться у вашому workspace.', 'Вийти', true);
  if (!ok) return;
  await logout();
  showAuth();
}

function toggleTheme() {
  state.ui.theme = state.ui.theme === 'dark' ? 'light' : 'dark';
  applyTheme();
  persistTheme();
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.ui.theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', state.ui.theme === 'dark' ? '#121310' : '#f7f4ef');
}

function openModal(id) {
  const el = $(id);
  if (!el) return;
  el.classList.remove('hidden');
  el.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  const el = $(id);
  if (!el) return;
  if (id === 'petModal' && el.dataset.force === 'true' && !state.pet.data?.name?.trim()) return;
  el.classList.add('hidden');
  el.setAttribute('aria-hidden', 'true');
  if (!document.querySelector('.modal:not(.hidden)')) document.body.style.overflow = '';
}

function confirmDialog(title, message, okText = 'Так', danger = false) {
  setText('confirmTitle', title);
  setText('confirmMessage', message);
  setText('confirmOkBtn', okText);
  $('confirmOkBtn')?.classList.toggle('danger', danger);
  openModal('confirmModal');
  return new Promise((resolve) => {
    const ok = $('confirmOkBtn');
    const cancel = $('confirmCancelBtn');
    const backdrop = document.querySelector('[data-confirm-cancel]');
    const cleanup = (value) => {
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      backdrop?.removeEventListener('click', onCancel);
      closeModal('confirmModal');
      resolve(value);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    backdrop?.addEventListener('click', onCancel);
  });
}

function toast(message, type = '') {
  const box = $('toastContainer');
  if (!box) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 220);
  }, 2600);
}

function showLoading() { $('loadingOverlay')?.classList.remove('hidden'); }
function hideLoading() { $('loadingOverlay')?.classList.add('hidden'); }
function showAuth() {
  $('authScreen')?.classList.remove('hidden');
  $('appContent')?.classList.add('hidden');
  hideLoading();
}
function hideAuth() { $('authScreen')?.classList.add('hidden'); }

function updateOnlineStatus() {
  $('offlineBar')?.classList.toggle('visible', !navigator.onLine);
}

function getTodayEvents() {
  const start = startOfToday();
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return state.events.items.filter(e => {
    const date = tsToDate(e.createdAt);
    return date && date >= start && date < end;
  });
}

function getTodayReminders() {
  const key = todayKey();
  const calendar = state.reminders.items
    .filter(r => r.date === key)
    .sort(sortByTime);
  const health = [...getOverdueHealthEvents(), ...getNextHealthEvents(3)]
    .map(e => ({
      id: `health_${e.type}_${e.date.getTime()}`,
      title: e.name,
      date: localDateKey(e.date),
      time: '',
      repeat: 'once',
      note: e.desc,
      done: false,
      virtual: true,
    }));
  return [...calendar, ...health].slice(0, 8);
}

function getCalendarReminders() {
  const filter = app.calendarFilter;
  const healthTypes = ['medicine', 'vaccine', 'vet', 'grooming', 'heat'];
  return state.reminders.items
    .filter(r => {
      if (filter === 'all') return true;
      if (filter === 'health') return healthTypes.includes(r.type);
      return r.type === filter;
    })
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || sortByTime(a, b));
}

function filteredEvents() {
  return state.events.items.filter(e => {
    if (app.diaryFilter === 'all') return true;
    const def = getEventDef(e.eventType);
    return def?.group === app.diaryFilter;
  });
}

function sortByTime(a, b) { return (a.time || '99:99').localeCompare(b.time || '99:99'); }
function repeatLabel(value) {
  return { once: 'Разово', daily: 'Щодня', weekly: 'Щотижня' }[value] || 'Разово';
}
function quickButtons() {
  const mode = state.pet.data?.toiletMode || 'pad';
  if (mode === 'outdoor') {
    return [
      { id: 'pee_success', title: 'Пісяв на вулиці', meta: 'успіх' },
      { id: 'poo_success', title: 'Какав на вулиці', meta: 'успіх' },
      { id: 'walk', title: 'Прогулянка', meta: 'рух' },
      { id: 'training', title: 'Тренування', meta: 'заняття' },
    ];
  }
  return [
    { id: 'pee_success', title: 'Пісяв правильно', meta: 'пелюшка / місце' },
    { id: 'pee_miss', title: 'Промах', meta: 'без емоцій' },
    { id: 'walk', title: 'Прогулянка', meta: 'рух' },
    { id: 'training', title: 'Тренування', meta: 'заняття' },
  ];
}
function getEventDef(type) { return EVENT_TYPES.find(t => t.id === type); }
function formatEventDate(event) {
  const date = tsToDate(event.createdAt);
  return date ? date.toLocaleDateString('uk', { day: 'numeric', month: 'short' }) : '';
}
function pushStatus() {
  if (!('Notification' in window)) return 'Не підтримується';
  if (Notification.permission === 'granted') return 'Увімкнені';
  if (Notification.permission === 'denied') return 'Заблоковані';
  return 'Не налаштовані';
}
async function enablePush() {
  if (!('Notification' in window)) {
    toast('Не підтримується', 'error');
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    await subscribePush();
    toast('Сповіщення увімкнено', 'success');
  } else {
    toast('Сповіщення не увімкнено', 'error');
  }
  renderProfile();
}
function exportData() {
  const data = {
    exportedAt: new Date().toISOString(),
    pet: state.pet.data,
    events: state.events.items,
    reminders: state.reminders.items,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `dogcoach_${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
async function copyInvite() {
  const code = state.workspace.data?.inviteCode;
  if (!code) {
    toast('Коду немає', 'error');
    return;
  }
  try {
    await navigator.clipboard.writeText(code);
    toast('Код скопійовано', 'success');
  } catch {
    toast(`Код: ${code}`, 'success');
  }
}
async function joinWorkspaceByCode() {
  const input = $('joinWorkspaceCode');
  const code = input?.value.trim().toUpperCase();
  if (!code) {
    toast('Введіть код', 'error');
    return;
  }
  showLoading();
  try {
    const token = await getIdToken();
    const response = await fetch('/api/join-workspace', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ code }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Не вдалося приєднатися');
    toast('Приєднано до спільного простору', 'success');
    setTimeout(() => window.location.reload(), 650);
  } catch (err) {
    toast(err.message || 'Помилка приєднання', 'error');
  } finally {
    hideLoading();
  }
}
async function clearAi() {
  const ok = await confirmDialog('Очистити AI чат?', 'Історія повідомлень буде видалена.', 'Очистити', true);
  if (!ok) return;
  await clearAiMessages();
  clearChatHistory();
  renderAiMessages();
}
function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

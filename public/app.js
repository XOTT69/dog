/* ===== Dog Coach AI — Main App v2 ===== */
(function () {
  'use strict';

  const AGE_PROGRAMS = window.AGE_PROGRAMS;
  const COURSES = window.COURSES;
  const KNOWLEDGE = window.KNOWLEDGE;
  const SOCIAL_ITEMS = window.SOCIAL_ITEMS;
  const TOILET_GUIDE = window.TOILET_GUIDE;
  const TYPE_CONFIG = window.TYPE_CONFIG;
  const EVENT_CATEGORIES = window.EVENT_CATEGORIES;
  const DAILY_TIPS = window.DAILY_TIPS;
  const HEAT_INFO = window.HEAT_INFO;
  const REMINDER_TEMPLATES = window.REMINDER_TEMPLATES;

  // ===== Firebase Init =====
  const firebaseConfig = window.FIREBASE_CONFIG;
  try { firebase.initializeApp(firebaseConfig); } catch (e) { console.error('Firebase init:', e); }
  const auth = firebase.auth();
  const db = firebase.firestore();
  const googleProvider = new firebase.auth.GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: 'select_account' });
  db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

  // ===== State =====
  let currentUser = null;
  let workspaceId = null;
  let workspaceData = null;
  let currentPet = null;
  let eventsState = [];
  let membersState = [];
  let currentCourseId = 'pee-pad';
  let currentCourseLevel = 'all';
  let currentDiaryFilter = 'all';
  let selectedEventType = null;
  let selectedSheetCategory = 'toilet';
  let unsubEvents = null;
  let unsubMembers = null;
  let unsubPet = null;
  let themeMode = localStorage.getItem('dc_theme') || 'light';
  let dailyDone = JSON.parse(localStorage.getItem('dc_daily') || '{}');
  let renderQueued = false;
  let activeTab = 'tabHome';

  // ===== DOM Helpers =====
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const show = (el) => el?.classList.remove('hidden');
  const hide = (el) => el?.classList.add('hidden');
  const showLoading = () => show($('loadingOverlay'));
  const hideLoading = () => hide($('loadingOverlay'));

  // ===== Utilities =====
  const nowTime = () => new Date().toTimeString().slice(0, 5);
  const todayKey = () => new Date().toISOString().slice(0, 10);
  const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const avatarLetter = (name = '') => (name.trim()[0] || 'П').toUpperCase();
  const tsToDate = (ts) => ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
  const haptic = () => { if (navigator.vibrate) navigator.vibrate(8); };
  const daysBetween = (d1, d2) => Math.floor((d2 - d1) / 86400000);

  function getAgeInWeeks(bd) {
    if (!bd) return null;
    const diff = Date.now() - new Date(bd).getTime();
    return isNaN(diff) || diff < 0 ? null : Math.floor(diff / 604800000);
  }

  function weekLabel(weeks) {
    if (weeks == null) return '—';
    if (weeks < 8) return `${weeks} тиж.`;
    if (weeks < 52) return `${Math.floor(weeks / 4.345)} міс.`;
    const y = weeks / 52;
    return y < 2 ? `${y.toFixed(1)} р.` : `${Math.floor(y)} р.`;
  }

  function getProgramByAge(weeks) {
    if (weeks == null) return AGE_PROGRAMS[1] || AGE_PROGRAMS[0];
    return AGE_PROGRAMS.find(p => weeks >= p.minWeeks && weeks < p.maxWeeks) || AGE_PROGRAMS[AGE_PROGRAMS.length - 1];
  }

  function isToiletSuccess(type) { return type === 'pee_success' || type === 'poo_success'; }
  function isToiletMiss(type) { return type === 'pee_miss' || type === 'poo_miss'; }

  // ===== Pet Size Detection =====
  function detectPetSize() {
    const weight = parseFloat(currentPet?.weight) || 0;
    const breed = (currentPet?.breed || '').toLowerCase().trim();
    if (weight > 0) {
      if (weight < 7) return 'tiny';
      if (weight < 12) return 'small';
      if (weight < 25) return 'medium';
      if (weight < 40) return 'large';
      return 'giant';
    }
    const tinyBreeds = ['чіхуахуа', 'той-тер', 'той тер', 'йорк', 'йоркшир', 'мальтезе', 'мальтійськ', 'папійон', 'ши-тцу', 'ши тцу', 'шитцу', 'померан', 'шпіц мініатюр'];
    const smallBreeds = ['шпіц', 'мопс', 'такса', 'пекінес', 'французький бульдог', 'кокер', 'бігль', 'бішон', 'карликов', 'цвергшнауцер', 'вест хайленд', 'джек рассел', 'корги', 'шелті', 'бостон тер'];
    const mediumBreeds = ['бордер колі', 'стафорд', 'пітбуль', 'англійський бульдог', 'шарпей', 'далматин', 'хаскі', 'самоїд', 'австралійська вівчарка', 'спанієль', 'пойнтер', 'сеттер'];
    const largeBreeds = ['лабрадор', 'ретрівер', 'вівчарка', 'ротвейлер', 'доберман', 'боксер', 'рідж', 'курцхаар', 'малінуа', 'бельгійська', 'колі', 'грейхаунд', 'акіта', 'кане корсо', 'кане-корсо'];
    const giantBreeds = ['дог', 'мастиф', 'сенбернар', 'ньюфаундленд', 'бернський', 'леонбергер', 'ірландський вовкодав', 'тибетський мастиф', 'алабай', 'кавказ'];
    if (tinyBreeds.some(b => breed.includes(b))) return 'tiny';
    if (smallBreeds.some(b => breed.includes(b))) return 'small';
    if (mediumBreeds.some(b => breed.includes(b))) return 'medium';
    if (largeBreeds.some(b => breed.includes(b))) return 'large';
    if (giantBreeds.some(b => breed.includes(b))) return 'giant';
    return 'medium';
  }

  function getSizeLabel() {
    const labels = { tiny: 'мініатюрна (до 7 кг)', small: 'маленька (7–12 кг)', medium: 'середня (12–25 кг)', large: 'велика (25–40 кг)', giant: 'гігантська (40+ кг)' };
    return labels[detectPetSize()] || 'середня';
  }

  function getSpayAgeRange() {
    const m = { tiny: { min: 5, max: 7, label: '5–7 міс (до першої тічки)' }, small: { min: 6, max: 8, label: '6–8 міс' }, medium: { min: 8, max: 12, label: '8–12 міс' }, large: { min: 12, max: 18, label: '12–18 міс (після першої тічки)' }, giant: { min: 18, max: 24, label: '18–24 міс (після росту)' } };
    return m[detectPetSize()] || m.medium;
  }

  function getNeuterAgeRange() {
    const m = { tiny: { min: 6, max: 8, label: '6–8 міс' }, small: { min: 6, max: 9, label: '6–9 міс' }, medium: { min: 9, max: 12, label: '9–12 міс' }, large: { min: 12, max: 18, label: '12–18 міс' }, giant: { min: 18, max: 24, label: '18–24 міс' } };
    return m[detectPetSize()] || m.medium;
  }

  // ===== Toast =====
  function toast(msg, type = '') {
    const box = $('toastContainer'); if (!box) return;
    const el = document.createElement('div'); el.className = `toast ${type}`; el.textContent = msg;
    box.appendChild(el); requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2800);
  }

  // ===== Theme =====
  function setTheme(mode) { themeMode = mode === 'dark' ? 'dark' : 'light'; document.documentElement.setAttribute('data-theme', themeMode); localStorage.setItem('dc_theme', themeMode); }

  // ===== Render Queue =====
  function queueRender() { if (renderQueued) return; renderQueued = true; requestAnimationFrame(() => { renderQueued = false; renderAll(); }); }

  // ===== RENDER: Header =====
  function renderHeader() {
    const petName = currentPet?.name?.trim() || 'Песик';
    const weeks = getAgeInWeeks(currentPet?.birthDate);
    const program = getProgramByAge(weeks);
    $('petNameHeader').textContent = petName;
    $('headerSub').textContent = `${weekLabel(weeks)} · ${program.stage}`;
    $('profileName').textContent = petName;
    $('profileMeta').textContent = [currentPet?.breed || 'Порода не вказана', weekLabel(weeks), currentPet?.sex || ''].filter(Boolean).join(' · ');
    const avatar = $('userAvatar');
    if (avatar) avatar.innerHTML = currentUser?.photoURL ? `<img src="${currentUser.photoURL}" alt="user">` : avatarLetter(currentUser?.displayName || petName);
  }

  // ===== RENDER: Daily Tip =====
  function renderDailyTip() {
    const el = $('dailyTipText'); if (!el) return;
    const weeks = getAgeInWeeks(currentPet?.birthDate);
    const sex = currentPet?.sex || '';
    const last7days = eventsState.filter(e => { const ts = tsToDate(e.createdAt); return ts && ts >= new Date(Date.now() - 7 * 86400000); });
    const toiletSuccess7d = last7days.filter(e => isToiletSuccess(e.eventType)).length;
    const toiletMiss7d = last7days.filter(e => isToiletMiss(e.eventType)).length;
    const toiletTotal7d = toiletSuccess7d + toiletMiss7d;
    const successRate = toiletTotal7d > 0 ? Math.round(toiletSuccess7d / toiletTotal7d * 100) : null;
    const trainings7d = last7days.filter(e => e.eventType === 'training').length;
    const walks7d = last7days.filter(e => e.eventType === 'walk').length;

    const dataBasedTips = [];
    if (successRate !== null) {
      if (successRate >= 90) dataBasedTips.push(`🎉 Вау! ${successRate}% успіху з горшиком за тиждень! Продовжуйте хвалити за кожен успіх!`);
      else if (successRate >= 70) dataBasedTips.push(`📈 Горшик: ${successRate}% успіху — хороший прогрес! Виводьте частіше після сну і їжі.`);
      else if (successRate >= 40) dataBasedTips.push(`💪 Горшик: ${successRate}% за тиждень. Обмежте простір і виводьте кожні 1.5 години.`);
      else if (toiletTotal7d > 3) dataBasedTips.push(`🎯 Горшик: лише ${successRate}%. Спробуйте: менше простору + частіше виводити + суперласощі за успіх!`);
    }
    if (toiletTotal7d === 0 && eventsState.length < 5) dataBasedTips.push('📝 Починайте записувати кожен туалет — через 3-5 днів побачите патерн!');
    if (trainings7d === 0) dataBasedTips.push('🎓 Жодного тренування цього тижня! Навіть 2 хвилини на день дають результат 💪');
    else if (trainings7d >= 5) dataBasedTips.push(`🌟 ${trainings7d} тренувань за тиждень — чудова регулярність! Песик вчиться швидше!`);
    if (walks7d === 0 && weeks != null && weeks > 12) dataBasedTips.push('🚶 Жодної прогулянки! 15 хвилин на повітрі знижує стрес і покращує поведінку.');

    let pool = DAILY_TIPS.filter(t => t.condition === 'any');
    if (weeks != null && weeks < 16) pool = pool.concat(DAILY_TIPS.filter(t => t.condition === 'puppy'));
    if (weeks != null && weeks >= 24 && weeks < 72) pool = pool.concat(DAILY_TIPS.filter(t => t.condition === 'teen'));
    if (sex === 'дівчинка') pool = pool.concat(DAILY_TIPS.filter(t => t.condition === 'girl'));

    if (dataBasedTips.length > 0) {
      el.textContent = dataBasedTips[new Date().getHours() < 12 ? 0 : Math.min(1, dataBasedTips.length - 1)];
    } else {
      el.textContent = pool[new Date().getDate() % pool.length]?.text || 'Записуйте події щодня для персональних порад! 📊';
    }
  }

  // ===== RENDER: KPIs =====
  function renderKpis() {
    const start = startOfToday();
    const todayEvents = eventsState.filter(e => { const ts = tsToDate(e.createdAt); return ts && ts >= start; });
    const success = todayEvents.filter(e => isToiletSuccess(e.eventType)).length;
    const miss = todayEvents.filter(e => isToiletMiss(e.eventType)).length;
    const total = success + miss;
    const pct = total > 0 ? Math.round(success / total * 100) : 0;
    $('kpiSuccess').textContent = success;
    $('kpiMiss').textContent = miss;
    $('kpiTotal').textContent = todayEvents.length;
    $('ringPct').textContent = `${pct}%`;
    const ring = $('ringFill'); if (ring) ring.style.strokeDashoffset = String(251.3 - (251.3 * pct / 100));
  }

  // ===== RENDER: Quick Actions =====
  function renderQuickActions() {
    const container = $('quickCategories'); if (!container) return;
    const toiletCat = EVENT_CATEGORIES.find(c => c.id === 'toilet');
    const activityCat = EVENT_CATEGORIES.find(c => c.id === 'activity');
    const quickEvents = [...toiletCat.events, ...activityCat.events.slice(0, 2)];
    container.innerHTML = `<div class="actions-grid">${quickEvents.map(ev => `<button class="action-btn ${ev.tone === 'success' ? 'green' : ev.tone === 'danger' ? 'red' : ev.tone === 'accent' ? 'accent' : 'neutral'}" data-quick-event="${ev.type}" type="button"><span class="action-icon">${ev.icon}</span>${ev.label.split(' ').slice(0, 2).join(' ')}</button>`).join('')}</div>`;
    $$('[data-quick-event]').forEach(btn => btn.addEventListener('click', async () => { await addEvent({ eventType: btn.dataset.quickEvent, timeLabel: nowTime() }); haptic(); }));
  }

  // ===== RENDER: Daily Plan =====
  function renderDailyPlan() {
    const list = $('dailyItems'); const badge = $('dailyProgressBadge'); if (!list || !badge) return;
    const plan = (getProgramByAge(getAgeInWeeks(currentPet?.birthDate))?.plan || []);
    const key = todayKey(); const done = dailyDone[key] || {};
    badge.textContent = `${Object.values(done).filter(Boolean).length}/${plan.length}`;
    list.innerHTML = plan.map((item, i) => `<label class="daily-item ${done[i] ? 'done' : ''}"><input type="checkbox" data-daily="${i}" ${done[i] ? 'checked' : ''}><span>${item}</span></label>`).join('');
    $$('[data-daily]').forEach(cb => cb.addEventListener('change', () => { const k = todayKey(); dailyDone[k] = dailyDone[k] || {}; dailyDone[k][cb.dataset.daily] = cb.checked; localStorage.setItem('dc_daily', JSON.stringify(dailyDone)); renderDailyPlan(); }));
  }

  // ===== RENDER: Age Focus =====
  function renderAgeFocus() {
    const program = getProgramByAge(getAgeInWeeks(currentPet?.birthDate));
    const box = $('periodFocus'); if (!box) return;
    box.innerHTML = `<div class="plan-item"><strong>🎯 Пріоритети</strong>${program.priorities.map(x => `<br>• ${x}`).join('')}</div><div class="plan-item"><strong>📋 План</strong>${program.plan.map(x => `<br>• ${x}`).join('')}</div><div class="plan-item"><strong>💡 Підказка</strong><br>${program.tip}</div>`;
  }

  // ===== RENDER: Heat / Reproductive =====
  function renderHeatInfo() {
    const card = $('heatCard'); const info = $('heatInfo'); const field = $('heatDateField');
    if (!card || !info) return;
    const weeks = getAgeInWeeks(currentPet?.birthDate);
    const monthsAge = weeks != null ? Math.round(weeks / 4.345) : null;
    const size = detectPetSize(); const sizeLabel = getSizeLabel();

    if (currentPet?.sex === 'хлопчик') {
      card.style.display = ''; if (field) field.style.display = 'none';
      const range = getNeuterAgeRange();
      let h = `<div class="plan-item"><strong>✂️ Кастрація</strong><br>📏 Розмір: <strong>${sizeLabel}</strong><br>📅 Рекомендований вік: <strong>${range.label}</strong></div>`;
      if (monthsAge != null) {
        if (monthsAge < range.min - 1) h += `<div class="plan-item">🕐 Зараз ${monthsAge} міс — ще рано. Обговоріть з ветеринаром.</div>`;
        else if (monthsAge >= range.min - 1 && monthsAge <= range.max) h += `<div class="plan-item" style="color:var(--accent)">✅ Зараз ${monthsAge} міс — оптимальний час! Запишіться до ветеринара.</div>`;
        else h += `<div class="plan-item">ℹ️ Зараз ${monthsAge} міс — можна в будь-якому віці. Обговоріть з ветеринаром.</div>`;
      }
      h += `<details style="margin-top:0.75rem"><summary style="cursor:pointer;font-weight:600;font-size:0.85rem">ℹ️ Переваги та ризики</summary><div style="margin-top:0.5rem"><div class="plan-item"><strong>✅ Переваги:</strong><br>• Менше маркування 🏠<br>• Зниження агресії<br>• Немає ризику раку яєчок<br>• Менше втікань 🏃<br>• Здоровіша простата</div><div class="plan-item"><strong>⚠️ Мінуси:</strong><br>• Може набрати вагу<br>• Рання кастрація великих порід — суглоби<br>• Не замінює виховання</div></div></details>`;
      h += `<p class="text-muted" style="margin-top:0.75rem;font-size:0.78rem">⚠️ Рішення — з ветеринаром.</p>`;
      info.innerHTML = h; return;
    }

    if (!currentPet?.sex || currentPet.sex !== 'дівчинка') { card.style.display = 'none'; if (field) field.style.display = 'none'; return; }

    card.style.display = ''; if (field) field.style.display = '';
    const lastHeat = currentPet?.lastHeat; const spayRange = getSpayAgeRange();
    let expectedFirst = { tiny: 6, small: 7, medium: 10, large: 12, giant: 16 }[size] || 10;
    let h = '';

    if (lastHeat) {
      const nextDate = new Date(new Date(lastHeat).getTime() + HEAT_INFO.avgCycleDays * 86400000);
      const daysUntil = daysBetween(new Date(), nextDate);
      if (daysUntil > 30) h += `<div class="plan-item">📅 <strong>Наступна тічка</strong><br>${nextDate.toLocaleDateString('uk')} (через ~${daysUntil} днів) 😌</div>`;
      else if (daysUntil > 0) h += `<div class="plan-item" style="color:var(--warning)">⚠️ <strong>Скоро тічка!</strong><br>Можливо через ${daysUntil} днів. Слідкуйте!</div>`;
      else h += `<div class="plan-item" style="color:var(--danger)">🩸 <strong>Можливо тічка зараз!</strong><br>Обережно на прогулянках! 🩲</div>`;
    } else if (weeks == null) {
      h += '<p class="text-muted">Вкажіть дату народження для прогнозу 📅</p>';
    } else {
      const until = expectedFirst - monthsAge;
      if (monthsAge >= 20) h += `<div class="plan-item">❓ <strong>Тічка не зафіксована</strong><br>Зверніться до ветеринара для перевірки.</div>`;
      else if (until <= 1) h += `<div class="plan-item" style="color:var(--warning)">⚠️ <strong>Перша тічка скоро!</strong><br>${monthsAge} міс · Розмір: ${sizeLabel}</div>`;
      else if (until <= 3) h += `<div class="plan-item">📅 <strong>Перша тічка наближається</strong><br>Через ~${until} міс (у ${expectedFirst} міс)</div>`;
      else h += `<div class="plan-item">🕐 <strong>До першої тічки є час</strong><br>Орієнтовно ${expectedFirst}–${expectedFirst + 2} міс. Зараз ${monthsAge} міс.</div>`;
      h += `<div class="plan-item" style="margin-top:0.5rem"><strong>🔍 Ознаки:</strong><br>• Набрякла петля<br>• Кров'янисті виділення<br>• Часте вилизування<br>• Зміна настрою<br>• Увага кобелів 👀</div>`;
      h += `<p class="text-muted" style="margin-top:0.5rem">💡 Помітили тічку? Запишіть дату в профілі!</p>`;
    }

    h += `<details style="margin-top:0.75rem"><summary style="cursor:pointer;font-weight:600;font-size:0.85rem">📖 Фази тічки</summary><div style="margin-top:0.5rem">${HEAT_INFO.phases.map(p => `<div class="plan-item"><strong>${p.name}</strong> (дні ${p.days})<br>${p.desc}</div>`).join('')}</div></details>`;

    let sp = `<div class="plan-item">📏 Розмір: <strong>${sizeLabel}</strong><br>📅 Рекомендовано: <strong>${spayRange.label}</strong></div>`;
    if (size === 'tiny' || size === 'small') sp += `<div class="plan-item">💡 Краще <strong>до першої тічки</strong> — захист від пухлин 99.5%!</div>`;
    else if (size === 'large' || size === 'giant') sp += `<div class="plan-item">💡 Краще <strong>після першої тічки</strong> — дайте кістяку дозріти.</div>`;
    else sp += `<div class="plan-item">💡 Обидва варіанти ок. Обговоріть з ветеринаром.</div>`;
    sp += `<div class="plan-item" style="color:var(--danger)">🚫 <strong>Не під час тічки!</strong> Зачекайте 2–3 міс після.</div>`;
    if (monthsAge != null && !lastHeat && monthsAge >= spayRange.min - 1 && monthsAge <= spayRange.max && (size === 'tiny' || size === 'small')) sp += `<div class="plan-item" style="color:var(--accent)">✅ Зараз ${monthsAge} міс — оптимальний час!</div>`;
    if (lastHeat) { const ds = daysBetween(new Date(lastHeat), new Date()); if (ds >= 60 && ds <= 120) sp += `<div class="plan-item" style="color:var(--accent)">✅ Після тічки ${ds} днів — безпечно!</div>`; else if (ds < 60) sp += `<div class="plan-item">⏳ Зачекайте ще ~${60 - ds} днів.</div>`; }
    sp += `<p class="text-muted" style="margin-top:0.5rem;font-size:0.78rem">⚠️ Рішення — з ветеринаром.</p>`;
    h += `<details style="margin-top:0.75rem"><summary style="cursor:pointer;font-weight:600;font-size:0.85rem">✂️ Стерилізація</summary><div style="margin-top:0.5rem">${sp}</div></details>`;
    info.innerHTML = h;
  }

  // ===== RENDER: Reminders =====
  function renderReminders() {
    const card = $('remindersCard'); const list = $('remindersList'); if (!card || !list) return;
    const reminders = currentPet?.reminders || [];
    if (!reminders.length) { card.style.display = 'none'; return; }
    card.style.display = ''; const now = new Date();
    list.innerHTML = reminders.map(r => { const d = new Date(r.nextDate); const days = daysBetween(now, d); let cls = '', txt = ''; if (days < 0) { cls = 'danger'; txt = `Прострочено (${Math.abs(days)} дн.)`; } else if (days === 0) { cls = 'warning'; txt = 'Сьогодні!'; } else if (days <= 3) { cls = 'warning'; txt = `Через ${days} дн.`; } else { txt = d.toLocaleDateString('uk'); } return `<div class="feed-item"><div><strong>${r.label}</strong><div class="meta ${cls}">${txt}</div></div></div>`; }).join('');
  }

  // ===== RENDER: Weight =====
  function renderWeight() {
    const container = $('weightHistory'); if (!container) return;
    const weightEvents = eventsState.filter(e => e.eventType === 'weight' && e.value).slice(0, 20).reverse();
    if (!weightEvents.length) { container.innerHTML = '<p class="text-muted">Додайте записи ваги: + → Здоров\'я → ⚖️ Вага<br>Рекомендуємо зважувати раз на тиждень 📊</p>'; return; }
    const latest = weightEvents[weightEvents.length - 1];
    const prev = weightEvents.length > 1 ? weightEvents[weightEvents.length - 2] : null;
    const diff = prev ? (latest.value - prev.value).toFixed(1) : null;
    const diffStr = diff ? (diff > 0 ? `+${diff} кг ↑` : diff < 0 ? `${diff} кг ↓` : 'без змін') : '';
    const diffColor = diff > 0 ? 'var(--success)' : diff < 0 ? 'var(--warning)' : 'var(--text-muted)';
    let html = `<div class="plan-item" style="margin-bottom:0.75rem"><strong>⚖️ Поточна: ${latest.value} кг</strong>${diffStr ? `<br><span style="color:${diffColor};font-size:0.85rem">${diffStr}</span>` : ''}</div>`;
    html += '<canvas id="weightChart" height="120" style="width:100%;margin-bottom:0.5rem"></canvas>';
    html += weightEvents.slice().reverse().slice(0, 5).map(e => { const d = tsToDate(e.createdAt); return `<div style="display:flex;justify-content:space-between;padding:0.3rem 0;font-size:0.8rem;color:var(--text-secondary);border-bottom:1px solid var(--border-light)"><span>${d ? d.toLocaleDateString('uk') : ''}</span><strong>${e.value} кг</strong></div>`; }).join('');
    container.innerHTML = html;
    requestAnimationFrame(() => renderWeightChart(weightEvents));
  }

  function renderWeightChart(weightEvents) {
    const canvas = $('weightChart'); if (!canvas || !canvas.getContext || weightEvents.length < 2) return;
    const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    const ctx = canvas.getContext('2d'); const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width, h = rect.height; ctx.clearRect(0, 0, w, h);
    const values = weightEvents.map(e => e.value);
    const minVal = Math.min(...values) - 0.2, maxVal = Math.max(...values) + 0.2, range = maxVal - minVal || 1;
    const isDark = themeMode === 'dark';
    const lineColor = isDark ? '#2dd4bf' : '#0f766e', dotColor = isDark ? '#5eead4' : '#0d9488';
    const gridColor = isDark ? '#292524' : '#e7e5e4', textColor = isDark ? '#78716c' : '#a8a29e';
    const pad = { top: 12, right: 8, bottom: 20, left: 36 }, cw = w - pad.left - pad.right, ch = h - pad.top - pad.bottom;
    ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) { const y = pad.top + (i / 3) * ch; ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke(); ctx.fillStyle = textColor; ctx.font = '10px system-ui'; ctx.textAlign = 'right'; ctx.fillText((maxVal - (i / 3) * range).toFixed(1), pad.left - 4, y + 3); }
    const points = values.map((v, i) => ({ x: pad.left + (i / (values.length - 1)) * cw, y: pad.top + ch - ((v - minVal) / range) * ch }));
    ctx.beginPath(); ctx.moveTo(points[0].x, h - pad.bottom); points.forEach(p => ctx.lineTo(p.x, p.y)); ctx.lineTo(points[points.length - 1].x, h - pad.bottom); ctx.closePath(); ctx.fillStyle = isDark ? 'rgba(45,212,191,0.1)' : 'rgba(15,118,110,0.08)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); for (let i = 1; i < points.length; i++) { const cx = (points[i - 1].x + points[i].x) / 2; ctx.bezierCurveTo(cx, points[i - 1].y, cx, points[i].y, points[i].x, points[i].y); } ctx.strokeStyle = lineColor; ctx.lineWidth = 2; ctx.stroke();
    points.forEach((p, i) => { ctx.beginPath(); ctx.arc(p.x, p.y, i === points.length - 1 ? 5 : 3, 0, Math.PI * 2); ctx.fillStyle = i === points.length - 1 ? dotColor : lineColor; ctx.fill(); if (i === points.length - 1) { ctx.strokeStyle = isDark ? '#042f2e' : '#fff'; ctx.lineWidth = 2; ctx.stroke(); } });
    ctx.fillStyle = textColor; ctx.font = '9px system-ui'; ctx.textAlign = 'center';
    [0, Math.floor(points.length / 2), points.length - 1].forEach(i => { if (i >= weightEvents.length) return; const d = tsToDate(weightEvents[i].createdAt); if (d) ctx.fillText(`${d.getDate()}/${d.getMonth() + 1}`, points[i].x, h - 4); });
  }
  // ===== RENDER: Feed =====
  function renderFeed(targetId, filter = 'all') {
    const list = $(targetId); if (!list) return;
    let filtered = eventsState;
    if (filter !== 'all') { const cat = EVENT_CATEGORIES.find(c => c.id === filter); if (cat) { const types = cat.events.map(e => e.type); filtered = eventsState.filter(e => types.includes(e.eventType)); } }
    if (!filtered.length) { list.innerHTML = '<div class="empty">Немає записів. Натисніть + щоб додати 📝</div>'; return; }
    list.innerHTML = filtered.slice(0, 40).map(item => { const conf = TYPE_CONFIG[item.eventType] || { icon: '•', label: 'Подія' }; const d = tsToDate(item.createdAt); const timeStr = d ? d.toLocaleString('uk', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''; const valueStr = item.value ? ` · ${item.value}${conf.unit || ''}` : ''; return `<div class="feed-item"><div><strong>${conf.icon} ${conf.label}</strong><div class="meta">${timeStr}${valueStr}${item.note ? ` · ${item.note}` : ''}</div></div><button type="button" class="btn btn-ghost btn-sm" data-delete-event="${item.id}">✕</button></div>`; }).join('');
    $$(`#${targetId} [data-delete-event]`).forEach(btn => { btn.addEventListener('click', async () => { if (!confirm('Видалити?')) return; await deleteEvent(btn.dataset.deleteEvent); }); });
  }

  // ===== RENDER: Chart =====
  function renderChart(canvasId) {
    const canvas = $(canvasId); if (!canvas || !canvas.getContext) return;
    const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    const ctx = canvas.getContext('2d'); const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width, h = rect.height; ctx.clearRect(0, 0, w, h);
    const days = []; for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0); const next = new Date(d); next.setDate(next.getDate() + 1); const dayEv = eventsState.filter(e => { const ts = tsToDate(e.createdAt); return ts && ts >= d && ts < next; }); const s = dayEv.filter(e => isToiletSuccess(e.eventType)).length; const m = dayEv.filter(e => isToiletMiss(e.eventType)).length; const t = s + m; days.push({ date: d, pct: t ? Math.round(s / t * 100) : null }); }
    const isDark = themeMode === 'dark'; const accent = isDark ? '#2dd4bf' : '#0f766e'; const danger = isDark ? '#f87171' : '#dc2626'; const warning = isDark ? '#fbbf24' : '#d97706'; const muted = isDark ? '#78716c' : '#a8a29e'; const border = isDark ? '#292524' : '#e7e5e4';
    const p = { top: 10, right: 4, bottom: 20, left: 4 }; const cw = w - p.left - p.right, ch = h - p.top - p.bottom, bw = cw / days.length;
    ctx.strokeStyle = border; ctx.lineWidth = 1; [0, 50, 100].forEach(v => { const y = p.top + ch - (v / 100) * ch; ctx.beginPath(); ctx.moveTo(p.left, y); ctx.lineTo(w - p.right, y); ctx.stroke(); });
    days.forEach((day, i) => { const x = p.left + i * bw + bw * 0.2, barW = bw * 0.6; if (day.pct == null) { ctx.fillStyle = muted; ctx.beginPath(); ctx.arc(x + barW / 2, p.top + ch - 3, 2, 0, Math.PI * 2); ctx.fill(); } else { const barH = Math.max(3, (day.pct / 100) * ch), y = p.top + ch - barH; ctx.fillStyle = day.pct >= 70 ? accent : day.pct >= 40 ? warning : danger; const r = Math.min(3, barW / 2); ctx.beginPath(); ctx.moveTo(x, y + barH); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.lineTo(x + barW - r, y); ctx.quadraticCurveTo(x + barW, y, x + barW, y + r); ctx.lineTo(x + barW, y + barH); ctx.closePath(); ctx.fill(); } if (i % 3 === 0 || i === days.length - 1) { ctx.fillStyle = muted; ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`${day.date.getDate()}/${day.date.getMonth() + 1}`, x + barW / 2, h - 4); } });
  }

  // ===== RENDER: Courses =====
  function renderCourses() {
    const grid = $('courseGrid'); const viewer = $('selectedCourse'); if (!grid || !viewer) return;
    const filtered = currentCourseLevel === 'all' ? COURSES : COURSES.filter(c => c.level === currentCourseLevel);
    grid.innerHTML = filtered.map(c => `<button type="button" class="course-btn ${c.id === currentCourseId ? 'selected' : ''}" data-course-id="${c.id}"><span class="c-badge">${c.badge}</span><strong>${c.title}</strong><div class="c-meta">${c.description}</div></button>`).join('');
    $$('[data-course-id]').forEach(btn => btn.addEventListener('click', () => { currentCourseId = btn.dataset.courseId; renderCourses(); haptic(); }));
    const course = COURSES.find(c => c.id === currentCourseId) || filtered[0] || COURSES[0];
    if (!course) { viewer.innerHTML = ''; return; }
    viewer.innerHTML = `<div class="course-detail"><h3>${course.title}</h3><p style="color:var(--text-secondary);margin-bottom:1rem">${course.description}</p><h4>Кроки</h4><ul>${course.steps.map(s => `<li>${s}</li>`).join('')}</ul><h4>Помилки</h4><ul class="mistakes">${course.mistakes.map(s => `<li>${s}</li>`).join('')}</ul><h4>Чекліст</h4><ul class="checks">${course.checklist.map(s => `<li>${s}</li>`).join('')}</ul></div>`;
  }

  function renderKnowledge() { const g = $('knowledgeGrid'); if (g) g.innerHTML = KNOWLEDGE.map(k => `<div class="k-card"><strong>${k.title}</strong><p>${k.text}</p><span class="k-tag">${k.tag}</span></div>`).join(''); }
  function renderSocial() { const grid = $('socialGrid'); if (!grid) return; const done = JSON.parse(localStorage.getItem('dc_social') || '{}'); grid.innerHTML = SOCIAL_ITEMS.map(group => `<div class="social-group"><h5 class="social-group-title">${group.category}</h5>${group.items.map(item => { const key = group.category + ':' + item; return `<label class="social-item"><input type="checkbox" data-social-key="${key}" ${done[key] ? 'checked' : ''}><span>${item}</span></label>`; }).join('')}</div>`).join(''); $$('[data-social-key]').forEach(cb => cb.addEventListener('change', () => { const d = JSON.parse(localStorage.getItem('dc_social') || '{}'); d[cb.dataset.socialKey] = cb.checked; localStorage.setItem('dc_social', JSON.stringify(d)); })); }
  function renderToiletGuide() { const g = $('toiletGuide'); if (g) g.innerHTML = TOILET_GUIDE.map(s => `<div class="k-card"><strong>${s.title}</strong><p>${s.text}</p></div>`).join(''); }
  function renderMembers() { const list = $('membersList'); if (!list) return; list.innerHTML = membersState.length ? membersState.map(m => `<div class="member-chip"><div class="m-avatar">${m.photoURL ? `<img src="${m.photoURL}" alt="">` : avatarLetter(m.displayName)}</div><span>${m.displayName || 'Учасник'}</span></div>`).join('') : '<div class="empty">Поки тільки ви 👤</div>'; }
  function renderWorkspaceMeta() { const el = $('inviteCodeView'); if (el) el.textContent = workspaceData?.inviteCode || '—'; }

  function fillPetForm() {
    if ($('petName')) $('petName').value = currentPet?.name || '';
    if ($('petBirthDate')) $('petBirthDate').value = currentPet?.birthDate || '';
    if ($('petSex')) $('petSex').value = currentPet?.sex || 'хлопчик';
    if ($('petBreed')) $('petBreed').value = currentPet?.breed || '';
    if ($('petWeight')) $('petWeight').value = currentPet?.weight || '';
    if ($('petToiletMode')) $('petToiletMode').value = currentPet?.toiletMode || 'pad';
    if ($('petLastVaccine')) $('petLastVaccine').value = currentPet?.lastVaccine || '';
    if ($('petLastDeworming')) $('petLastDeworming').value = currentPet?.lastDeworming || '';
    if ($('petLastHeat')) $('petLastHeat').value = currentPet?.lastHeat || '';
    const hf = $('heatDateField'); if (hf) hf.style.display = currentPet?.sex === 'дівчинка' ? '' : 'none';
  }

  function renderSheetCategories() { const c = $('sheetCategories'); if (!c) return; c.innerHTML = EVENT_CATEGORIES.map(cat => `<button type="button" class="chip ${cat.id === selectedSheetCategory ? 'active' : ''}" data-sheet-cat="${cat.id}">${cat.icon} ${cat.name}</button>`).join(''); $$('[data-sheet-cat]').forEach(btn => btn.addEventListener('click', () => { selectedSheetCategory = btn.dataset.sheetCat; selectedEventType = null; renderSheetCategories(); renderSheetEvents(); hide($('sheetExtraFields')); })); }
  function renderSheetEvents() { const c = $('sheetEvents'); if (!c) return; const cat = EVENT_CATEGORIES.find(x => x.id === selectedSheetCategory); if (!cat) return; c.innerHTML = `<div class="actions-grid">${cat.events.map(ev => `<button type="button" class="action-btn ${selectedEventType === ev.type ? 'selected' : ''} ${ev.tone === 'success' ? 'green' : ev.tone === 'danger' ? 'red' : 'neutral'}" data-sheet-event="${ev.type}"><span class="action-icon">${ev.icon}</span>${ev.label}</button>`).join('')}</div>`; $$('[data-sheet-event]').forEach(btn => btn.addEventListener('click', () => { selectedEventType = btn.dataset.sheetEvent; renderSheetEvents(); show($('sheetExtraFields')); $('eventTime').value = nowTime(); const conf = TYPE_CONFIG[selectedEventType]; const vf = $('valueField'); if (vf) vf.style.display = conf?.hasValue ? '' : 'none'; haptic(); })); }

  function renderAll() { renderHeader(); renderDailyTip(); renderKpis(); renderQuickActions(); renderDailyPlan(); renderAgeFocus(); renderHeatInfo(); renderReminders(); renderFeed('recentLogs'); renderFeed('recentLogsDiary', currentDiaryFilter); renderWeight(); renderCourses(); renderKnowledge(); renderSocial(); renderToiletGuide(); renderMembers(); renderWorkspaceMeta(); fillPetForm(); if (activeTab === 'tabDiary') requestAnimationFrame(() => renderChart('progressChartDiary')); }

  // ===== Tab / Sheet =====
  function setActiveTab(id) { activeTab = id; $$('.tab').forEach(p => p.classList.toggle('active', p.id === id)); $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === id)); if (id === 'tabProfile') hide($('fabAddEvent')); else show($('fabAddEvent')); if (id === 'tabDiary') requestAnimationFrame(() => renderChart('progressChartDiary')); }
  function openSheet() { show($('eventSheet')); selectedEventType = null; selectedSheetCategory = 'toilet'; renderSheetCategories(); renderSheetEvents(); hide($('sheetExtraFields')); }
  function closeSheet() { hide($('eventSheet')); }

  // ===== Firestore =====
  async function savePetProfile(payload) { if (!currentUser || !workspaceId) return toast('Увійдіть', 'error'); showLoading(); try { await db.collection('workspaces').doc(workspaceId).collection('dogs').doc('primary').set({ ...(currentPet || {}), ...payload, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }); toast('Збережено ✓', 'success'); } catch (e) { console.error(e); toast('Помилка', 'error'); } finally { hideLoading(); } }
  async function addEvent(payload) { if (!currentUser || !workspaceId) return toast('Увійдіть', 'error'); try { const data = { eventType: payload.eventType, byUid: currentUser.uid, byName: currentUser.displayName || 'Я', note: payload.note || '', timeLabel: payload.timeLabel || nowTime(), createdAt: firebase.firestore.FieldValue.serverTimestamp() }; if (payload.value) data.value = payload.value; await db.collection('workspaces').doc(workspaceId).collection('events').add(data); toast('Додано ✓', 'success'); haptic(); } catch (e) { console.error(e); toast('Помилка', 'error'); } }
  async function deleteEvent(id) { if (!workspaceId || !id) return; try { await db.collection('workspaces').doc(workspaceId).collection('events').doc(id).delete(); toast('Видалено', 'success'); } catch (e) { console.error(e); toast('Помилка', 'error'); } }

  // ===== Workspace =====
  async function ensureWorkspaceForUser(user) { const udoc = await db.collection('users').doc(user.uid).get(); if (udoc.exists && udoc.data().workspaceId) { workspaceId = udoc.data().workspaceId; const wdoc = await db.collection('workspaces').doc(workspaceId).get(); workspaceData = wdoc.exists ? wdoc.data() : null; return; } const wsRef = db.collection('workspaces').doc(); workspaceId = wsRef.id; const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase(); workspaceData = { name: (user.displayName || 'Мій').split(' ')[0], ownerId: user.uid, inviteCode }; await wsRef.set({ ...workspaceData, createdAt: firebase.firestore.FieldValue.serverTimestamp() }); await db.collection('users').doc(user.uid).set({ uid: user.uid, email: user.email || '', displayName: user.displayName || '', photoURL: user.photoURL || '', role: 'owner', workspaceId }, { merge: true }); await wsRef.collection('members').doc(user.uid).set({ uid: user.uid, email: user.email || '', displayName: user.displayName || '', photoURL: user.photoURL || '', role: 'owner', createdAt: firebase.firestore.FieldValue.serverTimestamp() }); await wsRef.collection('dogs').doc('primary').set({ name: '', birthDate: '', sex: 'хлопчик', breed: '', toiletMode: 'pad', weight: '', createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() }); }
  async function joinWorkspaceByInvite(code) { const clean = (code || '').trim().toUpperCase(); if (!clean) throw new Error('Введіть код'); const snap = await db.collection('workspaces').where('inviteCode', '==', clean).limit(1).get(); if (snap.empty) throw new Error('Код не знайдено'); workspaceId = snap.docs[0].id; workspaceData = snap.docs[0].data(); await db.collection('users').doc(currentUser.uid).set({ uid: currentUser.uid, email: currentUser.email || '', displayName: currentUser.displayName || '', photoURL: currentUser.photoURL || '', role: 'member', workspaceId }, { merge: true }); await db.collection('workspaces').doc(workspaceId).collection('members').doc(currentUser.uid).set({ uid: currentUser.uid, email: currentUser.email || '', displayName: currentUser.displayName || '', photoURL: currentUser.photoURL || '', role: 'member', createdAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }); subscribePet(); subscribeMembers(); subscribeEvents(); queueRender(); }

  // ===== Subscriptions =====
  function subscribePet() { unsubPet?.(); unsubPet = db.collection('workspaces').doc(workspaceId).collection('dogs').doc('primary').onSnapshot(s => { currentPet = s.exists ? s.data() : null; queueRender(); }); }
  function subscribeMembers() { unsubMembers?.(); unsubMembers = db.collection('workspaces').doc(workspaceId).collection('members').onSnapshot(s => { membersState = []; s.forEach(d => membersState.push(d.data())); renderMembers(); }); }
  function subscribeEvents() { unsubEvents?.(); unsubEvents = db.collection('workspaces').doc(workspaceId).collection('events').orderBy('createdAt', 'desc').limit(300).onSnapshot(s => { eventsState = []; s.forEach(d => eventsState.push({ id: d.id, ...d.data() })); queueRender(); }); }

    // ===== Auth =====
  async function loginGoogle() {
    showLoading();
    try { await auth.signInWithPopup(googleProvider); }
    catch (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user') {
        try { await auth.signInWithRedirect(googleProvider); } catch (err) { toast(err.message || 'Помилка', 'error'); }
      } else if (e.code === 'auth/unauthorized-domain') toast('Домен не авторизовано', 'error');
      else toast(e.message || 'Помилка входу', 'error');
    } finally { hideLoading(); }
  }

  async function logout() {
    unsubEvents?.(); unsubMembers?.(); unsubPet?.();
    unsubEvents = unsubMembers = unsubPet = null;
    await auth.signOut();
    currentUser = null; workspaceId = null; workspaceData = null;
    currentPet = null; eventsState = []; membersState = [];
    hide($('appContent')); show($('authScreen'));
  }

  // ===== AI Chat =====
  function addChatMessage(text, type) {
    const chat = $('aiChat'); if (!chat) return;
    const msg = document.createElement('div');
    msg.className = `ai-msg ${type}`; msg.textContent = text;
    chat.appendChild(msg); chat.scrollTop = chat.scrollHeight;
  }

  function showTyping() {
    const chat = $('aiChat'); if (!chat) return;
    const el = document.createElement('div');
    el.className = 'ai-msg loading'; el.id = 'typingIndicator'; el.textContent = 'Думаю...';
    chat.appendChild(el); chat.scrollTop = chat.scrollHeight;
  }

  function removeTyping() { const el = $('typingIndicator'); if (el) el.remove(); }

  async function fetchAIResponse(prompt) {
    const weeks = getAgeInWeeks(currentPet?.birthDate);
    const petInfo = currentPet ? `Собака: ${currentPet.name || 'Песик'}, вік: ${weekLabel(weeks)}${weeks != null && weeks < 12 ? ' (цуценя до 3 міс!)' : ''}, порода: ${currentPet.breed || 'невідома'}, стать: ${currentPet.sex || 'невідома'}, розмір: ${getSizeLabel()}` : '';
    const systemPrompt = `Ти — професійний український кінолог з 15-річним досвідом.\n\nПРАВИЛА:\n1. ТІЛЬКИ українською. Жодних ієрогліфів.\n2. Максимум 4-5 речень. Конкретні кроки.\n3. Враховуй вік: до 3 міс — адаптація.\n4. Ніяких покарань, криків.\n5. Не знаєш — "зверніться до ветеринара".\n6. Пронумеровані кроки. Без вступів.\n\n${petInfo}`;
    try {
      const response = await fetch('/api/proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'groq/llama-3.3-70b-versatile', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }], temperature: 0.2, max_tokens: 400, stream: false }) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.choices?.[0]?.message?.content) {
        let text = data.choices[0].message.content.trim().replace(/[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef]/g, '').replace(/\s{2,}/g, ' ').trim();
        return text || getLocalFallback(prompt);
      }
      throw new Error('Empty');
    } catch (e) { console.warn('AI:', e.message); return getLocalFallback(prompt); }
  }

  function getLocalFallback(prompt) {
    const l = prompt.toLowerCase();
    if (l.includes('команд') || l.includes('сідати')) return '1) Ласощі біля носа. 2) Підніміть руку — сяде. 3) "Так!" + ласощі. 4) 5-8 разів, 2-3 підходи/день. Сесія до 2 хвилин.';
    if (l.includes('гриз') || l.includes('речі')) return '1) Приберіть речі. 2) Дайте жувальні іграшки. 3) Гризе своє — маркер + похвала. 4) Чуже — мовчки замініть.';
    if (l.includes('гавк')) return '1) Причина: нудьга/страх/збудження? 2) Не кричіть. 3) "Тихо": пауза → маркер → ласощі. 4) Більше навантаження.';
    if (l.includes('пелюшк') || l.includes('туалет')) return '1) Обмежте простір. 2) Після сну/їжі — на місце. 3) "Так!" + ласощі одразу. 4) Промах — тихо прибрати.';
    if (l.includes('повідець') || l.includes('тягне')) return '1) Тягне = стоп. 2) Вільний повідок = йдемо. 3) Ласощі біля ноги. 4) Короткі прогулянки спочатку.';
    if (l.includes('кусає')) return '1) Завмріть + тихо "ай". 2) Пауза 5 сек. 3) Дайте іграшку. 4) Перезбуджено — вийдіть з кімнати.';
    return getProgramByAge(getAgeInWeeks(currentPet?.birthDate))?.tip || 'Запитайте конкретніше — я дам покроковий план! 🐾';
  }

  async function handleAISubmit(prompt) {
    if (!prompt.trim()) return;
    addChatMessage(prompt, 'user'); showTyping();
    try { const r = await fetchAIResponse(prompt); removeTyping(); addChatMessage(r, 'assistant'); }
    catch { removeTyping(); addChatMessage('Помилка. Спробуйте ще раз 🔄', 'assistant'); }
  }

  // ===== Event Binding =====
  function bindEvents() {
    setTheme(themeMode);
    $$('[data-theme-toggle]').forEach(b => b.addEventListener('click', () => { setTheme(themeMode === 'dark' ? 'light' : 'dark'); haptic(); }));
    $('googleLoginBtn')?.addEventListener('click', loginGoogle);
    $('logoutBtn')?.addEventListener('click', logout);
    $$('.nav-item').forEach(b => b.addEventListener('click', () => { setActiveTab(b.dataset.tab); haptic(); }));
    $('fabAddEvent')?.addEventListener('click', openSheet);
    $('sheetBackdrop')?.addEventListener('click', closeSheet);

    $('saveEventBtn')?.addEventListener('click', async () => {
      if (!selectedEventType) return toast('Оберіть тип події', 'error');
      const payload = { eventType: selectedEventType, timeLabel: $('eventTime')?.value || nowTime(), note: $('eventNote')?.value?.trim() || '' };
      const val = $('eventValue')?.value;
      if (val) payload.value = parseFloat(val);
      await addEvent(payload);
      $('eventNote').value = ''; $('eventValue').value = '';
      closeSheet();
    });

    $('petProfileForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await savePetProfile({
        name: $('petName').value.trim(),
        birthDate: $('petBirthDate').value,
        sex: $('petSex').value,
        breed: $('petBreed').value.trim(),
        weight: $('petWeight').value,
        toiletMode: $('petToiletMode').value
      });
    });

    $('saveHealthBtn')?.addEventListener('click', async () => {
      await savePetProfile({
        lastVaccine: $('petLastVaccine').value,
        lastDeworming: $('petLastDeworming').value,
        lastHeat: $('petLastHeat')?.value || ''
      });
    });

    $('petSex')?.addEventListener('change', () => {
      const f = $('heatDateField');
      if (f) f.style.display = $('petSex').value === 'дівчинка' ? '' : 'none';
    });

    $$('#diaryFilters .chip').forEach(btn => btn.addEventListener('click', () => {
      currentDiaryFilter = btn.dataset.filter;
      $$('#diaryFilters .chip').forEach(b => b.classList.toggle('active', b === btn));
      renderFeed('recentLogsDiary', currentDiaryFilter);
    }));

    $$('#courseFilters [data-course-level]').forEach(btn => btn.addEventListener('click', () => {
      currentCourseLevel = btn.dataset.courseLevel;
      $$('#courseFilters [data-course-level]').forEach(b => b.classList.toggle('active', b === btn));
      renderCourses();
    }));

    $('copyInviteBtn')?.addEventListener('click', async () => {
      if (!workspaceData?.inviteCode) return;
      try { await navigator.clipboard.writeText(workspaceData.inviteCode); toast('Скопійовано ✓', 'success'); }
      catch { toast('Помилка копіювання', 'error'); }
    });

    $('joinWorkspaceForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await joinWorkspaceByInvite($('inviteCodeInput').value); $('inviteCodeInput').value = ''; toast('Приєдналися! 🎉', 'success'); }
      catch (err) { toast(err.message, 'error'); }
    });

    $('aiForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = $('aiInput'); const msg = input.value.trim();
      if (!msg) return;
      input.value = ''; input.style.height = 'auto';
      await handleAISubmit(msg);
    });

    $$('[data-ai-prompt]').forEach(b => b.addEventListener('click', async () => { await handleAISubmit(b.dataset.aiPrompt); haptic(); }));
    $('clearChatBtn')?.addEventListener('click', () => { const c = $('aiChat'); if (c) c.innerHTML = ''; });

    const aiInput = $('aiInput');
    if (aiInput) aiInput.addEventListener('input', () => { aiInput.style.height = 'auto'; aiInput.style.height = Math.min(aiInput.scrollHeight, 100) + 'px'; });
    $('aiInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('aiForm')?.requestSubmit(); } });

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
    let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (activeTab === 'tabDiary') renderChart('progressChartDiary'); }, 200); });
  }

  // ===== Boot =====
  function bootAuth() {
    auth.onAuthStateChanged(async (user) => {
      currentUser = user || null;
      if (!currentUser) { show($('authScreen')); hide($('appContent')); return; }
      hide($('authScreen')); show($('appContent')); showLoading();
      try {
        await ensureWorkspaceForUser(currentUser);
        subscribePet(); subscribeMembers(); subscribeEvents(); queueRender();
      } catch (e) { console.error('Boot:', e); toast('Помилка завантаження', 'error'); }
      finally { hideLoading(); }
    });
  }

  // ===== Init =====
  bindEvents();
  bootAuth();
  auth.getRedirectResult().then(r => { if (r?.user) console.log('Redirect OK'); }).catch(e => { if (e.code && e.code !== 'auth/no-auth-event') toast('Помилка входу', 'error'); });

})();

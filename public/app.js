import { AGE_PROGRAMS, COURSES, KNOWLEDGE, SOCIAL_ITEMS, TOILET_GUIDE, TYPE_CONFIG } from './content.js';

firebase.initializeApp({
  apiKey: 'AIzaSyCY2SkRPpopi7mtsihrlqocxdgG8cBjNHI',
  authDomain: 'dogsbelli.vercel.app',
  projectId: 'dogs-55f5e',
  storageBucket: 'dogs-55f5e.firebasestorage.app',
  messagingSenderId: '1053489833652',
  appId: '1:1053489833652:web:ddf53d87b0a4af4207d9e1'
});

const auth = firebase.auth();
const db = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

let currentUser = null;
let workspaceId = null;
let workspaceData = null;
let currentPet = null;
let currentCourseId = 'pee-pad';
let eventsState = [];
let membersState = [];
let unsubEvents = null;
let unsubMembers = null;
let unsubPet = null;
let obMode = 'pad';
let dailyDone = {};
let themeMode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const $ = (id) => document.getElementById(id);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function haptic(ms = 10) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

function nowTime() {
  return new Date().toTimeString().slice(0, 5);
}

function createInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function avatarText(name) {
  return ((name || 'П').trim()[0] || 'П').toUpperCase();
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function getAgeInWeeks(birthDate) {
  if (!birthDate) return null;
  const diff = Date.now() - new Date(birthDate).getTime();
  return isNaN(diff) || diff < 0 ? null : Math.floor(diff / 604800000);
}

function getAgeLabel(weeks) {
  if (weeks == null) return 'Вік не вказаний';
  if (weeks < 8) return `${weeks} тиж.`;
  if (weeks < 52) return `${Math.floor(weeks / 4.345)} міс.`;
  return `${(weeks / 52).toFixed(1)} р.`;
}

function getProgramByAge(weeks) {
  if (weeks == null) return AGE_PROGRAMS[1] || AGE_PROGRAMS[0];
  return AGE_PROGRAMS.find((p) => weeks >= p.minWeeks && weeks < p.maxWeeks) || AGE_PROGRAMS[AGE_PROGRAMS.length - 1];
}

function getEventCountForToday(type) {
  const start = todayStart();
  return eventsState.filter((e) => {
    if (!e.createdAt) return false;
    const ts = e.createdAt.toDate ? e.createdAt.toDate() : new Date(e.createdAt);
    return ts >= start && e.eventType === type;
  }).length;
}

function showToast(msg, type = '') {
  const c = $('toastContainer');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`.trim();
  t.textContent = msg;
  c.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 250);
  }, 2600);
}

function confetti() {
  const canvas = $('confettiCanvas');
  if (!canvas) return;
  const colors = ['#0e766e', '#eab308', '#ef4444', '#3b82f6', '#a855f7', '#f97316'];
  for (let i = 0; i < 36; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.left = Math.random() * 100 + '%';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.animationDelay = Math.random() * .35 + 's';
    p.style.animationDuration = 2.4 + Math.random() * 1.2 + 's';
    p.style.width = 5 + Math.random() * 6 + 'px';
    p.style.height = 5 + Math.random() * 6 + 'px';
    canvas.appendChild(p);
  }
  setTimeout(() => { canvas.innerHTML = ''; }, 4200);
}

function setTheme(mode) {
  themeMode = mode === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', themeMode);
}

function toggleTheme() {
  setTheme(themeMode === 'dark' ? 'light' : 'dark');
}

function updateAuthUI(loggedIn) {
  $('authScreen')?.classList.toggle('hidden', loggedIn);
  $('appContent')?.classList.toggle('hidden', !loggedIn);
  $('logoutBtn')?.classList.toggle('hidden', !loggedIn);
}

function setActiveTab(id) {
  $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === id));
  $$('.nav-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
  const fab = $('fabAddEvent');
  if (fab) fab.style.display = id === 'tabProfile' ? 'none' : 'grid';
  if (id === 'tabDiary') setTimeout(renderChart, 40);
  haptic();
}

function openSheet() {
  $('eventSheet')?.classList.remove('hidden');
  const t = $('eventTime');
  if (t) t.value = nowTime();
}

function closeSheet() {
  $('eventSheet')?.classList.add('hidden');
}

function renderWeekCalendar() {
  const wrap = $('weekCalendar');
  if (!wrap) return;
  const names = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const now = new Date();
  const currentDay = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - currentDay + 1);
  if (currentDay === 0) start.setDate(now.getDate() - 6);
  wrap.innerHTML = '';

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const isToday = d.toDateString() === now.toDateString();
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = `day-pill ${isToday ? 'active' : ''}`;
    pill.innerHTML = `<span class="day-name">${names[d.getDay()]}</span><span class="day-num">${d.getDate()}</span>`;
    wrap.appendChild(pill);
  }
}

function renderHeader() {
  const petName = currentPet?.name?.trim() || 'Песик';
  const weeks = getAgeInWeeks(currentPet?.birthDate);
  const stage = getProgramByAge(weeks)?.stage || 'Щоденний режим';
  $('petNameHeader').textContent = petName;
  $('headerSub').textContent = `${getAgeLabel(weeks)} · ${stage}`;
  $('profileName').textContent = petName;
  $('profileMeta').textContent = [currentPet?.breed || 'Порода не вказана', getAgeLabel(weeks)].join(' · ');

  const photo = currentUser?.photoURL;
  const avatar = $('userAvatar');
  if (avatar) {
    avatar.innerHTML = photo ? `<img src="${photo}" alt="user" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : avatarText(currentUser?.displayName || petName);
  }
  const big = $('profileAvatarBig');
  if (big) big.textContent = '🐶';
}

function renderDailyPlan() {
  const list = $('dailyItems');
  const badge = $('dailyProgressBadge');
  if (!list) return;
  const weeks = getAgeInWeeks(currentPet?.birthDate);
  const program = getProgramByAge(weeks);
  const plan = (program?.plan || []).slice(0, 3);
  const doneMap = dailyDone[todayKey()] || {};

  list.innerHTML = plan.map((item, index) => `
    <label class="daily-item ${doneMap[index] ? 'done' : ''}">
      <input type="checkbox" data-daily-index="${index}" ${doneMap[index] ? 'checked' : ''}>
      <span>${item}</span>
    </label>
  `).join('');

  const checked = Object.values(doneMap).filter(Boolean).length;
  badge.textContent = `${checked}/${plan.length || 0}`;

  $$('[data-daily-index]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const day = todayKey();
      dailyDone[day] = dailyDone[day] || {};
      dailyDone[day][cb.dataset.dailyIndex] = cb.checked;
      cb.closest('.daily-item')?.classList.toggle('done', cb.checked);
      renderDailyPlan();
      if (Object.values(dailyDone[day]).filter(Boolean).length === plan.length && plan.length) {
        confetti();
        showToast('План на сьогодні виконано', 'success');
      }
    });
  });
}

function renderSuggestion() {
  const card = $('suggestionCard');
  const text = $('suggestionText');
  if (!card || !text) return;

  const allToilet = eventsState.filter((e) => ['pad', 'outdoor', 'miss'].includes(e.eventType));
  if (allToilet.length < 3) {
    const program = getProgramByAge(getAgeInWeeks(currentPet?.birthDate));
    text.textContent = program?.tip || 'Записуйте події кілька днів поспіль — тоді поради стануть точнішими.';
    card.classList.remove('hidden');
    return;
  }

  const recent = allToilet.slice(0, 20);
  const success = recent.filter((e) => e.eventType !== 'miss').length;
  const pct = recent.length ? Math.round((success / recent.length) * 100) : 0;
  const topMissTrigger = Object.entries(
    allToilet.filter((e) => e.eventType === 'miss' && e.trigger).reduce((acc, e) => {
      acc[e.trigger] = (acc[e.trigger] || 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1])[0];

  let message = '';
  if (pct >= 80 && recent.length >= 8) {
    message = `Чудовий результат: ${pct}% успіху в останніх записах. Можна потроху ускладнювати режим або розширювати простір.`;
  } else if (topMissTrigger && topMissTrigger[1] >= 2) {
    message = `Найчастіший тригер промахів: «${topMissTrigger[0]}». Підводьте собаку у правильне місце ще ДО цього моменту.`;
  } else if (getEventCountForToday('miss') >= 2) {
    message = 'Сьогодні вже було кілька промахів. Зменште свободу пересування і частіше нагадуйте про туалет після сну, їжі та гри.';
  } else {
    message = getProgramByAge(getAgeInWeeks(currentPet?.birthDate))?.tip || 'Краще 2–3 короткі успішні сесії, ніж одне довге перевтомлене тренування.';
  }

  text.textContent = message;
  card.classList.remove('hidden');
}

function renderKpis() {
  $('kpiPad').textContent = getEventCountForToday('pad');
  $('kpiOutdoor').textContent = getEventCountForToday('outdoor');
  $('kpiMiss').textContent = getEventCountForToday('miss');
  $('kpiTotal').textContent = eventsState.length;
}

function renderFeed() {
  const list = $('recentLogs');
  if (!list) return;
  if (!eventsState.length) {
    list.innerHTML = `<div class="card">Поки що немає записів. Натисни + і додай першу подію.</div>`;
    return;
  }

  list.innerHTML = eventsState.slice(0, 20).map((item) => {
    const conf = TYPE_CONFIG[item.eventType] || { icon: '•', label: item.eventType || 'Подія', tone: '' };
    const note = item.note ? `<div class="meta">${item.note}</div>` : '';
    return `
      <div class="feed-item" data-id="${item.id}">
        <div>
          <strong>${conf.icon} ${conf.label}</strong>
          <div class="meta">${item.timeLabel || '—'}${item.byName ? ` · ${item.byName}` : ''}</div>
          ${note}
        </div>
        <button type="button" class="btn-small" data-delete-event="${item.id}">Видалити</button>
      </div>
    `;
  }).join('');

  $$('[data-delete-event]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Видалити запис?')) return;
      await deleteEvent(btn.dataset.deleteEvent);
    });
  });
}

function renderChart() {
  const canvas = $('progressChart');
  if (!canvas || !canvas.getContext) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const dayEvents = eventsState.filter((e) => {
      if (!e.createdAt) return false;
      const ts = e.createdAt.toDate ? e.createdAt.toDate() : new Date(e.createdAt);
      return ts >= d && ts < next;
    });
    const success = dayEvents.filter((e) => ['pad', 'outdoor'].includes(e.eventType)).length;
    const miss = dayEvents.filter((e) => e.eventType === 'miss').length;
    const total = success + miss;
    days.push({ date: d, pct: total ? Math.round(success / total * 100) : null });
  }

  const css = getComputedStyle(document.documentElement);
  const primary = css.getPropertyValue('--primary').trim() || '#0e766e';
  const danger = css.getPropertyValue('--danger').trim() || '#ef4444';
  const line = css.getPropertyValue('--line').trim() || '#e5e7eb';
  const muted = css.getPropertyValue('--text-muted').trim() || '#6b7280';
  const orange = '#d97706';

  const pad = { top: 12, right: 6, bottom: 20, left: 6 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;
  const barW = cw / days.length;

  ctx.lineWidth = 1;
  ctx.strokeStyle = line;
  [0, 50, 100].forEach((v) => {
    const y = pad.top + ch - (v / 100) * ch;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
  });

  days.forEach((day, i) => {
    const x = pad.left + i * barW + barW * 0.18;
    const bw = barW * 0.64;
    if (day.pct == null) {
      ctx.fillStyle = muted;
      ctx.beginPath();
      ctx.arc(x + bw / 2, pad.top + ch - 4, 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const barH = Math.max(4, (day.pct / 100) * ch);
      const y = pad.top + ch - barH;
      ctx.fillStyle = day.pct >= 70 ? primary : day.pct >= 40 ? orange : danger;
      const r = Math.min(4, bw / 2);
      ctx.beginPath();
      ctx.moveTo(x, y + barH);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.lineTo(x + bw - r, y);
      ctx.quadraticCurveTo(x + bw, y, x + bw, y + r);
      ctx.lineTo(x + bw, y + barH);
      ctx.closePath();
      ctx.fill();
    }

    if (i % 3 === 0 || i === days.length - 1) {
      ctx.fillStyle = muted;
      ctx.font = '11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`${day.date.getDate()}/${day.date.getMonth() + 1}`, x + bw / 2, h - 4);
    }
  });
}

function renderCourses() {
  const grid = $('courseGrid');
  const viewer = $('selectedCourse');
  const ageBadge = $('ageSummaryBadge');
  if (!grid || !viewer) return;

  const weeks = getAgeInWeeks(currentPet?.birthDate);
  const program = getProgramByAge(weeks);
  ageBadge.textContent = program?.stage || '';

  grid.innerHTML = COURSES.map((course) => `
    <button type="button" class="course-card ${course.id === currentCourseId ? 'selected' : ''}" data-course-id="${course.id}">
      <div class="c-icon">${(course.badge || '🎓').split(' ')[0]}</div>
      <strong>${course.title}</strong>
      <span>${course.description}</span>
    </button>
  `).join('');

  $$('[data-course-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentCourseId = btn.dataset.courseId;
      renderCourses();
      haptic();
    });
  });

  const course = COURSES.find((c) => c.id === currentCourseId) || COURSES[0];
  if (!course) return;
  viewer.classList.remove('hidden');
  viewer.innerHTML = `
    <div class="card mt-3">
      <h3>${course.title}</h3>
      <p class="mt-2">${course.description}</p>
      <div class="mt-3">
        <h3>Кроки</h3>
        <ol class="mt-2" style="padding-left:1rem; display:grid; gap:.45rem;">
          ${course.steps.map((s) => `<li>${s}</li>`).join('')}
        </ol>
      </div>
      <div class="mt-3">
        <h3>Не робити</h3>
        <ul class="mt-2" style="padding-left:1rem; display:grid; gap:.45rem;">
          ${course.mistakes.map((s) => `<li>${s}</li>`).join('')}
        </ul>
      </div>
      <div class="mt-3">
        <h3>Чекліст</h3>
        <ul class="mt-2" style="padding-left:1rem; display:grid; gap:.45rem;">
          ${course.checklist.map((s) => `<li>${s}</li>`).join('')}
        </ul>
      </div>
    </div>
  `;
}

function renderKnowledge() {
  const grid = $('knowledgeGrid');
  if (!grid) return;
  grid.innerHTML = KNOWLEDGE.map((k) => `
    <div class="card mt-3">
      <span class="badge badge-primary">${k.tag}</span>
      <h3 class="mt-2">${k.title}</h3>
      <p class="mt-2">${k.text}</p>
    </div>
  `).join('');
}

function fillPetForm() {
  $('petName').value = currentPet?.name || '';
  $('petBirthDate').value = currentPet?.birthDate || '';
  $('petSex').value = currentPet?.sex || 'хлопчик';
  $('petBreed').value = currentPet?.breed || '';
  $('petToiletMode').value = currentPet?.toiletMode || 'pad';
}

function renderMembers() {
  const list = $('membersList');
  if (!list) return;
  list.innerHTML = membersState.length ? membersState.map((m) => `
    <div class="card mt-2" style="padding:.8rem; display:flex; align-items:center; gap:.7rem;">
      <div class="user-avatar" style="flex-shrink:0;">${m.photoURL ? `<img src="${m.photoURL}" alt="${m.displayName || 'user'}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : avatarText(m.displayName)}</div>
      <div>
        <strong>${m.displayName || 'Учасник'}</strong>
        <div class="meta">${m.role || 'member'}</div>
      </div>
    </div>
  `).join('') : `<div class="card mt-2">Поки що тут тільки ви.</div>`;
}

function renderWorkspaceMeta() {
  $('workspaceName').textContent = workspaceData?.name || '—';
  $('inviteCodeView').textContent = workspaceData?.inviteCode || '—';
}

function renderProfile() {
  renderHeader();
  fillPetForm();
  renderWorkspaceMeta();
  renderMembers();
}

function renderAll() {
  renderWeekCalendar();
  renderHeader();
  renderDailyPlan();
  renderSuggestion();
  renderKpis();
  renderFeed();
  renderCourses();
  renderKnowledge();
  renderProfile();
  setTimeout(renderChart, 50);
  $('appLoader')?.classList.add('hidden');
}

async function ensureWorkspaceForUser(user) {
  const userDoc = await db.collection('users').doc(user.uid).get();

  if (userDoc.exists && userDoc.data().workspaceId) {
    workspaceId = userDoc.data().workspaceId;
    const wsDoc = await db.collection('workspaces').doc(workspaceId).get();
    workspaceData = wsDoc.exists ? wsDoc.data() : null;
    return;
  }

  const newRef = db.collection('workspaces').doc();
  workspaceId = newRef.id;
  const inviteCode = createInviteCode();
  const spaceName = `${(user.displayName || 'Мій').split(' ')[0]} Family`;

  await newRef.set({
    name: spaceName,
    ownerId: user.uid,
    inviteCode,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  workspaceData = { name: spaceName, ownerId: user.uid, inviteCode };

  await db.collection('users').doc(user.uid).set({
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || 'User',
    photoURL: user.photoURL || '',
    role: 'owner',
    workspaceId,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  await db.collection('workspaces').doc(workspaceId).collection('members').doc(user.uid).set({
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || 'User',
    photoURL: user.photoURL || '',
    role: 'owner',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  await db.collection('workspaces').doc(workspaceId).collection('dogs').doc('primary').set({
    name: '',
    birthDate: '',
    sex: 'хлопчик',
    breed: '',
    toiletMode: 'pad',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

function subscribePet() {
  if (!workspaceId) return;
  if (unsubPet) unsubPet();
  unsubPet = db.collection('workspaces').doc(workspaceId).collection('dogs').doc('primary').onSnapshot((snap) => {
    currentPet = snap.exists ? snap.data() : null;
    renderAll();
  });
}

function subscribeMembers() {
  if (!workspaceId) return;
  if (unsubMembers) unsubMembers();
  unsubMembers = db.collection('workspaces').doc(workspaceId).collection('members').onSnapshot((snap) => {
    membersState = [];
    snap.forEach((d) => membersState.push(d.data()));
    renderMembers();
  });
}

function subscribeEvents() {
  if (!workspaceId) return;
  if (unsubEvents) unsubEvents();
  unsubEvents = db.collection('workspaces').doc(workspaceId).collection('events').orderBy('createdAt', 'desc').limit(500).onSnapshot((snap) => {
    eventsState = [];
    snap.forEach((d) => eventsState.push({ id: d.id, ...d.data() }));
    renderAll();
  });
}

async function savePetProfile(payload) {
  if (!currentUser || !workspaceId) return showToast('Спочатку увійди в акаунт', 'error');
  await db.collection('workspaces').doc(workspaceId).collection('dogs').doc('primary').set({
    ...(currentPet || {}),
    ...payload,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  showToast('Профіль собаки збережено', 'success');
  haptic();
}

async function addEvent(payload) {
  if (!currentUser || !workspaceId) return showToast('Потрібен вхід', 'error');
  await db.collection('workspaces').doc(workspaceId).collection('events').add({
    eventType: payload.eventType,
    byUid: currentUser.uid,
    byName: payload.byName || currentUser.displayName || 'Я',
    trigger: payload.trigger || '',
    note: payload.note || '',
    timeLabel: payload.timeLabel || nowTime(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  showToast('Подію збережено', 'success');
  if ([1, 10, 25, 50].includes(eventsState.length + 1)) confetti();
}

async function deleteEvent(id) {
  if (!workspaceId || !id) return;
  await db.collection('workspaces').doc(workspaceId).collection('events').doc(id).delete();
  showToast('Запис видалено', 'success');
}

async function joinWorkspaceByInvite(code) {
  if (!currentUser) return showToast('Спочатку увійдіть', 'error');
  const clean = (code || '').trim().toUpperCase();
  if (!clean) throw new Error('Введи код запрошення');
  const snap = await db.collection('workspaces').where('inviteCode', '==', clean).limit(1).get();
  if (snap.empty) throw new Error('Код не знайдено');

  workspaceId = snap.docs[0].id;
  workspaceData = snap.docs[0].data();

  await db.collection('users').doc(currentUser.uid).set({
    uid: currentUser.uid,
    email: currentUser.email || '',
    displayName: currentUser.displayName || 'User',
    photoURL: currentUser.photoURL || '',
    role: 'member',
    workspaceId
  }, { merge: true });

  await db.collection('workspaces').doc(workspaceId).collection('members').doc(currentUser.uid).set({
    uid: currentUser.uid,
    email: currentUser.email || '',
    displayName: currentUser.displayName || 'User',
    photoURL: currentUser.photoURL || '',
    role: 'member',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  subscribePet();
  subscribeMembers();
  subscribeEvents();
  renderAll();
  confetti();
}

function loginGoogle() {
  auth.signInWithRedirect(googleProvider);
}

async function logoutGoogle() {
  if (unsubEvents) unsubEvents();
  if (unsubMembers) unsubMembers();
  if (unsubPet) unsubPet();
  unsubEvents = unsubMembers = unsubPet = null;
  await auth.signOut();
  currentUser = null;
  workspaceId = null;
  workspaceData = null;
  currentPet = null;
  eventsState = [];
  membersState = [];
  updateAuthUI(false);
  showToast('Ви вийшли з акаунту');
}

function showOnboarding() {
  $('onboarding')?.classList.remove('hidden');
}

function hideOnboarding() {
  $('onboarding')?.classList.add('hidden');
}

async function finishOnboarding() {
  const name = $('obName').value.trim();
  const birth = $('obBirth').value;
  hideOnboarding();
  if (name || birth || obMode !== 'pad') {
    await savePetProfile({ name, birthDate: birth, toiletMode: obMode });
  }
  confetti();
}

function bindOnboarding() {
  $('obNext1')?.addEventListener('click', () => {
    $$('.ob-screen').forEach((s) => s.classList.remove('active'));
    $('ob2')?.classList.add('active');
    $$('.ob-dot').forEach((d, i) => d.classList.toggle('active', i === 1));
  });

  $('obNext2')?.addEventListener('click', () => {
    $$('.ob-screen').forEach((s) => s.classList.remove('active'));
    $('ob3')?.classList.add('active');
    $$('.ob-dot').forEach((d, i) => d.classList.toggle('active', i === 2));
  });

  $$('.ob-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.ob-option').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      obMode = btn.dataset.mode;
    });
  });

  $('obFinish')?.addEventListener('click', finishOnboarding);
}

function bootAuth() {
  auth.getRedirectResult().catch(() => {});
  auth.onAuthStateChanged(async (user) => {
    currentUser = user || null;
    updateAuthUI(!!currentUser);
    if (!currentUser) {
      $('appLoader')?.classList.add('hidden');
      return;
    }

    try {
      await ensureWorkspaceForUser(currentUser);
      subscribePet();
      subscribeMembers();
      subscribeEvents();
    } catch (e) {
      console.error(e);
      showToast(e.message || 'Помилка запуску', 'error');
      $('appLoader')?.classList.add('hidden');
    }
  });
}

function bindEvents() {
  setTheme(themeMode);

  $$('[data-theme-toggle]').forEach((btn) => btn.addEventListener('click', toggleTheme));
  $('googleLoginBtn')?.addEventListener('click', loginGoogle);
  $('logoutBtn')?.addEventListener('click', logoutGoogle);
  $('fabAddEvent')?.addEventListener('click', openSheet);
  $('sheetBackdrop')?.addEventListener('click', closeSheet);

  $$('.nav-tab').forEach((b) => b.addEventListener('click', () => setActiveTab(b.dataset.tab)));

  $$('[data-quick-event]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await addEvent({ eventType: btn.dataset.quickEvent, timeLabel: nowTime() });
        closeSheet();
        haptic();
      } catch (e) {
        showToast(e.message || 'Не вдалося додати подію', 'error');
      }
    });
  });

  $('eventForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await addEvent({
        eventType: $('eventType').value,
        timeLabel: $('eventTime').value || nowTime(),
        note: $('eventNote').value.trim()
      });
      e.target.reset();
      closeSheet();
    } catch (err) {
      showToast(err.message || 'Помилка збереження', 'error');
    }
  });

  $('petProfileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await savePetProfile({
        name: $('petName').value.trim(),
        birthDate: $('petBirthDate').value,
        sex: $('petSex').value,
        breed: $('petBreed').value.trim(),
        toiletMode: $('petToiletMode').value
      });
    } catch (err) {
      showToast(err.message || 'Помилка збереження', 'error');
    }
  });

  $('copyInviteBtn')?.addEventListener('click', async () => {
    if (!workspaceData?.inviteCode) return;
    try {
      await navigator.clipboard.writeText(workspaceData.inviteCode);
      showToast('Код скопійовано', 'success');
    } catch {
      showToast('Не вдалося скопіювати', 'error');
    }
  });

  $('joinWorkspaceForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await joinWorkspaceByInvite($('inviteCodeInput').value);
      $('inviteCodeInput').value = '';
      showToast('Ви приєдналися до простору', 'success');
    } catch (err) {
      showToast(err.message || 'Не вдалося приєднатися', 'error');
    }
  });

  window.addEventListener('resize', () => {
    if ($('tabDiary')?.classList.contains('active')) renderChart();
  });
}

bindOnboarding();
bindEvents();
bootAuth();

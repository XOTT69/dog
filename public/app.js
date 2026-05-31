from pathlib import Path
# Overwrite app.js with a cleaner v2.1 pass that removes old artifacts and aligns with the new HTML/CSS.
app = r'''import { AGE_PROGRAMS, COURSES, KNOWLEDGE, SOCIAL_ITEMS, TOILET_GUIDE, TYPE_CONFIG } from './content.js';

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

const $ = (id) => document.getElementById(id);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const today = () => new Date().toISOString().slice(0, 10);
const timeNow = () => new Date().toTimeString().slice(0, 5);
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const avatarLetter = (name = 'П') => ((name.trim()[0] || 'П').toUpperCase());
const weekLabel = (weeks) => weeks == null ? '—' : weeks < 8 ? `${weeks} тиж.` : weeks < 52 ? `${Math.floor(weeks / 4.345)} міс.` : `${(weeks / 52).toFixed(1)} р.`;
const toast = (msg, type = '') => { const box = $('toastContainer'); if (!box) return; const el = document.createElement('div'); el.className = `toast ${type}`.trim(); el.textContent = msg; box.appendChild(el); requestAnimationFrame(() => el.classList.add('show')); setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, 2800); };
const haptic = (ms = 10) => { if (navigator.vibrate) navigator.vibrate(ms); };

let currentUser = null;
let workspaceId = null;
let workspaceData = null;
let currentPet = null;
let eventsState = [];
let membersState = [];
let currentCourseId = 'pee-pad';
let obMode = 'pad';
let themeMode = localStorage.getItem('doggo_theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
let dailyDone = JSON.parse(localStorage.getItem('doggo_daily_done') || '{}');
let unsubEvents = null;
let unsubMembers = null;
let unsubPet = null;

const setTheme = (mode) => {
  themeMode = mode === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', themeMode);
  localStorage.setItem('doggo_theme', themeMode);
};

const getAgeInWeeks = (bd) => {
  if (!bd) return null;
  const diff = Date.now() - new Date(bd).getTime();
  return isNaN(diff) || diff < 0 ? null : Math.floor(diff / 604800000);
};

const getProgramByAge = (weeks) => {
  if (weeks == null) return AGE_PROGRAMS[1] || AGE_PROGRAMS[0];
  return AGE_PROGRAMS.find(p => weeks >= p.minWeeks && weeks < p.maxWeeks) || AGE_PROGRAMS[AGE_PROGRAMS.length - 1];
};

const getEventCountForToday = (type) => {
  const start = startOfToday();
  return eventsState.filter(e => {
    if (!e.createdAt) return false;
    const ts = e.createdAt.toDate ? e.createdAt.toDate() : new Date(e.createdAt);
    return ts >= start && e.eventType === type;
  }).length;
};

const createInviteCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

function showConfetti() {
  const canvas = $('confettiCanvas');
  if (!canvas) return;
  const colors = ['#0e766e', '#eab308', '#ef4444', '#3b82f6', '#a855f7', '#f97316'];
  for (let i = 0; i < 36; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.left = Math.random() * 100 + '%';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.animationDelay = Math.random() * .5 + 's';
    p.style.animationDuration = 2.4 + Math.random() * 1.4 + 's';
    p.style.width = (5 + Math.random() * 6) + 'px';
    p.style.height = (5 + Math.random() * 6) + 'px';
    canvas.appendChild(p);
  }
  setTimeout(() => { canvas.innerHTML = ''; }, 4200);
}

function updateAuthUI(loggedIn) {
  $('authScreen')?.classList.toggle('hidden', loggedIn);
  $('appContent')?.classList.toggle('hidden', !loggedIn);
  $('logoutBtn')?.classList.toggle('hidden', !loggedIn);
  $('appLoader')?.classList.add('hidden');
}

function setActiveTab(id) {
  $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === id));
  $$('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  $('fabAddEvent').style.display = id === 'tabProfile' ? 'none' : 'grid';
  if (id === 'tabDiary') setTimeout(renderChart, 50);
}

function openSheet() { $('eventSheet').classList.remove('hidden'); $('eventTime').value = timeNow(); }
function closeSheet() { $('eventSheet').classList.add('hidden'); }
function saveDaily() { localStorage.setItem('doggo_daily_done', JSON.stringify(dailyDone)); }

function renderWeekCalendar() {
  const wrap = $('weekCalendar'); if (!wrap) return;
  const names = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const now = new Date();
  const d0 = new Date(now);
  const day = now.getDay();
  d0.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  wrap.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(d0); d.setDate(d0.getDate() + i);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `day-pill ${d.toDateString() === now.toDateString() ? 'active' : ''}`;
    b.innerHTML = `<span class="day-name">${names[d.getDay()]}</span><span class="day-num">${d.getDate()}</span>`;
    wrap.appendChild(b);
  }
}

function renderHeader() {
  const petName = currentPet?.name?.trim() || 'Песик';
  const weeks = getAgeInWeeks(currentPet?.birthDate);
  const program = getProgramByAge(weeks);
  $('petNameHeader').textContent = petName;
  $('headerSub').textContent = `${weekLabel(weeks)} · ${program.stage}`;
  $('profileName').textContent = petName;
  $('profileMeta').textContent = [currentPet?.breed || 'Порода не вказана', weekLabel(weeks)].join(' · ');
  const avatar = $('userAvatar');
  avatar.innerHTML = currentUser?.photoURL ? `<img src="${currentUser.photoURL}" alt="user">` : avatarLetter(currentUser?.displayName || petName);
  $('ageSummaryBadge').textContent = program.stage;
}

function renderDailyPlan() {
  const list = $('dailyItems');
  const badge = $('dailyProgressBadge');
  if (!list || !badge) return;
  const plan = (getProgramByAge(getAgeInWeeks(currentPet?.birthDate))?.plan || []).slice(0, 3);
  const done = dailyDone[today()] || {};
  list.innerHTML = plan.map((item, i) => `<label class="daily-item ${done[i] ? 'done' : ''}"><input type="checkbox" data-daily-index="${i}" ${done[i] ? 'checked' : ''}><span>${item}</span></label>`).join('');
  badge.textContent = `${Object.values(done).filter(Boolean).length}/${plan.length}`;
  $$('[data-daily-index]').forEach(cb => cb.addEventListener('change', () => {
    const key = today();
    dailyDone[key] = dailyDone[key] || {};
    dailyDone[key][cb.dataset.dailyIndex] = cb.checked;
    saveDaily();
    renderDailyPlan();
    if (plan.length && Object.values(dailyDone[key]).filter(Boolean).length === plan.length) {
      showConfetti();
      toast('План на сьогодні виконано', 'success');
    }
  }));
}

function renderSuggestion() {
  const card = $('suggestionCard');
  const text = $('suggestionText');
  if (!card || !text) return;
  const toilet = eventsState.filter(e => ['pad', 'outdoor', 'miss'].includes(e.eventType));
  if (toilet.length < 3) {
    text.textContent = getProgramByAge(getAgeInWeeks(currentPet?.birthDate))?.tip || 'Записуйте події кілька днів поспіль.';
    card.classList.remove('hidden');
    return;
  }
  const recent = toilet.slice(0, 20);
  const success = recent.filter(e => e.eventType !== 'miss').length;
  const pct = recent.length ? Math.round(success / recent.length * 100) : 0;
  const missTriggers = {};
  toilet.filter(e => e.eventType === 'miss' && e.trigger).forEach(e => { missTriggers[e.trigger] = (missTriggers[e.trigger] || 0) + 1; });
  const topTrigger = Object.entries(missTriggers).sort((a, b) => b[1] - a[1])[0];
  let msg = '';
  if (pct >= 80 && recent.length >= 8) msg = `Чудовий прогрес: ${pct}% успіху. Можна трохи ускладнювати режим.`;
  else if (topTrigger && topTrigger[1] >= 2) msg = `Найчастіший тригер промахів: «${topTrigger[0]}». Підводьте раніше.`;
  else if (getEventCountForToday('miss') >= 2) msg = 'Сьогодні вже було кілька промахів. Зменште свободу і частіше ведіть на місце.';
  else msg = getProgramByAge(getAgeInWeeks(currentPet?.birthDate))?.tip || 'Краще коротко, але часто.';
  text.textContent = msg;
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
    list.innerHTML = '<div class="card">Поки що немає записів. Натисни + і додай першу подію.</div>';
    return;
  }
  list.innerHTML = eventsState.slice(0, 20).map(item => {
    const conf = TYPE_CONFIG[item.eventType] || { icon: '•', label: item.eventType || 'Подія' };
    return `<div class="feed-item"><div><strong>${conf.icon} ${conf.label}</strong><div class="meta">${item.timeLabel || '—'}${item.note ? ` · ${item.note}` : ''}</div></div><button type="button" class="btn-small" data-delete-event="${item.id}">Видалити</button></div>`;
  }).join('');
  $$('[data-delete-event]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Видалити запис?')) return;
    await deleteEvent(btn.dataset.deleteEvent);
  }));
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
  const w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    const dayEvents = eventsState.filter(e => { if (!e.createdAt) return false; const ts = e.createdAt.toDate ? e.createdAt.toDate() : new Date(e.createdAt); return ts >= d && ts < next; });
    const success = dayEvents.filter(e => ['pad', 'outdoor'].includes(e.eventType)).length;
    const miss = dayEvents.filter(e => e.eventType === 'miss').length;
    const total = success + miss;
    days.push({ date: d, pct: total ? Math.round(success / total * 100) : null });
  }
  const css = getComputedStyle(document.documentElement);
  const primary = css.getPropertyValue('--primary').trim();
  const danger = css.getPropertyValue('--danger').trim();
  const line = css.getPropertyValue('--line').trim();
  const muted = css.getPropertyValue('--faint').trim();
  const orange = '#d97706';
  const pad = { top: 12, right: 6, bottom: 20, left: 6 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;
  const barW = cw / days.length;
  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  [0, 50, 100].forEach(v => { const y = pad.top + ch - (v / 100) * ch; ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke(); });
  days.forEach((day, i) => {
    const x = pad.left + i * barW + barW * .18;
    const bw = barW * .64;
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
  if (!grid || !viewer) return;
  grid.innerHTML = COURSES.map(course => `<button type="button" class="course-card ${course.id === currentCourseId ? 'selected' : ''}" data-course-id="${course.id}"><div class="c-icon">${(course.badge || '🎓').split(' ')[0]}</div><div><strong>${course.title}</strong><span>${course.description}</span></div></button>`).join('');
  $$('[data-course-id]').forEach(btn => btn.addEventListener('click', () => { currentCourseId = btn.dataset.courseId; renderCourses(); haptic(); }));
  const course = COURSES.find(c => c.id === currentCourseId) || COURSES[0];
  viewer.innerHTML = `<div class="card"><h3>${course.title}</h3><p class="mt-3">${course.description}</p><h4>Кроки</h4><ul>${course.steps.map(s => `<li>${s}</li>`).join('')}</ul><h4>Не робити</h4><ul class="mistakes">${course.mistakes.map(s => `<li>${s}</li>`).join('')}</ul><h4>Чекліст</h4><ul class="checks">${course.checklist.map(s => `<li>${s}</li>`).join('')}</ul></div>`;
}

function renderKnowledge() {
  const grid = $('knowledgeGrid');
  if (!grid) return;
  grid.innerHTML = KNOWLEDGE.map(k => `<div class="k-card"><strong>${k.title}</strong><p>${k.text}</p><span class="k-tag">${k.tag}</span></div>`).join('');
}

function renderMembers() {
  const list = $('membersList');
  if (!list) return;
  list.innerHTML = membersState.length ? membersState.map(m => `<div class="card" style="padding:.85rem;display:flex;align-items:center;gap:.7rem;"><div class="user-avatar">${m.photoURL ? `<img src="${m.photoURL}" alt="${m.displayName || 'user'}">` : avatarLetter(m.displayName)}</div><div><strong>${m.displayName || 'Учасник'}</strong><div class="meta">${m.role || 'member'}</div></div></div>`).join('') : '<div class="card">Поки що тут тільки ви.</div>';
}

function renderWorkspaceMeta() {
  $('workspaceName').textContent = workspaceData?.name || '—';
  $('inviteCodeView').textContent = workspaceData?.inviteCode || '—';
}

function fillPetForm() {
  $('petName').value = currentPet?.name || '';
  $('petBirthDate').value = currentPet?.birthDate || '';
  $('petSex').value = currentPet?.sex || 'хлопчик';
  $('petBreed').value = currentPet?.breed || '';
  $('petToiletMode').value = currentPet?.toiletMode || 'pad';
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
  renderMembers();
  renderWorkspaceMeta();
  fillPetForm();
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
  const wsRef = db.collection('workspaces').doc();
  workspaceId = wsRef.id;
  const inviteCode = createInviteCode();
  const name = `${(user.displayName || 'Мій').split(' ')[0]} Family`;
  workspaceData = { name, ownerId: user.uid, inviteCode };
  await wsRef.set({ name, ownerId: user.uid, inviteCode, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  await db.collection('users').doc(user.uid).set({ uid: user.uid, email: user.email || '', displayName: user.displayName || 'User', photoURL: user.photoURL || '', role: 'owner', workspaceId }, { merge: true });
  await wsRef.collection('members').doc(user.uid).set({ uid: user.uid, email: user.email || '', displayName: user.displayName || 'User', photoURL: user.photoURL || '', role: 'owner', createdAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  await wsRef.collection('dogs').doc('primary').set({ name: '', birthDate: '', sex: 'хлопчик', breed: '', toiletMode: 'pad', createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
}

function subscribePet() { if (!workspaceId) return; if (unsubPet) unsubPet(); unsubPet = db.collection('workspaces').doc(workspaceId).collection('dogs').doc('primary').onSnapshot(s => { currentPet = s.exists ? s.data() : null; renderAll(); }); }
function subscribeMembers() { if (!workspaceId) return; if (unsubMembers) unsubMembers(); unsubMembers = db.collection('workspaces').doc(workspaceId).collection('members').onSnapshot(s => { membersState = []; s.forEach(d => membersState.push(d.data())); renderMembers(); }); }
function subscribeEvents() { if (!workspaceId) return; if (unsubEvents) unsubEvents(); unsubEvents = db.collection('workspaces').doc(workspaceId).collection('events').orderBy('createdAt', 'desc').limit(500).onSnapshot(s => { eventsState = []; s.forEach(d => eventsState.push({ id: d.id, ...d.data() })); renderAll(); }); }

async function savePetProfile(payload) {
  if (!currentUser || !workspaceId) return toast('Спочатку увійдіть', 'error');
  await db.collection('workspaces').doc(workspaceId).collection('dogs').doc('primary').set({ ...(currentPet || {}), ...payload, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  toast('Профіль збережено', 'success');
  haptic();
}

async function addEvent(payload) {
  if (!currentUser || !workspaceId) return toast('Потрібен вхід', 'error');
  await db.collection('workspaces').doc(workspaceId).collection('events').add({ eventType: payload.eventType, byUid: currentUser.uid, byName: currentUser.displayName || 'Я', trigger: payload.trigger || '', note: payload.note || '', timeLabel: payload.timeLabel || timeNow(), createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  toast('Подію збережено', 'success');
}

async function deleteEvent(id) {
  if (!workspaceId || !id) return;
  await db.collection('workspaces').doc(workspaceId).collection('events').doc(id).delete();
  toast('Запис видалено', 'success');
}

async function joinWorkspaceByInvite(code) {
  if (!currentUser) return toast('Спочатку увійдіть', 'error');
  const clean = (code || '').trim().toUpperCase();
  if (!clean) throw new Error('Введи код запрошення');
  const snap = await db.collection('workspaces').where('inviteCode', '==', clean).limit(1).get();
  if (snap.empty) throw new Error('Код не знайдено');
  workspaceId = snap.docs[0].id;
  workspaceData = snap.docs[0].data();
  await db.collection('users').doc(currentUser.uid).set({ uid: currentUser.uid, email: currentUser.email || '', displayName: currentUser.displayName || 'User', photoURL: currentUser.photoURL || '', role: 'member', workspaceId }, { merge: true });
  await db.collection('workspaces').doc(workspaceId).collection('members').doc(currentUser.uid).set({ uid: currentUser.uid, email: currentUser.email || '', displayName: currentUser.displayName || 'User', photoURL: currentUser.photoURL || '', role: 'member', createdAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  subscribePet(); subscribeMembers(); subscribeEvents(); renderAll(); showConfetti();
}

function loginGoogle() { auth.signInWithRedirect(googleProvider); }
async function logoutGoogle() {
  if (unsubEvents) unsubEvents();
  if (unsubMembers) unsubMembers();
  if (unsubPet) unsubPet();
  unsubEvents = unsubMembers = unsubPet = null;
  await auth.signOut();
  currentUser = null; workspaceId = null; workspaceData = null; currentPet = null; eventsState = []; membersState = [];
  updateAuthUI(false);
}

function hideOnboarding() { $('onboarding')?.classList.add('hidden'); }
async function finishOnboarding() {
  const name = $('obName').value.trim();
  const birth = $('obBirth').value;
  hideOnboarding();
  if (name || birth || obMode !== 'pad') await savePetProfile({ name, birthDate: birth, toiletMode: obMode });
  showConfetti();
}

function bindOnboarding() {
  $('obNext1')?.addEventListener('click', () => { $$('.ob-screen').forEach(s => s.classList.remove('active')); $('ob2')?.classList.add('active'); $$('.ob-dot').forEach((d, i) => d.classList.toggle('active', i === 1)); });
  $('obNext2')?.addEventListener('click', () => { $$('.ob-screen').forEach(s => s.classList.remove('active')); $('ob3')?.classList.add('active'); $$('.ob-dot').forEach((d, i) => d.classList.toggle('active', i === 2)); });
  $$('.ob-option').forEach(btn => btn.addEventListener('click', () => { $$('.ob-option').forEach(b => b.classList.remove('active')); btn.classList.add('active'); obMode = btn.dataset.mode; }));
  $('obFinish')?.addEventListener('click', finishOnboarding);
}

function bootAuth() {
  auth.onAuthStateChanged(async user => {
    currentUser = user || null;
    updateAuthUI(!!currentUser);
    if (!currentUser) return;
    try {
      await ensureWorkspaceForUser(currentUser);
      subscribePet(); subscribeMembers(); subscribeEvents();
    } catch (e) {
      console.error(e);
      toast(e.message || 'Помилка запуску', 'error');
    }
  });
}

function bindEvents() {
  setTheme(themeMode);
  $$('[data-theme-toggle]').forEach(btn => btn.addEventListener('click', () => setTheme(themeMode === 'dark' ? 'light' : 'dark')));
  $('googleLoginBtn')?.addEventListener('click', loginGoogle);
  $('logoutBtn')?.addEventListener('click', logoutGoogle);
  $('fabAddEvent')?.addEventListener('click', openSheet);
  $('sheetBackdrop')?.addEventListener('click', closeSheet);
  $$('.nav-tab').forEach(b => b.addEventListener('click', () => setActiveTab(b.dataset.tab)));
  $$('[data-quick-event]').forEach(btn => btn.addEventListener('click', async () => { await addEvent({ eventType: btn.dataset.quickEvent, timeLabel: timeNow() }); closeSheet(); }));
  $('eventForm')?.addEventListener('submit', async e => { e.preventDefault(); await addEvent({ eventType: $('eventType').value, timeLabel: $('eventTime').value || timeNow(), note: $('eventNote').value.trim() }); e.target.reset(); closeSheet(); });
  $('petProfileForm')?.addEventListener('submit', async e => { e.preventDefault(); await savePetProfile({ name: $('petName').value.trim(), birthDate: $('petBirthDate').value, sex: $('petSex').value, breed: $('petBreed').value.trim(), toiletMode: $('petToiletMode').value }); });
  $('copyInviteBtn')?.addEventListener('click', async () => { if (!workspaceData?.inviteCode) return; try { await navigator.clipboard.writeText(workspaceData.inviteCode); toast('Код скопійовано', 'success'); } catch { toast('Не вдалося скопіювати', 'error'); } });
  $('joinWorkspaceForm')?.addEventListener('submit', async e => { e.preventDefault(); try { await joinWorkspaceByInvite($('inviteCodeInput').value); $('inviteCodeInput').value = ''; toast('Ви приєдналися', 'success'); } catch (err) { toast(err.message || 'Не вдалося приєднатися', 'error'); } });
  window.addEventListener('resize', () => { if ($('tabDiary')?.classList.contains('active')) renderChart(); });
}

bindOnboarding();
bindEvents();
bootAuth();
'''
Path('output/app.js').write_text(app)
print('clean pass written', len(app))

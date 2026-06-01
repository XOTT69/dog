const AGE_PROGRAMS = window.AGE_PROGRAMS;
const COURSES = window.COURSES;
const KNOWLEDGE = window.KNOWLEDGE;
const SOCIAL_ITEMS = window.SOCIAL_ITEMS;
const TOILET_GUIDE = window.TOILET_GUIDE;
const TYPE_CONFIG = window.TYPE_CONFIG;

const firebaseConfig = {
  apiKey: window.FIREBASE_API_KEY || 'AIzaSyCY2SkRPpopi7mtsihrlqocxdgG8cBjNHI',
  authDomain: window.FIREBASE_AUTH_DOMAIN || 'dogs-55f5e.firebaseapp.com',
  projectId: window.FIREBASE_PROJECT_ID || 'dogs-55f5e',
  storageBucket: window.FIREBASE_STORAGE_BUCKET || 'dogs-55f5e.firebasestorage.app',
  messagingSenderId: window.FIREBASE_MESSAGING_SENDER_ID || '1053489833652',
  appId: window.FIREBASE_APP_ID || '1:1053489833652:web:ddf53d87b0a4af4207d9e1',
  measurementId: window.FIREBASE_MEASUREMENT_ID || 'G-2M9G6V5WBB'
};

try {
  firebase.initializeApp(firebaseConfig);
} catch (e) {
  console.error('Firebase init error:', e);
  toast('Помилка ініціалізації Firebase', 'error');
}

const auth = firebase.auth();
const db = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

db.enablePersistence({ synchronizeTabs: true }).catch(function () {});

const $ = (id) => document.getElementById(id);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let currentUser = null;
let workspaceId = null;
let workspaceData = null;
let currentPet = null;
let eventsState = [];
let membersState = [];
let currentCourseId = 'pee-pad';
let unsubEvents = null;
let unsubMembers = null;
let unsubPet = null;
let themeMode = localStorage.getItem('doggo_theme') || 'light';
let dailyDone = JSON.parse(localStorage.getItem('doggo_daily_done') || '{}');

const setVisible = (el, yes) => { if (el) el.classList.toggle('hidden', !yes); };
const showLoading = () => setVisible($('loadingOverlay'), true);
const hideLoading = () => setVisible($('loadingOverlay'), false);
const haptic = (ms = 10) => { if (navigator.vibrate) navigator.vibrate(ms); };
const nowTime = () => new Date().toTimeString().slice(0, 5);
const todayKey = () => new Date().toISOString().slice(0, 10);
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const avatarLetter = (name = 'П') => ((name.trim()[0] || 'П').toUpperCase());
const createdToDate = (ts) => ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);

function toast(msg, type = '') {
  const box = $('toastContainer');
  if (!box) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`.trim();
  el.textContent = msg;
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, 2600);
}

function setTheme(mode) {
  themeMode = mode === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', themeMode);
  localStorage.setItem('doggo_theme', themeMode);
}

function getAgeInWeeks(bd) {
  if (!bd) return null;
  const diff = Date.now() - new Date(bd).getTime();
  return isNaN(diff) || diff < 0 ? null : Math.floor(diff / 604800000);
}

function weekLabel(weeks) {
  if (weeks == null) return '—';
  if (weeks < 8) return `${weeks} тиж.`;
  if (weeks < 52) return `${Math.floor(weeks / 4.345)} міс.`;
  return `${(weeks / 52).toFixed(1)} р.`;
}

function getProgramByAge(weeks) {
  if (weeks == null) return AGE_PROGRAMS[1] || AGE_PROGRAMS[0];
  return AGE_PROGRAMS.find(p => weeks >= p.minWeeks && weeks < p.maxWeeks) || AGE_PROGRAMS[AGE_PROGRAMS.length - 1];
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
  if (avatar) avatar.innerHTML = currentUser?.photoURL ? `<img src="${currentUser.photoURL}" alt="user">` : avatarLetter(currentUser?.displayName || petName);
}

function renderAgeFocus() {
  const weeks = getAgeInWeeks(currentPet?.birthDate);
  const program = getProgramByAge(weeks);
  const box = $('periodFocus');
  if (!box) return;
  box.innerHTML = `
    <div class="plan-item"><strong>Пріоритети</strong><br>${program.priorities.map(x => `• ${x}`).join('<br>')}</div>
    <div class="plan-item"><strong>План на зараз</strong><br>${program.plan.map(x => `• ${x}`).join('<br>')}</div>
    <div class="plan-item"><strong>Підказка</strong><br>${program.tip}</div>
  `;
}

function renderDailyPlan() {
  const list = $('dailyItems');
  const badge = $('dailyProgressBadge');
  if (!list || !badge) return;
  const plan = (getProgramByAge(getAgeInWeeks(currentPet?.birthDate))?.plan || []).slice(0, 3);
  const done = dailyDone[todayKey()] || {};
  badge.textContent = `${Object.values(done).filter(Boolean).length}/${plan.length}`;
  list.innerHTML = plan.map((item, i) => `<label class="daily-item ${done[i] ? 'done' : ''}"><input type="checkbox" data-daily-index="${i}" ${done[i] ? 'checked' : ''}><span>${item}</span></label>`).join('');
  $$('[data-daily-index]').forEach(cb => cb.addEventListener('change', () => {
    const key = todayKey();
    dailyDone[key] = dailyDone[key] || {};
    dailyDone[key][cb.dataset.dailymarker || cb.dataset.dailyIndex] = cb.checked;
    localStorage.setItem('doggo_daily_done', JSON.stringify(dailyDone));
    renderDailyPlan();
  }));
}

function renderKpis() {
  const start = startOfToday();
  const todayEvents = eventsState.filter(e => {
    const ts = createdToDate(e.createdAt);
    return ts && ts >= start;
  });
  $('kpiPad').textContent = todayEvents.filter(e => e.eventType === 'pad').length;
  $('kpiOutdoor').textContent = todayEvents.filter(e => e.eventType === 'outdoor').length;
  $('kpiMiss').textContent = todayEvents.filter(e => e.eventType === 'miss').length;
  const success = todayEvents.filter(e => ['pad', 'outdoor'].includes(e.eventType)).length;
  const total = Math.max(1, todayEvents.filter(e => ['pad', 'outdoor', 'miss'].includes(e.eventType)).length);
  const pct = Math.round(success / total * 100);
  $('ringPct').textContent = `${pct}%`;
  const ring = $('ringFill');
  if (ring) ring.style.strokeDashoffset = String(264 - (264 * pct / 100));
}

function renderSuggestion() {
  const text = $('suggestionText');
  if (!text) return;
  const toilet = eventsState.filter(e => ['pad', 'outdoor', 'miss'].includes(e.eventType));
  if (toilet.length < 4) {
    text.textContent = getProgramByAge(getAgeInWeeks(currentPet?.birthDate))?.tip || 'Записуйте події кілька днів поспіль.';
    return;
  }
  const recent = toilet.slice(0, 20);
  const success = recent.filter(e => e.eventType !== 'miss').length;
  const rate = Math.round(success / recent.length * 100);
  text.textContent = rate >= 80 ? `Чудовий прогрес: ${rate}% успіху.` : rate < 50 ? `Успішність лише ${rate}%.` : `Стабільність: ${rate}%.`;
}

function renderCourses() {
  const grid = $('courseGrid');
  const viewer = $('selectedCourse');
  if (!grid || !viewer) return;
  grid.innerHTML = COURSES.map(course => `
    <button type="button" class="course-btn ${course.id === currentCourseId ? 'selected' : ''}" data-course-id="${course.id}">
      <span class="c-badge">${course.badge}</span>
      <strong>${course.title}</strong>
      <div class="c-meta">${course.description}</div>
    </button>`).join('');
  $$('[data-course-id]').forEach(btn => btn.addEventListener('click', () => {
    currentCourseId = btn.dataset.courseId;
    renderCourses();
    haptic();
  }));
  const course = COURSES.find(c => c.id === currentCourseId) || COURSES[0];
  viewer.innerHTML = `<div class="course-detail"><h3>${course.title}</h3><p class="mt-6">${course.description}</p><h4>Кроки</h4><ul>${course.steps.map(s => `<li>${s}</li>`).join('')}</ul><h4>Не робити</h4><ul class="mistakes">${course.mistakes.map(s => `<li>${s}</li>`).join('')}</ul><h4>Чекліст</h4><ul class="checks">${course.checklist.map(s => `<li>${s}</li>`).join('')}</ul></div>`;
}

function renderKnowledge() {
  const grid = $('knowledgeGrid');
  if (grid) grid.innerHTML = KNOWLEDGE.map(k => `<div class="k-card"><strong>${k.title}</strong><p>${k.text}</p><span class="k-tag">${k.tag}</span></div>`).join('');
}

function renderSocial() {
  const grid = $('socialGrid');
  if (grid) grid.innerHTML = SOCIAL_ITEMS.map(item => `<label class="social-item"><input type="checkbox"><span>${item}</span></label>`).join('');
}

function renderToiletGuide() {
  const grid = $('toiletGuide');
  if (grid) grid.innerHTML = TOILET_GUIDE.map(step => `<div class="k-card"><strong>${step.title}</strong><p>${step.text}</p></div>`).join('');
}

function renderMembers() {
  const list = $('membersList');
  if (!list) return;
  list.innerHTML = membersState.length
    ? membersState.map(m => `<div class="member-chip"><div class="m-avatar">${m.photoURL ? `<img src="${m.photoURL}" alt="user">` : avatarLetter(m.displayName)}</div><span>${m.displayName || 'Учасник'}</span></div>`).join('')
    : '<div class="empty">Поки що тут тільки ви.</div>';
}

function renderWorkspaceMeta() {
  $('inviteCodeView').textContent = workspaceData?.inviteCode || '—';
}
function fillPetForm() {
  $('petName').value = currentPet?.name || '';
  $('petBirthDate').value = currentPet?.birthDate || '';
  $('petSex').value = currentPet?.sex || 'хлопчик';
  $('petBreed').value = currentPet?.breed || '';
  $('petToiletMode').value = currentPet?.toiletMode || 'pad';
}

function renderFeed(targetId = 'recentLogs') {
  const list = $(targetId);
  if (!list) return;
  if (!eventsState.length) {
    list.innerHTML = '<div class="empty">Поки що немає записів. Натисни + і додай першу подію.</div>';
    return;
  }
  list.innerHTML = eventsState.slice(0, 20).map(item => {
    const conf = TYPE_CONFIG[item.eventType] || { icon: '•', label: 'Подія', tone: '' };
    const d = createdToDate(item.createdAt);
    return `<div class="feed-item" data-event-id="${item.id}"><div><strong>${conf.icon} ${conf.label}</strong><div class="meta">${d ? d.toLocaleString('uk') : ''}${item.note ? ` · ${item.note}` : ''}</div></div><button type="button" class="btn-sm" data-delete-event="${item.id}">Видалити</button></div>`;
  }).join('');
  $$('[data-delete-event]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Видалити запис?')) return;
    await deleteEvent(btn.dataset.deleteEvent);
  }));
}

function renderChart(canvasId) {
  const canvas = $(canvasId);
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
    const dayEvents = eventsState.filter(e => {
      const ts = createdToDate(e.createdAt);
      return ts && ts >= d && ts < next;
    });
    const success = dayEvents.filter(e => ['pad', 'outdoor'].includes(e.eventType)).length;
    const miss = dayEvents.filter(e => e.eventType === 'miss').length;
    const total = success + miss;
    days.push({ date: d, pct: total ? Math.round(success / total * 100) : null });
  }

  const css = getComputedStyle(document.documentElement);
  const primary = css.getPropertyValue('--primary').trim();
  const danger = css.getPropertyValue('--danger').trim();
  const faint = css.getPropertyValue('--faint').trim();
  const line = css.getPropertyValue('--line').trim();

  const pad = { top: 12, right: 6, bottom: 18, left: 6 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;
  const bw = cw / days.length;

  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  [0, 50, 100].forEach(v => {
    const y = pad.top + ch - (v / 100) * ch;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
  });

  days.forEach((day, i) => {
    const x = pad.left + i * bw + bw * .18;
    const barW = bw * .64;
    if (day.pct == null) {
      ctx.fillStyle = faint;
      ctx.beginPath();
      ctx.arc(x + barW / 2, pad.top + ch - 4, 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const barH = Math.max(4, (day.pct / 100) * ch);
      const y = pad.top + ch - barH;
      ctx.fillStyle = day.pct >= 70 ? primary : day.pct >= 40 ? '#d97706' : danger;
      const r = Math.min(4, barW / 2);
      ctx.beginPath();
      ctx.moveTo(x, y + barH);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.lineTo(x + barW - r, y);
      ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
      ctx.lineTo(x + barW, y + barH);
      ctx.closePath();
      ctx.fill();
    }
    if (i % 3 === 0 || i === days.length - 1) {
      ctx.fillStyle = faint;
      ctx.font = '11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`${day.date.getDate()}/${day.date.getMonth() + 1}`, x + barW / 2, h - 3);
    }
  });
}

function renderAll() {
  renderHeader();
  renderAgeFocus();
  renderDailyPlan();
  renderKpis();
  renderSuggestion();
  renderFeed('recentLogs');
  renderFeed('recentLogsDiary');
  renderCourses();
  renderKnowledge();
  renderSocial();
  renderToiletGuide();
  renderMembers();
  renderWorkspaceMeta();
  fillPetForm();
  requestAnimationFrame(() => renderChart('progressChartDiary'));
}

function setActiveTab(id) {
  $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === id));
  $$('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  setVisible($('fabAddEvent'), id !== 'tabProfile');
  if (id === 'tabDiary') requestAnimationFrame(() => renderChart('progressChartDiary'));
}

function openSheet() { setVisible($('eventSheet'), true); $('eventTime').value = nowTime(); }
function closeSheet() { setVisible($('eventSheet'), false); }

async function savePetProfile(payload) {
  if (!currentUser || !workspaceId) {
    toast('Спочатку увійдіть в систему', 'error');
    return;
  }
  showLoading();
  try {
    await db.collection('workspaces').doc(workspaceId).collection('dogs').doc('primary').set({
      ...(currentPet || {}),
      ...payload,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    toast('Профіль збережено', 'success');
  } catch (e) {
    console.error('Save pet profile error:', e);
    toast('Помилка збереження профілю', 'error');
  } finally {
    hideLoading();
  }
}

async function addEvent(payload) {
  if (!currentUser || !workspaceId) {
    toast('Спочатку увійдіть в систему', 'error');
    return;
  }
  try {
    await db.collection('workspaces').doc(workspaceId).collection('events').add({
      eventType: payload.eventType,
      byUid: currentUser.uid,
      byName: currentUser.displayName || 'Я',
      trigger: payload.trigger || '',
      note: payload.note || '',
      timeLabel: payload.timeLabel || nowTime(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast('Подію додано', 'success');
  } catch (e) {
    console.error('Add event error:', e);
    toast('Помилка додавання події', 'error');
  }
}

async function deleteEvent(id) {
  if (!workspaceId || !id) {
    toast('Помилка: немає даних для видалення', 'error');
    return;
  }
  try {
    await db.collection('workspaces').doc(workspaceId).collection('events').doc(id).delete();
    toast('Подію видалено', 'success');
  } catch (e) {
    console.error('Delete event error:', e);
    toast('Помилка видалення події', 'error');
  }
}

async function ensureWorkspaceForUser(user) {
  try {
    const udoc = await db.collection('users').doc(user.uid).get();
    if (udoc.exists && udoc.data().workspaceId) {
      workspaceId = udoc.data().workspaceId;
      const wdoc = await db.collection('workspaces').doc(workspaceId).get();
      workspaceData = wdoc.exists ? wdoc.data() : null;
      return;
    }
    const wsRef = db.collection('workspaces').doc();
    workspaceId = wsRef.id;
    const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase();
    workspaceData = { name: `${(user.displayName || 'Мій').split(' ')[0]} Family`, ownerId: user.uid, inviteCode };
    await wsRef.set({ ...workspaceData, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    await db.collection('users').doc(user.uid).set({ uid: user.uid, email: user.email || '', displayName: user.displayName || 'User', photoURL: user.photoURL || '', role: 'owner', workspaceId }, { merge: true });
    await wsRef.collection('members').doc(user.uid).set({ uid: user.uid, email: user.email || '', displayName: user.displayName || 'User', photoURL: user.photoURL || '', role: 'owner', createdAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await wsRef.collection('dogs').doc('primary').set({ name: '', birthDate: '', sex: 'хлопчик', breed: '', toiletMode: 'pad', createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  } catch (e) {
    console.error('Ensure workspace error:', e);
    toast('Помилка створення робочого простору', 'error');
    throw e;
  }
}

function subscribePet() {
  if (!workspaceId) return;
  unsubPet?.();
  unsubPet = db.collection('workspaces').doc(workspaceId).collection('dogs').doc('primary').onSnapshot(s => {
    currentPet = s.exists ? s.data() : null;
    renderAll();
  });
}

function subscribeMembers() {
  if (!workspaceId) return;
  unsubMembers?.();
  unsubMembers = db.collection('workspaces').doc(workspaceId).collection('members').onSnapshot(s => {
    membersState = [];
    s.forEach(d => membersState.push(d.data()));
    renderMembers();
  });
}

function subscribeEvents() {
  if (!workspaceId) return;
  unsubEvents?.();
  unsubEvents = db.collection('workspaces').doc(workspaceId).collection('events').orderBy('createdAt', 'desc').limit(200).onSnapshot(s => {
    eventsState = [];
    s.forEach(d => eventsState.push({ id: d.id, ...d.data() }));
    renderAll();
  });
}

async function joinWorkspaceByInvite(code) {
  try {
    const clean = (code || '').trim().toUpperCase();
    if (!clean) throw new Error('Введи код запрошення');
    const snap = await db.collection('workspaces').where('inviteCode', '==', clean).limit(1).get();
    if (snap.empty) throw new Error('Код не знайдено');
    workspaceId = snap.docs[0].id;
    workspaceData = snap.docs[0].data();
    await db.collection('users').doc(currentUser.uid).set({ uid: currentUser.uid, email: currentUser.email || '', displayName: currentUser.displayName || 'User', photoURL: currentUser.photoURL || '', role: 'member', workspaceId }, { merge: true });
    await db.collection('workspaces').doc(workspaceId).collection('members').doc(currentUser.uid).set({ uid: currentUser.uid, email: currentUser.email || '', displayName: currentUser.displayName || 'User', photoURL: currentUser.photoURL || '', role: 'member', createdAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    subscribePet();
    subscribeMembers();
    subscribeEvents();
    renderAll();
  } catch (e) {
    console.error('Join workspace error:', e);
    throw e;
  }
}

async function loginGoogle() {
  showLoading();
  try {
    const result = await auth.signInWithPopup(googleProvider);
    console.log('Google login success:', result.user.email);
  } catch (e) {
    console.error('Google popup error:', e.code, e.message);
    
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user') {
      try {
        toast('Відкриваємо вхід у новому вікні...', 'info');
        await auth.signInWithRedirect(googleProvider);
      } catch (err) {
        console.error('Google redirect error:', err.code, err.message);
        if (err.code === 'auth/unauthorized-domain') {
          toast('Помилка: домен не авторизовано в Firebase Console', 'error');
        } else if (err.code === 'auth/operation-not-allowed') {
          toast('Помилка: Google Auth не увімкнено в Firebase Console', 'error');
        } else {
          toast(err.message || 'Помилка входу через Google', 'error');
        }
      }
    } else if (e.code === 'auth/unauthorized-domain') {
      toast('Помилка: домен не авторизовано. Додайте поточний домен в Firebase Console → Authentication → Settings → Authorized domains', 'error');
    } else if (e.code === 'auth/operation-not-allowed') {
      toast('Помилка: Google Auth не увімкнено. Увімкніть в Firebase Console → Authentication → Sign-in method', 'error');
    } else if (e.code === 'auth/configuration-not-found') {
      toast('Помилка конфігурації Firebase. Перевірте authDomain в налаштуваннях', 'error');
    } else {
      toast(`${e.message || 'Помилка входу'}`, 'error');
    }
  } finally {
    hideLoading();
  }
}

async function logoutGoogle() {
  unsubEvents?.();
  unsubMembers?.();
  unsubPet?.();
  unsubEvents = unsubMembers = unsubPet = null;
  await auth.signOut();
  currentUser = null;
  workspaceId = null;
  workspaceData = null;
  currentPet = null;
  eventsState = [];
  membersState = [];
  setVisible($('appContent'), false);
  setVisible($('authScreen'), true);
}

function bindEvents() {
  setTheme(themeMode);
  $$('[data-theme-toggle]').forEach(btn => btn.addEventListener('click', () => setTheme(themeMode === 'dark' ? 'light' : 'dark')));
  $('googleLoginBtn')?.addEventListener('click', loginGoogle);
  $('logoutBtn')?.addEventListener('click', logoutGoogle);
  $('fabAddEvent')?.addEventListener('click', openSheet);
  $('sheetBackdrop')?.addEventListener('click', closeSheet);
  $$('.nav-tab').forEach(b => b.addEventListener('click', () => setActiveTab(b.dataset.tab)));
  $$('[data-quick-event]').forEach(btn => btn.addEventListener('click', async () => {
    await addEvent({ eventType: btn.dataset.quickEvent, timeLabel: nowTime() });
    closeSheet();
  }));
  $('eventForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    await addEvent({ eventType: $('eventType').value, timeLabel: $('eventTime').value || nowTime(), note: $('eventNote').value.trim() });
    e.target.reset();
    closeSheet();
  });
  $('petProfileForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    await savePetProfile({ name: $('petName').value.trim(), birthDate: $('petBirthDate').value, sex: $('petSex').value, breed: $('petBreed').value.trim(), toiletMode: $('petToiletMode').value });
  });
  $('copyInviteBtn')?.addEventListener('click', async () => {
    if (!workspaceData?.inviteCode) return;
    try {
      await navigator.clipboard.writeText(workspaceData.inviteCode);
      toast('Код скопійовано', 'success');
    } catch {
      toast('Не вдалося скопіювати', 'error');
    }
  });
  $('joinWorkspaceForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await joinWorkspaceByInvite($('inviteCodeInput').value);
      $('inviteCodeInput').value = '';
      toast('Ви приєдналися', 'success');
    } catch (err) {
      toast(err.message || 'Не вдалося приєднатися', 'error');
    }
  });
}

function bootAuth() {
  auth.onAuthStateChanged(async user => {
    currentUser = user || null;
    setVisible($('authScreen'), !currentUser);
    setVisible($('appContent'), !!currentUser);
    if (!currentUser) return;
    showLoading();
    try {
      await ensureWorkspaceForUser(currentUser);
      subscribePet();
      subscribeMembers();
      subscribeEvents();
      renderAll();
    } catch (e) {
      toast(e.message || 'Помилка запуску', 'error');
    } finally {
      hideLoading();
    }
  });
}

bindEvents();
bootAuth();

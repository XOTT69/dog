import { AGE_PROGRAMS, COURSES, KNOWLEDGE, SOCIAL_ITEMS, TOILET_GUIDE, TYPE_CONFIG } from './content.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import {
  initializeFirestore,
  persistentLocalCache,
  doc, getDoc, setDoc, updateDoc, addDoc, getDocs,
  collection, query, where, orderBy, limit, onSnapshot, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';

/* ─── Firebase Init ─── */
const firebaseConfig = {
  apiKey: 'AIzaSyCY2SkRPpopi7mtsihrlqocxdgG8cBjNHI',
  authDomain: 'dogs-55f5e.firebaseapp.com',
  projectId: 'dogs-55f5e',
  storageBucket: 'dogs-55f5e.firebasestorage.app',
  messagingSenderId: '1053489833652',
  appId: '1:1053489833652:web:ddf53d87b0a4af4207d9e1'
};

// Compat SDK for auth (no iframe needed)
firebase.initializeApp(firebaseConfig);
const authCompat = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Modular SDK for Firestore (with offline cache)
const app = initializeApp(firebaseConfig, 'firestoreApp');
const db = initializeFirestore(app, { localCache: persistentLocalCache() });

/* ─── State ─── */
let currentUser = null;
let workspaceId = null;
let workspaceData = null;
let currentPet = null;
let currentCourseId = 'pee-pad';
let eventsState = [];
let unsubEvents = null;
let unsubMembers = null;
let unsubPet = null;
let petFormDirty = false;

function $(id) { return document.getElementById(id); }
function $$(sel) { return document.querySelectorAll(sel); }

function showToast(message, type = 'info') {
  const container = $('toastContainer');
  const toast = document.createElement('div');
  const icons = { error: '⚠️', success: '✅', info: 'ℹ️' };
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || icons.info}</span><span>${message}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3500);
}

function nowTime() { return new Date().toTimeString().slice(0, 5); }
function createInviteCode() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }
function avatarText(name = 'U') { return (name.trim()[0] || 'U').toUpperCase(); }
function todayStart() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }

function getAgeInWeeks(birthDate) {
  if (!birthDate) return null;
  const diff = Date.now() - new Date(birthDate).getTime();
  if (Number.isNaN(diff) || diff < 0) return null;
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 7));
}

function getAgeLabel(weeks) {
  if (weeks == null) return 'не вказано';
  if (weeks < 8) return `${weeks} тиж.`;
  if (weeks < 52) return `${Math.floor(weeks / 4.345)} міс.`;
  return `${(weeks / 52).toFixed(1)} р.`;
}

function getProgramByAge(weeks) {
  if (weeks == null) return AGE_PROGRAMS[1];
  return AGE_PROGRAMS.find(p => weeks >= p.minWeeks && weeks < p.maxWeeks) || AGE_PROGRAMS[AGE_PROGRAMS.length - 1];
}

function updateAuthUI(isLoggedIn) {
  const authScreen = $('authScreen');
  const appContent = $('appContent');
  const mobileTabsEl = document.querySelector('.mobile-tabs');
  if (isLoggedIn) {
    authScreen.classList.add('hidden');
    appContent.classList.remove('hidden');
    if (mobileTabsEl) mobileTabsEl.classList.remove('hidden');
    $('logoutBtn').style.display = '';
    $('googleLoginBtnTop').style.display = 'none';
  } else {
    authScreen.classList.remove('hidden');
    appContent.classList.add('hidden');
    if (mobileTabsEl) mobileTabsEl.classList.add('hidden');
    $('logoutBtn').style.display = 'none';
    $('googleLoginBtnTop').style.display = '';
  }
}

function setActiveTab(id) {
  $$('[data-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === id));
  $$('.tab-panel').forEach(panel => panel.classList.toggle('active', panel.id === id));
}

function renderProfileInsights() {
  const weeks = getAgeInWeeks(currentPet?.birthDate);
  const program = getProgramByAge(weeks);
  const mode = currentPet?.toiletMode || 'pad';
  const modeTexts = {
    pad: 'Пелюшка вдома — типовий сценарій до завершення вакцинації. Фокус: стабільне місце, підведення після тригерів, миттєве підкріплення.',
    mixed: 'Змішаний режим — пелюшка + вулиця. Не поспішати, переводити навичку поступово.',
    outdoor: 'Вулиця — основний сценарій. Фокус: режим виходів, підкріплення на місці.'
  };
  const insights = [
    { title: 'Вікова програма', text: `Етап: ${program.stage}. Від віку залежить складність завдань і пріоритети.` },
    { title: 'Побутовий режим', text: modeTexts[mode] || modeTexts.pad },
    { title: 'Навіщо записи', text: 'Щоденник дозволяє бачити патерни: після чого промахи, які інтервали, хто частіше фіксує успіхи.' }
  ];
  $('profileInsights').innerHTML = insights.map(x => `<div class="notice"><strong>${x.title}</strong><div class="helper">${x.text}</div></div>`).join('');
}

function renderTodayPlan() {
  const weeks = getAgeInWeeks(currentPet?.birthDate);
  const program = getProgramByAge(weeks);
  $('todayPlan').innerHTML = program.plan.map(item => `<div class="item"><div><strong>${item}</strong><div class="meta">${program.stage}</div></div><span class="pill">сьогодні</span></div>`).join('');
  $('ageSummaryBadge').textContent = `${getAgeLabel(weeks)} · ${program.stage}`;
  $('sidebarAgeStage').textContent = `${program.stage} · ${getAgeLabel(weeks)}`;
  $('sidebarTip').textContent = program.tip;
}

function renderPriorityTips() {
  const weeks = getAgeInWeeks(currentPet?.birthDate);
  const program = getProgramByAge(weeks);
  $('priorityTips').innerHTML = program.priorities.map((text, i) => `<div class="tip-card"><strong>${i + 1}. ${text}</strong><div class="meta">${program.tip}</div></div>`).join('');
}

function renderSocialChecklist() {
  $('socialChecklist').innerHTML = SOCIAL_ITEMS.map(label => `
    <label class="check-row"><input type="checkbox" /><div><strong>${label}</strong><div class="meta">Поступово, без примусу, з підкріпленням спокою.</div></div></label>
  `).join('');
}

function renderCourses() {
  $('courseGrid').innerHTML = COURSES.map(course => `
    <button type="button" class="course-card ${course.id === currentCourseId ? 'selected' : ''}" data-course-id="${course.id}">
      <span class="pill">${course.badge}</span>
      <strong>${course.title}</strong>
      <div class="meta">${course.description}</div>
    </button>
  `).join('');
  const course = COURSES.find(c => c.id === currentCourseId) || COURSES[0];
  $('selectedCourse').innerHTML = `
    <div class="notice"><strong>${course.title}</strong><div class="helper">${course.description}</div></div>
    <div class="triple" style="margin-top:1rem">
      <div class="card" style="padding:1rem"><div class="section-title"><h3>Покроково</h3></div><div class="lesson-list">${course.steps.map((x, i) => `<div class="lesson"><strong>Крок ${i + 1}</strong><div class="meta">${x}</div></div>`).join('')}</div></div>
      <div class="card" style="padding:1rem"><div class="section-title"><h3>Помилки</h3></div><div class="lesson-list">${course.mistakes.map(x => `<div class="lesson"><strong>⚠️</strong><div class="meta">${x}</div></div>`).join('')}</div></div>
      <div class="card" style="padding:1rem"><div class="section-title"><h3>Чекліст</h3></div><div class="lesson-list">${course.checklist.map(x => `<div class="lesson"><strong>✓</strong><div class="meta">${x}</div></div>`).join('')}</div></div>
    </div>
  `;
  $$('[data-course-id]').forEach(btn => btn.addEventListener('click', () => { currentCourseId = btn.dataset.courseId; renderCourses(); }));
}

function renderKnowledge() {
  $('knowledgeGrid').innerHTML = KNOWLEDGE.map(item => `
    <div class="card"><div class="section-title"><h3>${item.title}</h3><span class="pill blue">${item.tag}</span></div><div class="helper">${item.text}</div></div>
  `).join('');
}

function renderToiletGuide() {
  $('toiletGuide').innerHTML = TOILET_GUIDE.map(x => `<div class="lesson"><strong>${x.title}</strong><div class="meta">${x.text}</div></div>`).join('');
}

function renderEvents() {
  const list = $('recentLogs');
  if (!eventsState.length) { list.innerHTML = `<div class="empty">Записів ще немає. Додайте першу подію.</div>`; return; }
  list.innerHTML = eventsState.slice(0, 30).map(item => {
    const conf = TYPE_CONFIG[item.eventType] || { icon: '📌', label: item.eventType, tone: '' };
    return `<div class="item"><div><strong>${conf.icon} ${conf.label}</strong><div class="meta">${item.timeLabel || '--:--'} · ${item.trigger || ''}</div>${item.note ? `<div class="meta" style="margin-top:3px">${item.note}</div>` : ''}</div><span class="pill ${conf.tone}">${item.byName || ''}</span></div>`;
  }).join('');
}

function renderKPIs() {
  const start = todayStart();
  const today = eventsState.filter(x => {
    if (!x.createdAt) return false;
    const ts = x.createdAt.toDate ? x.createdAt.toDate() : new Date(x.createdAt);
    return ts >= start;
  });
  $('kpiPad').textContent = today.filter(x => x.eventType === 'pad').length;
  $('kpiOutdoor').textContent = today.filter(x => x.eventType === 'outdoor').length;
  $('kpiMiss').textContent = today.filter(x => x.eventType === 'miss').length;
  $('kpiTotal').textContent = eventsState.length;
}

function renderMembers(members = []) {
  $('membersList').innerHTML = members.length ? members.map(m => `
    <div class="person"><div class="avatar">${m.photoURL ? `<img src="${m.photoURL}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : avatarText(m.displayName || '')}</div><div><strong>${m.displayName || 'User'}</strong><div class="helper">${m.role || 'member'}</div></div></div>
  `).join('') : `<div class="empty">Немає учасників.</div>`;
}

function fillPetForm() {
  if (petFormDirty) return;
  $('petName').value = currentPet?.name || '';
  $('petBirthDate').value = currentPet?.birthDate || '';
  $('petSex').value = currentPet?.sex || '';
  $('petBreed').value = currentPet?.breed || '';
  $('petWeight').value = currentPet?.weight || '';
  $('petHomeDate').value = currentPet?.homeDate || '';
  $('petVaccination').value = currentPet?.vaccination || 'не вказано';
  $('petToiletMode').value = currentPet?.toiletMode || 'pad';
  $('petNotes').value = currentPet?.notes || '';
}

function renderWorkspaceMeta() {
  $('workspaceName').textContent = workspaceData?.name || '—';
  $('inviteCodeView').textContent = workspaceData?.inviteCode || '—';
}

function renderAll() { fillPetForm(); renderWorkspaceMeta(); renderProfileInsights(); renderTodayPlan(); renderPriorityTips(); renderEvents(); renderKPIs(); }
function renderStatic() { renderSocialChecklist(); renderCourses(); renderKnowledge(); renderToiletGuide(); }

/* ─── Firestore Logic ─── */
async function ensureWorkspaceForUser(user) {
  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists() && userSnap.data().workspaceId) {
    workspaceId = userSnap.data().workspaceId;
    const wsSnap = await getDoc(doc(db, 'workspaces', workspaceId));
    workspaceData = wsSnap.exists() ? wsSnap.data() : null;
    return;
  }
  const newWorkspaceRef = doc(collection(db, 'workspaces'));
  workspaceId = newWorkspaceRef.id;
  const inviteCode = createInviteCode();
  const spaceName = `${(user.displayName || 'Мій').split(' ')[0]} простір`;
  await setDoc(newWorkspaceRef, { name: spaceName, ownerId: user.uid, inviteCode, createdAt: serverTimestamp() });
  workspaceData = { name: spaceName, ownerId: user.uid, inviteCode };
  await setDoc(userRef, { uid: user.uid, email: user.email || '', displayName: user.displayName || '', photoURL: user.photoURL || '', role: 'owner', workspaceId, createdAt: serverTimestamp() });
  await setDoc(doc(db, 'workspaces', workspaceId, 'members', user.uid), { uid: user.uid, email: user.email || '', displayName: user.displayName || '', photoURL: user.photoURL || '', role: 'owner', createdAt: serverTimestamp() });
  await setDoc(doc(db, 'workspaces', workspaceId, 'dogs', 'primary'), { name: '', birthDate: '', sex: '', breed: '', weight: '', homeDate: '', vaccination: 'не вказано', toiletMode: 'pad', notes: '', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

function subscribePet() {
  if (!workspaceId) return;
  if (unsubPet) unsubPet();
  unsubPet = onSnapshot(doc(db, 'workspaces', workspaceId, 'dogs', 'primary'), snap => { currentPet = snap.exists() ? snap.data() : null; renderAll(); }, err => console.error('Pet err:', err));
}

function subscribeMembers() {
  if (!workspaceId) return;
  if (unsubMembers) unsubMembers();
  unsubMembers = onSnapshot(collection(db, 'workspaces', workspaceId, 'members'), snap => { const m = []; snap.forEach(d => m.push(d.data())); renderMembers(m); }, err => console.error('Members err:', err));
}

function subscribeEvents() {
  if (!workspaceId) return;
  if (unsubEvents) unsubEvents();
  unsubEvents = onSnapshot(query(collection(db, 'workspaces', workspaceId, 'events'), orderBy('createdAt', 'desc'), limit(100)), snap => { const r = []; snap.forEach(d => r.push({ id: d.id, ...d.data() })); eventsState = r; renderEvents(); renderKPIs(); }, err => console.error('Events err:', err));
}

async function savePetProfile(payload) {
  if (!currentUser || !workspaceId) return showToast('Спочатку увійди', 'error');
  await setDoc(doc(db, 'workspaces', workspaceId, 'dogs', 'primary'), { ...(currentPet || {}), ...payload, updatedAt: serverTimestamp() }, { merge: true });
  petFormDirty = false;
  showToast('Збережено ✓', 'success');
}

async function addEvent(payload) {
  if (!currentUser || !workspaceId) return showToast('Спочатку увійди', 'error');
  await addDoc(collection(db, 'workspaces', workspaceId, 'events'), { eventType: payload.eventType, byUid: currentUser.uid, byName: payload.byName || currentUser.displayName || '', trigger: payload.trigger || '', note: payload.note || '', timeLabel: payload.timeLabel || nowTime(), createdAt: serverTimestamp() });
  showToast('Додано ✓', 'success');
}

async function joinWorkspaceByInvite(codeRaw) {
  if (!currentUser) return showToast('Увійди через Google', 'error');
  const code = codeRaw.trim().toUpperCase();
  if (!code) throw new Error('Введіть код');
  const snap = await getDocs(query(collection(db, 'workspaces'), where('inviteCode', '==', code), limit(1)));
  if (snap.empty) throw new Error('Код не знайдено');
  workspaceId = snap.docs[0].id;
  workspaceData = snap.docs[0].data();
  await updateDoc(doc(db, 'users', currentUser.uid), { workspaceId, role: 'member' });
  await setDoc(doc(db, 'workspaces', workspaceId, 'members', currentUser.uid), { uid: currentUser.uid, email: currentUser.email || '', displayName: currentUser.displayName || '', photoURL: currentUser.photoURL || '', role: 'member', createdAt: serverTimestamp() });
  subscribePet(); subscribeMembers(); subscribeEvents(); renderAll();
}

/* ─── AUTH via Compat SDK + Redirect ─── */
function loginGoogle() {
  authCompat.signInWithRedirect(googleProvider);
}

async function logoutGoogle() {
  if (unsubEvents) { unsubEvents(); unsubEvents = null; }
  if (unsubMembers) { unsubMembers(); unsubMembers = null; }
  if (unsubPet) { unsubPet(); unsubPet = null; }
  await authCompat.signOut();
  currentUser = null; workspaceId = null; workspaceData = null; currentPet = null; eventsState = [];
  petFormDirty = false;
  showToast('Вихід виконано', 'success');
}

function bootAuth() {
  authCompat.getRedirectResult().then(function(result) {
    if (result && result.user) {
      console.log('[Auth] Redirect success:', result.user.email);
    }
  }).catch(function(err) {
    console.warn('[Auth] Redirect error:', err.code);
  });

  authCompat.onAuthStateChanged(async function(user) {
    console.log('[Auth] State:', user ? user.email : 'null');
    currentUser = user || null;
    updateAuthUI(!!currentUser);

    if (!currentUser) {
      workspaceId = null; workspaceData = null; currentPet = null; eventsState = [];
      $('appLoader').classList.add('hidden');
      return;
    }

    try {
      await ensureWorkspaceForUser(currentUser);
      subscribePet(); subscribeMembers(); subscribeEvents();
      renderAll();
    } catch (error) {
      console.error('[Auth] Boot error:', error);
      showToast('Помилка завантаження', 'error');
    }
    $('appLoader').classList.add('hidden');
  });
}

/* ─── Bindings ─── */
function bindEvents() {
  $$('[data-tab]').forEach(btn => btn.addEventListener('click', () => setActiveTab(btn.dataset.tab)));
  $$('[data-theme-toggle]').forEach(el => el.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  }));
  const saved = localStorage.getItem('theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);

  $('googleLoginBtn').addEventListener('click', loginGoogle);
  $('googleLoginBtnTop').addEventListener('click', loginGoogle);
  $('logoutBtn').addEventListener('click', logoutGoogle);

  $('eventTime').value = nowTime();
  $('eventForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await addEvent({ eventType: $('eventType').value, byName: $('eventBy').value.trim(), timeLabel: $('eventTime').value || nowTime(), trigger: $('eventTrigger').value, note: $('eventNote').value.trim() });
      e.target.reset(); $('eventTime').value = nowTime(); setActiveTab('dashboard');
    } catch (err) { showToast(err.message, 'error'); }
    finally { btn.disabled = false; }
  });

  const petForm = $('petProfileForm');
  petForm.addEventListener('input', () => { petFormDirty = true; });
  petForm.addEventListener('change', () => { petFormDirty = true; });
  petForm.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await savePetProfile({ name: $('petName').value.trim(), birthDate: $('petBirthDate').value, sex: $('petSex').value, breed: $('petBreed').value.trim(), weight: $('petWeight').value, homeDate: $('petHomeDate').value, vaccination: $('petVaccination').value, toiletMode: $('petToiletMode').value, notes: $('petNotes').value.trim() });
    } catch (err) { showToast(err.message, 'error'); }
    finally { btn.disabled = false; }
  });

  $$('[data-quick-event]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try { await addEvent({ eventType: btn.dataset.quickEvent, byName: currentUser?.displayName || '', timeLabel: nowTime(), trigger: '', note: '' }); }
      catch (err) { showToast(err.message, 'error'); }
      finally { btn.disabled = false; }
    });
  });

  $('copyInviteBtn').addEventListener('click', async () => {
    if (!workspaceData?.inviteCode) return showToast('Код недоступний', 'error');
    try { await navigator.clipboard.writeText(workspaceData.inviteCode); }
    catch { const i = document.createElement('input'); i.value = workspaceData.inviteCode; document.body.appendChild(i); i.select(); document.execCommand('copy'); i.remove(); }
    showToast('Скопійовано ✓', 'success');
  });

  $('joinWorkspaceForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true;
    try { await joinWorkspaceByInvite($('inviteCodeInput').value); $('inviteCodeInput').value = ''; showToast('Приєднано ✓', 'success'); }
    catch (err) { showToast(err.message, 'error'); }
    finally { btn.disabled = false; }
  });
}

renderStatic();
bindEvents();
bootAuth();

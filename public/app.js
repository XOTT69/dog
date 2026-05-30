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

db.enablePersistence({ synchronizeTabs: true }).catch(function() {});

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
  requestAnimationFrame(function() { toast.classList.add('show'); });
  setTimeout(function() { toast.classList.remove('show'); setTimeout(function() { toast.remove(); }, 300); }, 3500);
}

function nowTime() { return new Date().toTimeString().slice(0, 5); }
function createInviteCode() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }
function avatarText(name) { return ((name || 'U').trim()[0] || 'U').toUpperCase(); }
function todayStart() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }

function getAgeInWeeks(birthDate) {
  if (!birthDate) return null;
  var diff = Date.now() - new Date(birthDate).getTime();
  if (isNaN(diff) || diff < 0) return null;
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 7));
}

function getAgeLabel(weeks) {
  if (weeks == null) return 'не вказано';
  if (weeks < 8) return weeks + ' тиж.';
  if (weeks < 52) return Math.floor(weeks / 4.345) + ' міс.';
  return (weeks / 52).toFixed(1) + ' р.';
}

function getProgramByAge(weeks) {
  if (weeks == null) return AGE_PROGRAMS[1];
  return AGE_PROGRAMS.find(function(p) { return weeks >= p.minWeeks && weeks < p.maxWeeks; }) || AGE_PROGRAMS[AGE_PROGRAMS.length - 1];
}

function updateAuthUI(isLoggedIn) {
  var authScreen = $('authScreen');
  var appContent = $('appContent');
  var mobileTabsEl = document.querySelector('.mobile-tabs');
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
  $$('[data-tab]').forEach(function(btn) { btn.classList.toggle('active', btn.dataset.tab === id); });
  $$('.tab-panel').forEach(function(panel) { panel.classList.toggle('active', panel.id === id); });
}

function renderProfileInsights() {
  var weeks = getAgeInWeeks(currentPet ? currentPet.birthDate : null);
  var program = getProgramByAge(weeks);
  var mode = (currentPet && currentPet.toiletMode) || 'pad';
  var modeTexts = { pad: 'Пелюшка вдома.', mixed: 'Змішаний режим.', outdoor: 'Вулиця.' };
  var insights = [
    { title: 'Вікова програма', text: 'Етап: ' + program.stage },
    { title: 'Побутовий режим', text: modeTexts[mode] || modeTexts.pad },
    { title: 'Навіщо записи', text: 'Щоденник дозволяє бачити патерни.' }
  ];
  $('profileInsights').innerHTML = insights.map(function(x) { return '<div class="notice"><strong>' + x.title + '</strong><div class="helper">' + x.text + '</div></div>'; }).join('');
}

function renderTodayPlan() {
  var weeks = getAgeInWeeks(currentPet ? currentPet.birthDate : null);
  var program = getProgramByAge(weeks);
  $('todayPlan').innerHTML = program.plan.map(function(item) { return '<div class="item"><div><strong>' + item + '</strong><div class="meta">' + program.stage + '</div></div><span class="pill">сьогодні</span></div>'; }).join('');
  $('ageSummaryBadge').textContent = getAgeLabel(weeks) + ' · ' + program.stage;
  $('sidebarAgeStage').textContent = program.stage + ' · ' + getAgeLabel(weeks);
  $('sidebarTip').textContent = program.tip;
}

function renderPriorityTips() {
  var weeks = getAgeInWeeks(currentPet ? currentPet.birthDate : null);
  var program = getProgramByAge(weeks);
  $('priorityTips').innerHTML = program.priorities.map(function(text, i) { return '<div class="tip-card"><strong>' + (i + 1) + '. ' + text + '</strong><div class="meta">' + program.tip + '</div></div>'; }).join('');
}

function renderSocialChecklist() {
  $('socialChecklist').innerHTML = SOCIAL_ITEMS.map(function(label) { return '<label class="check-row"><input type="checkbox" /><div><strong>' + label + '</strong><div class="meta">Поступово, без примусу.</div></div></label>'; }).join('');
}

function renderCourses() {
  $('courseGrid').innerHTML = COURSES.map(function(course) { return '<button type="button" class="course-card ' + (course.id === currentCourseId ? 'selected' : '') + '" data-course-id="' + course.id + '"><span class="pill">' + course.badge + '</span><strong>' + course.title + '</strong><div class="meta">' + course.description + '</div></button>'; }).join('');
  var course = COURSES.find(function(c) { return c.id === currentCourseId; }) || COURSES[0];
  $('selectedCourse').innerHTML = '<div class="notice"><strong>' + course.title + '</strong><div class="helper">' + course.description + '</div></div><div class="triple" style="margin-top:1rem"><div class="card" style="padding:1rem"><div class="section-title"><h3>Покроково</h3></div><div class="lesson-list">' + course.steps.map(function(x, i) { return '<div class="lesson"><strong>Крок ' + (i + 1) + '</strong><div class="meta">' + x + '</div></div>'; }).join('') + '</div></div><div class="card" style="padding:1rem"><div class="section-title"><h3>Помилки</h3></div><div class="lesson-list">' + course.mistakes.map(function(x) { return '<div class="lesson"><strong>⚠️</strong><div class="meta">' + x + '</div></div>'; }).join('') + '</div></div><div class="card" style="padding:1rem"><div class="section-title"><h3>Чекліст</h3></div><div class="lesson-list">' + course.checklist.map(function(x) { return '<div class="lesson"><strong>✓</strong><div class="meta">' + x + '</div></div>'; }).join('') + '</div></div></div>';
  $$('[data-course-id]').forEach(function(btn) { btn.addEventListener('click', function() { currentCourseId = btn.dataset.courseId; renderCourses(); }); });
}

function renderKnowledge() {
  $('knowledgeGrid').innerHTML = KNOWLEDGE.map(function(item) { return '<div class="card"><div class="section-title"><h3>' + item.title + '</h3><span class="pill blue">' + item.tag + '</span></div><div class="helper">' + item.text + '</div></div>'; }).join('');
}

function renderToiletGuide() {
  $('toiletGuide').innerHTML = TOILET_GUIDE.map(function(x) { return '<div class="lesson"><strong>' + x.title + '</strong><div class="meta">' + x.text + '</div></div>'; }).join('');
}

function renderEvents() {
  var list = $('recentLogs');
  if (!eventsState.length) { list.innerHTML = '<div class="empty">Записів ще немає.</div>'; return; }
  list.innerHTML = eventsState.slice(0, 30).map(function(item) {
    var conf = TYPE_CONFIG[item.eventType] || { icon: '📌', label: item.eventType, tone: '' };
    return '<div class="item"><div><strong>' + conf.icon + ' ' + conf.label + '</strong><div class="meta">' + (item.timeLabel || '--:--') + ' · ' + (item.trigger || '') + '</div>' + (item.note ? '<div class="meta">' + item.note + '</div>' : '') + '</div><span class="pill ' + conf.tone + '">' + (item.byName || '') + '</span></div>';
  }).join('');
}

function renderKPIs() {
  var start = todayStart();
  var today = eventsState.filter(function(x) {
    if (!x.createdAt) return false;
    var ts = x.createdAt.toDate ? x.createdAt.toDate() : new Date(x.createdAt);
    return ts >= start;
  });
  $('kpiPad').textContent = today.filter(function(x) { return x.eventType === 'pad'; }).length;
  $('kpiOutdoor').textContent = today.filter(function(x) { return x.eventType === 'outdoor'; }).length;
  $('kpiMiss').textContent = today.filter(function(x) { return x.eventType === 'miss'; }).length;
  $('kpiTotal').textContent = eventsState.length;
}

function renderMembers(members) {
  if (!members) members = [];
  $('membersList').innerHTML = members.length ? members.map(function(m) { return '<div class="person"><div class="avatar">' + (m.photoURL ? '<img src="' + m.photoURL + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover">' : avatarText(m.displayName || '')) + '</div><div><strong>' + (m.displayName || 'User') + '</strong><div class="helper">' + (m.role || 'member') + '</div></div></div>'; }).join('') : '<div class="empty">Немає учасників.</div>';
}

function fillPetForm() {
  if (petFormDirty) return;
  $('petName').value = (currentPet && currentPet.name) || '';
  $('petBirthDate').value = (currentPet && currentPet.birthDate) || '';
  $('petSex').value = (currentPet && currentPet.sex) || '';
  $('petBreed').value = (currentPet && currentPet.breed) || '';
  $('petWeight').value = (currentPet && currentPet.weight) || '';
  $('petHomeDate').value = (currentPet && currentPet.homeDate) || '';
  $('petVaccination').value = (currentPet && currentPet.vaccination) || 'не вказано';
  $('petToiletMode').value = (currentPet && currentPet.toiletMode) || 'pad';
  $('petNotes').value = (currentPet && currentPet.notes) || '';
}

function renderWorkspaceMeta() {
  $('workspaceName').textContent = (workspaceData && workspaceData.name) || '—';
  $('inviteCodeView').textContent = (workspaceData && workspaceData.inviteCode) || '—';
}

function renderAll() { fillPetForm(); renderWorkspaceMeta(); renderProfileInsights(); renderTodayPlan(); renderPriorityTips(); renderEvents(); renderKPIs(); }
function renderStatic() { renderSocialChecklist(); renderCourses(); renderKnowledge(); renderToiletGuide(); }

async function ensureWorkspaceForUser(user) {
  var userDoc = await db.collection('users').doc(user.uid).get();
  if (userDoc.exists && userDoc.data().workspaceId) {
    workspaceId = userDoc.data().workspaceId;
    var wsDoc = await db.collection('workspaces').doc(workspaceId).get();
    workspaceData = wsDoc.exists ? wsDoc.data() : null;
    return;
  }
  var newRef = db.collection('workspaces').doc();
  workspaceId = newRef.id;
  var inviteCode = createInviteCode();
  var spaceName = (user.displayName || 'Мій').split(' ')[0] + ' простір';
  await newRef.set({ name: spaceName, ownerId: user.uid, inviteCode, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  workspaceData = { name: spaceName, ownerId: user.uid, inviteCode };
  await db.collection('users').doc(user.uid).set({ uid: user.uid, email: user.email || '', displayName: user.displayName || '', photoURL: user.photoURL || '', role: 'owner', workspaceId: workspaceId, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  await db.collection('workspaces').doc(workspaceId).collection('members').doc(user.uid).set({ uid: user.uid, email: user.email || '', displayName: user.displayName || '', photoURL: user.photoURL || '', role: 'owner', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  await db.collection('workspaces').doc(workspaceId).collection('dogs').doc('primary').set({ name: '', birthDate: '', sex: '', breed: '', weight: '', homeDate: '', vaccination: 'не вказано', toiletMode: 'pad', notes: '', createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
}

function subscribePet() {
  if (!workspaceId) return;
  if (unsubPet) unsubPet();
  unsubPet = db.collection('workspaces').doc(workspaceId).collection('dogs').doc('primary').onSnapshot(function(snap) { currentPet = snap.exists ? snap.data() : null; renderAll(); }, function(err) { console.error('Pet err:', err); });
}

function subscribeMembers() {
  if (!workspaceId) return;
  if (unsubMembers) unsubMembers();
  unsubMembers = db.collection('workspaces').doc(workspaceId).collection('members').onSnapshot(function(snap) { var m = []; snap.forEach(function(d) { m.push(d.data()); }); renderMembers(m); }, function(err) { console.error('Members err:', err); });
}

function subscribeEvents() {
  if (!workspaceId) return;
  if (unsubEvents) unsubEvents();
  unsubEvents = db.collection('workspaces').doc(workspaceId).collection('events').orderBy('createdAt', 'desc').limit(100).onSnapshot(function(snap) { var r = []; snap.forEach(function(d) { r.push(Object.assign({ id: d.id }, d.data())); }); eventsState = r; renderEvents(); renderKPIs(); }, function(err) { console.error('Events err:', err); });
}

async function savePetProfile(payload) {
  if (!currentUser || !workspaceId) return showToast('Спочатку увійди', 'error');
  await db.collection('workspaces').doc(workspaceId).collection('dogs').doc('primary').set(Object.assign({}, currentPet || {}, payload, { updatedAt: firebase.firestore.FieldValue.serverTimestamp() }), { merge: true });
  petFormDirty = false;
  showToast('Збережено ✓', 'success');
}

async function addEvent(payload) {
  if (!currentUser || !workspaceId) return showToast('Спочатку увійди', 'error');
  await db.collection('workspaces').doc(workspaceId).collection('events').add({ eventType: payload.eventType, byUid: currentUser.uid, byName: payload.byName || currentUser.displayName || '', trigger: payload.trigger || '', note: payload.note || '', timeLabel: payload.timeLabel || nowTime(), createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  showToast('Додано ✓', 'success');
}

async function joinWorkspaceByInvite(codeRaw) {
  if (!currentUser) return showToast('Увійди через Google', 'error');
  var code = codeRaw.trim().toUpperCase();
  if (!code) throw new Error('Введіть код');
  var snap = await db.collection('workspaces').where('inviteCode', '==', code).limit(1).get();
  if (snap.empty) throw new Error('Код не знайдено');
  workspaceId = snap.docs[0].id;
  workspaceData = snap.docs[0].data();
  await db.collection('users').doc(currentUser.uid).update({ workspaceId: workspaceId, role: 'member' });
  await db.collection('workspaces').doc(workspaceId).collection('members').doc(currentUser.uid).set({ uid: currentUser.uid, email: currentUser.email || '', displayName: currentUser.displayName || '', photoURL: currentUser.photoURL || '', role: 'member', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  subscribePet(); subscribeMembers(); subscribeEvents(); renderAll();
}

function loginGoogle() {
  auth.signInWithRedirect(googleProvider);
}

async function logoutGoogle() {
  if (unsubEvents) { unsubEvents(); unsubEvents = null; }
  if (unsubMembers) { unsubMembers(); unsubMembers = null; }
  if (unsubPet) { unsubPet(); unsubPet = null; }
  await auth.signOut();
  currentUser = null; workspaceId = null; workspaceData = null; currentPet = null; eventsState = [];
  petFormDirty = false;
  showToast('Вихід виконано', 'success');
}

function bootAuth() {
  auth.getRedirectResult().then(function(result) {
    if (result && result.user) {
      console.log('[Auth] Redirect success:', result.user.email);
    }
  }).catch(function(err) {
    console.warn('[Auth] Redirect error:', err.code);
  });

  auth.onAuthStateChanged(async function(user) {
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

function bindEvents() {
  $$('[data-tab]').forEach(function(btn) { btn.addEventListener('click', function() { setActiveTab(btn.dataset.tab); }); });
  $$('[data-theme-toggle]').forEach(function(el) { el.addEventListener('click', function() {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  }); });
  var saved = localStorage.getItem('theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);

  $('googleLoginBtn').addEventListener('click', loginGoogle);
  $('googleLoginBtnTop').addEventListener('click', loginGoogle);
  $('logoutBtn').addEventListener('click', logoutGoogle);

  $('eventTime').value = nowTime();
  $('eventForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    var btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await addEvent({ eventType: $('eventType').value, byName: $('eventBy').value.trim(), timeLabel: $('eventTime').value || nowTime(), trigger: $('eventTrigger').value, note: $('eventNote').value.trim() });
      e.target.reset(); $('eventTime').value = nowTime(); setActiveTab('dashboard');
    } catch (err) { showToast(err.message, 'error'); }
    finally { btn.disabled = false; }
  });

  var petForm = $('petProfileForm');
  petForm.addEventListener('input', function() { petFormDirty = true; });
  petForm.addEventListener('change', function() { petFormDirty = true; });
  petForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    var btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await savePetProfile({ name: $('petName').value.trim(), birthDate: $('petBirthDate').value, sex: $('petSex').value, breed: $('petBreed').value.trim(), weight: $('petWeight').value, homeDate: $('petHomeDate').value, vaccination: $('petVaccination').value, toiletMode: $('petToiletMode').value, notes: $('petNotes').value.trim() });
    } catch (err) { showToast(err.message, 'error'); }
    finally { btn.disabled = false; }
  });

  $$('[data-quick-event]').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      btn.disabled = true;
      try { await addEvent({ eventType: btn.dataset.quickEvent, byName: currentUser ? currentUser.displayName || '' : '', timeLabel: nowTime(), trigger: '', note: '' }); }
      catch (err) { showToast(err.message, 'error'); }
      finally { btn.disabled = false; }
    });
  });

  $('copyInviteBtn').addEventListener('click', async function() {
    if (!workspaceData || !workspaceData.inviteCode) return showToast('Код недоступний', 'error');
    try { await navigator.clipboard.writeText(workspaceData.inviteCode); }
    catch (e) { var i = document.createElement('input'); i.value = workspaceData.inviteCode; document.body.appendChild(i); i.select(); document.execCommand('copy'); i.remove(); }
    showToast('Скопійовано ✓', 'success');
  });

  $('joinWorkspaceForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    var btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true;
    try { await joinWorkspaceByInvite($('inviteCodeInput').value); $('inviteCodeInput').value = ''; showToast('Приєднано ✓', 'success'); }
    catch (err) { showToast(err.message, 'error'); }
    finally { btn.disabled = false; }
  });
}

renderStatic();
bindEvents();
bootAuth();

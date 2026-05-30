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

function showToast(msg, type) {
  type = type || 'info';
  var c = $('toastContainer');
  var t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = '<span>' + msg + '</span>';
  c.appendChild(t);
  requestAnimationFrame(function() { t.classList.add('show'); });
  setTimeout(function() { t.classList.remove('show'); setTimeout(function() { t.remove(); }, 300); }, 3000);
}

function nowTime() { return new Date().toTimeString().slice(0, 5); }
function createInviteCode() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }
function avatarText(n) { return ((n || 'U').trim()[0] || 'U').toUpperCase(); }
function todayStart() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }

function getAgeInWeeks(bd) {
  if (!bd) return null;
  var diff = Date.now() - new Date(bd).getTime();
  if (isNaN(diff) || diff < 0) return null;
  return Math.floor(diff / 604800000);
}

function getAgeLabel(w) {
  if (w == null) return '';
  if (w < 8) return w + ' тиж.';
  if (w < 52) return Math.floor(w / 4.345) + ' міс.';
  return (w / 52).toFixed(1) + ' р.';
}

function getProgramByAge(w) {
  if (w == null) return AGE_PROGRAMS[1];
  return AGE_PROGRAMS.find(function(p) { return w >= p.minWeeks && w < p.maxWeeks; }) || AGE_PROGRAMS[AGE_PROGRAMS.length - 1];
}

/* ─── Auth UI ─── */
function updateAuthUI(loggedIn) {
  var as = $('authScreen'), ac = $('appContent');
  if (loggedIn) {
    as.classList.add('hidden');
    ac.classList.remove('hidden');
    $('logoutBtn').style.display = '';
  } else {
    as.classList.remove('hidden');
    ac.classList.add('hidden');
    $('logoutBtn').style.display = 'none';
  }
}

/* ─── Tabs ─── */
function setActiveTab(id) {
  $$('.tab-panel').forEach(function(p) { p.classList.toggle('active', p.id === id); });
  $$('.nav-tab').forEach(function(b) { b.classList.toggle('active', b.dataset.tab === id); });
}

/* ─── Bottom Sheet ─── */
function openSheet() { $('eventSheet').classList.remove('hidden'); $('eventTime').value = nowTime(); }
function closeSheet() { $('eventSheet').classList.add('hidden'); }

/* ─── Render: Home ─── */
function renderHome() {
  renderKPIs();
  renderFeed();
  renderTip();
  if (currentPet && currentPet.name) {
    $('petNameHeader').textContent = '🐶 ' + currentPet.name;
  }
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

function renderFeed() {
  var list = $('recentLogs');
  if (!eventsState.length) { list.innerHTML = '<div class="empty">Натисніть кнопку вище щоб додати першу подію</div>'; return; }
  var start = todayStart();
  var todayEvents = eventsState.filter(function(x) {
    if (!x.createdAt) return false;
    var ts = x.createdAt.toDate ? x.createdAt.toDate() : new Date(x.createdAt);
    return ts >= start;
  });
  var items = todayEvents.length ? todayEvents : eventsState.slice(0, 10);
  list.innerHTML = items.map(function(item) {
    var conf = TYPE_CONFIG[item.eventType] || { icon: '📌', label: item.eventType, tone: '' };
    return '<div class="feed-item"><div><strong>' + conf.icon + ' ' + conf.label + '</strong><div class="meta">' + (item.timeLabel || '') + (item.trigger ? ' · ' + item.trigger : '') + '</div>' + (item.note ? '<div class="meta">' + item.note + '</div>' : '') + '</div><span class="pill ' + conf.tone + '">' + (item.byName || '') + '</span></div>';
  }).join('');
}

function renderTip() {
  var weeks = getAgeInWeeks(currentPet ? currentPet.birthDate : null);
  var program = getProgramByAge(weeks);
  var tips = KNOWLEDGE;
  var randomTip = tips[Math.floor(Math.random() * tips.length)];
  $('tipEmoji').textContent = '💡';
  $('tipText').textContent = randomTip ? randomTip.text.slice(0, 120) + (randomTip.text.length > 120 ? '...' : '') : program.tip;
}

/* ─── Render: Learn ─── */
function renderLearn() {
  var weeks = getAgeInWeeks(currentPet ? currentPet.birthDate : null);
  var program = getProgramByAge(weeks);
  $('ageSummaryBadge').textContent = getAgeLabel(weeks) + (weeks != null ? ' · ' + program.stage : '');

  // Today plan
  $('todayPlan').innerHTML = program.plan.map(function(item) { return '<div class="learn-item">' + item + '</div>'; }).join('');

  // Courses
  $('courseGrid').innerHTML = COURSES.map(function(c) {
    return '<button type="button" class="course-btn ' + (c.id === currentCourseId ? 'selected' : '') + '" data-cid="' + c.id + '"><strong>' + c.title + '</strong><div class="meta">' + c.description.slice(0, 60) + '...</div></button>';
  }).join('');
  $$('[data-cid]').forEach(function(btn) { btn.addEventListener('click', function() { currentCourseId = btn.dataset.cid; renderLearn(); }); });

  // Selected course detail
  var course = COURSES.find(function(c) { return c.id === currentCourseId; }) || COURSES[0];
  $('selectedCourse').innerHTML = '<div class="course-detail"><h4>Кроки</h4><ul>' + course.steps.map(function(s) { return '<li>' + s + '</li>'; }).join('') + '</ul><h4>Помилки ⚠️</h4><ul>' + course.mistakes.map(function(s) { return '<li>' + s + '</li>'; }).join('') + '</ul><h4>Чекліст ✓</h4><ul>' + course.checklist.map(function(s) { return '<li>' + s + '</li>'; }).join('') + '</ul></div>';

  // Knowledge
  $('knowledgeGrid').innerHTML = KNOWLEDGE.map(function(k) { return '<div class="k-card"><strong>' + k.title + '</strong><p>' + k.text + '</p><span class="tag">' + k.tag + '</span></div>'; }).join('');

  // Socialization
  $('socialChecklist').innerHTML = SOCIAL_ITEMS.map(function(s) { return '<div class="check-item"><input type="checkbox"><span>' + s + '</span></div>'; }).join('');
}

/* ─── Render: Profile ─── */
function renderProfile() {
  fillPetForm();
  renderWorkspaceMeta();
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

function renderMembers(members) {
  if (!members) members = [];
  $('membersList').innerHTML = members.length ? members.map(function(m) {
    return '<div class="member-row"><div class="member-avatar">' + (m.photoURL ? '<img src="' + m.photoURL + '">' : avatarText(m.displayName)) + '</div><span class="member-name">' + (m.displayName || 'User') + '</span></div>';
  }).join('') : '<div class="empty">Тільки ви</div>';
}

/* ─── Render All ─── */
function renderAll() {
  renderHome();
  renderLearn();
  renderProfile();
}

/* ─── Firebase Logic ─── */
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
  await newRef.set({ name: spaceName, ownerId: user.uid, inviteCode: inviteCode, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  workspaceData = { name: spaceName, ownerId: user.uid, inviteCode: inviteCode };
  await db.collection('users').doc(user.uid).set({ uid: user.uid, email: user.email || '', displayName: user.displayName || '', photoURL: user.photoURL || '', role: 'owner', workspaceId: workspaceId, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  await db.collection('workspaces').doc(workspaceId).collection('members').doc(user.uid).set({ uid: user.uid, email: user.email || '', displayName: user.displayName || '', photoURL: user.photoURL || '', role: 'owner', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  await db.collection('workspaces').doc(workspaceId).collection('dogs').doc('primary').set({ name: '', birthDate: '', sex: '', breed: '', weight: '', homeDate: '', vaccination: 'не вказано', toiletMode: 'pad', notes: '', createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
}

function subscribePet() {
  if (!workspaceId) return;
  if (unsubPet) unsubPet();
  unsubPet = db.collection('workspaces').doc(workspaceId).collection('dogs').doc('primary').onSnapshot(function(snap) {
    currentPet = snap.exists ? snap.data() : null;
    renderAll();
  });
}

function subscribeMembers() {
  if (!workspaceId) return;
  if (unsubMembers) unsubMembers();
  unsubMembers = db.collection('workspaces').doc(workspaceId).collection('members').onSnapshot(function(snap) {
    var m = []; snap.forEach(function(d) { m.push(d.data()); }); renderMembers(m);
  });
}

function subscribeEvents() {
  if (!workspaceId) return;
  if (unsubEvents) unsubEvents();
  unsubEvents = db.collection('workspaces').doc(workspaceId).collection('events').orderBy('createdAt', 'desc').limit(100).onSnapshot(function(snap) {
    var r = []; snap.forEach(function(d) { r.push(Object.assign({ id: d.id }, d.data())); }); eventsState = r; renderHome();
  });
}

async function savePetProfile(payload) {
  if (!currentUser || !workspaceId) return showToast('Спочатку увійди', 'error');
  await db.collection('workspaces').doc(workspaceId).collection('dogs').doc('primary').set(Object.assign({}, currentPet || {}, payload, { updatedAt: firebase.firestore.FieldValue.serverTimestamp() }), { merge: true });
  petFormDirty = false;
  showToast('Збережено ✓', 'success');
}

async function addEvent(payload) {
  if (!currentUser || !workspaceId) return showToast('Спочатку увійди', 'error');
  await db.collection('workspaces').doc(workspaceId).collection('events').add({
    eventType: payload.eventType,
    byUid: currentUser.uid,
    byName: payload.byName || currentUser.displayName || '',
    trigger: payload.trigger || '',
    note: payload.note || '',
    timeLabel: payload.timeLabel || nowTime(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  showToast('Додано ✓', 'success');
}

async function joinWorkspaceByInvite(codeRaw) {
  if (!currentUser) return showToast('Увійди', 'error');
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

/* ─── Auth ─── */
function loginGoogle() { auth.signInWithRedirect(googleProvider); }

async function logoutGoogle() {
  if (unsubEvents) { unsubEvents(); unsubEvents = null; }
  if (unsubMembers) { unsubMembers(); unsubMembers = null; }
  if (unsubPet) { unsubPet(); unsubPet = null; }
  await auth.signOut();
  currentUser = null; workspaceId = null; workspaceData = null; currentPet = null; eventsState = [];
  petFormDirty = false;
  showToast('Вихід', 'success');
}

function bootAuth() {
  auth.getRedirectResult().then(function(result) {
    if (result && result.user) console.log('[Auth] Redirect OK:', result.user.email);
  }).catch(function(err) {
    console.warn('[Auth] Redirect err:', err.code);
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
      showToast('Помилка: ' + error.message, 'error');
    }
    $('appLoader').classList.add('hidden');
  });
}

/* ─── Bindings ─── */
function bindEvents() {
  // Tabs
  $$('.nav-tab').forEach(function(btn) { btn.addEventListener('click', function() { setActiveTab(btn.dataset.tab); }); });

  // Theme
  $$('[data-theme-toggle]').forEach(function(el) { el.addEventListener('click', function() {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  }); });
  var saved = localStorage.getItem('theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);

  // Auth
  $('googleLoginBtn').addEventListener('click', loginGoogle);
  $('logoutBtn').addEventListener('click', logoutGoogle);

  // Quick events
  $$('[data-quick-event]').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      btn.disabled = true;
      try { await addEvent({ eventType: btn.dataset.quickEvent, byName: currentUser ? currentUser.displayName || '' : '', timeLabel: nowTime(), trigger: '', note: '' }); }
      catch (err) { showToast(err.message, 'error'); }
      finally { btn.disabled = false; }
    });
  });

  // Open full form
  $('openFullForm').addEventListener('click', openSheet);
  $('sheetBackdrop').addEventListener('click', closeSheet);

  // Event form
  $('eventForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    var btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await addEvent({ eventType: $('eventType').value, byName: $('eventBy').value.trim(), timeLabel: $('eventTime').value || nowTime(), trigger: $('eventTrigger').value, note: $('eventNote').value.trim() });
      e.target.reset(); closeSheet();
    } catch (err) { showToast(err.message, 'error'); }
    finally { btn.disabled = false; }
  });

  // Pet form
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

  // Copy invite
  $('copyInviteBtn').addEventListener('click', async function() {
    if (!workspaceData || !workspaceData.inviteCode) return showToast('Код недоступний', 'error');
    try { await navigator.clipboard.writeText(workspaceData.inviteCode); }
    catch (e) { var i = document.createElement('input'); i.value = workspaceData.inviteCode; document.body.appendChild(i); i.select(); document.execCommand('copy'); i.remove(); }
    showToast('Скопійовано ✓', 'success');
  });

  // Join workspace
  $('joinWorkspaceForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    var btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true;
    try { await joinWorkspaceByInvite($('inviteCodeInput').value); $('inviteCodeInput').value = ''; showToast('Приєднано ✓', 'success'); }
    catch (err) { showToast(err.message, 'error'); }
    finally { btn.disabled = false; }
  });
}

/* ─── Init ─── */
bindEvents();
bootAuth();

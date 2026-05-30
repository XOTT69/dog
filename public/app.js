import { AGE_PROGRAMS, COURSES, KNOWLEDGE, SOCIAL_ITEMS, TOILET_GUIDE, TYPE_CONFIG } from './content.js';

firebase.initializeApp({
  apiKey: 'AIzaSyCY2SkRPpopi7mtsihrlqocxdgG8cBjNHI',
  authDomain: 'dogsbelli.vercel.app',
  projectId: 'dogs-55f5e',
  storageBucket: 'dogs-55f5e.firebasestorage.app',
  messagingSenderId: '1053489833652',
  appId: '1:1053489833652:web:ddf53d87b0a4af4207d9e1'
});

var auth = firebase.auth();
var db = firebase.firestore();
var googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
db.enablePersistence({ synchronizeTabs: true }).catch(function() {});

var currentUser = null, workspaceId = null, workspaceData = null, currentPet = null;
var currentCourseId = 'pee-pad', eventsState = [];
var unsubEvents = null, unsubMembers = null, unsubPet = null, petFormDirty = false;

function $(id) { return document.getElementById(id); }
function $$(s) { return document.querySelectorAll(s); }

function showToast(msg, type) {
  var c = $('toastContainer'), t = document.createElement('div');
  t.className = 'toast ' + (type || '');
  t.textContent = msg;
  c.appendChild(t);
  requestAnimationFrame(function() { t.classList.add('show'); });
  setTimeout(function() { t.classList.remove('show'); setTimeout(function() { t.remove(); }, 300); }, 3000);
}

function haptic() { if (navigator.vibrate) navigator.vibrate(10); }
function nowTime() { return new Date().toTimeString().slice(0, 5); }
function createInviteCode() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }
function avatarText(n) { return ((n || 'U').trim()[0] || 'U').toUpperCase(); }
function todayStart() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }

function getAgeInWeeks(bd) { if (!bd) return null; var d = Date.now() - new Date(bd).getTime(); return isNaN(d) || d < 0 ? null : Math.floor(d / 604800000); }
function getAgeLabel(w) { if (w == null) return ''; return w < 8 ? w + ' тиж.' : w < 52 ? Math.floor(w / 4.345) + ' міс.' : (w / 52).toFixed(1) + ' р.'; }
function getProgramByAge(w) { if (w == null) return AGE_PROGRAMS[1]; return AGE_PROGRAMS.find(function(p) { return w >= p.minWeeks && w < p.maxWeeks; }) || AGE_PROGRAMS[AGE_PROGRAMS.length - 1]; }

function confetti() {
  var canvas = $('confettiCanvas');
  var colors = ['#0e766e', '#eab308', '#ef4444', '#3b82f6', '#a855f7'];
  for (var i = 0; i < 30; i++) {
    var piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = Math.random() * .5 + 's';
    piece.style.animationDuration = 2 + Math.random() * 2 + 's';
    canvas.appendChild(piece);
  }
  setTimeout(function() { canvas.innerHTML = ''; }, 4000);
}

/* ─── Auth UI ─── */
function updateAuthUI(loggedIn) {
  $('authScreen').classList.toggle('hidden', loggedIn);
  $('appContent').classList.toggle('hidden', !loggedIn);
  $('logoutBtn').style.display = loggedIn ? '' : 'none';
}

function setActiveTab(id) {
  $$('.tab-panel').forEach(function(p) { p.classList.toggle('active', p.id === id); });
  $$('.nav-tab').forEach(function(b) { b.classList.toggle('active', b.dataset.tab === id); });
}

function openSheet() { $('eventSheet').classList.remove('hidden'); $('eventTime').value = nowTime(); }
function closeSheet() { $('eventSheet').classList.add('hidden'); }

/* ─── Render: Home ─── */
function renderHome() {
  renderKPIs();
  renderProgressRing();
  renderStreak();
  renderDailyChecklist();
  renderTip();
  renderFeed();
  renderHeaderInfo();
}

function renderHeaderInfo() {
  var name = (currentPet && currentPet.name) || 'Мій песик';
  $('petNameHeader').textContent = '🐶 ' + name;
  var weeks = getAgeInWeeks(currentPet ? currentPet.birthDate : null);
  var program = getProgramByAge(weeks);
  $('headerSub').textContent = weeks != null ? getAgeLabel(weeks) + ' · ' + program.stage : 'Заповніть профіль →';
  if (currentUser && currentUser.photoURL) {
    $('userAvatar').innerHTML = '<img src="' + currentUser.photoURL + '" alt="">';
  }
}

function renderKPIs() {
  var start = todayStart();
  var today = eventsState.filter(function(x) { if (!x.createdAt) return false; var ts = x.createdAt.toDate ? x.createdAt.toDate() : new Date(x.createdAt); return ts >= start; });
  $('kpiPad').textContent = today.filter(function(x) { return x.eventType === 'pad'; }).length;
  $('kpiOutdoor').textContent = today.filter(function(x) { return x.eventType === 'outdoor'; }).length;
  $('kpiMiss').textContent = today.filter(function(x) { return x.eventType === 'miss'; }).length;
  $('kpiTotal').textContent = eventsState.length + ' записів';
}

function renderProgressRing() {
  var start = todayStart();
  var today = eventsState.filter(function(x) { if (!x.createdAt) return false; var ts = x.createdAt.toDate ? x.createdAt.toDate() : new Date(x.createdAt); return ts >= start; });
  var success = today.filter(function(x) { return x.eventType === 'pad' || x.eventType === 'outdoor'; }).length;
  var total = success + today.filter(function(x) { return x.eventType === 'miss'; }).length;
  var pct = total > 0 ? Math.round((success / total) * 100) : 0;
  var offset = 264 - (264 * pct / 100);
  $('ringFill').style.strokeDashoffset = offset;
  $('ringPct').textContent = pct + '%';
}

function renderStreak() {
  var start = todayStart();
  var today = eventsState.filter(function(x) { if (!x.createdAt) return false; var ts = x.createdAt.toDate ? x.createdAt.toDate() : new Date(x.createdAt); return ts >= start; });
  var days = 0;
  if (today.length > 0) {
    days = 1;
    // Count consecutive days with records
    var allDates = eventsState.map(function(x) { if (!x.createdAt) return null; var ts = x.createdAt.toDate ? x.createdAt.toDate() : new Date(x.createdAt); return ts.toDateString(); }).filter(Boolean);
    var unique = [...new Set(allDates)].sort(function(a, b) { return new Date(b) - new Date(a); });
    for (var i = 0; i < unique.length - 1; i++) {
      var diff = (new Date(unique[i]) - new Date(unique[i + 1])) / 86400000;
      if (diff <= 1) days++; else break;
    }
  }
  var bar = $('streakBar');
  if (days >= 3) { bar.style.display = 'flex'; $('streakText').textContent = days + ' днів поспіль! Так тримати! 🔥'; }
  else if (today.length > 0) { bar.style.display = 'flex'; $('streakText').textContent = 'Сьогодні є записи — чудово!'; }
  else { bar.style.display = 'flex'; $('streakText').textContent = 'Додайте перший запис сьогодні'; }
}

function renderDailyChecklist() {
  var weeks = getAgeInWeeks(currentPet ? currentPet.birthDate : null);
  var program = getProgramByAge(weeks);
  var items = program.plan;
  $('dailyItems').innerHTML = items.map(function(item, i) { return '<div class="daily-item" data-idx="' + i + '"><input type="checkbox" id="dc' + i + '"><span>' + item + '</span></div>'; }).join('');
  $('dailyProgress').textContent = '0/' + items.length;
  $$('.daily-item input').forEach(function(cb) {
    cb.addEventListener('change', function() {
      var parent = cb.closest('.daily-item');
      parent.classList.toggle('done', cb.checked);
      var checked = $$('.daily-item input:checked').length;
      $('dailyProgress').textContent = checked + '/' + items.length;
      if (checked === items.length) { confetti(); showToast('Всі завдання виконано! 🎉', 'success'); }
      haptic();
    });
  });
}

function renderTip() {
  var weeks = getAgeInWeeks(currentPet ? currentPet.birthDate : null);
  var program = getProgramByAge(weeks);
  var hour = new Date().getHours();
  var tip;
  if (hour < 10) tip = 'Ранок — ідеальний час для туалету після сну. Ведіть одразу на місце!';
  else if (hour < 14) tip = program.tip;
  else if (hour < 18) { var k = KNOWLEDGE[Math.floor(Math.random() * KNOWLEDGE.length)]; tip = k.text.slice(0, 140) + (k.text.length > 140 ? '...' : ''); }
  else tip = 'Вечір — коротка сесія на ім\'я (5–8 повторень) або нюхова гра перед сном.';
  $('tipText').textContent = tip;
}

function renderFeed() {
  var list = $('recentLogs');
  if (!eventsState.length) { list.innerHTML = '<div class="empty"><span class="empty-illustration">🐾</span>Натисніть кнопку вище щоб почати</div>'; return; }
  var start = todayStart();
  var todayEvents = eventsState.filter(function(x) { if (!x.createdAt) return false; var ts = x.createdAt.toDate ? x.createdAt.toDate() : new Date(x.createdAt); return ts >= start; });
  var items = todayEvents.length ? todayEvents : eventsState.slice(0, 8);
  list.innerHTML = items.map(function(item, i) {
    var conf = TYPE_CONFIG[item.eventType] || { icon: '📌', label: item.eventType, tone: '' };
    return '<div class="feed-item" style="animation-delay:' + (i * .05) + 's"><div><strong>' + conf.icon + ' ' + conf.label + '</strong><div class="meta">' + (item.timeLabel || '') + (item.trigger ? ' · ' + item.trigger : '') + (item.note ? ' — ' + item.note : '') + '</div></div><span class="pill ' + conf.tone + '">' + (item.byName || '') + '</span></div>';
  }).join('');
}

/* ─── Render: Learn ─── */
function renderLearn() {
  var weeks = getAgeInWeeks(currentPet ? currentPet.birthDate : null);
  var program = getProgramByAge(weeks);
  $('ageSummaryBadge').textContent = weeks != null ? getAgeLabel(weeks) + ' · ' + program.stage : 'Вкажіть вік в профілі';
  $('priorityTips').innerHTML = program.priorities.map(function(t) { return '<div class="plan-item">' + t + '</div>'; }).join('');

  $('courseGrid').innerHTML = COURSES.map(function(c) {
    return '<button type="button" class="course-btn ' + (c.id === currentCourseId ? 'selected' : '') + '" data-cid="' + c.id + '"><span class="c-badge">' + c.badge + '</span><strong>' + c.title + '</strong><div class="c-meta">' + c.description.slice(0, 70) + '...</div></button>';
  }).join('');
  $$('[data-cid]').forEach(function(btn) { btn.addEventListener('click', function() { currentCourseId = btn.dataset.cid; renderLearn(); haptic(); }); });

  var course = COURSES.find(function(c) { return c.id === currentCourseId; }) || COURSES[0];
  $('selectedCourse').innerHTML = '<div class="course-detail"><h4>Кроки</h4><ul>' + course.steps.map(function(s) { return '<li>' + s + '</li>'; }).join('') + '</ul><h4>Помилки</h4><ul class="mistakes">' + course.mistakes.map(function(s) { return '<li>' + s + '</li>'; }).join('') + '</ul><h4>Чекліст</h4><ul class="checks">' + course.checklist.map(function(s) { return '<li>' + s + '</li>'; }).join('') + '</ul></div>';

  $('knowledgeGrid').innerHTML = KNOWLEDGE.map(function(k) { return '<div class="k-card"><strong>' + k.title + '</strong><p>' + k.text + '</p><span class="k-tag">' + k.tag + '</span></div>'; }).join('');

  var socialChecked = 0;
  $('socialChecklist').innerHTML = SOCIAL_ITEMS.map(function(s, i) { return '<div class="social-item"><input type="checkbox" id="sc' + i + '"><span>' + s + '</span></div>'; }).join('');
  $('socialProgress').textContent = '0/' + SOCIAL_ITEMS.length;
  $$('.social-item input').forEach(function(cb) {
    cb.addEventListener('change', function() { var c = $$('.social-item input:checked').length; $('socialProgress').textContent = c + '/' + SOCIAL_ITEMS.length; });
  });
}

/* ─── Render: Profile ─── */
function renderProfile() {
  fillPetForm();
  renderWorkspaceMeta();
  var name = (currentPet && currentPet.name) || 'Мій песик';
  var weeks = getAgeInWeeks(currentPet ? currentPet.birthDate : null);
  $('profileName').textContent = name;
  $('profileMeta').textContent = weeks != null ? getAgeLabel(weeks) + ' · ' + ((currentPet && currentPet.breed) || 'Порода не вказана') : 'Заповніть дані нижче';
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
    return '<div class="member-chip">' + (m.photoURL ? '<img src="' + m.photoURL + '">' : '<div class="m-avatar">' + avatarText(m.displayName) + '</div>') + '<span>' + (m.displayName || 'User') + '</span></div>';
  }).join('') : '<div class="empty">Тільки ви</div>';
}

function renderAll() { renderHome(); renderLearn(); renderProfile(); }

/* ─── Firebase ─── */
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
  confetti();
}

function subscribePet() { if (!workspaceId) return; if (unsubPet) unsubPet(); unsubPet = db.collection('workspaces').doc(workspaceId).collection('dogs').doc('primary').onSnapshot(function(s) { currentPet = s.exists ? s.data() : null; renderAll(); }); }
function subscribeMembers() { if (!workspaceId) return; if (unsubMembers) unsubMembers(); unsubMembers = db.collection('workspaces').doc(workspaceId).collection('members').onSnapshot(function(s) { var m = []; s.forEach(function(d) { m.push(d.data()); }); renderMembers(m); }); }
function subscribeEvents() { if (!workspaceId) return; if (unsubEvents) unsubEvents(); unsubEvents = db.collection('workspaces').doc(workspaceId).collection('events').orderBy('createdAt', 'desc').limit(200).onSnapshot(function(s) { var r = []; s.forEach(function(d) { r.push(Object.assign({ id: d.id }, d.data())); }); eventsState = r; renderHome(); }); }

async function savePetProfile(payload) {
  if (!currentUser || !workspaceId) return showToast('Увійдіть спочатку', 'error');
  await db.collection('workspaces').doc(workspaceId).collection('dogs').doc('primary').set(Object.assign({}, currentPet || {}, payload, { updatedAt: firebase.firestore.FieldValue.serverTimestamp() }), { merge: true });
  petFormDirty = false;
  showToast('Збережено ✓', 'success'); haptic();
}

async function addEvent(payload) {
  if (!currentUser || !workspaceId) return showToast('Увійдіть спочатку', 'error');
  await db.collection('workspaces').doc(workspaceId).collection('events').add({ eventType: payload.eventType, byUid: currentUser.uid, byName: payload.byName || currentUser.displayName || '', trigger: payload.trigger || '', note: payload.note || '', timeLabel: payload.timeLabel || nowTime(), createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  showToast('Додано ✓', 'success'); haptic();
  // Milestone confetti
  if (eventsState.length === 9 || eventsState.length === 49 || eventsState.length === 99) { setTimeout(confetti, 500); showToast('🎉 ' + (eventsState.length + 1) + ' записів! Milestone!', 'success'); }
}

async function joinWorkspaceByInvite(code) {
  if (!currentUser) return showToast('Увійдіть', 'error');
  code = code.trim().toUpperCase();
  if (!code) throw new Error('Введіть код');
  var snap = await db.collection('workspaces').where('inviteCode', '==', code).limit(1).get();
  if (snap.empty) throw new Error('Код не знайдено');
  workspaceId = snap.docs[0].id; workspaceData = snap.docs[0].data();
  await db.collection('users').doc(currentUser.uid).update({ workspaceId: workspaceId, role: 'member' });
  await db.collection('workspaces').doc(workspaceId).collection('members').doc(currentUser.uid).set({ uid: currentUser.uid, email: currentUser.email || '', displayName: currentUser.displayName || '', photoURL: currentUser.photoURL || '', role: 'member', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  subscribePet(); subscribeMembers(); subscribeEvents(); renderAll(); confetti();
}

/* ─── Auth ─── */
function loginGoogle() { auth.signInWithRedirect(googleProvider); }

async function logoutGoogle() {
  if (unsubEvents) { unsubEvents(); unsubEvents = null; }
  if (unsubMembers) { unsubMembers(); unsubMembers = null; }
  if (unsubPet) { unsubPet(); unsubPet = null; }
  await auth.signOut();
  currentUser = null; workspaceId = null; workspaceData = null; currentPet = null; eventsState = [];
  petFormDirty = false; showToast('До побачення 👋');
}

function bootAuth() {
  auth.getRedirectResult().then(function(r) { if (r && r.user) console.log('[Auth] OK:', r.user.email); }).catch(function(e) { console.warn('[Auth]', e.code); });
  auth.onAuthStateChanged(async function(user) {
    currentUser = user || null;
    updateAuthUI(!!currentUser);
    if (!currentUser) { $('appLoader').classList.add('hidden'); return; }
    try {
      await ensureWorkspaceForUser(currentUser);
      subscribePet(); subscribeMembers(); subscribeEvents();
      renderAll();
    } catch (e) { console.error('[Boot]', e); showToast('Помилка: ' + e.message, 'error'); }
    $('appLoader').classList.add('hidden');
  });
}

/* ─── Bindings ─── */
function bindEvents() {
  $$('.nav-tab').forEach(function(b) { b.addEventListener('click', function() { setActiveTab(b.dataset.tab); haptic(); }); });
  $$('[data-theme-toggle]').forEach(function(el) { el.addEventListener('click', function() { var n = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', n); localStorage.setItem('theme', n); }); });
  if (localStorage.getItem('theme')) document.documentElement.setAttribute('data-theme', localStorage.getItem('theme'));

  $('googleLoginBtn').addEventListener('click', loginGoogle);
  $('logoutBtn').addEventListener('click', logoutGoogle);

  $$('[data-quick-event]').forEach(function(btn) {
    btn.addEventListener('click', async function() { btn.disabled = true; haptic(); try { await addEvent({ eventType: btn.dataset.quickEvent, byName: currentUser ? currentUser.displayName || '' : '', timeLabel: nowTime() }); } catch (e) { showToast(e.message, 'error'); } finally { btn.disabled = false; } });
  });

  $('openFullForm').addEventListener('click', function() { openSheet(); haptic(); });
  $('sheetBackdrop').addEventListener('click', closeSheet);

  $('eventForm').addEventListener('submit', async function(e) {
    e.preventDefault(); var btn = e.target.querySelector('[type="submit"]'); btn.disabled = true;
    try { await addEvent({ eventType: $('eventType').value, byName: $('eventBy').value.trim(), timeLabel: $('eventTime').value || nowTime(), trigger: $('eventTrigger').value, note: $('eventNote').value.trim() }); e.target.reset(); closeSheet(); } catch (err) { showToast(err.message, 'error'); }
    finally { btn.disabled = false; }
  });

  var pf = $('petProfileForm');
  pf.addEventListener('input', function() { petFormDirty = true; });
  pf.addEventListener('change', function() { petFormDirty = true; });
  pf.addEventListener('submit', async function(e) {
    e.preventDefault(); var btn = e.target.querySelector('[type="submit"]'); btn.disabled = true;
    try { await savePetProfile({ name: $('petName').value.trim(), birthDate: $('petBirthDate').value, sex: $('petSex').value, breed: $('petBreed').value.trim(), weight: $('petWeight').value, homeDate: $('petHomeDate').value, vaccination: $('petVaccination').value, toiletMode: $('petToiletMode').value, notes: $('petNotes').value.trim() }); } catch (err) { showToast(err.message, 'error'); }
    finally { btn.disabled = false; }
  });

  $('copyInviteBtn').addEventListener('click', async function() {
    if (!workspaceData || !workspaceData.inviteCode) return showToast('Код недоступний', 'error');
    try { await navigator.clipboard.writeText(workspaceData.inviteCode); } catch (e) { var i = document.createElement('input'); i.value = workspaceData.inviteCode; document.body.appendChild(i); i.select(); document.execCommand('copy'); i.remove(); }
    showToast('Скопійовано ✓', 'success'); haptic();
  });

   $('joinWorkspaceForm').addEventListener('submit', async function(e) {
    e.preventDefault(); var btn = e.target.querySelector('[type="submit"]'); btn.disabled = true;
    try { await joinWorkspaceByInvite($('inviteCodeInput').value); $('inviteCodeInput').value = ''; showToast('Приєднано! 🎉', 'success'); } catch (err) { showToast(err.message, 'error'); }
    finally { btn.disabled = false; }
  });
}

bindEvents();
bootAuth();

import { AGE_PROGRAMS, COURSES, KNOWLEDGE, SOCIAL_ITEMS, TOILET_GUIDE, TYPE_CONFIG } from './content.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';
import {
  initializeFirestore,
  persistentLocalCache,
  doc, getDoc, setDoc, updateDoc, addDoc, getDocs,
  collection, query, where, orderBy, limit, onSnapshot, serverTimestamp, Timestamp
} from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';

/* ─── Firebase Init ─── */
const firebaseConfig = {
  apiKey: 'AIzaSyCY2SkRPpopi7mtsihrlqocxdgG8cBjNHI',
  authDomain: 'dogsbelli.vercel.app',
  projectId: 'dogs-55f5e',
  storageBucket: 'dogs-55f5e.firebasestorage.app',
  messagingSenderId: '1053489833652',
  appId: '1:1053489833652:web:ddf53d87b0a4af4207d9e1'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, { localCache: persistentLocalCache() });
const provider = new GoogleAuthProvider();

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
let petFormDirty = false; // prevents snapshot from overwriting active form edits

/* ─── Helpers ─── */
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

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

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

/* ─── Auth UI Gate ─── */
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

/* ─── Tab Navigation ─── */
function setActiveTab(id) {
  $$('[data-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === id));
  $$('.tab-panel').forEach(panel => panel.classList.toggle('active', panel.id === id));
}

/* ─── Render Functions ─── */
function renderProfileInsights() {
  const weeks = getAgeInWeeks(currentPet?.birthDate);
  const program = getProgramByAge(weeks);
  const mode = currentPet?.toiletMode || 'pad';
  const modeTexts = {
    pad: 'Основний сценарій — пелюшка вдома. Завдання: стабілізувати місце, тригери і швидке підкріплення.',
    mixed: 'Змішаний режим. Завдання: не поспішати, переводити навичку поступово.',
    outdoor: 'Переважно вулиця. Завдання: стежити за інтервалами, ритуалами і вчасним виходом.'
  };
  const insights = [
    { title: 'Чому важливий вік', text: `Зараз етап: ${program.stage}. Саме від віку залежить, на чому краще фокусуватись щодня.` },
    { title: 'Поточний побутовий режим', text: modeTexts[mode] || modeTexts.pad },
    { title: 'Навіщо вести записи', text: 'Чим точніше ви відмічаєте сон, їжу, гру та туалет, тим легше застосунок підказує закономірності і дає корисні рекомендації.' }
  ];
  $('profileInsights').innerHTML = insights.map(x => `<div class="notice"><strong>${x.title}</strong><div class="helper">${x.text}</div></div>`).join('');
}

function renderTodayPlan() {
  const weeks = getAgeInWeeks(currentPet?.birthDate);
  const program = getProgramByAge(weeks);
  const plan = program.plan.map(item => `<div class="item"><div><strong>${item}</strong><div class="meta">${program.stage}</div></div><span class="pill">сьогодні</span></div>`).join('');
  $('todayPlan').innerHTML = plan;
  $('ageSummaryBadge').textContent = `Вік: ${getAgeLabel(weeks)} · ${program.stage}`;
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
    <label class="check-row">
      <input type="checkbox" />
      <div><strong>${label}</strong><div class="meta">Знайомити спокійно, без примусу, маленькими дозами.</div></div>
    </label>
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
    <div class="notice" style="margin-bottom:1rem"><strong>${course.title}</strong><div class="helper">${course.description}</div></div>
    <div class="triple">
      <div class="card" style="padding:1rem"><div class="section-title"><h3>Покроково</h3></div><div class="lesson-list">${course.steps.map((x, i) => `<div class="lesson"><strong>Крок ${i + 1}</strong><div class="meta">${x}</div></div>`).join('')}</div></div>
      <div class="card" style="padding:1rem"><div class="section-title"><h3>Часті помилки</h3></div><div class="lesson-list">${course.mistakes.map(x => `<div class="lesson"><strong>⚠️ Уникайте</strong><div class="meta">${x}</div></div>`).join('')}</div></div>
      <div class="card" style="padding:1rem"><div class="section-title"><h3>Чекліст</h3></div><div class="lesson-list">${course.checklist.map(x => `<div class="lesson"><strong>✓ Перевірка</strong><div class="meta">${x}</div></div>`).join('')}</div></div>
    </div>
  `;

  $$('[data-course-id]').forEach(btn => btn.addEventListener('click', () => {
    currentCourseId = btn.dataset.courseId;
    renderCourses();
  }));
}

function renderKnowledge() {
  $('knowledgeGrid').innerHTML = KNOWLEDGE.map(item => `
    <div class="card">
      <div class="section-title"><h3>${item.title}</h3><span class="pill blue">${item.tag}</span></div>
      <div class="helper">${item.text}</div>
    </div>
  `).join('');
}

function renderToiletGuide() {
  $('toiletGuide').innerHTML = TOILET_GUIDE.map(x => `<div class="lesson"><strong>${x.title}</strong><div class="meta">${x.text}</div></div>`).join('');
}

function renderEvents() {
  const list = $('recentLogs');
  if (!eventsState.length) {
    list.innerHTML = `<div class="empty">Записів ще немає.<br>Додайте першу подію, щоб бачити прогрес.</div>`;
    return;
  }
  list.innerHTML = eventsState.slice(0, 30).map(item => {
    const conf = TYPE_CONFIG[item.eventType] || { icon: '📌', label: item.eventType, tone: '' };
    return `<div class="item"><div><strong>${conf.icon} ${conf.label}</strong><div class="meta">${item.timeLabel || '--:--'} · ${item.trigger || ''}</div>${item.note ? `<div class="meta" style="margin-top:4px;color:var(--text);opacity:.8">${item.note}</div>` : ''}</div><span class="pill ${conf.tone}">${item.byName || 'user'}</span></div>`;
  }).join('');
}

function renderKPIs() {
  const start = todayStart();
  const todayEvents = eventsState.filter(x => {
    if (!x.createdAt) return false;
    const ts = x.createdAt.toDate ? x.createdAt.toDate() : new Date(x.createdAt);
    return ts >= start;
  });

  $('kpiPad').textContent = todayEvents.filter(x => x.eventType === 'pad').length;
  $('kpiOutdoor').textContent = todayEvents.filter(x => x.eventType === 'outdoor').length;
  $('kpiMiss').textContent = todayEvents.filter(x => x.eventType === 'miss').length;
  $('kpiTotal').textContent = eventsState.length;
}

function renderMembers(members = []) {
  const html = members.length ? members.map(member => `
    <div class="person">
      <div class="avatar">${member.photoURL ? `<img src="${member.photoURL}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : avatarText(member.displayName || member.email || 'U')}</div>
      <div><strong>${member.displayName || 'User'}</strong><div class="helper">${member.role || 'member'}</div></div>
    </div>
  `).join('') : `<div class="empty">Немає учасників.</div>`;
  $('membersList').innerHTML = html;
}

function fillPetForm() {
  if (petFormDirty) return; // don't overwrite active edits
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

function renderAll() {
  fillPetForm();
  renderWorkspaceMeta();
  renderProfileInsights();
  renderTodayPlan();
  renderPriorityTips();
  renderEvents();
  renderKPIs();
}

// These only need to render once (or on course change)
function renderStatic() {
  renderSocialChecklist();
  renderCourses();
  renderKnowledge();
  renderToiletGuide();
}

/* ─── Firebase Logic ─── */
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

  await setDoc(userRef, {
    uid: user.uid, email: user.email || '', displayName: user.displayName || '', photoURL: user.photoURL || '',
    role: 'owner', workspaceId, createdAt: serverTimestamp()
  });

  await setDoc(doc(db, 'workspaces', workspaceId, 'members', user.uid), {
    uid: user.uid, email: user.email || '', displayName: user.displayName || '', photoURL: user.photoURL || '',
    role: 'owner', createdAt: serverTimestamp()
  });

  await setDoc(doc(db, 'workspaces', workspaceId, 'dogs', 'primary'), {
    name: '', birthDate: '', sex: '', breed: '', weight: '', homeDate: '',
    vaccination: 'не вказано', toiletMode: 'pad', notes: '',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
}

function subscribePet() {
  if (!workspaceId) return;
  if (unsubPet) unsubPet();
  unsubPet = onSnapshot(doc(db, 'workspaces', workspaceId, 'dogs', 'primary'), snap => {
    currentPet = snap.exists() ? snap.data() : null;
    renderAll();
  }, err => console.error('Pet subscription error:', err));
}

function subscribeMembers() {
  if (!workspaceId) return;
  if (unsubMembers) unsubMembers();
  unsubMembers = onSnapshot(collection(db, 'workspaces', workspaceId, 'members'), snap => {
    const members = [];
    snap.forEach(d => members.push(d.data()));
    renderMembers(members);
  }, err => console.error('Members subscription error:', err));
}

function subscribeEvents() {
  if (!workspaceId) return;
  if (unsubEvents) unsubEvents();
  unsubEvents = onSnapshot(
    query(collection(db, 'workspaces', workspaceId, 'events'), orderBy('createdAt', 'desc'), limit(100)),
    snap => {
      const rows = [];
      snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
      eventsState = rows;
      renderEvents();
      renderKPIs();
    },
    err => console.error('Events subscription error:', err)
  );
}

async function savePetProfile(payload) {
  if (!currentUser || !workspaceId) return showToast('Спочатку увійди через Google', 'error');
  try {
    await setDoc(doc(db, 'workspaces', workspaceId, 'dogs', 'primary'), {
      ...(currentPet || {}),
      ...payload,
      updatedAt: serverTimestamp()
    }, { merge: true });
    petFormDirty = false;
    showToast('Профіль збережено ✓', 'success');
  } catch (error) {
    showToast('Помилка збереження: ' + error.message, 'error');
  }
}

async function addEvent(payload) {
  if (!currentUser || !workspaceId) return showToast('Спочатку увійди через Google', 'error');
  await addDoc(collection(db, 'workspaces', workspaceId, 'events'), {
    eventType: payload.eventType,
    byUid: currentUser.uid,
    byName: payload.byName || currentUser.displayName || 'Юзер',
    trigger: payload.trigger || '',
    note: payload.note || '',
    timeLabel: payload.timeLabel || nowTime(),
    createdAt: serverTimestamp()
  });
  showToast('Запис додано ✓', 'success');
}

async function joinWorkspaceByInvite(codeRaw) {
  if (!currentUser) return showToast('Увійди через Google для приєднання', 'error');
  const code = codeRaw.trim().toUpperCase();
  if (!code) throw new Error('Введіть код');
  const snap = await getDocs(query(collection(db, 'workspaces'), where('inviteCode', '==', code), limit(1)));
  if (snap.empty) throw new Error('Код не знайдено');
  workspaceId = snap.docs[0].id;
  workspaceData = snap.docs[0].data();
  await updateDoc(doc(db, 'users', currentUser.uid), { workspaceId, role: 'member' });
  await setDoc(doc(db, 'workspaces', workspaceId, 'members', currentUser.uid), {
    uid: currentUser.uid, email: currentUser.email || '', displayName: currentUser.displayName || '',
    photoURL: currentUser.photoURL || '', role: 'member', createdAt: serverTimestamp()
  });
  subscribePet();
  subscribeMembers();
  subscribeEvents();
  renderAll();
}

/* ─── Auth ─── */
async function loginGoogle() {
  const btn = $('googleLoginBtn');
  const btnTop = $('googleLoginBtnTop');
  btn && (btn.disabled = true);
  btnTop && (btnTop.disabled = true);

  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user') {
      showToast('Перенаправляємо на Google...', 'info');
      await signInWithRedirect(auth, provider);
    } else if (error.code !== 'auth/cancelled-popup-request') {
      showToast('Помилка входу: ' + error.message, 'error');
    }
  } finally {
    btn && (btn.disabled = false);
    btnTop && (btnTop.disabled = false);
  }
}

async function logoutGoogle() {
  try {
    if (unsubEvents) { unsubEvents(); unsubEvents = null; }
    if (unsubMembers) { unsubMembers(); unsubMembers = null; }
    if (unsubPet) { unsubPet(); unsubPet = null; }
    await signOut(auth);
    currentUser = null; workspaceId = null; workspaceData = null; currentPet = null; eventsState = [];
    showToast('Вихід виконано', 'success');
  } catch (error) {
    showToast('Помилка виходу: ' + error.message, 'error');
  }
}

async function bootAuth() {
  try { await getRedirectResult(auth); } catch (error) { console.warn('Redirect result error:', error); }

  onAuthStateChanged(auth, async user => {
    currentUser = user || null;
    updateAuthUI(!!currentUser);

    if (!currentUser) {
      workspaceId = null; workspaceData = null; currentPet = null; eventsState = [];
      $('appLoader').classList.add('hidden');
      return;
    }

    try {
      await ensureWorkspaceForUser(currentUser);
      subscribePet();
      subscribeMembers();
      subscribeEvents();
      renderAll();
    } catch (error) {
      console.error('Boot error:', error);
      showToast('Помилка завантаження: ' + error.message, 'error');
    }
    $('appLoader').classList.add('hidden');
  });
}

/* ─── Event Bindings ─── */
function bindEvents() {
  // Tabs
  $$('[data-tab]').forEach(btn => btn.addEventListener('click', () => setActiveTab(btn.dataset.tab)));

  // Theme toggle
  $$('[data-theme-toggle]').forEach(el => el.addEventListener('click', () => {
    const root = document.documentElement;
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  }));

  // Restore theme
  const saved = localStorage.getItem('theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);

  // Auth buttons
  $('googleLoginBtn').addEventListener('click', loginGoogle);
  $('googleLoginBtnTop').addEventListener('click', loginGoogle);
  $('logoutBtn').addEventListener('click', logoutGoogle);

  // Event form
  $('eventTime').value = nowTime();
  $('eventForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await addEvent({
        eventType: $('eventType').value,
        byName: $('eventBy').value.trim(),
        timeLabel: $('eventTime').value || nowTime(),
        trigger: $('eventTrigger').value,
        note: $('eventNote').value.trim()
      });
      e.target.reset();
      $('eventTime').value = nowTime();
      setActiveTab('dashboard');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // Pet profile form — track dirty state
  const petForm = $('petProfileForm');
  petForm.addEventListener('input', () => { petFormDirty = true; });
  petForm.addEventListener('change', () => { petFormDirty = true; });
  petForm.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await savePetProfile({
        name: $('petName').value.trim(),
        birthDate: $('petBirthDate').value,
        sex: $('petSex').value,
        breed: $('petBreed').value.trim(),
        weight: $('petWeight').value,
        homeDate: $('petHomeDate').value,
        vaccination: $('petVaccination').value,
        toiletMode: $('petToiletMode').value,
        notes: $('petNotes').value.trim()
      });
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // Quick event buttons (mobile)
  $$('[data-quick-event]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await addEvent({
          eventType: btn.dataset.quickEvent,
          byName: currentUser?.displayName || '',
          timeLabel: nowTime(),
          trigger: '',
          note: ''
        });
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  });

  // Invite copy
  $('copyInviteBtn').addEventListener('click', async () => {
    if (!workspaceData?.inviteCode) return showToast('Код ще недоступний', 'error');
    try {
      await navigator.clipboard.writeText(workspaceData.inviteCode);
      showToast('Код скопійовано ✓', 'success');
    } catch {
      // Fallback
      const input = document.createElement('input');
      input.value = workspaceData.inviteCode;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
      showToast('Код скопійовано ✓', 'success');
    }
  });

  // Join workspace
  $('joinWorkspaceForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await joinWorkspaceByInvite($('inviteCodeInput').value);
      $('inviteCodeInput').value = '';
      showToast('Приєднано до простору ✓', 'success');
    } catch (error) {
      showToast(error.message || 'Не вдалося приєднатись', 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

/* ─── Init ─── */
renderStatic();
bindEvents();
bootAuth();

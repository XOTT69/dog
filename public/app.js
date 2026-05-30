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
  doc, getDoc, setDoc, updateDoc, addDoc, getDocs, collection, query, where, orderBy, limit, onSnapshot, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';

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

let currentUser = null;
let workspaceId = null;
let workspaceData = null;
let currentPet = null;
let currentCourseId = 'pee-pad';
let eventsState = [];
let unsubEvents = null;
let unsubMembers = null;
let unsubPet = null;

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'error' : type === 'success' ? 'success' : ''}`;
  toast.innerHTML = `<span>${type === 'error' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3500);
}

function nowTime() { return new Date().toTimeString().slice(0, 5); }
function createInviteCode() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }
function avatarText(name = 'U') { return (name.trim()[0] || 'U').toUpperCase(); }

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

function setActiveTab(id) {
  document.querySelectorAll('[data-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === id));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.toggle('active', panel.id === id));
}

function renderProfileInsights() {
  const weeks = getAgeInWeeks(currentPet?.birthDate);
  const program = getProgramByAge(weeks);
  const mode = currentPet?.toiletMode || 'pad';
  const insights = [
    {title:'Чому важливий вік', text:`Зараз етап: ${program.stage}. Саме від віку залежить, на чому краще фокусуватись щодня.`},
    {title:'Поточний побутовий режим', text: mode === 'pad' ? 'Основний сценарій — пелюшка вдома. Завдання: стабілізувати місце, тригери і швидке підкріплення.' : mode === 'mixed' ? 'Змішаний режим. Завдання: не поспішати, переводити навичку поступово.' : 'Переважно вулиця. Завдання: стежити за інтервалами, ритуалами і вчасним виходом.'},
    {title:'Навіщо вести записи', text:'Чим точніше ви відмічаєте сон, їжу, гру та туалет, тим легше застосунок підказує закономірності і дає корисні рекомендації.'}
  ];
  document.getElementById('profileInsights').innerHTML = insights.map(x => `<div class="notice"><strong>${x.title}</strong><div class="helper">${x.text}</div></div>`).join('');
}

function renderTodayPlan() {
  const weeks = getAgeInWeeks(currentPet?.birthDate);
  const program = getProgramByAge(weeks);
  const plan = program.plan.map(item => `<div class="item"><div><strong>${item}</strong><div class="meta">${program.stage}</div></div><span class="pill">сьогодні</span></div>`).join('');
  document.getElementById('todayPlan').innerHTML = plan;
  document.getElementById('ageSummaryBadge').textContent = `Вік: ${getAgeLabel(weeks)} · ${program.stage}`;
  document.getElementById('sidebarAgeStage').textContent = `${program.stage} · ${getAgeLabel(weeks)}`;
  document.getElementById('sidebarTip').textContent = program.tip;
}

function renderPriorityTips() {
  const weeks = getAgeInWeeks(currentPet?.birthDate);
  const program = getProgramByAge(weeks);
  document.getElementById('priorityTips').innerHTML = program.priorities.map((text, i) => `<div class="tip-card"><strong>${i + 1}. ${text}</strong><div class="meta">${program.tip}</div></div>`).join('');
}

function renderSocialChecklist() {
  document.getElementById('socialChecklist').innerHTML = SOCIAL_ITEMS.map(label => `
    <label class="check-row">
      <input type="checkbox" />
      <div><strong>${label}</strong><div class="meta">Знайомити спокійно, без примусу, маленькими дозами.</div></div>
    </label>
  `).join('');
}

function renderCourses() {
  document.getElementById('courseGrid').innerHTML = COURSES.map(course => `
    <button type="button" class="course-card" data-course-id="${course.id}" style="text-align:left">
      <span class="pill">${course.badge}</span>
      <strong style="margin-top:.65rem">${course.title}</strong>
      <div class="meta">${course.description}</div>
    </button>
  `).join('');

  const course = COURSES.find(c => c.id === currentCourseId) || COURSES[0];
  document.getElementById('selectedCourse').innerHTML = `
    <div class="notice" style="margin-bottom:1rem"><strong>${course.title}</strong><div class="helper">${course.description}</div></div>
    <div class="triple">
      <div class="card" style="padding:1rem"><div class="section-title"><h3>Покроково</h3></div><div class="lesson-list">${course.steps.map((x,i)=>`<div class="lesson"><strong>Крок ${i+1}</strong><div class="meta">${x}</div></div>`).join('')}</div></div>
      <div class="card" style="padding:1rem"><div class="section-title"><h3>Часті помилки</h3></div><div class="lesson-list">${course.mistakes.map(x=>`<div class="lesson"><strong>Уникайте</strong><div class="meta">${x}</div></div>`).join('')}</div></div>
      <div class="card" style="padding:1rem"><div class="section-title"><h3>Чекліст</h3></div><div class="lesson-list">${course.checklist.map(x=>`<div class="lesson"><strong>Перевірка</strong><div class="meta">${x}</div></div>`).join('')}</div></div>
    </div>
  `;

  document.querySelectorAll('[data-course-id]').forEach(btn => btn.addEventListener('click', () => {
    currentCourseId = btn.dataset.courseId;
    renderCourses();
  }));
}

function renderKnowledge() {
  document.getElementById('knowledgeGrid').innerHTML = KNOWLEDGE.map(item => `
    <div class="card">
      <div class="section-title"><h3>${item.title}</h3><span class="pill blue">${item.tag}</span></div>
      <div class="helper">${item.text}</div>
    </div>
  `).join('');
}

function renderToiletGuide() {
  document.getElementById('toiletGuide').innerHTML = TOILET_GUIDE.map(x => `<div class="lesson"><strong>${x.title}</strong><div class="meta">${x.text}</div></div>`).join('');
}

function renderEvents() {
  const list = document.getElementById('recentLogs');
  if (!eventsState.length) {
    list.innerHTML = `<div class="empty">Записів ще немає. Додайте першу подію, щоб бачити прогрес і закономірності.</div>`;
    return;
  }
  list.innerHTML = eventsState.map(item => {
    const conf = TYPE_CONFIG[item.eventType] || { icon: '📌', label: item.eventType, tone: '' };
    return `<div class="item"><div><strong>${conf.icon} ${conf.label}</strong><div class="meta">${item.timeLabel || '--:--'} · ${item.trigger || 'Без тригера'}</div>${item.note ? `<div class="meta" style="margin-top:6px;color:var(--text)">${item.note}</div>` : ''}</div><span class="pill ${conf.tone}">${item.byName || 'user'}</span></div>`;
  }).join('');
}

function renderKPIs() {
  document.getElementById('kpiPad').textContent = eventsState.filter(x => x.eventType === 'pad').length;
  document.getElementById('kpiOutdoor').textContent = eventsState.filter(x => x.eventType === 'outdoor').length;
  document.getElementById('kpiMiss').textContent = eventsState.filter(x => x.eventType === 'miss').length;
  document.getElementById('kpiTotal').textContent = eventsState.length;
}

function renderMembers(members = []) {
  const html = members.length ? members.map(member => `<div class="person"><div class="avatar">${avatarText(member.displayName || member.email || 'U')}</div><div><strong>${member.displayName || 'User'}</strong><div class="helper">${member.role || 'member'}</div></div></div>`).join('') : `<div class="empty">Немає учасників.</div>`;
  document.getElementById('membersList').innerHTML = html;
}

function fillPetForm() {
  document.getElementById('petName').value = currentPet?.name || '';
  document.getElementById('petBirthDate').value = currentPet?.birthDate || '';
  document.getElementById('petSex').value = currentPet?.sex || '';
  document.getElementById('petBreed').value = currentPet?.breed || '';
  document.getElementById('petWeight').value = currentPet?.weight || '';
  document.getElementById('petHomeDate').value = currentPet?.homeDate || '';
  document.getElementById('petVaccination').value = currentPet?.vaccination || 'не вказано';
  document.getElementById('petToiletMode').value = currentPet?.toiletMode || 'pad';
  document.getElementById('petNotes').value = currentPet?.notes || '';
}

function renderWorkspaceMeta() {
  document.getElementById('workspaceName').textContent = workspaceData?.name || '—';
  document.getElementById('inviteCodeView').textContent = workspaceData?.inviteCode || '—';
}

function renderAll() {
  fillPetForm();
  renderWorkspaceMeta();
  renderProfileInsights();
  renderTodayPlan();
  renderPriorityTips();
  renderSocialChecklist();
  renderCourses();
  renderKnowledge();
  renderToiletGuide();
  renderEvents();
  renderKPIs();
}

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
    name: 'Боня', birthDate: '', sex: '', breed: '', weight: '', homeDate: '', vaccination: 'не вказано', toiletMode: 'pad', notes: '',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
}

async function subscribePet() {
  if (!workspaceId) return;
  if (unsubPet) unsubPet();
  unsubPet = onSnapshot(doc(db, 'workspaces', workspaceId, 'dogs', 'primary'), snap => {
    currentPet = snap.exists() ? snap.data() : null;
    renderAll();
  });
}

async function subscribeMembers() {
  if (!workspaceId) return;
  if (unsubMembers) unsubMembers();
  unsubMembers = onSnapshot(query(collection(db, 'workspaces', workspaceId, 'members')), snap => {
    const members = []; snap.forEach(d => members.push(d.data())); renderMembers(members);
  });
}

async function subscribeEvents() {
  if (!workspaceId) return;
  if (unsubEvents) unsubEvents();
  unsubEvents = onSnapshot(query(collection(db, 'workspaces', workspaceId, 'events'), orderBy('createdAt', 'desc'), limit(80)), snap => {
    const rows = []; snap.forEach(d => rows.push(d.data())); eventsState = rows; renderAll();
  });
}

async function savePetProfile(payload) {
  if (!currentUser || !workspaceId) return showToast('Спочатку увійди через Google', 'error');
  await setDoc(doc(db, 'workspaces', workspaceId, 'dogs', 'primary'), {
    ...(currentPet || {}),
    ...payload,
    updatedAt: serverTimestamp()
  }, { merge: true });
  showToast('Профіль тварини збережено', 'success');
}

async function addEvent(payload) {
  if (!currentUser || !workspaceId) return showToast('Спочатку увійди через Google', 'error');
  await addDoc(collection(db, 'workspaces', workspaceId, 'events'), {
    eventType: payload.eventType,
    byUid: currentUser.uid,
    byName: payload.byName || currentUser.displayName || 'Юзер',
    trigger: payload.trigger || 'Без тригера',
    note: payload.note || '',
    timeLabel: payload.timeLabel || nowTime(),
    createdAt: serverTimestamp()
  });
  showToast('Запис додано', 'success');
}

async function joinWorkspaceByInvite(codeRaw) {
  if (!currentUser) return showToast('Увійди через Google для приєднання', 'error');
  const code = codeRaw.trim().toUpperCase();
  const snap = await getDocs(query(collection(db, 'workspaces'), where('inviteCode', '==', code), limit(1)));
  if (snap.empty) throw new Error('Код не знайдено');
  workspaceId = snap.docs[0].id;
  workspaceData = snap.docs[0].data();
  await updateDoc(doc(db, 'users', currentUser.uid), { workspaceId, role: 'member' });
  await setDoc(doc(db, 'workspaces', workspaceId, 'members', currentUser.uid), {
    uid: currentUser.uid, email: currentUser.email || '', displayName: currentUser.displayName || '', photoURL: currentUser.photoURL || '', role: 'member', createdAt: serverTimestamp()
  });
  await subscribePet();
  await subscribeMembers();
  await subscribeEvents();
  renderAll();
}

async function loginGoogle() {
  try { await signInWithPopup(auth, provider); }
  catch (error) {
    if (error.code === 'auth/popup-blocked') {
      showToast('Перенаправляємо на Google...', 'info');
      await signInWithRedirect(auth, provider);
    } else {
      showToast('Помилка входу: ' + error.message, 'error');
    }
  }
}

async function logoutGoogle() {
  try {
    if (unsubEvents) unsubEvents();
    if (unsubMembers) unsubMembers();
    if (unsubPet) unsubPet();
    await signOut(auth);
    currentUser = null; workspaceId = null; workspaceData = null; currentPet = null; eventsState = [];
    renderMembers([]); renderAll(); showToast('Вихід виконано', 'success');
  } catch (error) { showToast('Помилка виходу: ' + error.message, 'error'); }
}

async function bootAuth() {
  try { await getRedirectResult(auth); } catch (error) { console.error('Redirect Error:', error); }
  onAuthStateChanged(auth, async user => {
    currentUser = user || null;
    if (!currentUser) {
      workspaceId = null; workspaceData = null; currentPet = null; eventsState = [];
      renderMembers([]); renderAll();
      document.getElementById('googleLoginBtn').style.display = '';
      document.getElementById('logoutBtn').style.display = 'none';
      document.getElementById('appLoader').classList.add('hidden');
      return;
    }
    document.getElementById('googleLoginBtn').style.display = 'none';
    document.getElementById('logoutBtn').style.display = '';
    try {
      await ensureWorkspaceForUser(currentUser);
      await subscribePet();
      await subscribeMembers();
      await subscribeEvents();
      renderAll();
    } catch (error) {
      showToast('Помилка завантаження даних', 'error');
    }
    document.getElementById('appLoader').classList.add('hidden');
  });
}

function bindEvents() {
  document.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => setActiveTab(btn.dataset.tab)));
  document.querySelector('[data-theme-toggle]').addEventListener('click', () => {
    const root = document.documentElement;
    root.setAttribute('data-theme', root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  document.getElementById('googleLoginBtn').addEventListener('click', loginGoogle);
  document.getElementById('logoutBtn').addEventListener('click', logoutGoogle);
  document.getElementById('eventTime').value = nowTime();

  document.getElementById('eventForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await addEvent({
        eventType: document.getElementById('eventType').value,
        byName: document.getElementById('eventBy').value.trim(),
        timeLabel: document.getElementById('eventTime').value || nowTime(),
        trigger: document.getElementById('eventTrigger').value,
        note: document.getElementById('eventNote').value.trim()
      });
      e.target.reset();
      document.getElementById('eventTime').value = nowTime();
      setActiveTab('dashboard');
    } catch (error) { showToast(error.message, 'error'); }
  });

  document.getElementById('petProfileForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await savePetProfile({
        name: document.getElementById('petName').value.trim() || 'Боня',
        birthDate: document.getElementById('petBirthDate').value,
        sex: document.getElementById('petSex').value,
        breed: document.getElementById('petBreed').value.trim(),
        weight: document.getElementById('petWeight').value,
        homeDate: document.getElementById('petHomeDate').value,
        vaccination: document.getElementById('petVaccination').value,
        toiletMode: document.getElementById('petToiletMode').value,
        notes: document.getElementById('petNotes').value.trim()
      });
    } catch (error) { showToast(error.message, 'error'); }
  });

  document.getElementById('copyInviteBtn').addEventListener('click', async () => {
    if (!workspaceData?.inviteCode) return showToast('Код ще недоступний', 'error');
    await navigator.clipboard.writeText(workspaceData.inviteCode);
    showToast('Код скопійовано', 'success');
  });

  document.getElementById('joinWorkspaceForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await joinWorkspaceByInvite(document.getElementById('inviteCodeInput').value);
      document.getElementById('inviteCodeInput').value = '';
      showToast('Успішно приєднано до простору', 'success');
    } catch (error) { showToast(error.message || 'Не вдалося приєднатись', 'error'); }
  });
}

renderAll();
bindEvents();
bootAuth();

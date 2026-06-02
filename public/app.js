/* ===== Dog Coach AI v5 — 2026 Rewrite ===== */
(function() {
'use strict';

// ===== CONSTANTS =====
const MS_DAY = 86400000;
const MS_WEEK = 604800000;
const RING_CIRCUMFERENCE = 251.3;
const MAX_EVENTS_LISTEN = 300;
const MAX_FEED_ITEMS = 50;
const UNDO_TIMEOUT = 5000;
const AI_MAX_TOKENS = 400;

// ===== STORE =====
const store = {
  user: null,
  workspaceId: null,
  workspaceData: null,
  pet: null,
  currentDogId: 'primary',
  dogs: [],
  events: [],
  members: [],
  ui: {
    activeTab: 'tabHome',
    theme: localStorage.getItem('dc_theme') || 'light',
    courseId: 'pee-pad',
    courseLevel: 'all',
    diaryFilter: 'all',
    sheetCategory: 'toilet',
    sheetEventType: null,
    sheetOpen: false
  },
  streak: JSON.parse(localStorage.getItem('dc_streak') || '{"count":0,"lastDate":""}'),
  undoStack: []
};

let unsubEvents = null, unsubMembers = null, unsubPet = null;
let renderQueued = false;

// ===== FIREBASE INIT =====
try { firebase.initializeApp(window.FIREBASE_CONFIG); } catch(e) { console.warn('Firebase already init'); }
const auth = firebase.auth();
const db = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

// ===== UTILS =====
const $ = (id) => document.getElementById(id);
const $$ = (s) => [...document.querySelectorAll(s)];
const show = (el) => { if (el) el.classList.remove('hidden'); };
const hide = (el) => { if (el) el.classList.add('hidden'); };
const showLoading = () => show($('loadingOverlay'));
const hideLoading = () => hide($('loadingOverlay'));

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function nowTime() { return new Date().toTimeString().slice(0, 5); }
function todayKey() { return new Date().toISOString().slice(0, 10); }
function startOfToday() { const d = new Date(); d.setHours(0,0,0,0); return d; }
function avatarLetter(n) { return ((n || '').trim()[0] || 'П').toUpperCase(); }
function tsToDate(ts) { return ts && ts.toDate ? ts.toDate() : (ts ? new Date(ts) : null); }
function daysBetween(a, b) { return Math.floor((b - a) / MS_DAY); }

function haptic(type = 'light') {
  if (!navigator.vibrate) return;
  const patterns = { light: 6, medium: 12, heavy: 20, success: [8, 50, 8], error: [15, 30, 15, 30, 15] };
  navigator.vibrate(patterns[type] || 6);
}

function getAgeInWeeks(bd) {
  if (!bd) return null;
  const d = Date.now() - new Date(bd).getTime();
  return isNaN(d) || d < 0 ? null : Math.floor(d / MS_WEEK);
}

function weekLabel(w) {
  if (w == null) return '—';
  if (w < 8) return w + ' тиж.';
  if (w < 52) return Math.floor(w / 4.345) + ' міс.';
  const y = w / 52;
  return y < 2 ? y.toFixed(1) + ' р.' : Math.floor(y) + ' р.';
}

function getProgramByAge(w) {
  const programs = window.AGE_PROGRAMS || [];
  if (w == null) return programs[1] || programs[0] || { stage: '—', priorities: [], tip: '' };
  return programs.find(p => w >= p.minWeeks && w < p.maxWeeks) || programs[programs.length - 1] || { stage: '—', priorities: [], tip: '' };
}

function isToiletSuccess(t) { return t === 'pee_success' || t === 'poo_success'; }
function isToiletMiss(t) { return t === 'pee_miss' || t === 'poo_miss'; }

function detectPetSize() {
  const w = parseFloat(store.pet && store.pet.weight) || 0;
  const b = ((store.pet && store.pet.breed) || '').toLowerCase();
  if (w > 0) {
    if (w < 7) return 'tiny';
    if (w < 12) return 'small';
    if (w < 25) return 'medium';
    if (w < 40) return 'large';
    return 'giant';
  }
  const sizeMap = {
    tiny: ['чіхуахуа','той','йорк','мальтезе','папійон','ши-тцу','померан'],
    small: ['шпіц','мопс','такса','пекінес','бігль','корги','джек рассел'],
    medium: ['хаскі','стафорд','далматин','шарпей','самоїд'],
    large: ['лабрадор','ретрівер','вівчарка','ротвейлер','доберман','акіта'],
    giant: ['дог','мастиф','сенбернар','бернський','алабай']
  };
  for (const [size, breeds] of Object.entries(sizeMap)) {
    if (breeds.some(x => b.includes(x))) return size;
  }
  return 'medium';
}

function getSizeLabel() {
  return { tiny:'мініатюрна', small:'маленька', medium:'середня', large:'велика', giant:'гігантська' }[detectPetSize()] || 'середня';
}

function getSpayRange() {
  return { tiny:'5–7 міс', small:'6–8 міс', medium:'8–12 міс', large:'12–18 міс', giant:'18–24 міс' }[detectPetSize()] || '8–12 міс';
}
function getNeuterRange() {
  return { tiny:'6–8 міс', small:'6–9 міс', medium:'9–12 міс', large:'12–18 міс', giant:'18–24 міс' }[detectPetSize()] || '9–12 міс';
}

// ===== TOAST =====
function toast(msg, type) {
  const box = $('toastContainer');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  el.textContent = msg;
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// ===== THEME =====
function setTheme(mode) {
  store.ui.theme = mode === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', store.ui.theme);
  localStorage.setItem('dc_theme', store.ui.theme);
}

// ===== CONFETTI =====
function fireConfetti() {
  const canvas = $('confettiCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.scale(dpr, dpr);

  const colors = ['#0f766e','#14b8a6','#fbbf24','#f87171','#a78bfa','#34d399'];
  const particles = [];
  for (let i = 0; i < 80; i++) {
    particles.push({
      x: Math.random() * window.innerWidth,
      y: -20 - Math.random() * 100,
      w: 6 + Math.random() * 6,
      h: 4 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 4,
      vy: 2 + Math.random() * 4,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 10,
      opacity: 1
    });
  }

  let frame = 0;
  function animate() {
    frame++;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    let alive = false;
    for (const p of particles) {
      p.x += p.vx;
      p.vy += 0.1;
      p.y += p.vy;
      p.rotation += p.rotSpeed;
      if (frame > 40) p.opacity -= 0.015;
      if (p.opacity <= 0) continue;
      alive = true;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation * Math.PI / 180);
      ctx.globalAlpha = Math.max(0, p.opacity);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (alive && frame < 150) requestAnimationFrame(animate);
    else ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }
  animate();
}

// ===== UNDO =====
function showUndo(text, restoreFn) {
  const bar = $('undoBar');
  const textEl = $('undoText');
  const btn = $('undoBtn');
  if (!bar) return;
  textEl.textContent = text;
  show(bar);
  const timeout = setTimeout(() => { hide(bar); }, UNDO_TIMEOUT);
  const handler = () => {
    clearTimeout(timeout);
    hide(bar);
    restoreFn();
    btn.removeEventListener('click', handler);
  };
  btn.addEventListener('click', handler);
}

// ===== STREAK =====
function updateStreak() {
  const today = todayKey();
  const yesterday = new Date(Date.now() - MS_DAY).toISOString().slice(0, 10);
  const hasToday = store.events.some(e => {
    const ts = tsToDate(e.createdAt);
    return ts && ts >= startOfToday();
  });

  if (hasToday) {
    if (store.streak.lastDate === today) return;
    if (store.streak.lastDate === yesterday) {
      store.streak.count++;
    } else {
      store.streak.count = 1;
    }
    store.streak.lastDate = today;
    // Celebrate milestones
    if ([3, 7, 14, 30].includes(store.streak.count)) {
      setTimeout(fireConfetti, 300);
    }
  } else if (store.streak.lastDate !== today && store.streak.lastDate !== yesterday) {
    store.streak.count = 0;
  }
  localStorage.setItem('dc_streak', JSON.stringify(store.streak));
}

// ===== RENDER ENGINE =====
function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderActive();
  });
}

function renderActive() {
  renderHeader();
  renderStreak();

  switch (store.ui.activeTab) {
    case 'tabHome':
      renderHome();
      break;
    case 'tabDiary':
      renderDiary();
      break;
    case 'tabCourses':
      renderCourses();
      break;
    case 'tabProfile':
      renderProfile();
      break;
  }
}

// ===== HEADER =====
function renderHeader() {
  const name = (store.pet && store.pet.name && store.pet.name.trim()) || 'Песик';
  const weeks = getAgeInWeeks(store.pet && store.pet.birthDate);
  const program = getProgramByAge(weeks);

  $('petNameHeader').textContent = name;
  $('headerSub').textContent = weekLabel(weeks) + ' · ' + program.stage;

  const av = $('userAvatar');
  if (av) {
    av.innerHTML = (store.user && store.user.photoURL)
      ? '<img src="' + esc(store.user.photoURL) + '" alt="">'
      : avatarLetter((store.user && store.user.displayName) || name);
  }
}

function renderStreak() {
  updateStreak();
  const b = $('streakBadge');
  const c = $('streakCard');
  if (store.streak.count > 0) {
    if (b) { show(b); $('streakCount').textContent = store.streak.count; }
    if (c) {
      show(c);
      const days = store.streak.count;
      const word = days === 1 ? ' день' : days < 5 ? ' дні' : ' днів';
      $('streakText').textContent = days + word + ' поспіль!';
      $('streakSub').textContent = days >= 7 ? '🏆 Чудова серія!' : '💪 Продовжуйте!';
    }
  } else {
    if (b) hide(b);
    if (c) hide(c);
  }
}

// ===== HOME TAB =====
function renderHome() {
  renderDailyTip();
  renderKpis();
  renderOneTap();
  renderWeeklyReport();
  renderHeatInfo();
  renderAgeFocus();
  renderFeed('recentLogs', 'all', true);
  renderRecommendedCourses();
  generateAIPlan();
}

function renderDailyTip() {
  const el = $('dailyTipText');
  if (!el) return;
  el.classList.remove('skeleton-text');

  const DAILY_TIPS = window.DAILY_TIPS || [];
  const weeks = getAgeInWeeks(store.pet && store.pet.birthDate);
  const sex = (store.pet && store.pet.sex) || '';

  const last7 = store.events.filter(e => {
    const ts = tsToDate(e.createdAt);
    return ts && ts >= new Date(Date.now() - 7 * MS_DAY);
  });
  const s7 = last7.filter(e => isToiletSuccess(e.eventType)).length;
  const m7 = last7.filter(e => isToiletMiss(e.eventType)).length;
  const t7 = s7 + m7;
  const rate = t7 > 0 ? Math.round(s7 / t7 * 100) : null;

  const tips = [];
  if (rate !== null) {
    if (rate >= 90) tips.push('🎉 ' + rate + '% горшик за тиждень! Чудово!');
    else if (rate >= 70) tips.push('📈 Горшик ' + rate + '% — прогрес є!');
    else if (rate < 50 && t7 > 3) tips.push('🎯 Горшик ' + rate + '%. Зменшіть простір!');
  }
  if (t7 === 0 && store.events.length < 5) tips.push('📝 Почніть записувати туалет!');

  if (tips.length) {
    el.textContent = tips[0];
    return;
  }

  let pool = DAILY_TIPS.filter(t => t.condition === 'any');
  if (weeks != null && weeks < 16) pool = pool.concat(DAILY_TIPS.filter(t => t.condition === 'puppy'));
  if (weeks != null && weeks >= 24 && weeks < 72) pool = pool.concat(DAILY_TIPS.filter(t => t.condition === 'teen'));
  if (sex === 'дівчинка') pool = pool.concat(DAILY_TIPS.filter(t => t.condition === 'girl'));

  el.textContent = (pool[new Date().getDate() % pool.length] || {}).text || 'Записуйте події!';
}

function renderKpis() {
  const start = startOfToday();
  const todayEv = store.events.filter(e => {
    const ts = tsToDate(e.createdAt);
    return ts && ts.getTime() >= start.getTime();
  });
  const s = todayEv.filter(e => isToiletSuccess(e.eventType)).length;
  const m = todayEv.filter(e => isToiletMiss(e.eventType)).length;
  const t = s + m;
  const pct = t > 0 ? Math.round(s / t * 100) : 0;

  $('kpiSuccess').textContent = s;
  $('kpiMiss').textContent = m;
  $('kpiTotal').textContent = todayEv.length;
  $('ringPct').textContent = pct + '%';

  const ring = $('ringFill');
  if (ring) ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE - (RING_CIRCUMFERENCE * pct / 100));
}

function renderOneTap() {
  const grid = $('onetapGrid');
  if (!grid) return;

  const items = [
    { type: 'pee_success', icon: '💛', label: 'Пописяв ✓', cls: 'success' },
    { type: 'pee_miss', icon: '💛', label: 'Пописяв мимо', cls: 'danger' },
    { type: 'poo_success', icon: '💩', label: 'Покакав ✓', cls: 'success' },
    { type: 'poo_miss', icon: '💩', label: 'Покакав мимо', cls: 'danger' },
    { type: 'training', icon: '🎓', label: 'Тренування', cls: '' },
    { type: 'walk', icon: '🚶', label: 'Прогулянка', cls: '' }
  ];

  grid.innerHTML = items.map(i =>
    `<button type="button" class="onetap-btn ${i.cls}" data-onetap="${i.type}">
      <span class="onetap-icon">${i.icon}</span>${esc(i.label)}
    </button>`
  ).join('') + `<button type="button" class="onetap-btn" id="moreActionsBtn"><span class="onetap-icon">➕</span>Більше</button>`;

  $$('[data-onetap]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('logged')) return;
      btn.classList.add('logged');
      haptic('success');
      addEvent({ eventType: btn.dataset.onetap, timeLabel: nowTime() });
      setTimeout(() => btn.classList.remove('logged'), 2200);
    });
  });

  const mb = $('moreActionsBtn');
  if (mb) mb.addEventListener('click', openSheet);
}

function renderWeeklyReport() {
  const card = $('weeklyReport');
  const content = $('weeklyContent');
  if (!card || !content) return;

  if (store.events.length < 5 || localStorage.getItem('dc_weekly_dismissed') === todayKey()) {
    hide(card); return;
  }

  const weekAgo = new Date(Date.now() - 7 * MS_DAY);
  weekAgo.setHours(0, 0, 0, 0);
  const tw = store.events.filter(e => { const ts = tsToDate(e.createdAt);
    return ts && ts >= weekAgo;
  });

  if (tw.length < 3) { hide(card); return; }

  const tws = tw.filter(e => isToiletSuccess(e.eventType)).length;
  const twm = tw.filter(e => isToiletMiss(e.eventType)).length;
  const twt = tws + twm;
  const twR = twt > 0 ? Math.round(tws / twt * 100) : null;

  show(card);
  content.innerHTML =
    `<div class="weekly-stat"><span class="ws-label">📊 Подій</span><span class="ws-value">${tw.length}</span></div>` +
    (twR !== null ? `<div class="weekly-stat"><span class="ws-label">🚽 Горшик</span><span class="ws-value">${twR}%</span></div>` : '') +
    `<div class="weekly-stat"><span class="ws-label">🔥 Streak</span><span class="ws-value">${store.streak.count}</span></div>`;
}

function renderHeatInfo() {
  const info = $('heatInfo');
  if (!info) return;
  if (!store.pet || !store.pet.sex) {
    info.innerHTML = '<p class="text-muted">Вкажіть стать в профілі.</p>';
    return;
  }

  const weeks = getAgeInWeeks(store.pet.birthDate);
  const monthsAge = weeks != null ? Math.round(weeks / 4.345) : null;
  const HEAT_INFO = window.HEAT_INFO || { avgCycleDays: 180 };

  if (store.pet.sex === 'хлопчик') {
    info.innerHTML =
      `<div class="plan-item"><strong>✂️ Кастрація:</strong> ${getSizeLabel()} · ${getNeuterRange()}</div>` +
      (monthsAge != null ? `<div class="plan-item">📅 Зараз ${monthsAge} міс.</div>` : '') +
      `<p class="text-muted" style="font-size:0.78rem">⚠️ Рішення — з ветеринаром.</p>`;
    return;
  }

  const lastHeat = store.pet.lastHeat;
  const expFirst = { tiny: 6, small: 7, medium: 10, large: 12, giant: 16 }[detectPetSize()] || 10;
  let h = '';

  if (lastHeat) {
    const next = new Date(new Date(lastHeat).getTime() + HEAT_INFO.avgCycleDays * MS_DAY);
    const du = daysBetween(new Date(), next);
    if (du > 30) h += `<div class="plan-item">📅 Наступна ~${next.toLocaleDateString('uk')} (${du} дн.)</div>`;
    else if (du > 0) h += `<div class="plan-item" style="color:var(--warning)">⚠️ Через ~${du} днів!</div>`;
    else h += `<div class="plan-item" style="color:var(--danger)">🩸 Можливо зараз!</div>`;
  } else if (monthsAge != null) {
    const until = expFirst - monthsAge;
    if (until <= 1) h += `<div class="plan-item" style="color:var(--warning)">⚠️ Перша скоро (${monthsAge} міс)</div>`;
    else if (until <= 3) h += `<div class="plan-item">📅 Через ~${until} міс</div>`;
    else h += `<div class="plan-item">🕐 Ще далеко (~${expFirst} міс)</div>`;
  } else {
    h += '<p class="text-muted">Вкажіть дату народження.</p>';
  }

  h += `<div class="plan-item"><strong>✂️ Стерилізація:</strong> ${getSizeLabel()} · ${getSpayRange()}</div>`;
  h += '<p class="text-muted" style="font-size:0.78rem">⚠️ Не під час тічки! З ветеринаром.</p>';
  info.innerHTML = h;
}

function renderAgeFocus() {
  const box = $('periodFocus');
  if (!box) return;
  const p = getProgramByAge(getAgeInWeeks(store.pet && store.pet.birthDate));
  box.innerHTML =
    `<div class="plan-item"><strong>🎯 Пріоритети</strong>${(p.priorities || []).map(x => '<br>• ' + esc(x)).join('')}</div>` +
    `<div class="plan-item"><strong>💡</strong> ${esc(p.tip || '')}</div>`;
}

function renderRecommendedCourses() {
  const card = $('recommendedCourses');
  const list = $('recommendedList');
  if (!card || !list) return;

  const COURSES = window.COURSES || [];
  const weeks = getAgeInWeeks(store.pet && store.pet.birthDate);
  const issues = (store.pet && store.pet.issues) || '';

  let rec = [];
  if (weeks != null && weeks < 16) rec = COURSES.filter(c => c.level === 'базовий').slice(0, 3);
  else if (weeks != null && weeks < 72) rec = COURSES.filter(c => c.level === 'середній').slice(0, 3);
  else rec = COURSES.filter(c => c.level === 'просунутий').slice(0, 3);

  if (issues.includes('кусає') || issues.includes('кусається')) {
    const bc = COURSES.find(c => c.id === 'bite-control');
    if (bc) rec.unshift(bc);
  }
  if (issues.includes('тягне') || issues.includes('повідок')) {
    const lw = COURSES.find(c => c.id === 'leash-walking');
    if (lw) rec.unshift(lw);
  }
  if (issues.includes('гавка')) {
    const re = COURSES.find(c => c.id === 'reactivity');
    if (re) rec.unshift(re);
  }

  if (!rec.length) rec = COURSES.slice(0, 3);

  const seen = {};
  rec = rec.filter(c => { if (seen[c.id]) return false; seen[c.id] = true; return true; }).slice(0, 4);

  list.innerHTML = rec.map(c =>
    `<button type="button" class="course-btn" data-rec-course="${esc(c.id)}">
      <span class="c-badge">${esc(c.badge)}</span>
      <strong>${esc(c.title)}</strong>
    </button>`
  ).join('');

  $$('[data-rec-course]').forEach(btn => {
    btn.addEventListener('click', () => {
      store.ui.courseId = btn.dataset.recCourse;
      setActiveTab('tabCourses');
      renderCourses();
      haptic();
    });
  });
}

// ===== DIARY TAB =====
function renderDiary() {
  renderDiarySummary();
  renderFeed('recentLogsDiary', store.ui.diaryFilter, false);
  renderWeight();
  renderPhotoGallery();
  requestAnimationFrame(() => renderChart('progressChartDiary'));
}

function renderDiarySummary() {
  const el = $('diarySummary');
  if (!el) return;

  const last7 = store.events.filter(e => {
    const ts = tsToDate(e.createdAt);
    return ts && ts >= new Date(Date.now() - 7 * MS_DAY);
  });

  if (!last7.length) {
    el.innerHTML = '<p class="text-muted" style="text-align:center;padding:0.5rem">Поки немає даних за тиждень</p>';
    return;
  }

  const s = last7.filter(e => isToiletSuccess(e.eventType)).length;
  const m = last7.filter(e => isToiletMiss(e.eventType)).length;
  const t = s + m;
  const rate = t > 0 ? Math.round(s / t * 100) : null;
  const tr = last7.filter(e => e.eventType === 'training').length;
  const wk = last7.filter(e => e.eventType === 'walk').length;

  el.innerHTML =
    `<h4 class="card-title">📊 За 7 днів</h4>
    <div class="weekly-stat"><span class="ws-label">Подій</span><span class="ws-value">${last7.length}</span></div>` +
    (rate !== null ? `<div class="weekly-stat"><span class="ws-label">🚽 Горшик</span><span class="ws-value">${rate}%</span></div>` : '') +
    `<div class="weekly-stat"><span class="ws-label">🎓 Тренувань</span><span class="ws-value">${tr}</span></div>
    <div class="weekly-stat"><span class="ws-label">🚶 Прогулянок</span><span class="ws-value">${wk}</span></div>`;
}

function renderWeight() {
  const c = $('weightHistory');
  if (!c) return;
  const we = store.events.filter(e => e.eventType === 'weight' && e.value).slice(0, 10).reverse();
  if (!we.length) {
    c.innerHTML = '<p class="text-muted">+ → Здоров\'я → ⚖️</p>';
    return;
  }
  const latest = we[we.length - 1];
  c.innerHTML =
    `<div class="plan-item"><strong>⚖️ ${esc(String(latest.value))} кг</strong></div>` +
    we.slice().reverse().slice(0, 3).map(e => {
      const d = tsToDate(e.createdAt);
      return `<div style="display:flex;justify-content:space-between;padding:0.25rem 0;font-size:0.8rem;color:var(--text-secondary)">
        <span>${d ? d.toLocaleDateString('uk') : ''}</span><strong>${esc(String(e.value))}</strong>
      </div>`;
    }).join('');
}

function renderPhotoGallery() {
  const gallery = $('photoGallery');
  if (!gallery) return;

  const photos = store.events.filter(e => e.eventType === 'photo' && e.photoURL).slice(0, 12);
  if (!photos.length) {
    gallery.innerHTML = '<div class="photo-empty">📷 Додайте перше фото</div>';
    return;
  }

  gallery.innerHTML = photos.map(p =>
    `<div class="photo-thumb"><img src="${esc(p.photoURL)}" alt="Фото" loading="lazy"></div>`
  ).join('');
}

function renderChart(canvasId) {
  const canvas = $(canvasId);
  if (!canvas || !canvas.getContext) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const isDark = store.ui.theme === 'dark';
  const accent = isDark ? '#2dd4bf' : '#0f766e';
  const danger = isDark ? '#f87171' : '#dc2626';
  const warning = isDark ? '#fbbf24' : '#d97706';
  const muted = isDark ? '#78716c' : '#a8a29e';
  const border = isDark ? '#292524' : '#e7e5e4';

  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    const dayEv = store.events.filter(e => {
      const ts = tsToDate(e.createdAt);
      return ts && ts >= d && ts < next;
    });
    const s = dayEv.filter(e => isToiletSuccess(e.eventType)).length;
    const m = dayEv.filter(e => isToiletMiss(e.eventType)).length;
    const t = s + m;
    days.push({ date: d, pct: t ? Math.round(s / t * 100) : null });
  }

  const p = { top: 12, right: 6, bottom: 22, left: 6 };
  const cw = w - p.left - p.right, ch = h - p.top - p.bottom;
  const bw = cw / days.length;

  // Grid lines
  ctx.strokeStyle = border;
  ctx.lineWidth = 0.5;
  [0, 50, 100].forEach(v => {
    const y = p.top + ch - (v / 100) * ch;
    ctx.beginPath(); ctx.moveTo(p.left, y); ctx.lineTo(w - p.right, y); ctx.stroke();
  });

  // Bars
  days.forEach((day, i) => {
    const x = p.left + i * bw + bw * 0.15;
    const barW = bw * 0.7;

    if (day.pct == null) {
      ctx.fillStyle = muted;
      ctx.beginPath();
      ctx.arc(x + barW / 2, p.top + ch - 3, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const barH = Math.max(4, (day.pct / 100) * ch);
      const y2 = p.top + ch - barH;
      ctx.fillStyle = day.pct >= 70 ? accent : day.pct >= 40 ? warning : danger;

      const r = Math.min(4, barW / 2);
      ctx.beginPath();
      ctx.moveTo(x, y2 + barH);
      ctx.lineTo(x, y2 + r);
      ctx.quadraticCurveTo(x, y2, x + r, y2);
      ctx.lineTo(x + barW - r, y2);
      ctx.quadraticCurveTo(x + barW, y2, x + barW, y2 + r);
      ctx.lineTo(x + barW, y2 + barH);
      ctx.closePath();
      ctx.fill();
    }

    if (i % 3 === 0 || i === days.length - 1) {
      ctx.fillStyle = muted;
      ctx.font = '10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(day.date.getDate() + '/' + (day.date.getMonth() + 1), x + barW / 2, h - 4);
    }
  });
}

// ===== FEED =====
function renderFeed(targetId, filter, todayOnly) {
  const list = $(targetId);
  if (!list) return;

  const EVENT_CATEGORIES = window.EVENT_CATEGORIES || [];
  const TYPE_CONFIG = window.TYPE_CONFIG || {};

  let filtered = store.events;

  if (filter && filter !== 'all') {
    const cat = EVENT_CATEGORIES.find(c => c.id === filter);
    if (cat) {
      const types = cat.events.map(e => e.type);
      filtered = filtered.filter(e => types.includes(e.eventType));
    }
  }

  if (todayOnly) {
    const todayStart = startOfToday();
    filtered = filtered.filter(e => {
      const ts = tsToDate(e.createdAt);
      return ts && ts.getTime() >= todayStart.getTime();
    });
  }

  const maxItems = todayOnly ? 8 : MAX_FEED_ITEMS;

  if (!filtered.length) {
    list.innerHTML = `<div class="empty">${todayOnly ? 'Сьогодні поки немає записів ✨' : 'Немає записів'}</div>`;
    return;
  }

  list.innerHTML = filtered.slice(0, maxItems).map(item => {
    const conf = TYPE_CONFIG[item.eventType] || { icon: '•', label: 'Подія' };
    const d = tsToDate(item.createdAt);
    const timeStr = d
      ? (todayOnly
        ? d.toLocaleTimeString('uk', { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString('uk', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('uk', { hour: '2-digit', minute: '2-digit' }))
      : '';
    const valStr = item.value ? ' · ' + item.value + (conf.unit || '') : '';

    return `<div class="feed-item">
      <div>
        <strong>${conf.icon} ${esc(conf.label)}</strong>
        <div class="meta">${esc(timeStr)}${esc(valStr)}${item.note ? ' · ' + esc(item.note) : ''}</div>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" data-delete-event="${esc(item.id)}">✕</button>
    </div>`;
  }).join('');

  $$('#' + targetId + ' [data-delete-event]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.deleteEvent;
      const item = store.events.find(e => e.id === id);
      deleteEvent(id);
      if (item) {
        showUndo('Видалено', () => restoreEvent(item));
      }
    });
  });
}

// ===== COURSES TAB =====
function renderCourses() {
  const COURSES = window.COURSES || [];
  const KNOWLEDGE = window.KNOWLEDGE || [];
  const SOCIAL_ITEMS = window.SOCIAL_ITEMS || [];
  const TOILET_GUIDE = window.TOILET_GUIDE || [];

  renderCourseGrid(COURSES);
  renderCourseDetail(COURSES);
  renderKnowledge(KNOWLEDGE);
  renderSocial(SOCIAL_ITEMS);
  renderToiletGuide(TOILET_GUIDE);
}

function renderCourseGrid(COURSES) {
  const grid = $('courseGrid');
  if (!grid) return;

  const filtered = store.ui.courseLevel === 'all'
    ? COURSES
    : COURSES.filter(c => c.level === store.ui.courseLevel);

  grid.innerHTML = filtered.map(c =>
    `<button type="button" class="course-btn ${c.id === store.ui.courseId ? 'selected' : ''}" data-course-id="${esc(c.id)}">
      <span class="c-badge">${esc(c.badge)}</span>
      <strong>${esc(c.title)}</strong>
      <div class="c-meta">${esc(c.description)}</div>
    </button>`
  ).join('');

  $$('[data-course-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      store.ui.courseId = btn.dataset.courseId;
      renderCourseGrid(COURSES);
      renderCourseDetail(COURSES);
      haptic();
    });
  });
}

function renderCourseDetail(COURSES) {
  const viewer = $('selectedCourse');
  if (!viewer) return;

  const course = COURSES.find(c => c.id === store.ui.courseId) || COURSES[0];
  if (!course) { viewer.innerHTML = ''; return; }

  viewer.innerHTML =
    `<div class="course-detail">
      <h3>${esc(course.title)}</h3>
      <p style="color:var(--text-secondary);margin-bottom:1rem">${esc(course.description)}</p>
      <h4>📋 Кроки</h4>
      <ul>${(course.steps || []).map(s => '<li>' + esc(s) + '</li>').join('')}</ul>
      <h4>❌ Помилки</h4>
      <ul class="mistakes">${(course.mistakes || []).map(s => '<li>' + esc(s) + '</li>').join('')}</ul>
      <h4>✅ Чекліст</h4>
      <ul class="checks">${(course.checklist || []).map(s => '<li>' + esc(s) + '</li>').join('')}</ul>
    </div>`;
}

function renderKnowledge(KNOWLEDGE) {
  const g = $('knowledgeGrid');
  if (g) g.innerHTML = KNOWLEDGE.map(k =>
    `<div class="k-card"><strong>${esc(k.title)}</strong><p>${esc(k.text)}</p><span class="k-tag">${esc(k.tag)}</span></div>`
  ).join('');
}

function renderSocial(SOCIAL_ITEMS) {
  const grid = $('socialGrid');
  if (!grid) return;
  const done = JSON.parse(localStorage.getItem('dc_social') || '{}');

  grid.innerHTML = SOCIAL_ITEMS.map(group =>
    `<div class="social-group">
      <h5 class="social-group-title">${esc(group.category)}</h5>
      ${group.items.map(item => {
        const key = group.category + ':' + item;
        return `<label class="social-item">
          <input type="checkbox" data-social-key="${esc(key)}" ${done[key] ? 'checked' : ''}>
          <span>${esc(item)}</span>
        </label>`;
      }).join('')}
    </div>`
  ).join('');

  $$('[data-social-key]').forEach(cb => {
    cb.addEventListener('change', () => {
      const d = JSON.parse(localStorage.getItem('dc_social') || '{}');
      d[cb.dataset.socialKey] = cb.checked;
      localStorage.setItem('dc_social', JSON.stringify(d));
    });
  });
}

function renderToiletGuide(TOILET_GUIDE) {
  const g = $('toiletGuide');
  if (g) g.innerHTML = TOILET_GUIDE.map(s =>
    `<div class="k-card"><strong>${esc(s.title)}</strong><p>${esc(s.text)}</p></div>`
  ).join('');
}

// ===== PROFILE TAB =====
function renderProfile() {
  fillPetForm();
  renderReminders();
  renderMembers();
  renderWorkspaceMeta();
}

function fillPetForm() {
  const pet = store.pet || {};
  if ($('petName')) $('petName').value = pet.name || '';
  if ($('petBirthDate')) $('petBirthDate').value = pet.birthDate || '';
  if ($('petSex')) $('petSex').value = pet.sex || 'хлопчик';
  if ($('petBreed')) $('petBreed').value = pet.breed || '';
  if ($('petWeight')) $('petWeight').value = pet.weight || '';
  if ($('petToiletMode')) $('petToiletMode').value = pet.toiletMode || 'pad';
  if ($('petIssues')) $('petIssues').value = pet.issues || '';
  if ($('petLastVaccine')) $('petLastVaccine').value = pet.lastVaccine || '';
  if ($('petLastDeworming')) $('petLastDeworming').value = pet.lastDeworming || '';
  if ($('petLastHeat')) $('petLastHeat').value = pet.lastHeat || '';

  const hf = $('heatDateField');
  if (hf) hf.style.display = pet.sex === 'дівчинка' ? '' : 'none';

  const ps = $('pushStatus');
  if (ps) {
    if ('Notification' in window && Notification.permission === 'granted') ps.textContent = '✅ Увімкнені';
    else if ('Notification' in window && Notification.permission === 'denied') ps.textContent = '❌ Заблоковані';
    else ps.textContent = '⚪ Не налаштовано';
  }
}

function renderReminders() {
  const list = $('remindersList');
  if (!list) return;
  const rem = (store.pet && store.pet.reminders) || [];

  if (!rem.length) {
    list.innerHTML = '<p class="text-muted">Немає нагадувань</p>';
    return;
  }

  const now = new Date();
  list.innerHTML = rem.map((r, i) => {
    const d = new Date(r.nextDate);
    const days = daysBetween(now, d);
    let cls = '', txt = '';
    if (days < 0) { cls = 'danger'; txt = 'Прострочено!'; }
    else if (days === 0) { cls = 'warning'; txt = 'Сьогодні!'; }
    else if (days <= 3) { cls = 'warning'; txt = 'Через ' + days + ' дн.'; }
    else { txt = d.toLocaleDateString('uk'); }

    return `<div class="feed-item">
      <div><strong>${esc(r.label)}</strong><div class="meta ${cls}">${esc(txt)}</div></div>
      <button type="button" class="btn btn-ghost btn-sm" data-del-rem="${i}">✕</button>
    </div>`;
  }).join('');

  $$('[data-del-rem]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.delRem);
      const r2 = (store.pet.reminders || []).slice();
      r2.splice(idx, 1);
      savePetProfile({ reminders: r2 });
    });
  });
}

function renderMembers() {
  const list = $('membersList');
  if (!list) return;
  list.innerHTML = store.members.length
    ? store.members.map(m =>
      `<div class="member-chip">
        <div class="m-avatar">${m.photoURL ? '<img src="' + esc(m.photoURL) + '" alt="">' : avatarLetter(m.displayName)}</div>
        <span>${esc(m.displayName || 'Учасник')}</span>
      </div>`
    ).join('')
    : '<div class="empty">Тільки ви</div>';
}

function renderWorkspaceMeta() {
  const el = $('inviteCodeView');
  if (el) el.textContent = (store.workspaceData && store.workspaceData.inviteCode) || '—';
}

// ===== AI PLAN =====
function generateAIPlan() {
  const card = $('aiPlanCard');
  const content = $('aiPlanContent');
  if (!card || !content) return;
  if (!store.pet || !store.pet.name) { hide(card); return; }

  const cached = localStorage.getItem('dc_aiplan');
  if (cached) {
    try {
      const p = JSON.parse(cached);
      if (p.date === todayKey() && p.plan) {
        show(card); content.innerHTML = p.plan; return;
      }
    } catch(e) {}
  }

  show(card);
  content.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';

  const weeks = getAgeInWeeks(store.pet.birthDate);
  const issues = store.pet.issues || '';
  const prompt = `План на сьогодні для ${store.pet.name} (${weekLabel(weeks)}, ${store.pet.breed || '?'}, ${getSizeLabel()})` +
    (issues ? '\nПроблеми: ' + issues : '') +
    '\n4-5 пунктів. Формат: 1. [коли] — [що]';

  fetchAIResponse(prompt).then(r => {
    const html = r.split('\n').filter(l => l.trim()).map(l =>
      `<div class="ai-plan-item">${esc(l)}</div>`
    ).join('');
    content.innerHTML = html || '<p class="text-muted">🔄 Спробуйте оновити</p>';
    localStorage.setItem('dc_aiplan', JSON.stringify({ date: todayKey(), plan: html }));
  }).catch(() => {
    content.innerHTML = '<p class="text-muted">Натисніть 🔄</p>';
  });
}

// ===== AI CHAT =====
function addChatMessage(text, type) {
  const chat = $('aiChat');
  if (!chat) return;
  const msg = document.createElement('div');
  msg.className = 'ai-msg ' + type;

  if (type === 'assistant') {
    // Typewriter effect
    msg.textContent = '';
    chat.appendChild(msg);
    chat.scrollTop = chat.scrollHeight;
    typeWriter(msg, text, 0);
  } else {
    msg.textContent = text;
    chat.appendChild(msg);
    chat.scrollTop = chat.scrollHeight;
  }
}

function typeWriter(el, text, i) {
  if (i < text.length) {
    el.textContent += text[i];
    el.parentElement.scrollTop = el.parentElement.scrollHeight;
    setTimeout(() => typeWriter(el, text, i + 1), 12);
  }
}

function showTyping() {
  const chat = $('aiChat');
  if (!chat) return;
  const el = document.createElement('div');
  el.className = 'ai-msg loading';
  el.id = 'typingIndicator';
  el.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
}

function removeTyping() {
  const el = $('typingIndicator');
  if (el) el.remove();
}

function fetchAIResponse(prompt) {
  const weeks = getAgeInWeeks(store.pet && store.pet.birthDate);
  const issues = (store.pet && store.pet.issues) || '';
  const petInfo = store.pet
    ? `Собака: ${store.pet.name || '?'}, ${weekLabel(weeks)}, ${store.pet.breed || '?'}, ${getSizeLabel()}${issues ? ', проблеми: ' + issues : ''}`
    : '';

  const sys = `Ти — український кінолог з 15+ років досвіду.\n1. Відповідай ТІЛЬКИ українською.\n2. 4-5 речень, конкретні кроки.\n3. Без покарань, позитивне підкріплення.\n4. Враховуй вік та розмір собаки.\n\n${petInfo}`;

  return fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'groq/llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: AI_MAX_TOKENS,
      stream: false
    })
  }).then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(data => {
    if (data.choices && data.choices[0] && data.choices[0].message) {
      const t = data.choices[0].message.content.trim()
        .replace(/[\u4e00-\u9fff\u3040-\u30ff\uff00-\uffef]/g, '').trim();
      return t || 'Спробуйте конкретніше.';
    }
    throw new Error('Empty');
  }).catch(() => {
    return (getProgramByAge(getAgeInWeeks(store.pet && store.pet.birthDate))).tip || 'Запитайте конкретніше!';
  });
}

function handleAISubmit(prompt) {
  if (!prompt.trim()) return;
  addChatMessage(prompt, 'user');
  showTyping();
  fetchAIResponse(prompt).then(r => {
    removeTyping();
    addChatMessage(r, 'assistant');
  }).catch(() => {
    removeTyping();
    addChatMessage('Помилка з\'єднання', 'assistant');
  });
}

// ===== VOICE INPUT =====
function startVoiceInput() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    toast('Не підтримується в цьому браузері', 'error');
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.lang = 'uk-UA';
  recognition.continuous = false;
  recognition.interimResults = false;

  const btn = $('voiceInputBtn');
  if (btn) btn.classList.add('recording');

  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript;
    const input = $('aiInput');
    if (input) input.value = text;
    if (btn) btn.classList.remove('recording');
  };

  recognition.onerror = () => {
    if (btn) btn.classList.remove('recording');
    toast('Не вдалося розпізнати', 'error');
  };

  recognition.onend = () => {
    if (btn) btn.classList.remove('recording');
  };

  recognition.start();
  haptic('medium');
}

// ===== PHOTO UPLOAD =====
function handlePhotoUpload(file) {
  if (!file || !store.user || !store.workspaceId) return;
  if (file.size > 5 * 1024 * 1024) {
    toast('Фото занадто велике (макс. 5 МБ)', 'error');
    return;
  }

  showLoading();
  const storage = firebase.storage();
  const path = `workspaces/${store.workspaceId}/photos/${Date.now()}_${file.name}`;
  const ref = storage.ref(path);

  ref.put(file).then(snapshot => {
    return snapshot.ref.getDownloadURL();
  }).then(url => {
    return addEvent({ eventType: 'photo', photoURL: url, note: 'Фото' });
  }).then(() => {
    toast('Фото додано! 📸', 'success');
  }).catch(e => {
    console.error(e);
    toast('Помилка завантаження', 'error');
  }).finally(() => {
    hideLoading();
  });
}

// ===== PDF EXPORT =====
function exportPDF() {
  const pet = store.pet || {};
  const weeks = getAgeInWeeks(pet.birthDate);
  const last30 = store.events.filter(e => {
    const ts = tsToDate(e.createdAt);
    return ts && ts >= new Date(Date.now() - 30 * MS_DAY);
  });

  const TYPE_CONFIG = window.TYPE_CONFIG || {};
  const s = last30.filter(e => isToiletSuccess(e.eventType)).length;
  const m = last30.filter(e => isToiletMiss(e.eventType)).length;
  const t = s + m;
  const rate = t > 0 ? Math.round(s / t * 100) : '—';

  let content = `DOG COACH AI — ЗВІТ\n${'='.repeat(40)}\n\n`;
  content += `Собака: ${pet.name || '—'}\n`;
  content += `Вік: ${weekLabel(weeks)}\n`;
  content += `Порода: ${pet.breed || '—'}\n`;
  content += `Вага: ${pet.weight || '—'} кг\n`;
  content += `Розмір: ${getSizeLabel()}\n\n`;
  content += `--- СТАТИСТИКА (30 днів) ---\n`;
  content += `Всього подій: ${last30.length}\n`;
  content += `Горшик: ${rate}% (${s} правильно, ${m} мимо)\n`;
  content += `Тренувань: ${last30.filter(e => e.eventType === 'training').length}\n`;
  content += `Прогулянок: ${last30.filter(e => e.eventType === 'walk').length}\n\n`;
  content += `--- ЗДОРОВ'Я ---\n`;
  content += `Вакцина: ${pet.lastVaccine || '—'}\n`;
  content += `Дегельмінтизація: ${pet.lastDeworming || '—'}\n\n`;
  content += `--- ОСТАННІ ПОДІЇ ---\n`;

  last30.slice(0, 30).forEach(e => {
    const conf = TYPE_CONFIG[e.eventType] || { icon: '•', label: 'Подія' };
    const d = tsToDate(e.createdAt);
    const dateStr = d ? d.toLocaleDateString('uk') + ' ' + d.toLocaleTimeString('uk', { hour: '2-digit', minute: '2-digit' }) : '';
    content += `${dateStr} — ${conf.label}${e.note ? ' (' + e.note + ')' : ''}\n`;
  });

  content += `\n\nЗгенеровано: ${new Date().toLocaleDateString('uk')} ${new Date().toLocaleTimeString('uk')}`;

  // Download as text file (PDF requires library, this is simpler)
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dog-coach-${pet.name || 'report'}-${todayKey()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Звіт завантажено! 📄', 'success');
}

// ===== SHEET =====
function openSheet() {
  show($('eventSheet'));
  store.ui.sheetOpen = true;
  store.ui.sheetEventType = null;
  store.ui.sheetCategory = 'toilet';
  renderSheetCategories();
  renderSheetEvents();
  hide($('sheetExtraFields'));
  document.body.style.overflow = 'hidden';
}

function closeSheet() {
  hide($('eventSheet'));
  store.ui.sheetOpen = false;
  document.body.style.overflow = '';
}

function renderSheetCategories() {
  const c = $('sheetCategories');
  if (!c) return;
  const EVENT_CATEGORIES = window.EVENT_CATEGORIES || [];

  c.innerHTML = EVENT_CATEGORIES.map(cat =>
    `<button type="button" class="chip ${cat.id === store.ui.sheetCategory ? 'active' : ''}" data-sheet-cat="${esc(cat.id)}">${cat.icon} ${esc(cat.name)}</button>`
  ).join('');

  $$('[data-sheet-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      store.ui.sheetCategory = btn.dataset.sheetCat;
      store.ui.sheetEventType = null;
      renderSheetCategories();
      renderSheetEvents();
      hide($('sheetExtraFields'));
    });
  });
}

function renderSheetEvents() {
  const c = $('sheetEvents');
  if (!c) return;
  const EVENT_CATEGORIES = window.EVENT_CATEGORIES || [];
  const cat = EVENT_CATEGORIES.find(x => x.id === store.ui.sheetCategory);
  if (!cat) return;

  c.innerHTML = `<div class="actions-grid">${cat.events.map(ev =>
    `<button type="button" class="action-btn ${store.ui.sheetEventType === ev.type ? 'selected' : ''} ${ev.tone === 'success' ? 'green' : ev.tone === 'danger' ? 'red' : 'neutral'}" data-sheet-event="${esc(ev.type)}">
      <span class="action-icon">${ev.icon}</span>${esc(ev.label)}
    </button>`
  ).join('')}</div>`;

  $$('[data-sheet-event]').forEach(btn => {
    btn.addEventListener('click', () => {
      store.ui.sheetEventType = btn.dataset.sheetEvent;
      renderSheetEvents();
      show($('sheetExtraFields'));
      $('eventTime').value = nowTime();
      const TYPE_CONFIG = window.TYPE_CONFIG || {};
      const conf = TYPE_CONFIG[store.ui.sheetEventType];
      const vf = $('valueField');
      if (vf) vf.style.display = (conf && conf.hasValue) ? '' : 'none';
      haptic();
    });
  });
}

// ===== TAB SWITCHING =====
function setActiveTab(id) {
  store.ui.activeTab = id;
  $$('.tab').forEach(p => p.classList.toggle('active', p.id === id));
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  if (id === 'tabProfile') hide($('fabAddEvent'));
  else show($('fabAddEvent'));
  queueRender();
}

// ===== FIRESTORE OPERATIONS =====
function savePetProfile(payload) {
  if (!store.user || !store.workspaceId) {
    toast('Увійдіть', 'error');
    return Promise.resolve();
  }
  showLoading();
  return db.collection('workspaces').doc(store.workspaceId)
    .collection('dogs').doc(store.currentDogId)
    .set(Object.assign({}, store.pet || {}, payload, {
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }), { merge: true })
    .then(() => { toast('Збережено ✓', 'success'); haptic('success'); })
    .catch(e => { console.error(e); toast('Помилка збереження', 'error'); })
    .finally(() => hideLoading());
}

function addEvent(payload) {
  if (!store.user || !store.workspaceId) {
    toast('Увійдіть', 'error');
    return Promise.resolve();
  }

  const data = {
    eventType: payload.eventType,
    byUid: store.user.uid,
    byName: store.user.displayName || 'Я',
    note: (payload.note || '').slice(0, 500),
    timeLabel: payload.timeLabel || nowTime(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  if (payload.value) data.value = parseFloat(payload.value);
  if (payload.photoURL) data.photoURL = payload.photoURL;

  return db.collection('workspaces').doc(store.workspaceId)
    .collection('events').add(data)
    .then(() => { toast('Додано ✓', 'success'); haptic('success'); })
    .catch(e => { console.error(e); toast('Помилка', 'error'); haptic('error'); });
}

function deleteEvent(id) {
  if (!store.workspaceId || !id) return Promise.resolve();
  return db.collection('workspaces').doc(store.workspaceId)
    .collection('events').doc(id).delete()
    .catch(e => { console.error(e); toast('Помилка видалення', 'error'); });
}

function restoreEvent(item) {
  if (!store.workspaceId) return;
  const data = {
    eventType: item.eventType,
    byUid: item.byUid,
    byName: item.byName || 'Я',
    note: item.note || '',
    timeLabel: item.timeLabel || '',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  if (item.value) data.value = item.value;
  if (item.photoURL) data.photoURL = item.photoURL;

  db.collection('workspaces').doc(store.workspaceId)
    .collection('events').add(data)
    .then(() => { toast('Відновлено ✓', 'success'); })
    .catch(() => { toast('Помилка відновлення', 'error'); });
}

// ===== WORKSPACE =====
function ensureWorkspaceForUser(user) {
  return db.collection('users').doc(user.uid).get().then(udoc => {
    if (udoc.exists && udoc.data().workspaceId) {
      store.workspaceId = udoc.data().workspaceId;
      return db.collection('workspaces').doc(store.workspaceId).get().then(wdoc => {
        store.workspaceData = wdoc.exists ? wdoc.data() : null;
      });
    }

    const wsRef = db.collection('workspaces').doc();
    store.workspaceId = wsRef.id;
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    store.workspaceData = {
      name: (user.displayName || 'Мій').split(' ')[0],
      ownerId: user.uid,
      inviteCode: code
    };

    return wsRef.set(Object.assign({}, store.workspaceData, {
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    })).then(() => {
      return db.collection('users').doc(user.uid).set({
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || '',
        photoURL: user.photoURL || '',
        role: 'owner',
        workspaceId: store.workspaceId
      }, { merge: true });
    }).then(() => {
      return wsRef.collection('members').doc(user.uid).set({
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || '',
        photoURL: user.photoURL || '',
        role: 'owner',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }).then(() => {
      return wsRef.collection('dogs').doc('primary').set({
        name: '', birthDate: '', sex: 'хлопчик', breed: '',
        toiletMode: 'pad', weight: '', issues: '', reminders: [],
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
  });
}

function joinWorkspaceByInvite(code) {
  const clean = (code || '').trim().toUpperCase();
  if (!clean) return Promise.reject(new Error('Введіть код'));

  return db.collection('workspaces').where('inviteCode', '==', clean).limit(1).get()
    .then(snap => {
      if (snap.empty) throw new Error('Код не знайдено');
      store.workspaceId = snap.docs[0].id;
      store.workspaceData = snap.docs[0].data();

      return db.collection('users').doc(store.user.uid).set({
        uid: store.user.uid,
        email: store.user.email || '',
        displayName: store.user.displayName || '',
        photoURL: store.user.photoURL || '',
        role: 'member',
        workspaceId: store.workspaceId
      }, { merge: true });
    }).then(() => {
      return db.collection('workspaces').doc(store.workspaceId)
        .collection('members').doc(store.user.uid).set({
          uid: store.user.uid,
          email: store.user.email || '',
          displayName: store.user.displayName || '',
          photoURL: store.user.photoURL || '',
          role: 'member',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }).then(() => {
      subscribePet();
      subscribeMembers();
      subscribeEvents();
      queueRender();
    });
}

// ===== SUBSCRIPTIONS =====
function subscribePet() {
  if (unsubPet) unsubPet();
  unsubPet = db.collection('workspaces').doc(store.workspaceId)
    .collection('dogs').doc(store.currentDogId)
    .onSnapshot(s => {
      store.pet = s.exists ? s.data() : null;
      queueRender();
    });
}

function subscribeMembers() {
  if (unsubMembers) unsubMembers();
  unsubMembers = db.collection('workspaces').doc(store.workspaceId)
    .collection('members')
    .onSnapshot(s => {
      store.members = [];
      s.forEach(d => store.members.push(d.data()));
      if (store.ui.activeTab === 'tabProfile') renderMembers();
    });
}

function subscribeEvents() {
  if (unsubEvents) unsubEvents();
  unsubEvents = db.collection('workspaces').doc(store.workspaceId)
    .collection('events').orderBy('createdAt', 'desc').limit(MAX_EVENTS_LISTEN)
    .onSnapshot(s => {
      store.events = [];
      s.forEach(d => store.events.push(Object.assign({ id: d.id }, d.data())));
      queueRender();
    });
}

// ===== AUTH =====
function loginGoogle() {
  showLoading();
  return auth.signInWithPopup(googleProvider).catch(e => {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user') {
      return auth.signInWithRedirect(googleProvider);
    }
    toast(e.message || 'Помилка входу', 'error');
  }).finally(() => hideLoading());
}

function logout() {
  if (unsubEvents) unsubEvents();
  if (unsubMembers) unsubMembers();
  if (unsubPet) unsubPet();
  unsubEvents = unsubMembers = unsubPet = null;

  return auth.signOut().then(() => {
    store.user = null;
    store.workspaceId = null;
    store.workspaceData = null;
    store.pet = null;
    store.events = [];
    store.members = [];
    hide($('appContent'));
    show($('authScreen'));
  });
}

// ===== PUSH =====
function requestPushPermission() {
  if (!('Notification' in window)) { toast('Не підтримується', 'error'); return; }
  if (!('serviceWorker' in navigator)) { toast('SW не підтримується', 'error'); return; }

  Notification.requestPermission().then(perm => {
    if (perm === 'granted') {
      toast('Сповіщення увімкнені! 🔔', 'success');
      subscribeToPush();
    } else {
      toast('Відхилено', 'error');
    }
    fillPetForm();
  }).catch(e => toast('Помилка: ' + e.message, 'error'));
}

function subscribeToPush() {
  if (!firebase.messaging) return;
  try {
    const messaging = firebase.messaging();
    navigator.serviceWorker.ready.then(reg => {
      return messaging.getToken({
        vapidKey: 'BFvGyG-w5R68xO2RS6gQbYSyAPQaviGnVsHedxjzXajvxg1OUdL1Xe6e4M38j0mewG-Yt3qKgbUnMHmf98PaCiA',
        serviceWorkerRegistration: reg
      });
    }).then(token => {
      if (token && store.user && store.workspaceId) {
        db.collection('workspaces').doc(store.workspaceId)
          .collection('members').doc(store.user.uid)
          .update({ pushToken: token });
      }
    }).catch(e => console.warn('Push:', e.message));
  } catch(e) { console.warn('Push:', e); }
}

// ===== MULTI-DOG =====
function renderDogSwitcher() {
  const switcher = $('dogSwitcher');
  const list = $('dogSwitcherList');
  if (!switcher || !list) return;

  if (store.dogs.length <= 1) { hide(switcher); return; }
  show(switcher);

  list.innerHTML = store.dogs.map(d =>
    `<button type="button" class="dog-chip ${d.id === store.currentDogId ? 'active' : ''}" data-dog-id="${esc(d.id)}">
      🐕 ${esc(d.name || 'Собака')}
    </button>`
  ).join('');

  $$('[data-dog-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      store.currentDogId = btn.dataset.dogId;
      subscribePet();
      renderDogSwitcher();
      haptic();
    });
  });
}

function addNewDog() {
  const name = prompt('Ім\'я нової собаки:');
  if (!name || !name.trim()) return;

  const id = 'dog_' + Date.now();
  showLoading();
  db.collection('workspaces').doc(store.workspaceId)
    .collection('dogs').doc(id).set({
      name: name.trim(),
      birthDate: '', sex: 'хлопчик', breed: '',
      toiletMode: 'pad', weight: '', issues: '', reminders: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
      store.currentDogId = id;
      subscribePet();
      loadDogsList();
      toast('Собаку додано! 🐕', 'success');
    }).catch(e => {
      console.error(e); toast('Помилка', 'error');
    }).finally(() => hideLoading());
}

function loadDogsList() {
  db.collection('workspaces').doc(store.workspaceId)
    .collection('dogs').get().then(snap => {
      store.dogs = [];
      snap.forEach(d => store.dogs.push({ id: d.id, name: (d.data().name || 'Собака') }));
      renderDogSwitcher();
    });
}
  // ===== ONBOARDING =====
function showOnboarding() {
  hide($('authScreen'));
  hide($('appContent'));
  show($('onboardingScreen'));
  setOnboardingStep(1);
}

function hideOnboarding() {
  hide($('onboardingScreen'));
  show($('appContent'));
}

function setOnboardingStep(step) {
  $$('.onboarding-step').forEach(s => s.classList.add('hidden'));
  show($('onboardingStep' + step));
  $$('.ob-dot').forEach(d => d.classList.toggle('active', parseInt(d.dataset.step) === step));
}

function checkOnboarding() {
  if (localStorage.getItem('dc_onboarded')) return false;
  if (store.pet && store.pet.name && store.pet.name.trim()) {
    localStorage.setItem('dc_onboarded', 'true');
    return false;
  }
  return true;
}

function bindOnboarding() {
  const obNext1 = $('obNext1');
  const obBack2 = $('obBack2');
  const obNext2 = $('obNext2');
  const obBack3 = $('obBack3');
  const obFinish = $('obFinish');
  const obBack4 = $('obBack4');
  const obFinishFinal = $('obFinishFinal');

  if (obNext1) obNext1.addEventListener('click', () => {
    if (!$('obName').value.trim()) { toast('Введіть ім\'я!', 'error'); haptic('error'); return; }
    setOnboardingStep(2);
    haptic();
  });

  if (obBack2) obBack2.addEventListener('click', () => { setOnboardingStep(1); haptic(); });

  if (obNext2) obNext2.addEventListener('click', () => { setOnboardingStep(3); haptic(); });

  if (obBack3) obBack3.addEventListener('click', () => { setOnboardingStep(2); haptic(); });

  if (obFinish) obFinish.addEventListener('click', () => { setOnboardingStep(4); haptic(); });

  if (obBack4) obBack4.addEventListener('click', () => { setOnboardingStep(3); haptic(); });

  if (obFinishFinal) obFinishFinal.addEventListener('click', () => {
    const issues = [];
    $$('#obIssuesGrid input[type="checkbox"]:checked').forEach(cb => {
      issues.push(cb.value);
    });

    showLoading();
    savePetProfile({
      name: $('obName').value.trim(),
      birthDate: $('obBirthDate').value,
      sex: $('obSex').value,
      breed: $('obBreed').value.trim(),
      issues: issues.join(', ')
    }).then(() => {
      localStorage.setItem('dc_onboarded', 'true');
      hideOnboarding();
      toast('Готово! Ласкаво просимо! 🎉', 'success');
      fireConfetti();
      queueRender();
    }).finally(() => hideLoading());
  });
}

// ===== HEADER SCROLL EFFECT =====
function initHeaderScroll() {
  const header = $('mainHeader');
  if (!header) return;

  let lastScroll = 0;
  const mainContent = $('mainContent');
  if (!mainContent) return;

  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    if (scrollY > 10) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
    lastScroll = scrollY;
  }, { passive: true });
}

// ===== PULL TO REFRESH =====
function initPullToRefresh() {
  let startY = 0;
  let pulling = false;
  const threshold = 80;
  const main = $('mainContent');
  if (!main) return;

  main.addEventListener('touchstart', (e) => {
    if (window.scrollY === 0) {
      startY = e.touches[0].clientY;
      pulling = true;
    }
  }, { passive: true });

  main.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 10 && dy < threshold * 1.5) {
      main.style.transform = `translateY(${Math.min(dy * 0.4, 40)}px)`;
      main.style.transition = 'none';
    }
  }, { passive: true });

  main.addEventListener('touchend', (e) => {
    if (!pulling) return;
    pulling = false;
    main.style.transition = 'transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)';
    main.style.transform = '';

    const dy = e.changedTouches[0].clientY - startY;
    if (dy > threshold && window.scrollY === 0) {
      haptic('medium');
      queueRender();
      toast('Оновлено ✓', 'success');
    }
  }, { passive: true });
}

// ===== SWIPE BETWEEN TABS =====
function initSwipeNavigation() {
  const main = $('mainContent');
  if (!main) return;

  const tabs = ['tabHome', 'tabDiary', 'tabCourses', 'tabProfile'];
  let touchStartX = 0;
  let touchStartY = 0;
  let swiping = false;

  main.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    swiping = true;
  }, { passive: true });

  main.addEventListener('touchend', (e) => {
    if (!swiping) return;
    swiping = false;

    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;

    // Only horizontal swipes (not vertical scrolling)
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.7) return;

    const currentIdx = tabs.indexOf(store.ui.activeTab);
    if (dx < -60 && currentIdx < tabs.length - 1) {
      // Swipe left -> next tab
      setActiveTab(tabs[currentIdx + 1]);
      haptic();
    } else if (dx > 60 && currentIdx > 0) {
      // Swipe right -> previous tab
      setActiveTab(tabs[currentIdx - 1]);
      haptic();
    }
  }, { passive: true });
}

// ===== EVENT BINDINGS =====
function bindEvents() {
  setTheme(store.ui.theme);

  // Theme toggle
  $$('[data-theme-toggle]').forEach(b => {
    b.addEventListener('click', () => {
      setTheme(store.ui.theme === 'dark' ? 'light' : 'dark');
      haptic();
    });
  });

  // Auth
  const loginBtn = $('googleLoginBtn');
  if (loginBtn) loginBtn.addEventListener('click', loginGoogle);

  const logoutBtn = $('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', () => {
    if (confirm('Вийти з акаунту?')) logout();
  });

  // Navigation
  $$('.nav-item').forEach(b => {
    b.addEventListener('click', () => {
      setActiveTab(b.dataset.tab);
      haptic();
    });
  });

  // FAB
  const fab = $('fabAddEvent');
  if (fab) fab.addEventListener('click', openSheet);

  // Sheet
  const backdrop = $('sheetBackdrop');
  if (backdrop) backdrop.addEventListener('click', closeSheet);

  // Sheet drag to close
  const sheetContent = $('sheetContentEl');
  if (sheetContent) {
    let sheetStartY = 0;
    sheetContent.addEventListener('touchstart', (e) => {
      sheetStartY = e.touches[0].clientY;
    }, { passive: true });

    sheetContent.addEventListener('touchend', (e) => {
      const dy = e.changedTouches[0].clientY - sheetStartY;
      if (dy > 100) closeSheet();
    }, { passive: true });
  }

  // Save Event
  const saveEventBtn = $('saveEventBtn');
  if (saveEventBtn) saveEventBtn.addEventListener('click', () => {
    if (!store.ui.sheetEventType) { toast('Оберіть тип', 'error'); haptic('error'); return; }
    const payload = {
      eventType: store.ui.sheetEventType,
      timeLabel: ($('eventTime') && $('eventTime').value) || nowTime(),
      note: ($('eventNote') && $('eventNote').value && $('eventNote').value.trim()) || ''
    };
    const val = $('eventValue') && $('eventValue').value;
    if (val) payload.value = parseFloat(val);

    addEvent(payload).then(() => {
      if ($('eventNote')) $('eventNote').value = '';
      if ($('eventValue')) $('eventValue').value = '';
      closeSheet();
    });
  });

  // Pet profile form
  const petForm = $('petProfileForm');
  if (petForm) petForm.addEventListener('submit', (e) => {
    e.preventDefault();
    savePetProfile({
      name: $('petName').value.trim(),
      birthDate: $('petBirthDate').value,
      sex: $('petSex').value,
      breed: $('petBreed').value.trim(),
      weight: $('petWeight').value,
      toiletMode: $('petToiletMode').value,
      issues: ($('petIssues') && $('petIssues').value) ? $('petIssues').value.trim() : ''
    });
  });

  // Health save
  const saveHealthBtn = $('saveHealthBtn');
  if (saveHealthBtn) saveHealthBtn.addEventListener('click', () => {
    savePetProfile({
      lastVaccine: $('petLastVaccine').value,
      lastDeworming: $('petLastDeworming').value,
      lastHeat: ($('petLastHeat') && $('petLastHeat').value) || ''
    });
  });

  // Sex change -> show/hide heat field
  const petSex = $('petSex');
  if (petSex) petSex.addEventListener('change', () => {
    const f = $('heatDateField');
    if (f) f.style.display = petSex.value === 'дівчинка' ? '' : 'none';
  });

  // Reminders
  const addReminderBtn = $('addReminderBtn');
  if (addReminderBtn) addReminderBtn.addEventListener('click', () => {
    const typeEl = $('reminderType');
    const dateEl = $('reminderDate');
    const type = typeEl ? typeEl.value : '';
    const date = dateEl ? dateEl.value : '';

    if (!type || !date) { toast('Вкажіть тип і дату!', 'error'); haptic('error'); return; }

    const reminders = (store.pet && store.pet.reminders) ? store.pet.reminders.slice() : [];
    reminders.push({ label: type, nextDate: date });
    savePetProfile({ reminders }).then(() => {
      if (dateEl) dateEl.value = '';
      toast('Нагадування додано ✓', 'success');
    });
  });

  // Diary filters
  $$('#diaryFilters .chip').forEach(btn => {
    btn.addEventListener('click', () => {
      store.ui.diaryFilter = btn.dataset.filter;
      $$('#diaryFilters .chip').forEach(b => b.classList.toggle('active', b === btn));
      renderFeed('recentLogsDiary', store.ui.diaryFilter, false);
      haptic();
    });
  });

  // Course filters
  $$('#courseFilters [data-course-level]').forEach(btn => {
    btn.addEventListener('click', () => {
      store.ui.courseLevel = btn.dataset.courseLevel;
      $$('#courseFilters [data-course-level]').forEach(b => b.classList.toggle('active', b === btn));
      renderCourses();
      haptic();
    });
  });

  // Invite code copy
  const copyInviteBtn = $('copyInviteBtn');
  if (copyInviteBtn) copyInviteBtn.addEventListener('click', () => {
    if (!store.workspaceData || !store.workspaceData.inviteCode) return;
    navigator.clipboard.writeText(store.workspaceData.inviteCode)
      .then(() => { toast('Скопійовано ✓', 'success'); haptic('success'); })
      .catch(() => toast('Помилка', 'error'));
  });

  // Join workspace
  const joinForm = $('joinWorkspaceForm');
  if (joinForm) joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    joinWorkspaceByInvite($('inviteCodeInput').value)
      .then(() => {
        $('inviteCodeInput').value = '';
        toast('Приєдналися! 🎉', 'success');
        haptic('success');
      })
      .catch(err => { toast(err.message, 'error'); haptic('error'); });
  });

  // AI form
  const aiForm = $('aiForm');
  if (aiForm) aiForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('aiInput');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';
    input.style.height = 'auto';
    handleAISubmit(msg);
  });

  // AI prompts
  $$('[data-ai-prompt]').forEach(b => {
    b.addEventListener('click', () => {
      handleAISubmit(b.dataset.aiPrompt);
      haptic();
    });
  });

  // Clear chat
  const clearChatBtn = $('clearChatBtn');
  if (clearChatBtn) clearChatBtn.addEventListener('click', () => {
    const c = $('aiChat');
    if (c) c.innerHTML = '';
  });

  // AI input auto-resize
  const aiInput = $('aiInput');
  if (aiInput) {
    aiInput.addEventListener('input', () => {
      aiInput.style.height = 'auto';
      aiInput.style.height = Math.min(aiInput.scrollHeight, 100) + 'px';
    });
    aiInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        aiForm.dispatchEvent(new Event('submit'));
      }
    });
  }

  // Voice input
  const voiceBtn = $('voiceInputBtn');
  if (voiceBtn) voiceBtn.addEventListener('click', startVoiceInput);

  // Photo upload
  const addPhotoBtn = $('addPhotoBtn');
  const photoInput = $('photoInput');
  if (addPhotoBtn && photoInput) {
    addPhotoBtn.addEventListener('click', () => photoInput.click());
    photoInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handlePhotoUpload(file);
      photoInput.value = '';
    });
  }

  // PDF export
  const exportBtn = $('exportPdfBtn');
  if (exportBtn) exportBtn.addEventListener('click', exportPDF);

  // Weekly report close
  const closeWeeklyBtn = $('closeWeeklyBtn');
  if (closeWeeklyBtn) closeWeeklyBtn.addEventListener('click', () => {
    hide($('weeklyReport'));
    localStorage.setItem('dc_weekly_dismissed', todayKey());
  });

  // AI plan refresh
  const refreshPlanBtn = $('refreshPlanBtn');
  if (refreshPlanBtn) refreshPlanBtn.addEventListener('click', () => {
    localStorage.removeItem('dc_aiplan');
    generateAIPlan();
    haptic();
  });

  // Push notifications
  const enablePushBtn = $('enablePushBtn');
  if (enablePushBtn) enablePushBtn.addEventListener('click', requestPushPermission);

  // Dog switcher
  const switchDogBtn = $('switchDogBtn');
  if (switchDogBtn) switchDogBtn.addEventListener('click', () => {
    const switcher = $('dogSwitcher');
    if (switcher) switcher.classList.toggle('hidden');
    haptic();
  });

  const addDogBtn = $('addDogBtn');
  if (addDogBtn) addDogBtn.addEventListener('click', addNewDog);

  // Keyboard escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && store.ui.sheetOpen) closeSheet();
  });

  // Resize handler for chart
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (store.ui.activeTab === 'tabDiary') renderChart('progressChartDiary');
    }, 250);
  });

  // Init gesture features
  initHeaderScroll();
  initPullToRefresh();
  initSwipeNavigation();

  // Bind onboarding
  bindOnboarding();
}

// ===== BOOT =====
function bootAuth() {
  auth.onAuthStateChanged((user) => {
    store.user = user || null;

    if (!store.user) {
      show($('authScreen'));
      hide($('appContent'));
      hide($('onboardingScreen'));
      hideLoading();
      return;
    }

    hide($('authScreen'));
    showLoading();

    ensureWorkspaceForUser(store.user).then(() => {
      subscribePet();
      subscribeMembers();
      subscribeEvents();
      loadDogsList();

      // Wait for first pet snapshot
      return new Promise((resolve) => {
        const unsub = db.collection('workspaces').doc(store.workspaceId)
          .collection('dogs').doc(store.currentDogId)
          .onSnapshot(s => {
            store.pet = s.exists ? s.data() : null;
            unsub();
            resolve();
          });
      });
    }).then(() => {
      if (checkOnboarding()) {
        hideLoading();
        showOnboarding();
      } else {
        show($('appContent'));
        hideLoading();
        queueRender();
      }

      if ('Notification' in window && Notification.permission === 'granted') {
        subscribeToPush();
      }
    }).catch(e => {
      console.error('Boot error:', e);
      toast('Помилка завантаження', 'error');
      hideLoading();
    });
  });
}

// ===== INIT =====
bindEvents();
bootAuth();
auth.getRedirectResult().catch(() => {});

})();

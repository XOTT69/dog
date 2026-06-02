/* ===== Dog Coach AI v4.1 ===== */
(function () {
  'use strict';

  const AGE_PROGRAMS = window.AGE_PROGRAMS;
  const COURSES = window.COURSES;
  const KNOWLEDGE = window.KNOWLEDGE;
  const SOCIAL_ITEMS = window.SOCIAL_ITEMS;
  const TOILET_GUIDE = window.TOILET_GUIDE;
  const TYPE_CONFIG = window.TYPE_CONFIG;
  const EVENT_CATEGORIES = window.EVENT_CATEGORIES;
  const DAILY_TIPS = window.DAILY_TIPS;
  const HEAT_INFO = window.HEAT_INFO;

  const firebaseConfig = window.FIREBASE_CONFIG;
  try { firebase.initializeApp(firebaseConfig); } catch (e) { console.error('FB:', e); }
  const auth = firebase.auth();
  const db = firebase.firestore();
  const googleProvider = new firebase.auth.GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: 'select_account' });
  db.enablePersistence({ synchronizeTabs: true }).catch(function() {});

  // ===== STATE =====
  let currentUser = null;
  let workspaceId = null;
  let workspaceData = null;
  let currentPet = null;
  let eventsState = [];
  let membersState = [];
  let currentCourseId = 'pee-pad';
  let currentCourseLevel = 'all';
  let currentDiaryFilter = 'all';
  let selectedEventType = null;
  let selectedSheetCategory = 'toilet';
  let unsubEvents = null;
  let unsubMembers = null;
  let unsubPet = null;
  let themeMode = localStorage.getItem('dc_theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  let dailyDone = JSON.parse(localStorage.getItem('dc_daily') || '{}');
  let streakData = JSON.parse(localStorage.getItem('dc_streak') || '{"count":0,"lastDate":""}');
  let renderQueued = false;
  let activeTab = 'tabHome';
  let timerInterval = null;
  let timerSeconds = 0;
  let timerTotal = 0;
  let timerRunning = false;
  let achievementsState = JSON.parse(localStorage.getItem('dc_achievements') || '{}');
  let audioCtx = null;

  // ===== HELPERS =====
  var $ = function(id) { return document.getElementById(id); };
  var $$ = function(sel) { return Array.from(document.querySelectorAll(sel)); };
  var show = function(el) { if (el) el.classList.remove('hidden'); };
  var hide = function(el) { if (el) el.classList.add('hidden'); };
  var showLoading = function() { show($('loadingOverlay')); };
  var hideLoading = function() { hide($('loadingOverlay')); };

  var nowTime = function() { return new Date().toTimeString().slice(0, 5); };
  var todayKey = function() { return new Date().toISOString().slice(0, 10); };
  var startOfToday = function() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  var avatarLetter = function(name) { return ((name || '').trim()[0] || 'П').toUpperCase(); };
  var tsToDate = function(ts) { return ts && ts.toDate ? ts.toDate() : (ts ? new Date(ts) : null); };
  var haptic = function() { if (navigator.vibrate) navigator.vibrate(10); };
  var daysBetween = function(d1, d2) { return Math.floor((d2 - d1) / 86400000); };

  function getAgeInWeeks(bd) {
    if (!bd) return null;
    var diff = Date.now() - new Date(bd).getTime();
    return isNaN(diff) || diff < 0 ? null : Math.floor(diff / 604800000);
  }

  function weekLabel(weeks) {
    if (weeks == null) return '—';
    if (weeks < 8) return weeks + ' тиж.';
    if (weeks < 52) return Math.floor(weeks / 4.345) + ' міс.';
    var y = weeks / 52;
    return y < 2 ? y.toFixed(1) + ' р.' : Math.floor(y) + ' р.';
  }

  function getProgramByAge(weeks) {
    if (weeks == null) return AGE_PROGRAMS[1] || AGE_PROGRAMS[0];
    return AGE_PROGRAMS.find(function(p) { return weeks >= p.minWeeks && weeks < p.maxWeeks; }) || AGE_PROGRAMS[AGE_PROGRAMS.length - 1];
  }

  function isToiletSuccess(type) { return type === 'pee_success' || type === 'poo_success'; }
  function isToiletMiss(type) { return type === 'pee_miss' || type === 'poo_miss'; }

  function detectPetSize() {
    var weight = parseFloat(currentPet && currentPet.weight) || 0;
    var breed = ((currentPet && currentPet.breed) || '').toLowerCase().trim();
    if (weight > 0) {
      if (weight < 7) return 'tiny';
      if (weight < 12) return 'small';
      if (weight < 25) return 'medium';
      if (weight < 40) return 'large';
      return 'giant';
    }
    var tinyB = ['чіхуахуа','той-тер','той тер','йорк','йоркшир','мальтезе','мальтійськ','папійон','ши-тцу','ши тцу','шитцу','померан'];
    var smallB = ['шпіц','мопс','такса','пекінес','французький бульдог','кокер','бігль','бішон','карликов','цвергшнауцер','джек рассел','корги','шелті'];
    var medB = ['бордер колі','стафорд','пітбуль','шарпей','далматин','хаскі','самоїд','спанієль','пойнтер','сеттер'];
    var largeB = ['лабрадор','ретрівер','вівчарка','ротвейлер','доберман','боксер','рідж','курцхаар','малінуа','акіта','кане корсо','кане-корсо'];
    var giantB = ['дог','мастиф','сенбернар','ньюфаундленд','бернський','леонбергер','алабай','кавказ'];
    if (tinyB.some(function(b) { return breed.includes(b); })) return 'tiny';
    if (smallB.some(function(b) { return breed.includes(b); })) return 'small';
    if (medB.some(function(b) { return breed.includes(b); })) return 'medium';
    if (largeB.some(function(b) { return breed.includes(b); })) return 'large';
    if (giantB.some(function(b) { return breed.includes(b); })) return 'giant';
    return 'medium';
  }

  function getSizeLabel() {
    var labels = { tiny: 'мініатюрна (до 7 кг)', small: 'маленька (7–12 кг)', medium: 'середня (12–25 кг)', large: 'велика (25–40 кг)', giant: 'гігантська (40+ кг)' };
    return labels[detectPetSize()] || 'середня';
  }

  function getSpayAgeRange() {
    var m = { tiny: {min:5,max:7,label:'5–7 міс'}, small: {min:6,max:8,label:'6–8 міс'}, medium: {min:8,max:12,label:'8–12 міс'}, large: {min:12,max:18,label:'12–18 міс'}, giant: {min:18,max:24,label:'18–24 міс'} };
    return m[detectPetSize()] || m.medium;
  }

  function getNeuterAgeRange() {
    var m = { tiny: {min:6,max:8,label:'6–8 міс'}, small: {min:6,max:9,label:'6–9 міс'}, medium: {min:9,max:12,label:'9–12 міс'}, large: {min:12,max:18,label:'12–18 міс'}, giant: {min:18,max:24,label:'18–24 міс'} };
    return m[detectPetSize()] || m.medium;
  }

  // ===== AUDIO — CLICKER & WHISTLE =====
  function getAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playClicker() {
    try {
      var ctx = getAudioContext();
      var now = ctx.currentTime;

      // Click sound — sharp metallic click
      var osc1 = ctx.createOscillator();
      var gain1 = ctx.createGain();
      osc1.type = 'square';
      osc1.frequency.setValueAtTime(2500, now);
      osc1.frequency.exponentialRampToValueAtTime(1800, now + 0.01);
      gain1.gain.setValueAtTime(0.8, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.04);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.05);

      // Second click (double-click feel)
      var osc2 = ctx.createOscillator();
      var gain2 = ctx.createGain();
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(2200, now + 0.06);
      osc2.frequency.exponentialRampToValueAtTime(1600, now + 0.07);
      gain2.gain.setValueAtTime(0.6, now + 0.06);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.06);
      osc2.stop(now + 0.12);

      if (navigator.vibrate) navigator.vibrate(15);
    } catch (e) { console.warn('Audio:', e); }
  }

  function playWhistle() {
    try {
      var ctx = getAudioContext();
      var now = ctx.currentTime;
      var duration = 0.6;

      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      // Whistle — ascending pitch
      osc.frequency.setValueAtTime(1800, now);
      osc.frequency.linearRampToValueAtTime(2800, now + duration * 0.3);
      osc.frequency.setValueAtTime(2800, now + duration * 0.3);
      osc.frequency.linearRampToValueAtTime(2400, now + duration);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.5, now + 0.02);
      gain.gain.setValueAtTime(0.5, now + duration - 0.1);
      gain.gain.linearRampToValueAtTime(0, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration);

      if (navigator.vibrate) navigator.vibrate([30, 20, 30]);
    } catch (e) { console.warn('Audio:', e); }
  }

  // ===== TOAST =====
  function toast(msg, type, undoCallback) {
    var box = $('toastContainer'); if (!box) return;
    var el = document.createElement('div');
    el.className = 'toast ' + (type || '') + (undoCallback ? ' undo' : '');
    if (undoCallback) {
      el.innerHTML = '<span>' + msg + '</span><button class="undo-btn" type="button">Скасувати</button>';
      el.querySelector('.undo-btn').addEventListener('click', function() {
        undoCallback();
        el.classList.remove('show');
        setTimeout(function() { el.remove(); }, 300);
      });
    } else {
      el.textContent = msg;
    }
    box.appendChild(el);
    requestAnimationFrame(function() { el.classList.add('show'); });
    setTimeout(function() { el.classList.remove('show'); setTimeout(function() { el.remove(); }, 300); }, undoCallback ? 4000 : 2800);
  }

  // ===== THEME =====
  function setTheme(mode) {
    themeMode = mode === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', themeMode);
    localStorage.setItem('dc_theme', themeMode);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = themeMode === 'dark' ? '#0f0f1a' : '#0ea5e9';
  }

  // ===== ONLINE/OFFLINE =====
  function updateOnlineStatus() {
    var bar = $('offlineBar');
    if (bar) {
      if (navigator.onLine) bar.classList.remove('visible');
      else bar.classList.add('visible');
    }
  }

  // ===== ACHIEVEMENTS =====
  var ACHIEVEMENT_DEFS = [
    { id: 'first_event', icon: '🎉', label: 'Перший запис', condition: function() { return eventsState.length >= 1; } },
    { id: 'streak_3', icon: '🔥', label: '3 дні поспіль', condition: function() { return streakData.count >= 3; } },
    { id: 'streak_7', icon: '💪', label: 'Тиждень!', condition: function() { return streakData.count >= 7; } },
    { id: 'streak_30', icon: '🏆', label: 'Місяць!', condition: function() { return streakData.count >= 30; } },
    { id: 'events_10', icon: '📝', label: '10 подій', condition: function() { return eventsState.length >= 10; } },
    { id: 'events_50', icon: '📊', label: '50 подій', condition: function() { return eventsState.length >= 50; } },
    { id: 'events_100', icon: '⭐', label: '100 подій', condition: function() { return eventsState.length >= 100; } },
    { id: 'toilet_90', icon: '🚽', label: '90% горшик', condition: function() { var s = eventsState.filter(function(e) { return isToiletSuccess(e.eventType); }).length; var m = eventsState.filter(function(e) { return isToiletMiss(e.eventType); }).length; var t = s + m; return t >= 10 && (s / t) >= 0.9; } },
    { id: 'training_10', icon: '🎓', label: '10 тренувань', condition: function() { return eventsState.filter(function(e) { return e.eventType === 'training'; }).length >= 10; } },
    { id: 'clicker_pro', icon: '🔵', label: 'Клікер-про', condition: function() { return parseInt(localStorage.getItem('dc_clicker_count') || '0') >= 50; } },
    { id: 'social_5', icon: '🌍', label: '5 соціалізацій', condition: function() { var done = JSON.parse(localStorage.getItem('dc_social') || '{}'); return Object.values(done).filter(Boolean).length >= 5; } },
    { id: 'ai_user', icon: '🤖', label: 'AI друг', condition: function() { return parseInt(localStorage.getItem('dc_ai_count') || '0') >= 5; } }
  ];

  function checkAchievements() {
    var newUnlocks = [];
    ACHIEVEMENT_DEFS.forEach(function(a) {
      if (!achievementsState[a.id] && a.condition()) {
        achievementsState[a.id] = Date.now();
        newUnlocks.push(a);
      }
    });
    if (newUnlocks.length > 0) {
      localStorage.setItem('dc_achievements', JSON.stringify(achievementsState));
      newUnlocks.forEach(function(a) { toast(a.icon + ' ' + a.label + '!', 'success'); });
      showConfetti();
    }
  }

  function showConfetti() {
    var container = document.createElement('div');
    container.className = 'confetti-container';
    document.body.appendChild(container);
    var colors = ['#0ea5e9', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#ec4899'];
    for (var i = 0; i < 40; i++) {
      var piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = Math.random() * 100 + '%';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDelay = Math.random() * 0.5 + 's';
      piece.style.animationDuration = (1.5 + Math.random()) + 's';
      container.appendChild(piece);
    }
    setTimeout(function() { container.remove(); }, 3000);
  }

  function renderAchievements() {
    var grid = $('achievementsGrid'); if (!grid) return;
    grid.innerHTML = ACHIEVEMENT_DEFS.map(function(a) {
      var unlocked = !!achievementsState[a.id];
      return '<div class="achievement ' + (unlocked ? 'unlocked' : 'locked') + '"><span class="achievement-icon">' + a.icon + '</span><span class="achievement-label">' + a.label + '</span></div>';
    }).join('');
  }

  // ===== TIMER =====
  function startTimer(seconds) {
    stopTimer();
    timerTotal = seconds;
    timerSeconds = seconds;
    timerRunning = true;
    updateTimerUI();
    timerInterval = setInterval(function() {
      timerSeconds--;
      updateTimerUI();
      if (timerSeconds <= 0) {
        stopTimer();
        timerAlarm();
      }
    }, 1000);
    var card = $('timerCard'); if (card) card.classList.add('active');
    var btn = $('timerStartBtn'); if (btn) btn.textContent = '⏸ Пауза';
  }

  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    timerRunning = false;
    var card = $('timerCard'); if (card) card.classList.remove('active');
    var btn = $('timerStartBtn'); if (btn) btn.textContent = '▶ Старт';
  }

  function resetTimer() {
    stopTimer();
    timerSeconds = 0;
    timerTotal = 0;
    updateTimerUI();
  }

  function updateTimerUI() {
    var display = $('timerDisplay'); if (!display) return;
    var m = Math.floor(timerSeconds / 60);
    var s = timerSeconds % 60;
    display.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    var ring = $('timerRingProgress');
    if (ring && timerTotal > 0) {
      var pct = timerSeconds / timerTotal;
      ring.style.strokeDashoffset = String(408.4 * (1 - pct));
      ring.classList.remove('warning', 'danger');
      if (pct < 0.15) ring.classList.add('danger');
      else if (pct < 0.35) ring.classList.add('warning');
    } else if (ring) {
      ring.style.strokeDashoffset = '408.4';
    }
  }

  function timerAlarm() {
    toast('⏰ Час горшика! Ведіть на місце!', 'success');
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
    // Play alarm sound
    try {
      var ctx = getAudioContext(); var now = ctx.currentTime;
      for (var i = 0; i < 3; i++) {
        var osc = ctx.createOscillator(); var gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.4, now + i * 0.3);
        gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.3 + 0.2);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + i * 0.3); osc.stop(now + i * 0.3 + 0.25);
      }
    } catch (e) {}
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('⏰ Час горшика!', { body: 'Ведіть на пелюшку/вулицю!', icon: '/icons/icon-192.png' });
    }
  }

  // ===== STREAK =====
  function updateStreak() {
    var today = todayKey();
    var yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    var todayHas = eventsState.some(function(e) { var ts = tsToDate(e.createdAt); return ts && ts >= startOfToday(); });
    if (todayHas) {
      if (streakData.lastDate === today) return;
      if (streakData.lastDate === yesterday) { streakData.count += 1; }
      else { streakData.count = 1; }
      streakData.lastDate = today;
    } else if (streakData.lastDate !== today && streakData.lastDate !== yesterday) {
      streakData.count = 0;
    }
    localStorage.setItem('dc_streak', JSON.stringify(streakData));
  }

  function renderStreak() {
    updateStreak();
    var badge = $('streakBadge'); var card = $('streakCard');
    if (streakData.count > 0) {
      if (badge) { show(badge); $('streakCount').textContent = streakData.count; }
      if (card) { show(card); $('streakText').textContent = streakData.count + (streakData.count === 1 ? ' день' : streakData.count < 5 ? ' дні' : ' днів') + ' поспіль!'; $('streakSub').textContent = streakData.count >= 30 ? '🏆 Легенда!' : streakData.count >= 7 ? '💎 Тижневий рекорд!' : streakData.count >= 3 ? '💪 Чудово!' : 'Так тримати!'; }
    } else {
      if (badge) hide(badge);
      if (card) hide(card);
    }
  }

  // ===== QUEUE RENDER =====
  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(function() { renderQueued = false; renderAll(); });
  }

  // ===== RENDER HEADER =====
  function renderHeader() {
    var name = (currentPet && currentPet.name && currentPet.name.trim()) || 'Песик';
    var weeks = getAgeInWeeks(currentPet && currentPet.birthDate);
    var program = getProgramByAge(weeks);
    $('petNameHeader').textContent = name;
    $('headerSub').textContent = weekLabel(weeks) + ' · ' + program.stage;
    $('profileName').textContent = name;
    $('profileMeta').textContent = [(currentPet && currentPet.breed) || '', weekLabel(weeks), (currentPet && currentPet.sex) || ''].filter(Boolean).join(' · ');
    var av = $('userAvatar');
    if (av) av.innerHTML = (currentUser && currentUser.photoURL) ? '<img src="' + currentUser.photoURL + '" alt="">' : avatarLetter((currentUser && currentUser.displayName) || name);
  }

  // ===== DAILY TIP =====
  function renderDailyTip() {
    var el = $('dailyTipText'); if (!el) return;
    var weeks = getAgeInWeeks(currentPet && currentPet.birthDate);
    var sex = (currentPet && currentPet.sex) || '';
    var last7 = eventsState.filter(function(e) { var ts = tsToDate(e.createdAt); return ts && ts >= new Date(Date.now() - 7 * 86400000); });
    var s7 = last7.filter(function(e) { return isToiletSuccess(e.eventType); }).length;
    var m7 = last7.filter(function(e) { return isToiletMiss(e.eventType); }).length;
    var t7 = s7 + m7;
    var rate = t7 > 0 ? Math.round(s7 / t7 * 100) : null;
    var tr7 = last7.filter(function(e) { return e.eventType === 'training'; }).length;

    var tips = [];
    if (rate !== null) {
      if (rate >= 90) tips.push('🎉 ' + rate + '% горшик за тиждень! Супер!');
      else if (rate >= 70) tips.push('📈 Горшик ' + rate + '% — чудовий прогрес!');
      else if (rate >= 40) tips.push('💪 Горшик ' + rate + '%. Частіше виводьте після сну/їжі!');
      else if (t7 > 3) tips.push('🎯 Горшик ' + rate + '%. Спробуйте менше простору + таймер!');
    }
    if (t7 === 0 && eventsState.length < 5) tips.push('📝 Починайте записувати туалет — побачите патерн за 3 дні!');
    if (tr7 === 0) tips.push('🎓 Сьогодні 0 тренувань. 2 хв достатньо! Використайте клікер 🔵');

    var pool = DAILY_TIPS.filter(function(t) { return t.condition === 'any'; });
    if (weeks != null && weeks < 16) pool = pool.concat(DAILY_TIPS.filter(function(t) { return t.condition === 'puppy'; }));
    if (weeks != null && weeks >= 24 && weeks < 72) pool = pool.concat(DAILY_TIPS.filter(function(t) { return t.condition === 'teen'; }));
    if (sex === 'дівчинка') pool = pool.concat(DAILY_TIPS.filter(function(t) { return t.condition === 'girl'; }));

    if (tips.length > 0) { el.textContent = tips[Math.floor(Date.now() / 3600000) % tips.length]; }
    else { el.textContent = (pool[new Date().getDate() % pool.length] && pool[new Date().getDate() % pool.length].text) || 'Натисніть + для запису 📝'; }
  }

  // ===== KPIs =====
  function renderKpis() {
    var start = startOfToday();
    var todayEv = eventsState.filter(function(e) { var ts = tsToDate(e.createdAt); return ts && ts >= start; });
    var s = todayEv.filter(function(e) { return isToiletSuccess(e.eventType); }).length;
    var m = todayEv.filter(function(e) { return isToiletMiss(e.eventType); }).length;
    var t = s + m;
    var pct = t > 0 ? Math.round(s / t * 100) : 0;
    $('kpiSuccess').textContent = s;
    $('kpiMiss').textContent = m;
    $('kpiTotal').textContent = todayEv.length;
    $('ringPct').textContent = pct + '%';
    var ring = $('ringFill');
    if (ring) ring.style.strokeDashoffset = String(251.3 - (251.3 * pct / 100));
  }

  // ===== ONE-TAP =====
  function renderOneTap() {
    var grid = $('onetapGrid'); if (!grid) return;
    var items = [
      { type: 'pee_success', icon: '💛', label: 'Пописяла ✓', cls: 'success' },
      { type: 'pee_miss', icon: '💛', label: 'Мимо', cls: 'danger' },
      { type: 'poo_success', icon: '💩', label: 'Покакала ✓', cls: 'success' },
      { type: 'poo_miss', icon: '💩', label: 'Мимо', cls: 'danger' },
      { type: 'training', icon: '🎓', label: 'Тренування', cls: '' },
      { type: 'walk', icon: '🚶', label: 'Прогулянка', cls: '' }
    ];
    grid.innerHTML = items.map(function(i) { return '<button type="button" class="onetap-btn ' + i.cls + '" data-onetap="' + i.type + '"><span class="onetap-icon">' + i.icon + '</span>' + i.label + '</button>'; }).join('');
    $$('[data-onetap]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (btn.classList.contains('logged')) return;
        btn.classList.add('logged');
        haptic();
        addEvent({ eventType: btn.dataset.onetap, timeLabel: nowTime() }, true);
        setTimeout(function() { btn.classList.remove('logged'); }, 2500);
      });
    });
  }

  // ===== CHART — FIXED =====
  function renderChart(canvasId) {
    var canvas = $(canvasId); if (!canvas || !canvas.getContext) return;

    // Wait for element to be visible and have dimensions
    requestAnimationFrame(function() {
      var rect = canvas.getBoundingClientRect();
      if (!rect.width || rect.width < 50) {
        // Retry after layout
        setTimeout(function() { renderChartInternal(canvasId); }, 100);
        return;
      }
      renderChartInternal(canvasId);
    });
  }

  function renderChartInternal(canvasId) {
    var canvas = $(canvasId); if (!canvas || !canvas.getContext) return;
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || rect.width < 50 || !rect.height || rect.height < 50) return;

    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);

    // Gather data
    var days = [];
    for (var i = 13; i >= 0; i--) {
      var d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      var next = new Date(d); next.setDate(next.getDate() + 1);
      var dayEv = eventsState.filter(function(e) { var ts = tsToDate(e.createdAt); return ts && ts >= d && ts < next; });
      var s = dayEv.filter(function(e) { return isToiletSuccess(e.eventType); }).length;
      var m = dayEv.filter(function(e) { return isToiletMiss(e.eventType); }).length;
      var t = s + m;
      days.push({ date: d, pct: t ? Math.round(s / t * 100) : null, total: t, success: s, miss: m });
    }

    var isDark = themeMode === 'dark';
    var accent = isDark ? '#38bdf8' : '#0ea5e9';
    var danger = isDark ? '#f87171' : '#ef4444';
    var warning = isDark ? '#fbbf24' : '#f59e0b';
    var muted = isDark ? '#6c757d' : '#adb5bd';
    var border = isDark ? '#2a2a4a' : '#e9ecef';
    var textColor = isDark ? '#adb5bd' : '#495057';

    var pad = { top: 16, right: 8, bottom: 28, left: 8 };
    var cw = w - pad.left - pad.right, ch = h - pad.top - pad.bottom;
    var bw = cw / days.length;

    // Grid lines
    ctx.strokeStyle = border; ctx.lineWidth = 1;
    [0, 50, 100].forEach(function(v) {
      var y = pad.top + ch - (v / 100) * ch;
      ctx.beginPath(); ctx.setLineDash([3, 3]); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke(); ctx.setLineDash([]);
    });

    // Draw bars
    days.forEach(function(day, i) {
      var x = pad.left + i * bw + bw * 0.15, barW = bw * 0.7;
      if (day.pct == null) {
        // No data — dot
        ctx.fillStyle = muted; ctx.beginPath(); ctx.arc(x + barW / 2, pad.top + ch - 3, 3, 0, Math.PI * 2); ctx.fill();
      } else {
        var barH = Math.max(6, (day.pct / 100) * ch);
        var y = pad.top + ch - barH;
        var barColor = day.pct >= 70 ? accent : day.pct >= 40 ? warning : danger;

        // Bar with rounded top
        ctx.fillStyle = barColor;
        var r = Math.min(4, barW / 2);
        ctx.beginPath();
        ctx.moveTo(x, pad.top + ch);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.lineTo(x + barW - r, y);
        ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
        ctx.lineTo(x + barW, pad.top + ch);
        ctx.closePath();
        ctx.fill();

        // Percentage on top
        if (day.total >= 2) {
          ctx.fillStyle = textColor; ctx.font = 'bold 9px -apple-system, system-ui, sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(day.pct + '%', x + barW / 2, y - 4);
        }
      }

      // Date labels
      if (i % 2 === 0 || i === days.length - 1) {
        ctx.fillStyle = muted; ctx.font = '10px -apple-system, system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(day.date.getDate() + '.' + (day.date.getMonth() + 1), x + barW / 2, h - 6);
      }
    });

    // Legend
    ctx.font = '10px -apple-system, system-ui, sans-serif'; ctx.textAlign = 'left';
    var lx = pad.left + 4, ly = pad.top + 4;
    ctx.fillStyle = accent; ctx.fillRect(lx, ly, 8, 8); ctx.fillStyle = textColor; ctx.fillText('≥70%', lx + 12, ly + 8);
    ctx.fillStyle = warning; ctx.fillRect(lx + 48, ly, 8, 8); ctx.fillStyle = textColor; ctx.fillText('40-69%', lx + 60, ly + 8);
    ctx.fillStyle = danger; ctx.fillRect(lx + 108, ly, 8, 8); ctx.fillStyle = textColor; ctx.fillText('<40%', lx + 120, ly + 8);
  }

  // ===== WEEKLY REPORT =====
  function renderWeeklyReport() {
    var card = $('weeklyReport'); var content = $('weeklyContent'); if (!card || !content) return;
    var dismissed = localStorage.getItem('dc_weekly_dismissed') === todayKey();
    if (eventsState.length < 5 || dismissed) { hide(card); return; }
    var now = new Date();
    var twStart = new Date(now); twStart.setDate(now.getDate() - 7); twStart.setHours(0, 0, 0, 0);
    var lwStart = new Date(twStart); lwStart.setDate(lwStart.getDate() - 7);
    var tw = eventsState.filter(function(e) { var ts = tsToDate(e.createdAt); return ts && ts >= twStart; });
    var lw = eventsState.filter(function(e) { var ts = tsToDate(e.createdAt); return ts && ts >= lwStart && ts < twStart; });
    if (tw.length < 3) { hide(card); return; }
    var tws = tw.filter(function(e) { return isToiletSuccess(e.eventType); }).length;
    var twm = tw.filter(function(e) { return isToiletMiss(e.eventType); }).length;
    var twt = tws + twm; var twRate = twt > 0 ? Math.round(tws / twt * 100) : null;
    var lws = lw.filter(function(e) { return isToiletSuccess(e.eventType); }).length;
    var lwm = lw.filter(function(e) { return isToiletMiss(e.eventType); }).length;
    var lwt = lws + lwm; var lwRate = lwt > 0 ? Math.round(lws / lwt * 100) : null;
    var twTr = tw.filter(function(e) { return e.eventType === 'training'; }).length;
    var lwTr = lw.filter(function(e) { return e.eventType === 'training'; }).length;
    function ch(c, p) { if (p == null || c == null) return ''; var d = c - p; if (d > 0) return '<span class="ws-change up">+' + d + '↑</span>'; if (d < 0) return '<span class="ws-change down">' + d + '↓</span>'; return ''; }
    show(card);
    content.innerHTML = '<div class="weekly-stat"><span class="ws-label">📊 Подій</span><span class="ws-value">' + tw.length + ch(tw.length, lw.length) + '</span></div>' + (twRate !== null ? '<div class="weekly-stat"><span class="ws-label">🚽 Горшик</span><span class="ws-value">' + twRate + '%' + ch(twRate, lwRate) + '</span></div>' : '') + '<div class="weekly-stat"><span class="ws-label">🎓 Тренувань</span><span class="ws-value">' + twTr + ch(twTr, lwTr) + '</span></div><div class="weekly-stat"><span class="ws-label">🔥 Streak</span><span class="ws-value">' + streakData.count + ' дн.</span></div>';
  }

  // ===== AI PLAN =====
  function generateAIPlan() {
    var card = $('aiPlanCard'); var content = $('aiPlanContent'); if (!card || !content) return;
    if (!currentPet || !currentPet.name) { hide(card); return; }
    var cached = localStorage.getItem('dc_aiplan');
    if (cached) { try { var p = JSON.parse(cached); if (p.date === todayKey() && p.plan) { show(card); content.innerHTML = p.plan; return; } } catch (e) {} }
    show(card); content.innerHTML = '<p class="text-muted">🧠 Генерую план...</p>';
    var weeks = getAgeInWeeks(currentPet.birthDate);
    var issues = currentPet.issues || '';
    var last7 = eventsState.filter(function(e) { var ts = tsToDate(e.createdAt); return ts && ts >= new Date(Date.now() - 7 * 86400000); });
    var s7 = last7.filter(function(e) { return isToiletSuccess(e.eventType); }).length;
    var m7 = last7.filter(function(e) { return isToiletMiss(e.eventType); }).length;
    var rate = (s7 + m7) > 0 ? Math.round(s7 / (s7 + m7) * 100) : null;
    var tr = last7.filter(function(e) { return e.eventType === 'training'; }).length;
    var prompt = 'Створи план на СЬОГОДНІ для собаки:\n- ' + currentPet.name + ', ' + weekLabel(weeks) + ', ' + (currentPet.breed || '?') + ', ' + getSizeLabel() + ', туалет: ' + (currentPet.toiletMode || 'pad') + '\n' + (issues ? '- Проблеми: ' + issues + '\n' : '') + (rate !== null ? '- Горшик за тиждень: ' + rate + '%\n' : '') + '- Тренувань: ' + tr + '\n\nДай 4-5 пунктів. Кожен = 1 речення. Формат:\n1. [коли] — [що зробити]';
    fetchAIResponse(prompt).then(function(r) {
      var html = r.split('\n').filter(function(l) { return l.trim(); }).map(function(l) { return '<div class="ai-plan-item">' + l + '</div>'; }).join('');
      content.innerHTML = html || '<p class="text-muted">Спробуйте 🔄</p>';
      localStorage.setItem('dc_aiplan', JSON.stringify({ date: todayKey(), plan: html }));
    }).catch(function() { content.innerHTML = '<p class="text-muted">Натисніть 🔄</p>'; });
  }

  // ===== DAILY PLAN =====
  function renderDailyPlan() {
    var list = $('dailyItems'); var badge = $('dailyProgressBadge'); if (!list || !badge) return;
    var plan = (getProgramByAge(getAgeInWeeks(currentPet && currentPet.birthDate)) || {}).plan || [];
    var key = todayKey(); var done = dailyDone[key] || {};
    badge.textContent = Object.values(done).filter(Boolean).length + '/' + plan.length;
    list.innerHTML = plan.map(function(item, i) { return '<label class="daily-item ' + (done[i] ? 'done' : '') + '"><input type="checkbox" data-daily="' + i + '" ' + (done[i] ? 'checked' : '') + '><span>' + item + '</span></label>'; }).join('');
    $$('[data-daily]').forEach(function(cb) {
      cb.addEventListener('change', function() { var k = todayKey(); dailyDone[k] = dailyDone[k] || {}; dailyDone[k][cb.dataset.daily] = cb.checked; localStorage.setItem('dc_daily', JSON.stringify(dailyDone)); haptic(); renderDailyPlan(); });
    });
  }

  function renderAgeFocus() {
    var p = getProgramByAge(getAgeInWeeks(currentPet && currentPet.birthDate));
    var box = $('periodFocus'); if (!box) return;
    box.innerHTML = '<div class="plan-item"><strong>🎯 Пріоритети</strong>' + p.priorities.map(function(x) { return '<br>• ' + x; }).join('') + '</div><div class="plan-item"><strong>💡</strong> ' + p.tip + '</div>';
  }

  function renderHeatInfo() {
    var card = $('heatCard'); var info = $('heatInfo'); var field = $('heatDateField');
    if (!card || !info) return;
    if (!currentPet || !currentPet.sex) { card.style.display = 'none'; if (field) field.style.display = 'none'; return; }
    var weeks = getAgeInWeeks(currentPet.birthDate);
    var monthsAge = weeks != null ? Math.round(weeks / 4.345) : null;
    var size = detectPetSize(); var sizeLabel = getSizeLabel();
    if (currentPet.sex === 'хлопчик') {
      card.style.display = ''; if (field) field.style.display = 'none';
      var range = getNeuterAgeRange();
      info.innerHTML = '<div class="plan-item"><strong>✂️ Кастрація</strong><br>📏 ' + sizeLabel + ' · 📅 ' + range.label + '</div>' + (monthsAge != null && monthsAge >= range.min - 1 && monthsAge <= range.max ? '<div class="plan-item" style="color:var(--accent)">✅ Час обговорити з ветеринаром!</div>' : '') + '<p class="text-muted" style="margin-top:0.5rem;font-size:0.78rem">⚠️ Рішення — разом з ветеринаром.</p>';
    } else if (currentPet.sex === 'дівчинка') {
      card.style.display = ''; if (field) field.style.display = '';
      var lastHeat = currentPet.lastHeat; var spayRange = getSpayAgeRange();
      var expFirst = { tiny: 6, small: 7, medium: 10, large: 12, giant: 16 }[size] || 10;
      var h = '';
      if (lastHeat) {
        var next = new Date(new Date(lastHeat).getTime() + HEAT_INFO.avgCycleDays * 86400000);
        var du = daysBetween(new Date(), next);
        if (du > 30) h += '<div class="plan-item">📅 Наступна ~' + next.toLocaleDateString('uk') + ' (' + du + ' дн.)</div>';
        else if (du > 0) h += '<div class="plan-item" style="color:var(--warning)">⚠️ Тічка через ~' + du + ' днів!</div>';
        else h += '<div class="plan-item" style="color:var(--danger)">🩸 Можливо зараз тічка!</div>';
      } else if (monthsAge != null) {
        var until = expFirst - monthsAge;
        if (until <= 1) h += '<div class="plan-item" style="color:var(--warning)">⚠️ Перша тічка може бути скоро!</div>';
        else if (until <= 3) h += '<div class="plan-item">📅 Перша через ~' + until + ' міс</div>';
      }
      h += '<div class="plan-item"><strong>✂️ Стерилізація:</strong> ' + spayRange.label + '</div>';
      info.innerHTML = h;
    } else {
      card.style.display = 'none'; if (field) field.style.display = 'none';
    }
  }

  function renderReminders() {
    var card = $('remindersCard'); var list = $('remindersList'); if (!card || !list) return;
    var rem = (currentPet && currentPet.reminders) || [];
    if (!rem.length) { card.style.display = 'none'; return; }
    card.style.display = ''; var now = new Date();
    list.innerHTML = rem.map(function(r) {
      var d = new Date(r.nextDate); var days = daysBetween(now, d);
      var cls = days < 0 ? 'danger' : days <= 3 ? 'warning' : '';
      var txt = days < 0 ? '⚠️ Прострочено ' + Math.abs(days) + ' дн.' : days === 0 ? '⏰ Сьогодні!' : days <= 3 ? '⏰ Через ' + days + ' дн.' : d.toLocaleDateString('uk');
      return '<div class="feed-item"><div><strong>' + r.label + '</strong><div class="meta ' + cls + '">' + txt + '</div></div></div>';
    }).join('');
  }

  // ===== HEATMAP =====
  function renderHeatmap() {
    var container = $('heatmapGrid'); if (!container) return;
    var cells = ''; var today = new Date(); today.setHours(0, 0, 0, 0);
    for (var i = 27; i >= 0; i--) {
      var d = new Date(today); d.setDate(d.getDate() - i);
      var next = new Date(d); next.setDate(next.getDate() + 1);
      var count = eventsState.filter(function(e) { var ts = tsToDate(e.createdAt); return ts && ts >= d && ts < next; }).length;
      var level = count === 0 ? '' : count <= 2 ? 'level-1' : count <= 4 ? 'level-2' : count <= 7 ? 'level-3' : 'level-4';
      cells += '<div class="heatmap-cell ' + level + (i === 0 ? ' today' : '') + '" title="' + d.toLocaleDateString('uk') + ': ' + count + '"></div>';
    }
    container.innerHTML = cells;
  }

  // ===== FEED (for Diary only) =====
  function renderFeed(targetId, filter) {
    filter = filter || 'all';
    var list = $(targetId); if (!list) return;
    var filtered = eventsState;
    if (filter !== 'all') {
      var cat = EVENT_CATEGORIES.find(function(c) { return c.id === filter; });
      if (cat) { var types = cat.events.map(function(e) { return e.type; }); filtered = eventsState.filter(function(e) { return types.indexOf(e.eventType) >= 0; }); }
    }
    if (!filtered.length) { list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📝</div><div class="empty-state-title">Поки порожньо</div><div class="empty-state-desc">Натисніть + щоб додати подію</div></div>'; return; }
    list.innerHTML = filtered.slice(0, 60).map(function(item) {
      var conf = TYPE_CONFIG[item.eventType] || { icon: '•', label: 'Подія' };
      var d = tsToDate(item.createdAt);
      var timeStr = d ? d.toLocaleString('uk', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
      var valStr = item.value ? ' · ' + item.value + (conf.unit || '') : '';
      var byStr = item.byName && membersState.length > 1 ? ' · ' + item.byName : '';
      return '<div class="feed-item"><div><strong>' + conf.icon + ' ' + conf.label + '</strong><div class="meta">' + timeStr + valStr + byStr + (item.note ? ' · ' + item.note : '') + '</div></div><button type="button" class="btn btn-ghost btn-sm" data-delete-event="' + item.id + '">✕</button></div>';
    }).join('');
    $$('#' + targetId + ' [data-delete-event]').forEach(function(btn) {
      btn.addEventListener('click', function() { deleteEventWithUndo(btn.dataset.deleteEvent); });
    });
  }
  function renderWeight() {
    var c = $('weightHistory'); if (!c) return;
    var we = eventsState.filter(function(e) { return e.eventType === 'weight' && e.value; }).slice(0, 20).reverse();
    if (!we.length) { c.innerHTML = '<p class="text-muted">+ → Здоров\'я → ⚖️ Вага</p>'; return; }
    var latest = we[we.length - 1]; var prev = we.length > 1 ? we[we.length - 2] : null;
    var diff = prev ? (latest.value - prev.value).toFixed(1) : null;
    var ds = diff ? (diff > 0 ? '+' + diff + ' кг ↑' : diff < 0 ? diff + ' кг ↓' : '= без змін') : '';
    var dc = diff > 0 ? 'var(--success)' : diff < 0 ? 'var(--warning)' : 'var(--text-muted)';
    var html = '<div style="text-align:center;margin-bottom:0.75rem"><div style="font-size:2rem;font-weight:800;color:var(--accent)">' + latest.value + ' кг</div>' + (ds ? '<div style="color:' + dc + ';font-size:0.85rem;font-weight:600">' + ds + '</div>' : '') + '</div>';
    html += '<canvas id="weightChart" height="120" style="width:100%;margin-bottom:0.5rem"></canvas>';
    c.innerHTML = html;
    requestAnimationFrame(function() { renderWeightChart(we); });
  }

  function renderWeightChart(we) {
    var canvas = $('weightChart'); if (!canvas || !canvas.getContext || we.length < 2) return;
    var rect = canvas.getBoundingClientRect(); if (!rect.width || rect.width < 50) return;
    var ctx = canvas.getContext('2d'); var dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var w = rect.width, h = rect.height; ctx.clearRect(0, 0, w, h);
    var vals = we.map(function(e) { return e.value; });
    var mn = Math.min.apply(null, vals) - 0.3, mx = Math.max.apply(null, vals) + 0.3, rng = mx - mn || 1;
    var isDark = themeMode === 'dark';
    var lc = isDark ? '#38bdf8' : '#0ea5e9';
    var gc = isDark ? '#2a2a4a' : '#e9ecef';
    var tc = isDark ? '#6c757d' : '#adb5bd';
    var pad = { top: 12, right: 8, bottom: 20, left: 38 };
    var cw = w - pad.left - pad.right, ch = h - pad.top - pad.bottom;
    // Grid
    ctx.strokeStyle = gc; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    for (var i = 0; i <= 3; i++) { var y = pad.top + (i / 3) * ch; ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke(); ctx.fillStyle = tc; ctx.font = '10px -apple-system, system-ui'; ctx.textAlign = 'right'; ctx.fillText((mx - (i / 3) * rng).toFixed(1), pad.left - 4, y + 3); }
    ctx.setLineDash([]);
    var pts = vals.map(function(v, idx) { return { x: pad.left + (idx / Math.max(vals.length - 1, 1)) * cw, y: pad.top + ch - ((v - mn) / rng) * ch }; });
    // Fill
    var gradient = ctx.createLinearGradient(0, pad.top, 0, h - pad.bottom);
    gradient.addColorStop(0, isDark ? 'rgba(56,189,248,0.12)' : 'rgba(14,165,233,0.08)');
    gradient.addColorStop(1, 'transparent');
    ctx.beginPath(); ctx.moveTo(pts[0].x, h - pad.bottom); pts.forEach(function(p) { ctx.lineTo(p.x, p.y); }); ctx.lineTo(pts[pts.length - 1].x, h - pad.bottom); ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();
    // Line
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (var j = 1; j < pts.length; j++) { var cx = (pts[j - 1].x + pts[j].x) / 2; ctx.bezierCurveTo(cx, pts[j - 1].y, cx, pts[j].y, pts[j].x, pts[j].y); }
    ctx.strokeStyle = lc; ctx.lineWidth = 2.5; ctx.stroke();
    // Points
    pts.forEach(function(p, idx) { ctx.beginPath(); ctx.arc(p.x, p.y, idx === pts.length - 1 ? 5 : 3, 0, Math.PI * 2); ctx.fillStyle = idx === pts.length - 1 ? lc : (isDark ? '#1a1a2e' : '#fff'); ctx.fill(); ctx.strokeStyle = lc; ctx.lineWidth = 2; ctx.stroke(); });
  }

  // ===== COURSES =====
  function renderCourses() {
    var grid = $('courseGrid'); var viewer = $('selectedCourse'); if (!grid || !viewer) return;
    var filtered = currentCourseLevel === 'all' ? COURSES : COURSES.filter(function(c) { return c.level === currentCourseLevel; });
    grid.innerHTML = filtered.map(function(c) {
      var progress = getCourseProgress(c.id);
      return '<button type="button" class="course-btn ' + (c.id === currentCourseId ? 'selected' : '') + '" data-course-id="' + c.id + '"><span class="c-badge">' + c.badge + '</span><strong>' + c.title + '</strong><div class="c-meta">' + c.description + '</div>' + (progress > 0 ? '<div class="progress-bar"><div class="progress-bar-fill" style="width:' + progress + '%"></div></div>' : '') + '</button>';
    }).join('');
    $$('[data-course-id]').forEach(function(btn) { btn.addEventListener('click', function() { currentCourseId = btn.dataset.courseId; renderCourses(); haptic(); }); });
    var course = COURSES.find(function(c) { return c.id === currentCourseId; }) || filtered[0] || COURSES[0];
    if (!course) { viewer.innerHTML = ''; return; }
    var courseProgress = JSON.parse(localStorage.getItem('dc_course_progress') || '{}');
    var done = courseProgress[course.id] || {};
    viewer.innerHTML = '<div class="course-detail"><h3>' + course.title + '</h3><p style="color:var(--text-secondary);margin-bottom:1rem">' + course.description + '</p><h4>Кроки</h4><ul>' + course.steps.map(function(s) { return '<li>' + s + '</li>'; }).join('') + '</ul><h4>Помилки</h4><ul class="mistakes">' + course.mistakes.map(function(s) { return '<li>' + s + '</li>'; }).join('') + '</ul><h4>Чекліст</h4><ul class="checks">' + course.checklist.map(function(s, i) { return '<li><label class="daily-item"><input type="checkbox" data-course-check="' + course.id + ':' + i + '" ' + (done[i] ? 'checked' : '') + '><span>' + s + '</span></label></li>'; }).join('') + '</ul></div>';
    $$('[data-course-check]').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var parts = cb.dataset.courseCheck.split(':');
        var p = JSON.parse(localStorage.getItem('dc_course_progress') || '{}');
        p[parts[0]] = p[parts[0]] || {};
        p[parts[0]][parts[1]] = cb.checked;
        localStorage.setItem('dc_course_progress', JSON.stringify(p));
        haptic(); renderCourses();
      });
    });
  }

  function getCourseProgress(courseId) {
    var p = JSON.parse(localStorage.getItem('dc_course_progress') || '{}');
    var done = p[courseId] || {};
    var course = COURSES.find(function(c) { return c.id === courseId; });
    if (!course) return 0;
    var total = course.checklist.length;
    var completed = Object.values(done).filter(Boolean).length;
    return total > 0 ? Math.round(completed / total * 100) : 0;
  }

  function renderKnowledge() { var g = $('knowledgeGrid'); if (g) g.innerHTML = KNOWLEDGE.map(function(k) { return '<div class="k-card"><strong>' + k.title + '</strong><p>' + k.text + '</p><span class="k-tag">' + k.tag + '</span></div>'; }).join(''); }

  function renderSocial() {
    var grid = $('socialGrid'); if (!grid) return;
    var done = JSON.parse(localStorage.getItem('dc_social') || '{}');
    var totalDone = Object.values(done).filter(Boolean).length;
    var totalItems = SOCIAL_ITEMS.reduce(function(sum, g) { return sum + g.items.length; }, 0);
    grid.innerHTML = '<div style="margin-bottom:0.75rem"><span class="badge">' + totalDone + '/' + totalItems + ' ✓</span></div>' + SOCIAL_ITEMS.map(function(group) { return '<div class="social-group"><h5 class="social-group-title">' + group.category + '</h5>' + group.items.map(function(item) { var key = group.category + ':' + item; return '<label class="social-item"><input type="checkbox" data-social-key="' + key + '" ' + (done[key] ? 'checked' : '') + '><span>' + item + '</span></label>'; }).join('') + '</div>'; }).join('');
    $$('[data-social-key]').forEach(function(cb) { cb.addEventListener('change', function() { var d = JSON.parse(localStorage.getItem('dc_social') || '{}'); d[cb.dataset.socialKey] = cb.checked; localStorage.setItem('dc_social', JSON.stringify(d)); haptic(); renderSocial(); }); });
  }

  function renderToiletGuide() { var g = $('toiletGuide'); if (g) g.innerHTML = TOILET_GUIDE.map(function(s) { return '<div class="k-card"><strong>' + s.title + '</strong><p>' + s.text + '</p></div>'; }).join(''); }
  function renderMembers() { var list = $('membersList'); if (!list) return; list.innerHTML = membersState.length ? membersState.map(function(m) { return '<div class="member-chip"><div class="m-avatar">' + (m.photoURL ? '<img src="' + m.photoURL + '" alt="">' : avatarLetter(m.displayName)) + '</div><span>' + (m.displayName || 'Учасник') + '</span></div>'; }).join('') : '<p class="text-muted">Поки тільки ви 👤</p>'; }
  function renderWorkspaceMeta() { var el = $('inviteCodeView'); if (el) el.textContent = (workspaceData && workspaceData.inviteCode) || '—'; }

  function fillPetForm() {
    if ($('petName')) $('petName').value = (currentPet && currentPet.name) || '';
    if ($('petBirthDate')) $('petBirthDate').value = (currentPet && currentPet.birthDate) || '';
    if ($('petSex')) $('petSex').value = (currentPet && currentPet.sex) || 'хлопчик';
    if ($('petBreed')) $('petBreed').value = (currentPet && currentPet.breed) || '';
    if ($('petWeight')) $('petWeight').value = (currentPet && currentPet.weight) || '';
    if ($('petToiletMode')) $('petToiletMode').value = (currentPet && currentPet.toiletMode) || 'pad';
    if ($('petIssues')) $('petIssues').value = (currentPet && currentPet.issues) || '';
    if ($('petLastVaccine')) $('petLastVaccine').value = (currentPet && currentPet.lastVaccine) || '';
    if ($('petLastDeworming')) $('petLastDeworming').value = (currentPet && currentPet.lastDeworming) || '';
    if ($('petLastHeat')) $('petLastHeat').value = (currentPet && currentPet.lastHeat) || '';
    var hf = $('heatDateField'); if (hf) hf.style.display = (currentPet && currentPet.sex === 'дівчинка') ? '' : 'none';
    var ps = $('pushStatus');
    if (ps) {
      if ('Notification' in window && Notification.permission === 'granted') ps.textContent = '✅ Сповіщення увімкнені';
      else if ('Notification' in window && Notification.permission === 'denied') ps.textContent = '❌ Заблоковані в браузері';
      else ps.textContent = '';
    }
  }

  // ===== SHEET =====
  function renderSheetCategories() {
    var c = $('sheetCategories'); if (!c) return;
    c.innerHTML = EVENT_CATEGORIES.map(function(cat) { return '<button type="button" class="chip ' + (cat.id === selectedSheetCategory ? 'active' : '') + '" data-sheet-cat="' + cat.id + '">' + cat.icon + ' ' + cat.name + '</button>'; }).join('');
    $$('[data-sheet-cat]').forEach(function(btn) { btn.addEventListener('click', function() { selectedSheetCategory = btn.dataset.sheetCat; selectedEventType = null; renderSheetCategories(); renderSheetEvents(); hide($('sheetExtraFields')); haptic(); }); });
  }

  function renderSheetEvents() {
    var c = $('sheetEvents'); if (!c) return;
    var cat = EVENT_CATEGORIES.find(function(x) { return x.id === selectedSheetCategory; }); if (!cat) return;
    c.innerHTML = '<div class="actions-grid">' + cat.events.map(function(ev) { return '<button type="button" class="action-btn ' + (selectedEventType === ev.type ? 'selected' : '') + ' ' + (ev.tone === 'success' ? 'green' : ev.tone === 'danger' ? 'red' : '') + '" data-sheet-event="' + ev.type + '"><span class="action-icon">' + ev.icon + '</span>' + ev.label + '</button>'; }).join('') + '</div>';
    $$('[data-sheet-event]').forEach(function(btn) { btn.addEventListener('click', function() { selectedEventType = btn.dataset.sheetEvent; renderSheetEvents(); show($('sheetExtraFields')); $('eventTime').value = nowTime(); var conf = TYPE_CONFIG[selectedEventType]; var vf = $('valueField'); if (vf) vf.style.display = (conf && conf.hasValue) ? '' : 'none'; haptic(); }); });
  }

  // ===== RENDER ALL =====
  function renderAll() {
    renderHeader(); renderStreak(); renderWeeklyReport(); renderDailyTip(); renderKpis();
    renderOneTap(); renderDailyPlan(); renderAgeFocus(); renderHeatInfo(); renderReminders();
    renderHeatmap(); renderAchievements();
    renderFeed('recentLogsDiary', currentDiaryFilter); renderWeight();
    renderCourses(); renderKnowledge(); renderSocial(); renderToiletGuide();
    renderMembers(); renderWorkspaceMeta(); fillPetForm();
    if (activeTab === 'tabDiary') { renderChart('progressChartDiary'); }
    generateAIPlan();
    checkAchievements();
  }

  // ===== TABS =====
  function setActiveTab(id) {
    activeTab = id;
    $$('.tab').forEach(function(p) { p.classList.toggle('active', p.id === id); });
    $$('.nav-item').forEach(function(b) { b.classList.toggle('active', b.dataset.tab === id); });
    if (id === 'tabProfile') hide($('fabAddEvent')); else show($('fabAddEvent'));
    if (id === 'tabDiary') setTimeout(function() { renderChart('progressChartDiary'); }, 50);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openSheet() { show($('eventSheet')); selectedEventType = null; selectedSheetCategory = 'toilet'; renderSheetCategories(); renderSheetEvents(); hide($('sheetExtraFields')); document.body.style.overflow = 'hidden'; }
  function closeSheet() { hide($('eventSheet')); document.body.style.overflow = ''; }

  // ===== FIREBASE =====
  function savePetProfile(payload) {
    if (!currentUser || !workspaceId) { toast('Увійдіть', 'error'); return Promise.resolve(); }
    showLoading();
    return db.collection('workspaces').doc(workspaceId).collection('dogs').doc('primary').set(
      Object.assign({}, currentPet || {}, payload, { updatedAt: firebase.firestore.FieldValue.serverTimestamp() }), { merge: true }
    ).then(function() { toast('Збережено ✓', 'success'); }).catch(function(e) { console.error(e); toast('Помилка збереження', 'error'); }).finally(hideLoading);
  }

  function addEvent(payload, withUndo) {
    if (!currentUser || !workspaceId) { toast('Увійдіть', 'error'); return Promise.resolve(); }
    var data = { eventType: payload.eventType, byUid: currentUser.uid, byName: currentUser.displayName || 'Я', note: payload.note || '', timeLabel: payload.timeLabel || nowTime(), createdAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (payload.value) data.value = payload.value;
    return db.collection('workspaces').doc(workspaceId).collection('events').add(data).then(function(docRef) {
      var conf = TYPE_CONFIG[payload.eventType] || { icon: '•', label: 'Подія' };
      if (withUndo) {
        toast(conf.icon + ' ' + conf.label, 'success', function() { docRef.delete().then(function() { toast('Скасовано', 'success'); }); });
      } else { toast('Додано ✓', 'success'); }
      haptic();
      // Auto-reminders
      if (['meal_morning', 'meal_day', 'meal_evening'].indexOf(payload.eventType) >= 0) scheduleLocalReminder(20, '🚽 Горшик!', 'Після їжі — пелюшка!');
      if (payload.eventType === 'sleep') scheduleLocalReminder(5, '🚽 Прокинувся!', 'Одразу на пелюшку!');
    }).catch(function(e) { console.error(e); toast('Помилка', 'error'); });
  }

  function deleteEvent(id) {
    if (!workspaceId || !id) return Promise.resolve();
    return db.collection('workspaces').doc(workspaceId).collection('events').doc(id).delete().then(function() { toast('Видалено', 'success'); }).catch(function(e) { console.error(e); toast('Помилка', 'error'); });
  }

  function deleteEventWithUndo(id) {
    if (!workspaceId || !id) return;
    var eventData = eventsState.find(function(e) { return e.id === id; });
    db.collection('workspaces').doc(workspaceId).collection('events').doc(id).delete().then(function() {
      toast('Видалено', 'success', function() {
        if (!eventData) return;
        var restoreData = { eventType: eventData.eventType, byUid: eventData.byUid || currentUser.uid, byName: eventData.byName || 'Я', note: eventData.note || '', timeLabel: eventData.timeLabel || '', createdAt: firebase.firestore.FieldValue.serverTimestamp() };
        if (eventData.value) restoreData.value = eventData.value;
        db.collection('workspaces').doc(workspaceId).collection('events').add(restoreData).then(function() { toast('Відновлено ✓', 'success'); });
      });
    }).catch(function(e) { console.error(e); toast('Помилка', 'error'); });
  }

  function ensureWorkspaceForUser(user) {
    return db.collection('users').doc(user.uid).get().then(function(udoc) {
      if (udoc.exists && udoc.data().workspaceId) { workspaceId = udoc.data().workspaceId; return db.collection('workspaces').doc(workspaceId).get().then(function(wdoc) { workspaceData = wdoc.exists ? wdoc.data() : null; }); }
      var wsRef = db.collection('workspaces').doc(); workspaceId = wsRef.id;
      var inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase();
      workspaceData = { name: (user.displayName || 'Мій').split(' ')[0], ownerId: user.uid, inviteCode: inviteCode };
      return wsRef.set(Object.assign({}, workspaceData, { createdAt: firebase.firestore.FieldValue.serverTimestamp() })).then(function() {
        return db.collection('users').doc(user.uid).set({ uid: user.uid, email: user.email || '', displayName: user.displayName || '', photoURL: user.photoURL || '', role: 'owner', workspaceId: workspaceId }, { merge: true });
      }).then(function() {
        return wsRef.collection('members').doc(user.uid).set({ uid: user.uid, email: user.email || '', displayName: user.displayName || '', photoURL: user.photoURL || '', role: 'owner', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      }).then(function() {
        return wsRef.collection('dogs').doc('primary').set({ name: '', birthDate: '', sex: 'хлопчик', breed: '', toiletMode: 'pad', weight: '', issues: '', createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      });
    });
  }

  function joinWorkspaceByInvite(code) {
    var clean = (code || '').trim().toUpperCase(); if (!clean) return Promise.reject(new Error('Введіть код'));
    return db.collection('workspaces').where('inviteCode', '==', clean).limit(1).get().then(function(snap) {
      if (snap.empty) throw new Error('Код не знайдено');
      workspaceId = snap.docs[0].id; workspaceData = snap.docs[0].data();
      return db.collection('users').doc(currentUser.uid).set({ uid: currentUser.uid, email: currentUser.email || '', displayName: currentUser.displayName || '', photoURL: currentUser.photoURL || '', role: 'member', workspaceId: workspaceId }, { merge: true });
    }).then(function() {
      return db.collection('workspaces').doc(workspaceId).collection('members').doc(currentUser.uid).set({ uid: currentUser.uid, email: currentUser.email || '', displayName: currentUser.displayName || '', photoURL: currentUser.photoURL || '', role: 'member', createdAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }).then(function() { subscribePet(); subscribeMembers(); subscribeEvents(); queueRender(); });
  }

  function subscribePet() { if (unsubPet) unsubPet(); unsubPet = db.collection('workspaces').doc(workspaceId).collection('dogs').doc('primary').onSnapshot(function(s) { currentPet = s.exists ? s.data() : null; queueRender(); }); }
  function subscribeMembers() { if (unsubMembers) unsubMembers(); unsubMembers = db.collection('workspaces').doc(workspaceId).collection('members').onSnapshot(function(s) { membersState = []; s.forEach(function(d) { membersState.push(d.data()); }); renderMembers(); }); }
  function subscribeEvents() { if (unsubEvents) unsubEvents(); unsubEvents = db.collection('workspaces').doc(workspaceId).collection('events').orderBy('createdAt', 'desc').limit(500).onSnapshot(function(s) { eventsState = []; s.forEach(function(d) { eventsState.push(Object.assign({ id: d.id }, d.data())); }); queueRender(); }); }

  // ===== AUTH =====
  function loginGoogle() {
    showLoading();
    return auth.signInWithPopup(googleProvider).catch(function(e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user') return auth.signInWithRedirect(googleProvider);
      else if (e.code === 'auth/unauthorized-domain') toast('Домен не авторизовано', 'error');
      else toast(e.message || 'Помилка', 'error');
    }).finally(hideLoading);
  }

  function logout() {
    if (unsubEvents) { unsubEvents(); unsubEvents = null; }
    if (unsubMembers) { unsubMembers(); unsubMembers = null; }
    if (unsubPet) { unsubPet(); unsubPet = null; }
    stopTimer();
    return auth.signOut().then(function() { currentUser = null; workspaceId = null; workspaceData = null; currentPet = null; eventsState = []; membersState = []; hide($('appContent')); show($('authScreen')); });
  }

  // ===== AI =====
  function addChatMessage(text, type) { var chat = $('aiChat'); if (!chat) return; var msg = document.createElement('div'); msg.className = 'ai-msg ' + type; msg.textContent = text; chat.appendChild(msg); chat.scrollTop = chat.scrollHeight; }
  function showTyping() { var chat = $('aiChat'); if (!chat) return; var el = document.createElement('div'); el.className = 'ai-msg loading'; el.id = 'typingIndicator'; el.textContent = 'Думаю'; chat.appendChild(el); chat.scrollTop = chat.scrollHeight; }
  function removeTyping() { var el = $('typingIndicator'); if (el) el.remove(); }

  function fetchAIResponse(prompt) {
    var weeks = getAgeInWeeks(currentPet && currentPet.birthDate);
    var issues = (currentPet && currentPet.issues) || '';
    var petInfo = currentPet ? 'Собака: ' + (currentPet.name || '?') + ', ' + weekLabel(weeks) + ', ' + (currentPet.breed || '?') + ', ' + getSizeLabel() + (issues ? ', проблеми: ' + issues : '') : '';
    var sys = 'Ти — професійний український кінолог (15р).\nПРАВИЛА:\n1. ТІЛЬКИ українською.\n2. 4-5 речень.\n3. До 3 міс — тільки адаптація.\n4. Без покарань.\n5. Пронумеровані кроки.\n\n' + petInfo;
    return fetch('/api/proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'groq/llama-3.3-70b-versatile', messages: [{ role: 'system', content: sys }, { role: 'user', content: prompt }], temperature: 0.2, max_tokens: 400, stream: false }) })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(data) {
      if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
        return data.choices[0].message.content.trim().replace(/[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef]/g, '').replace(/\s{2,}/g, ' ').trim() || getLocalFallback(prompt);
      }
      throw new Error('Empty');
    }).catch(function(e) { console.warn('AI:', e.message); return getLocalFallback(prompt); });
  }

  function getLocalFallback(prompt) {
    var l = prompt.toLowerCase();
    if (l.indexOf('сидіти') >= 0 || l.indexOf('сідати') >= 0) return '1) Ласощі біля носа.\n2) Підніміть руку вгору — сяде.\n3) Клікер/маркер "Так!" + ласощі.\n4) 5-8 разів, по 2 хв/день.';
    if (l.indexOf('гриз') >= 0) return '1) Приберіть цінне з доступу.\n2) Давайте жувальні іграшки.\n3) Гризе своє — клікер + похвала!\n4) Чуже — мовчки заберіть, дайте своє.';
    if (l.indexOf('гавк') >= 0) return '1) Визначте тригер.\n2) Не кричіть у відповідь.\n3) Пауза в гавкоті → клікер + ласощі.\n4) Більше розумового навантаження.';
    if (l.indexOf('пелюшк') >= 0 || l.indexOf('туалет') >= 0) return '1) Менше простору (манеж).\n2) Після сну/їжі — несіть на пелюшку.\n3) Зробила — клікер/маркер + ласощі!\n4) Промах — мовчки прибрати. Без емоцій.';
    if (l.indexOf('повідок') >= 0 || l.indexOf('повідець') >= 0 || l.indexOf('тягне') >= 0) return '1) Тягне = ви зупиняєтесь.\n2) Повідок вільний = йдемо.\n3) Кожні 15 кроків — ласощі біля ноги.\n4) Рулетку — в смітник!';
    if (l.indexOf('кусає') >= 0 || l.indexOf('кусат') >= 0) return '1) Завмріть як статуя.\n2) "Ай" + пауза 5 сек (ігноруємо).\n3) Дайте іграшку натомість.\n4) Не зупиняється → вийдіть з кімнати.';
    if (l.indexOf('соціал') >= 0) return '1) Одне нове знайомство на день.\n2) Безпечна відстань!\n3) Цікавість → клікер + ласощі.\n4) Стрес → відходимо далі.';
    if (l.indexOf('підклик') >= 0 || l.indexOf('до мене') >= 0) return '1) Слово "Сюди!" (не ім\'я).\n2) Вдома: слово → СУПЕРЛАСОЩІ.\n3) Підхід = завжди свято! Ніколи не карати.\n4) Свисток для підклику на відстані.';
    var prog = getProgramByAge(getAgeInWeeks(currentPet && currentPet.birthDate));
    return (prog && prog.tip) || 'Запитайте конкретніше! Наприклад: "Як навчити сидіти?" 🐾';
  }

  function handleAISubmit(prompt) {
    if (!prompt.trim()) return;
    addChatMessage(prompt, 'user'); showTyping();
    var count = parseInt(localStorage.getItem('dc_ai_count') || '0') + 1;
    localStorage.setItem('dc_ai_count', String(count));
    fetchAIResponse(prompt).then(function(r) { removeTyping(); addChatMessage(r, 'assistant'); }).catch(function() { removeTyping(); addChatMessage('Помилка. Спробуйте ще 🔄', 'assistant'); });
  }

  // ===== VOICE =====
  function initVoiceInput() {
    var voiceBtn = $('voiceBtn'); if (!voiceBtn) return;
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) { voiceBtn.style.display = 'none'; return; }
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var recognition = new SR();
    recognition.lang = 'uk-UA'; recognition.continuous = false; recognition.interimResults = false;
    var isRec = false;
    voiceBtn.addEventListener('click', function() {
      if (isRec) { recognition.stop(); voiceBtn.classList.remove('recording'); isRec = false; }
      else { recognition.start(); voiceBtn.classList.add('recording'); isRec = true; haptic(); }
    });
    recognition.onresult = function(e) { var t = e.results[0][0].transcript; var input = $('aiInput'); if (input) { input.value = t; input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 100) + 'px'; } voiceBtn.classList.remove('recording'); isRec = false; };
    recognition.onerror = function() { voiceBtn.classList.remove('recording'); isRec = false; };
    recognition.onend = function() { voiceBtn.classList.remove('recording'); isRec = false; };
  }

  // ===== PUSH =====
  function requestPushPermission() {
    if (!('Notification' in window)) { toast('Не підтримується', 'error'); return; }
    Notification.requestPermission().then(function(perm) {
      if (perm === 'granted') { subscribeToPush(); toast('Сповіщення увімкнені! 🔔', 'success'); }
      else toast('Відхилено', 'error');
      fillPetForm();
    });
  }

  function subscribeToPush() {
    try {
      if (!firebase.messaging) return;
      var messaging = firebase.messaging();
      navigator.serviceWorker.getRegistration().then(function(reg) {
        if (!reg) return;
        return messaging.getToken({ vapidKey: 'BFvGyG-w5R68xO2RS6gQbYSyAPQaviGnVsHedxjzXajvxg1OUdL1Xe6e4M38j0mewG-Yt3qKgbUnMHmf98PaCiA', serviceWorkerRegistration: reg });
      }).then(function(token) {
        if (token && currentUser && workspaceId) db.collection('workspaces').doc(workspaceId).collection('members').doc(currentUser.uid).update({ pushToken: token });
      }).catch(function(e) { console.warn('Push:', e); });
    } catch (e) { console.warn('Push:', e); }
  }

  function scheduleLocalReminder(minutes, title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    setTimeout(function() { new Notification(title, { body: body, icon: '/icons/icon-192.png' }); if (navigator.vibrate) navigator.vibrate([100, 50, 100]); }, minutes * 60 * 1000);
  }

  // ===== EXPORT =====
  function exportData() {
    if (!eventsState.length) { toast('Немає даних', 'error'); return; }
    var data = { exportDate: new Date().toISOString(), pet: currentPet || {}, events: eventsState.map(function(e) { var ts = tsToDate(e.createdAt); return { type: e.eventType, time: ts ? ts.toISOString() : null, note: e.note, value: e.value }; }) };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'dogcoach_' + todayKey() + '.json'; a.click();
    toast('Експортовано ✓', 'success');
  }

  // ===== ONBOARDING =====
  function showOnboarding() { hide($('authScreen')); hide($('appContent')); show($('onboardingScreen')); }
  function hideOnboarding() { hide($('onboardingScreen')); show($('appContent')); }
  function setOnboardingStep(step) { $$('.onboarding-step').forEach(function(s) { s.classList.add('hidden'); }); show($('onboardingStep' + step)); $$('.ob-dot').forEach(function(d) { d.classList.toggle('active', parseInt(d.dataset.step) === step); }); }
  function checkOnboarding() { if (localStorage.getItem('dc_onboarded')) return false; if (currentPet && currentPet.name && currentPet.name.trim()) { localStorage.setItem('dc_onboarded', 'true'); return false; } return true; }

  function bindOnboarding() {
    $('obNext1') && $('obNext1').addEventListener('click', function() { if (!$('obName').value.trim()) { toast('Введіть ім\'я 🐾', 'error'); return; } setOnboardingStep(2); haptic(); });
    $('obBack2') && $('obBack2').addEventListener('click', function() { setOnboardingStep(1); });
    $('obNext2') && $('obNext2').addEventListener('click', function() { setOnboardingStep(3); haptic(); });
    $('obBack3') && $('obBack3').addEventListener('click', function() { setOnboardingStep(2); });
    $('obFinish') && $('obFinish').addEventListener('click', function() {
      showLoading();
      savePetProfile({ name: $('obName').value.trim(), birthDate: $('obBirthDate').value, sex: $('obSex').value, breed: $('obBreed').value.trim() }).then(function() {
        localStorage.setItem('dc_onboarded', 'true'); hideOnboarding(); toast($('obName').value.trim() + ' додано! 🎉', 'success'); showConfetti(); queueRender();
      }).catch(function() { toast('Помилка', 'error'); }).finally(hideLoading);
    });
  }

  // ===== BIND EVENTS =====
  function bindEvents() {
    setTheme(themeMode);
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();

    $$('[data-theme-toggle]').forEach(function(b) { b.addEventListener('click', function() { setTheme(themeMode === 'dark' ? 'light' : 'dark'); haptic(); }); });
    $('googleLoginBtn') && $('googleLoginBtn').addEventListener('click', loginGoogle);
    $('logoutBtn') && $('logoutBtn').addEventListener('click', function() { if (confirm('Вийти?')) logout(); });
    $$('.nav-item').forEach(function(b) { b.addEventListener('click', function() { setActiveTab(b.dataset.tab); haptic(); }); });

    $('fabAddEvent') && $('fabAddEvent').addEventListener('click', function() { openSheet(); haptic(); });
    $('sheetBackdrop') && $('sheetBackdrop').addEventListener('click', closeSheet);
    $('showAllActionsBtn') && $('showAllActionsBtn').addEventListener('click', openSheet);

    $('saveEventBtn') && $('saveEventBtn').addEventListener('click', function() {
      if (!selectedEventType) { toast('Оберіть тип', 'error'); return; }
      var payload = { eventType: selectedEventType, timeLabel: ($('eventTime') && $('eventTime').value) || nowTime(), note: ($('eventNote') && $('eventNote').value && $('eventNote').value.trim()) || '' };
      var val = $('eventValue') && $('eventValue').value; if (val) payload.value = parseFloat(val);
      addEvent(payload).then(function() { if ($('eventNote')) $('eventNote').value = ''; if ($('eventValue')) $('eventValue').value = ''; closeSheet(); });
    });

    // CLICKER & WHISTLE
    $('clickerBtn') && $('clickerBtn').addEventListener('click', function() {
      playClicker();
      var count = parseInt(localStorage.getItem('dc_clicker_count') || '0') + 1;
      localStorage.setItem('dc_clicker_count', String(count));
      var el = $('clickerBtn'); if (el) { el.classList.add('clicked'); setTimeout(function() { el.classList.remove('clicked'); }, 200); }
    });
    $('whistleBtn') && $('whistleBtn').addEventListener('click', function() {
      playWhistle();
      var el = $('whistleBtn'); if (el) { el.classList.add('clicked'); setTimeout(function() { el.classList.remove('clicked'); }, 600); }
    });

    // Pet form
    $('petProfileForm') && $('petProfileForm').addEventListener('submit', function(e) { e.preventDefault(); savePetProfile({ name: $('petName').value.trim(), birthDate: $('petBirthDate').value, sex: $('petSex').value, breed: $('petBreed').value.trim(), weight: $('petWeight').value, toiletMode: $('petToiletMode').value, issues: ($('petIssues') && $('petIssues').value.trim()) || '' }); });
    $('saveHealthBtn') && $('saveHealthBtn').addEventListener('click', function() { savePetProfile({ lastVaccine: $('petLastVaccine').value, lastDeworming: $('petLastDeworming').value, lastHeat: ($('petLastHeat') && $('petLastHeat').value) || '' }); });
    $('petSex') && $('petSex').addEventListener('change', function() { var f = $('heatDateField'); if (f) f.style.display = $('petSex').value === 'дівчинка' ? '' : 'none'; });

    // Diary filters
    $$('#diaryFilters .chip').forEach(function(btn) { btn.addEventListener('click', function() { currentDiaryFilter = btn.dataset.filter; $$('#diaryFilters .chip').forEach(function(b) { b.classList.toggle('active', b === btn); }); renderFeed('recentLogsDiary', currentDiaryFilter); haptic(); }); });
    // Course filters
    $$('#courseFilters [data-course-level]').forEach(function(btn) { btn.addEventListener('click', function() { currentCourseLevel = btn.dataset.courseLevel; $$('#courseFilters [data-course-level]').forEach(function(b) { b.classList.toggle('active', b === btn); }); renderCourses(); haptic(); }); });

    // Workspace
    $('copyInviteBtn') && $('copyInviteBtn').addEventListener('click', function() { if (!workspaceData || !workspaceData.inviteCode) return; navigator.clipboard.writeText(workspaceData.inviteCode).then(function() { toast('Скопійовано ✓', 'success'); haptic(); }); });
    $('joinWorkspaceForm') && $('joinWorkspaceForm').addEventListener('submit', function(e) { e.preventDefault(); joinWorkspaceByInvite($('inviteCodeInput').value).then(function() { $('inviteCodeInput').value = ''; toast('Приєдналися! 🎉', 'success'); }).catch(function(err) { toast(err.message, 'error'); }); });

    // AI
    $('aiForm') && $('aiForm').addEventListener('submit', function(e) { e.preventDefault(); var input = $('aiInput'); var msg = input.value.trim(); if (!msg) return; input.value = ''; input.style.height = 'auto'; handleAISubmit(msg); });
    $$('[data-ai-prompt]').forEach(function(b) { b.addEventListener('click', function() { handleAISubmit(b.dataset.aiPrompt); haptic(); }); });
    $('clearChatBtn') && $('clearChatBtn').addEventListener('click', function() { var c = $('aiChat'); if (c) c.innerHTML = ''; });
    var aiInput = $('aiInput');
    if (aiInput) { aiInput.addEventListener('input', function() { aiInput.style.height = 'auto'; aiInput.style.height = Math.min(aiInput.scrollHeight, 100) + 'px'; }); aiInput.addEventListener('keydown', function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('aiForm').dispatchEvent(new Event('submit')); } }); }

    // Weekly / Plan
    $('closeWeeklyBtn') && $('closeWeeklyBtn').addEventListener('click', function() { hide($('weeklyReport')); localStorage.setItem('dc_weekly_dismissed', todayKey()); });
    $('refreshPlanBtn') && $('refreshPlanBtn').addEventListener('click', function() { localStorage.removeItem('dc_aiplan'); generateAIPlan(); haptic(); });

    // Push / Timer / Export
    $('enablePushBtn') && $('enablePushBtn').addEventListener('click', requestPushPermission);
    $('exportDataBtn') && $('exportDataBtn').addEventListener('click', exportData);
    $('timerStartBtn') && $('timerStartBtn').addEventListener('click', function() { if (timerRunning) { stopTimer(); } else { startTimer((timerTotal || 60) * (timerTotal ? 1 : 60)); } haptic(); });
    $('timerResetBtn') && $('timerResetBtn').addEventListener('click', function() { resetTimer(); haptic(); });
    $$('[data-timer-preset]').forEach(function(btn) { btn.addEventListener('click', function() { startTimer(parseInt(btn.dataset.timerPreset) * 60); haptic(); }); });

    // Keyboard
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeSheet(); });
    // Resize
    var rt; window.addEventListener('resize', function() { clearTimeout(rt); rt = setTimeout(function() { if (activeTab === 'tabDiary') renderChart('progressChartDiary'); }, 200); });

    bindOnboarding();
    initVoiceInput();
  }

  // ===== BOOT =====
  function bootAuth() {
    auth.onAuthStateChanged(function(user) {
      currentUser = user || null;
      if (!currentUser) { show($('authScreen')); hide($('appContent')); hide($('onboardingScreen')); hideLoading(); return; }
      hide($('authScreen')); showLoading();
      ensureWorkspaceForUser(currentUser).then(function() {
        subscribePet(); subscribeMembers(); subscribeEvents();
        return new Promise(function(resolve) { var unsub = db.collection('workspaces').doc(workspaceId).collection('dogs').doc('primary').onSnapshot(function(s) { currentPet = s.exists ? s.data() : null; unsub(); resolve(); }); });
      }).then(function() {
        if (checkOnboarding()) { hideLoading(); showOnboarding(); }
        else { show($('appContent')); hideLoading(); queueRender(); }
        if ('Notification' in window && Notification.permission === 'granted') subscribeToPush();
      }).catch(function(e) { console.error('Boot:', e); toast('Помилка', 'error'); hideLoading(); show($('authScreen')); });
    });
  }

  bindEvents();
  bootAuth();
  auth.getRedirectResult().catch(function(e) { if (e.code && e.code !== 'auth/no-auth-event') toast('Помилка входу', 'error'); });
})();

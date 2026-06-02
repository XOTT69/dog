/* ===== Dog Coach AI v3 ===== */
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
  let themeMode = localStorage.getItem('dc_theme') || 'light';
  let dailyDone = JSON.parse(localStorage.getItem('dc_daily') || '{}');
  let streakData = JSON.parse(localStorage.getItem('dc_streak') || '{"count":0,"lastDate":""}');
  let renderQueued = false;
  let activeTab = 'tabHome';

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
  var haptic = function() { if (navigator.vibrate) navigator.vibrate(8); };
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
    var badge = $('streakBadge');
    var card = $('streakCard');
    if (streakData.count > 0) {
      if (badge) { show(badge); $('streakCount').textContent = streakData.count; }
      if (card) { show(card); $('streakText').textContent = streakData.count + (streakData.count === 1 ? ' день' : streakData.count < 5 ? ' дні' : ' днів') + ' поспіль!'; $('streakSub').textContent = streakData.count >= 7 ? '🏆 Тижневий рекорд!' : streakData.count >= 3 ? '💪 Чудово!' : 'Так тримати!'; }
    } else {
      if (badge) hide(badge);
      if (card) hide(card);
    }
  }

  function toast(msg, type) {
    var box = $('toastContainer'); if (!box) return;
    var el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg;
    box.appendChild(el);
    requestAnimationFrame(function() { el.classList.add('show'); });
    setTimeout(function() { el.classList.remove('show'); setTimeout(function() { el.remove(); }, 300); }, 2800);
  }

  function setTheme(mode) {
    themeMode = mode === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', themeMode);
    localStorage.setItem('dc_theme', themeMode);
  }

  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(function() { renderQueued = false; renderAll(); });
  }

  function renderHeader() {
    var name = (currentPet && currentPet.name && currentPet.name.trim()) || 'Песик';
    var weeks = getAgeInWeeks(currentPet && currentPet.birthDate);
    var program = getProgramByAge(weeks);
    $('petNameHeader').textContent = name;
    $('headerSub').textContent = weekLabel(weeks) + ' · ' + program.stage;
    $('profileName').textContent = name;
    $('profileMeta').textContent = [(currentPet && currentPet.breed) || 'Порода?', weekLabel(weeks), (currentPet && currentPet.sex) || ''].filter(Boolean).join(' · ');
    var av = $('userAvatar');
    if (av) av.innerHTML = (currentUser && currentUser.photoURL) ? '<img src="' + currentUser.photoURL + '" alt="">' : avatarLetter((currentUser && currentUser.displayName) || name);
  }

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
      if (rate >= 90) tips.push('🎉 ' + rate + '% горшик! Молодці!');
      else if (rate >= 70) tips.push('📈 Горшик ' + rate + '% — прогрес!');
      else if (rate >= 40) tips.push('💪 Горшик ' + rate + '%. Частіше виводьте!');
      else if (t7 > 3) tips.push('🎯 Горшик ' + rate + '%. Менше простору!');
    }
    if (t7 === 0 && eventsState.length < 5) tips.push('📝 Записуйте туалет — побачите патерн!');
    if (tr7 === 0) tips.push('🎓 0 тренувань! 2 хв/день = результат 💪');

    var pool = DAILY_TIPS.filter(function(t) { return t.condition === 'any'; });
    if (weeks != null && weeks < 16) pool = pool.concat(DAILY_TIPS.filter(function(t) { return t.condition === 'puppy'; }));
    if (weeks != null && weeks >= 24 && weeks < 72) pool = pool.concat(DAILY_TIPS.filter(function(t) { return t.condition === 'teen'; }));
    if (sex === 'дівчинка') pool = pool.concat(DAILY_TIPS.filter(function(t) { return t.condition === 'girl'; }));

    if (tips.length > 0) { el.textContent = tips[new Date().getHours() < 12 ? 0 : Math.min(1, tips.length - 1)]; }
    else { el.textContent = (pool[new Date().getDate() % pool.length] && pool[new Date().getDate() % pool.length].text) || 'Записуйте події! 📊'; }
  }

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

  function renderOneTap() {
    var grid = $('onetapGrid'); if (!grid) return;
    var items = [
      { type: 'pee_success', icon: '💛', label: 'Пописяла ✓', cls: 'success' },
      { type: 'pee_miss', icon: '💛', label: 'Пописяла мимо', cls: 'danger' },
      { type: 'poo_success', icon: '💩', label: 'Покакала ✓', cls: 'success' },
      { type: 'poo_miss', icon: '💩', label: 'Покакала мимо', cls: 'danger' },
      { type: 'training', icon: '🎓', label: 'Тренування', cls: '' },
      { type: 'walk', icon: '🚶', label: 'Прогулянка', cls: '' }
    ];
    grid.innerHTML = items.map(function(i) { return '<button type="button" class="onetap-btn ' + i.cls + '" data-onetap="' + i.type + '"><span class="onetap-icon">' + i.icon + '</span>' + i.label + '</button>'; }).join('');
    $$('[data-onetap]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (btn.classList.contains('logged')) return;
        btn.classList.add('logged');
        haptic();
        addEvent({ eventType: btn.dataset.onetap, timeLabel: nowTime() });
        setTimeout(function() { btn.classList.remove('logged'); }, 2000);
      });
    });
  }

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
    content.innerHTML = '<div class="weekly-stat"><span class="ws-label">📊 Подій</span><span class="ws-value">' + tw.length + ch(tw.length, lw.length) + '</span></div>' + (twRate !== null ? '<div class="weekly-stat"><span class="ws-label">🚽 Горшик</span><span class="ws-value">' + twRate + '%' + ch(twRate, lwRate) + '</span></div>' : '') + '<div class="weekly-stat"><span class="ws-label">🎓 Тренувань</span><span class="ws-value">' + twTr + ch(twTr, lwTr) + '</span></div><div class="weekly-stat"><span class="ws-label">🔥 Streak</span><span class="ws-value">' + streakData.count + ' дн.</span></div>' + (twRate !== null && twRate >= 80 ? '<p style="margin-top:0.5rem;font-size:0.85rem;color:var(--success)">🎉 Чудовий тиждень!</p>' : '');
  }

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
    }).catch(function() {
      content.innerHTML = '<p class="text-muted">Натисніть 🔄</p>';
    });
  }

  function renderDailyPlan() {
    var list = $('dailyItems'); var badge = $('dailyProgressBadge'); if (!list || !badge) return;
    var plan = (getProgramByAge(getAgeInWeeks(currentPet && currentPet.birthDate)) || {}).plan || [];
    var key = todayKey(); var done = dailyDone[key] || {};
    badge.textContent = Object.values(done).filter(Boolean).length + '/' + plan.length;
    list.innerHTML = plan.map(function(item, i) { return '<label class="daily-item ' + (done[i] ? 'done' : '') + '"><input type="checkbox" data-daily="' + i + '" ' + (done[i] ? 'checked' : '') + '><span>' + item + '</span></label>'; }).join('');
    $$('[data-daily]').forEach(function(cb) { cb.addEventListener('change', function() { var k = todayKey(); dailyDone[k] = dailyDone[k] || {}; dailyDone[k][cb.dataset.daily] = cb.checked; localStorage.setItem('dc_daily', JSON.stringify(dailyDone)); renderDailyPlan(); }); });
  }

  function renderAgeFocus() {
    var p = getProgramByAge(getAgeInWeeks(currentPet && currentPet.birthDate));
    var box = $('periodFocus'); if (!box) return;
    box.innerHTML = '<div class="plan-item"><strong>🎯 Пріоритети</strong>' + p.priorities.map(function(x) { return '<br>• ' + x; }).join('') + '</div><div class="plan-item"><strong>📋 План</strong>' + p.plan.map(function(x) { return '<br>• ' + x; }).join('') + '</div><div class="plan-item"><strong>💡</strong> ' + p.tip + '</div>';
  }

  function renderHeatInfo() {
    var card = $('heatCard'); var info = $('heatInfo'); var field = $('heatDateField'); if (!card || !info) return;
    var weeks = getAgeInWeeks(currentPet && currentPet.birthDate);
    var monthsAge = weeks != null ? Math.round(weeks / 4.345) : null;
    var size = detectPetSize(); var sizeLabel = getSizeLabel();

    if (currentPet && currentPet.sex === 'хлопчик') {
      card.style.display = ''; if (field) field.style.display = 'none';
      var range = getNeuterAgeRange();
      var h = '<div class="plan-item"><strong>✂️ Кастрація</strong><br>📏 ' + sizeLabel + '<br>📅 ' + range.label + '</div>';
      if (monthsAge != null) {
        if (monthsAge < range.min - 1) h += '<div class="plan-item">🕐 ' + monthsAge + ' міс — рано.</div>';
        else if (monthsAge >= range.min - 1 && monthsAge <= range.max) h += '<div class="plan-item" style="color:var(--accent)">✅ ' + monthsAge + ' міс — час!</div>';
        else h += '<div class="plan-item">ℹ️ Можна будь-коли.</div>';
      }
      h += '<p class="text-muted" style="margin-top:0.5rem;font-size:0.78rem">⚠️ Рішення — з ветеринаром.</p>';
      info.innerHTML = h; return;
    }
    if (!currentPet || !currentPet.sex || currentPet.sex !== 'дівчинка') { card.style.display = 'none'; if (field) field.style.display = 'none'; return; }
    card.style.display = ''; if (field) field.style.display = '';
    var lastHeat = currentPet.lastHeat; var spayRange = getSpayAgeRange();
    var expFirst = { tiny: 6, small: 7, medium: 10, large: 12, giant: 16 }[size] || 10;
    var h2 = '';
    if (lastHeat) {
      var next = new Date(new Date(lastHeat).getTime() + HEAT_INFO.avgCycleDays * 86400000);
      var du = daysBetween(new Date(), next);
      if (du > 30) h2 += '<div class="plan-item">📅 Наступна ~' + next.toLocaleDateString('uk') + ' (' + du + ' дн.) 😌</div>';
      else if (du > 0) h2 += '<div class="plan-item" style="color:var(--warning)">⚠️ Тічка через ~' + du + ' днів!</div>';
      else h2 += '<div class="plan-item" style="color:var(--danger)">🩸 Можливо зараз!</div>';
    } else if (weeks == null) {
      h2 += '<p class="text-muted">Вкажіть дату народження 📅</p>';
    } else {
      var until = expFirst - monthsAge;
      if (monthsAge >= 20) h2 += '<div class="plan-item">❓ Не зафіксована. Ветеринар?</div>';
      else if (until <= 1) h2 += '<div class="plan-item" style="color:var(--warning)">⚠️ Перша скоро! (' + monthsAge + ' міс)</div>';
      else if (until <= 3) h2 += '<div class="plan-item">📅 Через ~' + until + ' міс</div>';
      else h2 += '<div class="plan-item">🕐 Ще далеко (~' + expFirst + ' міс)</div>';
    }
    h2 += '<details style="margin-top:0.75rem"><summary style="cursor:pointer;font-weight:600;font-size:0.85rem">✂️ Стерилізація</summary><div style="margin-top:0.5rem"><div class="plan-item">📏 ' + sizeLabel + ' · 📅 ' + spayRange.label + '</div><div class="plan-item" style="color:var(--danger)">🚫 Не під час тічки!</div><p class="text-muted" style="font-size:0.78rem">⚠️ Рішення — з ветеринаром.</p></div></details>';
    info.innerHTML = h2;
  }

  function renderReminders() {
    var card = $('remindersCard'); var list = $('remindersList'); if (!card || !list) return;
    var rem = (currentPet && currentPet.reminders) || [];
    if (!rem.length) { card.style.display = 'none'; return; }
    card.style.display = ''; var now = new Date();
    list.innerHTML = rem.map(function(r) { var d = new Date(r.nextDate); var days = daysBetween(now, d); var cls = '', txt = ''; if (days < 0) { cls = 'danger'; txt = 'Прострочено (' + Math.abs(days) + ' дн.)'; } else if (days === 0) { cls = 'warning'; txt = 'Сьогодні!'; } else if (days <= 3) { cls = 'warning'; txt = 'Через ' + days + ' дн.'; } else { txt = d.toLocaleDateString('uk'); } return '<div class="feed-item"><div><strong>' + r.label + '</strong><div class="meta ' + cls + '">' + txt + '</div></div></div>'; }).join('');
  }

  function renderWeight() {
    var c = $('weightHistory'); if (!c) return;
    var we = eventsState.filter(function(e) { return e.eventType === 'weight' && e.value; }).slice(0, 20).reverse();
    if (!we.length) { c.innerHTML = '<p class="text-muted">+ → Здоров\'я → ⚖️ Вага</p>'; return; }
    var latest = we[we.length - 1]; var prev = we.length > 1 ? we[we.length - 2] : null;
    var diff = prev ? (latest.value - prev.value).toFixed(1) : null;
    var ds = diff ? (diff > 0 ? '+' + diff + ' кг ↑' : diff < 0 ? diff + ' кг ↓' : '=') : '';
    var dc = diff > 0 ? 'var(--success)' : diff < 0 ? 'var(--warning)' : 'var(--text-muted)';
    var html = '<div class="plan-item" style="margin-bottom:0.75rem"><strong>⚖️ ' + latest.value + ' кг</strong>' + (ds ? '<br><span style="color:' + dc + ';font-size:0.85rem">' + ds + '</span>' : '') + '</div>';
    html += '<canvas id="weightChart" height="120" style="width:100%;margin-bottom:0.5rem"></canvas>';
    html += we.slice().reverse().slice(0, 5).map(function(e) { var d = tsToDate(e.createdAt); return '<div style="display:flex;justify-content:space-between;padding:0.3rem 0;font-size:0.8rem;color:var(--text-secondary);border-bottom:1px solid var(--border-light)"><span>' + (d ? d.toLocaleDateString('uk') : '') + '</span><strong>' + e.value + ' кг</strong></div>'; }).join('');
    c.innerHTML = html;
    requestAnimationFrame(function() { renderWeightChart(we); });
  }

  function renderWeightChart(we) {
    var canvas = $('weightChart'); if (!canvas || !canvas.getContext || we.length < 2) return;
    var rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    var ctx = canvas.getContext('2d'); var dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var w = rect.width, h = rect.height; ctx.clearRect(0, 0, w, h);
    var vals = we.map(function(e) { return e.value; });
    var mn = Math.min.apply(null, vals) - 0.2, mx = Math.max.apply(null, vals) + 0.2, rng = mx - mn || 1;
    var isDark = themeMode === 'dark';
    var lc = isDark ? '#2dd4bf' : '#0f766e'; var gc = isDark ? '#292524' : '#e7e5e4'; var tc = isDark ? '#78716c' : '#a8a29e';
    var pad = { top: 12, right: 8, bottom: 20, left: 36 }; var cw = w - pad.left - pad.right, ch = h - pad.top - pad.bottom;
    ctx.strokeStyle = gc; ctx.lineWidth = 1;
    for (var i = 0; i <= 3; i++) { var y = pad.top + (i / 3) * ch; ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke(); ctx.fillStyle = tc; ctx.font = '10px system-ui'; ctx.textAlign = 'right'; ctx.fillText((mx - (i / 3) * rng).toFixed(1), pad.left - 4, y + 3); }
    var pts = vals.map(function(v, i) { return { x: pad.left + (i / (vals.length - 1)) * cw, y: pad.top + ch - ((v - mn) / rng) * ch }; });
    ctx.beginPath(); ctx.moveTo(pts[0].x, h - pad.bottom); pts.forEach(function(p) { ctx.lineTo(p.x, p.y); }); ctx.lineTo(pts[pts.length - 1].x, h - pad.bottom); ctx.closePath(); ctx.fillStyle = isDark ? 'rgba(45,212,191,0.1)' : 'rgba(15,118,110,0.08)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (var j = 1; j < pts.length; j++) { var cx = (pts[j - 1].x + pts[j].x) / 2; ctx.bezierCurveTo(cx, pts[j - 1].y, cx, pts[j].y, pts[j].x, pts[j].y); } ctx.strokeStyle = lc; ctx.lineWidth = 2; ctx.stroke();
    pts.forEach(function(p, i) { ctx.beginPath(); ctx.arc(p.x, p.y, i === pts.length - 1 ? 5 : 3, 0, Math.PI * 2); ctx.fillStyle = lc; ctx.fill(); });
  }
  function renderFeed(targetId, filter) {
    filter = filter || 'all';
    var list = $(targetId); if (!list) return;
    var filtered = eventsState;
    if (filter !== 'all') {
      var cat = EVENT_CATEGORIES.find(function(c) { return c.id === filter; });
      if (cat) { var types = cat.events.map(function(e) { return e.type; }); filtered = eventsState.filter(function(e) { return types.indexOf(e.eventType) >= 0; }); }
    }
    if (!filtered.length) { list.innerHTML = '<div class="empty">Немає записів. Натисніть + 📝</div>'; return; }
    list.innerHTML = filtered.slice(0, 40).map(function(item) {
      var conf = TYPE_CONFIG[item.eventType] || { icon: '•', label: 'Подія' };
      var d = tsToDate(item.createdAt);
      var timeStr = d ? d.toLocaleString('uk', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
      var valStr = item.value ? ' · ' + item.value + (conf.unit || '') : '';
      return '<div class="feed-item"><div><strong>' + conf.icon + ' ' + conf.label + '</strong><div class="meta">' + timeStr + valStr + (item.note ? ' · ' + item.note : '') + '</div></div><button type="button" class="btn btn-ghost btn-sm" data-delete-event="' + item.id + '">✕</button></div>';
    }).join('');
    $$('#' + targetId + ' [data-delete-event]').forEach(function(btn) {
      btn.addEventListener('click', function() { if (!confirm('Видалити?')) return; deleteEvent(btn.dataset.deleteEvent); });
    });
  }

  function renderChart(canvasId) {
    var canvas = $(canvasId); if (!canvas || !canvas.getContext) return;
    var rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    var ctx = canvas.getContext('2d'); var dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var w = rect.width, h = rect.height; ctx.clearRect(0, 0, w, h);
    var days = [];
    for (var i = 13; i >= 0; i--) {
      var d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      var next = new Date(d); next.setDate(next.getDate() + 1);
      var dayEv = eventsState.filter(function(e) { var ts = tsToDate(e.createdAt); return ts && ts >= d && ts < next; });
      var s = dayEv.filter(function(e) { return isToiletSuccess(e.eventType); }).length;
      var m = dayEv.filter(function(e) { return isToiletMiss(e.eventType); }).length;
      var t = s + m;
      days.push({ date: d, pct: t ? Math.round(s / t * 100) : null });
    }
    var isDark = themeMode === 'dark';
    var accent = isDark ? '#2dd4bf' : '#0f766e';
    var danger = isDark ? '#f87171' : '#dc2626';
    var warning = isDark ? '#fbbf24' : '#d97706';
    var muted = isDark ? '#78716c' : '#a8a29e';
    var border = isDark ? '#292524' : '#e7e5e4';
    var p = { top: 10, right: 4, bottom: 20, left: 4 };
    var cw = w - p.left - p.right, ch = h - p.top - p.bottom, bw = cw / days.length;
    ctx.strokeStyle = border; ctx.lineWidth = 1;
    [0, 50, 100].forEach(function(v) { var y = p.top + ch - (v / 100) * ch; ctx.beginPath(); ctx.moveTo(p.left, y); ctx.lineTo(w - p.right, y); ctx.stroke(); });
    days.forEach(function(day, i) {
      var x = p.left + i * bw + bw * 0.2, barW = bw * 0.6;
      if (day.pct == null) { ctx.fillStyle = muted; ctx.beginPath(); ctx.arc(x + barW / 2, p.top + ch - 3, 2, 0, Math.PI * 2); ctx.fill(); }
      else { var barH = Math.max(3, (day.pct / 100) * ch), y = p.top + ch - barH; ctx.fillStyle = day.pct >= 70 ? accent : day.pct >= 40 ? warning : danger; var r = Math.min(3, barW / 2); ctx.beginPath(); ctx.moveTo(x, y + barH); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.lineTo(x + barW - r, y); ctx.quadraticCurveTo(x + barW, y, x + barW, y + r); ctx.lineTo(x + barW, y + barH); ctx.closePath(); ctx.fill(); }
      if (i % 3 === 0 || i === days.length - 1) { ctx.fillStyle = muted; ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.fillText(day.date.getDate() + '/' + (day.date.getMonth() + 1), x + barW / 2, h - 4); }
    });
  }

  function renderCourses() {
    var grid = $('courseGrid'); var viewer = $('selectedCourse'); if (!grid || !viewer) return;
    var filtered = currentCourseLevel === 'all' ? COURSES : COURSES.filter(function(c) { return c.level === currentCourseLevel; });
    grid.innerHTML = filtered.map(function(c) { return '<button type="button" class="course-btn ' + (c.id === currentCourseId ? 'selected' : '') + '" data-course-id="' + c.id + '"><span class="c-badge">' + c.badge + '</span><strong>' + c.title + '</strong><div class="c-meta">' + c.description + '</div></button>'; }).join('');
    $$('[data-course-id]').forEach(function(btn) { btn.addEventListener('click', function() { currentCourseId = btn.dataset.courseId; renderCourses(); haptic(); }); });
    var course = COURSES.find(function(c) { return c.id === currentCourseId; }) || filtered[0] || COURSES[0];
    if (!course) { viewer.innerHTML = ''; return; }
    viewer.innerHTML = '<div class="course-detail"><h3>' + course.title + '</h3><p style="color:var(--text-secondary);margin-bottom:1rem">' + course.description + '</p><h4>Кроки</h4><ul>' + course.steps.map(function(s) { return '<li>' + s + '</li>'; }).join('') + '</ul><h4>Помилки</h4><ul class="mistakes">' + course.mistakes.map(function(s) { return '<li>' + s + '</li>'; }).join('') + '</ul><h4>Чекліст</h4><ul class="checks">' + course.checklist.map(function(s) { return '<li>' + s + '</li>'; }).join('') + '</ul></div>';
  }

  function renderKnowledge() { var g = $('knowledgeGrid'); if (g) g.innerHTML = KNOWLEDGE.map(function(k) { return '<div class="k-card"><strong>' + k.title + '</strong><p>' + k.text + '</p><span class="k-tag">' + k.tag + '</span></div>'; }).join(''); }

  function renderSocial() {
    var grid = $('socialGrid'); if (!grid) return;
    var done = JSON.parse(localStorage.getItem('dc_social') || '{}');
    grid.innerHTML = SOCIAL_ITEMS.map(function(group) { return '<div class="social-group"><h5 class="social-group-title">' + group.category + '</h5>' + group.items.map(function(item) { var key = group.category + ':' + item; return '<label class="social-item"><input type="checkbox" data-social-key="' + key + '" ' + (done[key] ? 'checked' : '') + '><span>' + item + '</span></label>'; }).join('') + '</div>'; }).join('');
    $$('[data-social-key]').forEach(function(cb) { cb.addEventListener('change', function() { var d = JSON.parse(localStorage.getItem('dc_social') || '{}'); d[cb.dataset.socialKey] = cb.checked; localStorage.setItem('dc_social', JSON.stringify(d)); }); });
  }

  function renderToiletGuide() { var g = $('toiletGuide'); if (g) g.innerHTML = TOILET_GUIDE.map(function(s) { return '<div class="k-card"><strong>' + s.title + '</strong><p>' + s.text + '</p></div>'; }).join(''); }
  function renderMembers() { var list = $('membersList'); if (!list) return; list.innerHTML = membersState.length ? membersState.map(function(m) { return '<div class="member-chip"><div class="m-avatar">' + (m.photoURL ? '<img src="' + m.photoURL + '" alt="">' : avatarLetter(m.displayName)) + '</div><span>' + (m.displayName || 'Учасник') + '</span></div>'; }).join('') : '<div class="empty">Поки тільки ви 👤</div>'; }
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
      if ('Notification' in window && Notification.permission === 'granted') ps.textContent = '✅ Увімкнені';
      else if ('Notification' in window && Notification.permission === 'denied') ps.textContent = '❌ Заблоковані в браузері';
      else ps.textContent = '';
    }
  }

  function renderSheetCategories() {
    var c = $('sheetCategories'); if (!c) return;
    c.innerHTML = EVENT_CATEGORIES.map(function(cat) { return '<button type="button" class="chip ' + (cat.id === selectedSheetCategory ? 'active' : '') + '" data-sheet-cat="' + cat.id + '">' + cat.icon + ' ' + cat.name + '</button>'; }).join('');
    $$('[data-sheet-cat]').forEach(function(btn) { btn.addEventListener('click', function() { selectedSheetCategory = btn.dataset.sheetCat; selectedEventType = null; renderSheetCategories(); renderSheetEvents(); hide($('sheetExtraFields')); }); });
  }

  function renderSheetEvents() {
    var c = $('sheetEvents'); if (!c) return;
    var cat = EVENT_CATEGORIES.find(function(x) { return x.id === selectedSheetCategory; }); if (!cat) return;
    c.innerHTML = '<div class="actions-grid">' + cat.events.map(function(ev) { return '<button type="button" class="action-btn ' + (selectedEventType === ev.type ? 'selected' : '') + ' ' + (ev.tone === 'success' ? 'green' : ev.tone === 'danger' ? 'red' : 'neutral') + '" data-sheet-event="' + ev.type + '"><span class="action-icon">' + ev.icon + '</span>' + ev.label + '</button>'; }).join('') + '</div>';
    $$('[data-sheet-event]').forEach(function(btn) { btn.addEventListener('click', function() { selectedEventType = btn.dataset.sheetEvent; renderSheetEvents(); show($('sheetExtraFields')); $('eventTime').value = nowTime(); var conf = TYPE_CONFIG[selectedEventType]; var vf = $('valueField'); if (vf) vf.style.display = (conf && conf.hasValue) ? '' : 'none'; haptic(); }); });
  }

  function renderAll() {
    renderHeader(); renderStreak(); renderWeeklyReport(); renderDailyTip(); renderKpis(); renderOneTap();
    renderDailyPlan(); renderAgeFocus(); renderHeatInfo(); renderReminders();
    renderFeed('recentLogs'); renderFeed('recentLogsDiary', currentDiaryFilter); renderWeight();
    renderCourses(); renderKnowledge(); renderSocial(); renderToiletGuide();
    renderMembers(); renderWorkspaceMeta(); fillPetForm();
    if (activeTab === 'tabDiary') requestAnimationFrame(function() { renderChart('progressChartDiary'); });
    generateAIPlan();
  }

  function setActiveTab(id) { activeTab = id; $$('.tab').forEach(function(p) { p.classList.toggle('active', p.id === id); }); $$('.nav-item').forEach(function(b) { b.classList.toggle('active', b.dataset.tab === id); }); if (id === 'tabProfile') hide($('fabAddEvent')); else show($('fabAddEvent')); if (id === 'tabDiary') requestAnimationFrame(function() { renderChart('progressChartDiary'); }); }
  function openSheet() { show($('eventSheet')); selectedEventType = null; selectedSheetCategory = 'toilet'; renderSheetCategories(); renderSheetEvents(); hide($('sheetExtraFields')); }
  function closeSheet() { hide($('eventSheet')); }

  function savePetProfile(payload) {
    if (!currentUser || !workspaceId) { toast('Увійдіть', 'error'); return Promise.resolve(); }
    showLoading();
    return db.collection('workspaces').doc(workspaceId).collection('dogs').doc('primary').set(
      Object.assign({}, currentPet || {}, payload, { updatedAt: firebase.firestore.FieldValue.serverTimestamp() }), { merge: true }
    ).then(function() { toast('Збережено ✓', 'success'); }).catch(function(e) { console.error(e); toast('Помилка', 'error'); }).finally(function() { hideLoading(); });
  }

  function addEvent(payload) {
    if (!currentUser || !workspaceId) { toast('Увійдіть', 'error'); return Promise.resolve(); }
    var data = { eventType: payload.eventType, byUid: currentUser.uid, byName: currentUser.displayName || 'Я', note: payload.note || '', timeLabel: payload.timeLabel || nowTime(), createdAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (payload.value) data.value = payload.value;
    return db.collection('workspaces').doc(workspaceId).collection('events').add(data).then(function() { toast('Додано ✓', 'success'); haptic(); }).catch(function(e) { console.error(e); toast('Помилка', 'error'); });
  }

  function deleteEvent(id) {
    if (!workspaceId || !id) return Promise.resolve();
    return db.collection('workspaces').doc(workspaceId).collection('events').doc(id).delete().then(function() { toast('Видалено', 'success'); }).catch(function(e) { console.error(e); toast('Помилка', 'error'); });
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
      if (snap.empty) throw new Error('Не знайдено');
      workspaceId = snap.docs[0].id; workspaceData = snap.docs[0].data();
      return db.collection('users').doc(currentUser.uid).set({ uid: currentUser.uid, email: currentUser.email || '', displayName: currentUser.displayName || '', photoURL: currentUser.photoURL || '', role: 'member', workspaceId: workspaceId }, { merge: true });
    }).then(function() {
      return db.collection('workspaces').doc(workspaceId).collection('members').doc(currentUser.uid).set({ uid: currentUser.uid, email: currentUser.email || '', displayName: currentUser.displayName || '', photoURL: currentUser.photoURL || '', role: 'member', createdAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }).then(function() { subscribePet(); subscribeMembers(); subscribeEvents(); queueRender(); });
  }

  function subscribePet() { if (unsubPet) unsubPet(); unsubPet = db.collection('workspaces').doc(workspaceId).collection('dogs').doc('primary').onSnapshot(function(s) { currentPet = s.exists ? s.data() : null; queueRender(); }); }
  function subscribeMembers() { if (unsubMembers) unsubMembers(); unsubMembers = db.collection('workspaces').doc(workspaceId).collection('members').onSnapshot(function(s) { membersState = []; s.forEach(function(d) { membersState.push(d.data()); }); renderMembers(); }); }
  function subscribeEvents() { if (unsubEvents) unsubEvents(); unsubEvents = db.collection('workspaces').doc(workspaceId).collection('events').orderBy('createdAt', 'desc').limit(300).onSnapshot(function(s) { eventsState = []; s.forEach(function(d) { eventsState.push(Object.assign({ id: d.id }, d.data())); }); queueRender(); }); }

  function loginGoogle() {
    showLoading();
    return auth.signInWithPopup(googleProvider).catch(function(e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user') { return auth.signInWithRedirect(googleProvider); }
      else if (e.code === 'auth/unauthorized-domain') toast('Домен не авторизовано', 'error');
      else toast(e.message || 'Помилка', 'error');
    }).finally(function() { hideLoading(); });
  }

  function logout() {
    if (unsubEvents) unsubEvents(); if (unsubMembers) unsubMembers(); if (unsubPet) unsubPet();
    unsubEvents = unsubMembers = unsubPet = null;
    return auth.signOut().then(function() { currentUser = null; workspaceId = null; workspaceData = null; currentPet = null; eventsState = []; membersState = []; hide($('appContent')); show($('authScreen')); });
  }

  function addChatMessage(text, type) { var chat = $('aiChat'); if (!chat) return; var msg = document.createElement('div'); msg.className = 'ai-msg ' + type; msg.textContent = text; chat.appendChild(msg); chat.scrollTop = chat.scrollHeight; }
  function showTyping() { var chat = $('aiChat'); if (!chat) return; var el = document.createElement('div'); el.className = 'ai-msg loading'; el.id = 'typingIndicator'; el.textContent = 'Думаю...'; chat.appendChild(el); chat.scrollTop = chat.scrollHeight; }
  function removeTyping() { var el = $('typingIndicator'); if (el) el.remove(); }

  function fetchAIResponse(prompt) {
    var weeks = getAgeInWeeks(currentPet && currentPet.birthDate);
    var issues = (currentPet && currentPet.issues) || '';
    var petInfo = currentPet ? 'Собака: ' + (currentPet.name || '?') + ', ' + weekLabel(weeks) + ', ' + (currentPet.breed || '?') + ', ' + getSizeLabel() + (issues ? ', проблеми: ' + issues : '') : '';
    var sys = 'Ти — професійний український кінолог (15р).\nПРАВИЛА:\n1. ТІЛЬКИ українською.\n2. 4-5 речень.\n3. До 3 міс — адаптація.\n4. Без покарань.\n5. Пронумеровані кроки.\n\n' + petInfo;
    return fetch('/api/proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'groq/llama-3.3-70b-versatile', messages: [{ role: 'system', content: sys }, { role: 'user', content: prompt }], temperature: 0.2, max_tokens: 400, stream: false }) })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(data) {
      if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
        var t = data.choices[0].message.content.trim().replace(/[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef]/g, '').replace(/\s{2,}/g, ' ').trim();
        return t || getLocalFallback(prompt);
      }
      throw new Error('Empty');
    }).catch(function(e) { console.warn('AI:', e.message); return getLocalFallback(prompt); });
  }

  function getLocalFallback(prompt) {
    var l = prompt.toLowerCase();
    if (l.indexOf('команд') >= 0 || l.indexOf('сідати') >= 0) return '1) Ласощі біля носа. 2) Руку вгору — сяде. 3) "Так!" + ласощі. 4) 5-8 разів/день.';
    if (l.indexOf('гриз') >= 0) return '1) Приберіть. 2) Жувальне. 3) Своє — маркер. 4) Чуже — замініть.';
    if (l.indexOf('гавк') >= 0) return '1) Причина? 2) Не кричіть. 3) Пауза → маркер. 4) Навантаження.';
    if (l.indexOf('пелюшк') >= 0 || l.indexOf('туалет') >= 0) return '1) Менше простору. 2) Після сну/їжі. 3) "Так!" 4) Промах — тихо.';
    if (l.indexOf('повідець') >= 0 || l.indexOf('тягне') >= 0) return '1) Тягне = стоп. 2) Вільний = йдемо. 3) Ласощі біля ноги.';
    if (l.indexOf('кусає') >= 0) return '1) Завмріть. 2) Пауза. 3) Іграшку. 4) Вийдіть.';
    var prog = getProgramByAge(getAgeInWeeks(currentPet && currentPet.birthDate));
    return (prog && prog.tip) || 'Запитайте конкретніше! 🐾';
  }

  function handleAISubmit(prompt) {
    if (!prompt.trim()) return;
    addChatMessage(prompt, 'user'); showTyping();
    fetchAIResponse(prompt).then(function(r) { removeTyping(); addChatMessage(r, 'assistant'); }).catch(function() { removeTyping(); addChatMessage('Помилка 🔄', 'assistant'); });
  }

  function requestPushPermission() {
    if (!('Notification' in window)) { toast('Не підтримується', 'error'); return; }
    Notification.requestPermission().then(function(perm) {
      if (perm === 'granted') { subscribeToPush(); toast('Увімкнені! 🔔', 'success'); }
      else { toast('Відхилено', 'error'); }
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
        if (token && currentUser && workspaceId) {
          db.collection('workspaces').doc(workspaceId).collection('members').doc(currentUser.uid).update({ pushToken: token });
        }
      }).catch(function(e) { console.warn('Push:', e); });
    } catch (e) { console.warn('Push:', e); }
  }

  function scheduleLocalReminder(minutes, title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    setTimeout(function() { new Notification(title, { body: body, icon: '/icons/icon-192.png' }); }, minutes * 60 * 1000);
  }

  // Onboarding
  function showOnboarding() { hide($('authScreen')); hide($('appContent')); show($('onboardingScreen')); }
  function hideOnboarding() { hide($('onboardingScreen')); show($('appContent')); }
  function setOnboardingStep(step) { $$('.onboarding-step').forEach(function(s) { s.classList.add('hidden'); }); show($('onboardingStep' + step)); $$('.ob-dot').forEach(function(d) { d.classList.toggle('active', parseInt(d.dataset.step) === step); }); }
  function checkOnboarding() { if (localStorage.getItem('dc_onboarded')) return false; if (currentPet && currentPet.name && currentPet.name.trim()) { localStorage.setItem('dc_onboarded', 'true'); return false; } return true; }

  function bindOnboarding() {
    $('obNext1') && $('obNext1').addEventListener('click', function() { if (!$('obName').value.trim()) { toast('Введіть ім\'я 🐾', 'error'); return; } setOnboardingStep(2); });
    $('obBack2') && $('obBack2').addEventListener('click', function() { setOnboardingStep(1); });
    $('obNext2') && $('obNext2').addEventListener('click', function() { setOnboardingStep(3); });
    $('obBack3') && $('obBack3').addEventListener('click', function() { setOnboardingStep(2); });
    $('obFinish') && $('obFinish').addEventListener('click', function() {
      showLoading();
      savePetProfile({ name: $('obName').value.trim(), birthDate: $('obBirthDate').value, sex: $('obSex').value, breed: $('obBreed').value.trim() }).then(function() {
        localStorage.setItem('dc_onboarded', 'true'); hideOnboarding(); toast(($('obName').value.trim()) + ' додано! 🎉', 'success'); queueRender();
      }).catch(function() { toast('Помилка', 'error'); }).finally(function() { hideLoading(); });
    });
  }

  function bindEvents() {
    setTheme(themeMode);
    $$('[data-theme-toggle]').forEach(function(b) { b.addEventListener('click', function() { setTheme(themeMode === 'dark' ? 'light' : 'dark'); haptic(); }); });
    $('googleLoginBtn') && $('googleLoginBtn').addEventListener('click', loginGoogle);
    $('logoutBtn') && $('logoutBtn').addEventListener('click', logout);
    $$('.nav-item').forEach(function(b) { b.addEventListener('click', function() { setActiveTab(b.dataset.tab); haptic(); }); });
    $('fabAddEvent') && $('fabAddEvent').addEventListener('click', openSheet);
    $('sheetBackdrop') && $('sheetBackdrop').addEventListener('click', closeSheet);
    $('showAllActionsBtn') && $('showAllActionsBtn').addEventListener('click', openSheet);

    $('saveEventBtn') && $('saveEventBtn').addEventListener('click', function() {
      if (!selectedEventType) { toast('Оберіть тип', 'error'); return; }
      var payload = { eventType: selectedEventType, timeLabel: ($('eventTime') && $('eventTime').value) || nowTime(), note: ($('eventNote') && $('eventNote').value && $('eventNote').value.trim()) || '' };
      var val = $('eventValue') && $('eventValue').value; if (val) payload.value = parseFloat(val);
      addEvent(payload).then(function() {
        if (['meal_morning', 'meal_day', 'meal_evening'].indexOf(payload.eventType) >= 0) scheduleLocalReminder(20, '🚽 Горшик!', 'Після їжі — час на пелюшку!');
        if (payload.eventType === 'sleep') scheduleLocalReminder(5, '🚽 Прокинувся!', 'Одразу на пелюшку!');
        if ($('eventNote')) $('eventNote').value = '';
        if ($('eventValue')) $('eventValue').value = '';
        closeSheet();
      });
    });

    $('petProfileForm') && $('petProfileForm').addEventListener('submit', function(e) { e.preventDefault(); savePetProfile({ name: $('petName').value.trim(), birthDate: $('petBirthDate').value, sex: $('petSex').value, breed: $('petBreed').value.trim(), weight: $('petWeight').value, toiletMode: $('petToiletMode').value, issues: ($('petIssues') && $('petIssues').value && $('petIssues').value.trim()) || '' }); });
    $('saveHealthBtn') && $('saveHealthBtn').addEventListener('click', function() { savePetProfile({ lastVaccine: $('petLastVaccine').value, lastDeworming: $('petLastDeworming').value, lastHeat: ($('petLastHeat') && $('petLastHeat').value) || '' }); });
    $('petSex') && $('petSex').addEventListener('change', function() { var f = $('heatDateField'); if (f) f.style.display = $('petSex').value === 'дівчинка' ? '' : 'none'; });

    $$('#diaryFilters .chip').forEach(function(btn) { btn.addEventListener('click', function() { currentDiaryFilter = btn.dataset.filter; $$('#diaryFilters .chip').forEach(function(b) { b.classList.toggle('active', b === btn); }); renderFeed('recentLogsDiary', currentDiaryFilter); }); });
    $$('#courseFilters [data-course-level]').forEach(function(btn) { btn.addEventListener('click', function() { currentCourseLevel = btn.dataset.courseLevel; $$('#courseFilters [data-course-level]').forEach(function(b) { b.classList.toggle('active', b === btn); }); renderCourses(); }); });

    $('copyInviteBtn') && $('copyInviteBtn').addEventListener('click', function() { if (!workspaceData || !workspaceData.inviteCode) return; navigator.clipboard.writeText(workspaceData.inviteCode).then(function() { toast('Скопійовано ✓', 'success'); }).catch(function() { toast('Помилка', 'error'); }); });
    $('joinWorkspaceForm') && $('joinWorkspaceForm').addEventListener('submit', function(e) { e.preventDefault(); joinWorkspaceByInvite($('inviteCodeInput').value).then(function() { $('inviteCodeInput').value = ''; toast('Приєдналися! 🎉', 'success'); }).catch(function(err) { toast(err.message, 'error'); }); });

    $('aiForm') && $('aiForm').addEventListener('submit', function(e) { e.preventDefault(); var input = $('aiInput'); var msg = input.value.trim(); if (!msg) return; input.value = ''; input.style.height = 'auto'; handleAISubmit(msg); });
    $$('[data-ai-prompt]').forEach(function(b) { b.addEventListener('click', function() { handleAISubmit(b.dataset.aiPrompt); haptic(); }); });
    $('clearChatBtn') && $('clearChatBtn').addEventListener('click', function() { var c = $('aiChat'); if (c) c.innerHTML = ''; });

    var aiInput = $('aiInput');
    if (aiInput) aiInput.addEventListener('input', function() { aiInput.style.height = 'auto'; aiInput.style.height = Math.min(aiInput.scrollHeight, 100) + 'px'; });
    if (aiInput) aiInput.addEventListener('keydown', function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('aiForm').dispatchEvent(new Event('submit')); } });

    $('closeWeeklyBtn') && $('closeWeeklyBtn').addEventListener('click', function() { hide($('weeklyReport')); localStorage.setItem('dc_weekly_dismissed', todayKey()); });
    $('refreshPlanBtn') && $('refreshPlanBtn').addEventListener('click', function() { localStorage.removeItem('dc_aiplan'); generateAIPlan(); });
    $('enablePushBtn') && $('enablePushBtn').addEventListener('click', requestPushPermission);

    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeSheet(); });
    var rt; window.addEventListener('resize', function() { clearTimeout(rt); rt = setTimeout(function() { if (activeTab === 'tabDiary') renderChart('progressChartDiary'); }, 200); });

    bindOnboarding();
  }

  function bootAuth() {
    auth.onAuthStateChanged(function(user) {
      currentUser = user || null;
      if (!currentUser) { show($('authScreen')); hide($('appContent')); hide($('onboardingScreen')); return; }
      hide($('authScreen')); showLoading();
      ensureWorkspaceForUser(currentUser).then(function() {
        subscribePet(); subscribeMembers(); subscribeEvents();
        return new Promise(function(resolve) {
          var unsub = db.collection('workspaces').doc(workspaceId).collection('dogs').doc('primary').onSnapshot(function(s) {
            currentPet = s.exists ? s.data() : null; unsub(); resolve();
          });
        });
      }).then(function() {
        if (checkOnboarding()) { hideLoading(); showOnboarding(); }
        else { show($('appContent')); hideLoading(); queueRender(); }
        if ('Notification' in window && Notification.permission === 'granted') subscribeToPush();
      }).catch(function(e) { console.error('Boot:', e); toast('Помилка', 'error'); hideLoading(); });
    });
  }

  bindEvents();
  bootAuth();
  auth.getRedirectResult().then(function(r) { if (r && r.user) console.log('OK'); }).catch(function(e) { if (e.code && e.code !== 'auth/no-auth-event') toast('Помилка входу', 'error'); });

})();

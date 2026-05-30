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
var obMode = 'pad';

function $(id) { return document.getElementById(id); }
function $$(s) { return document.querySelectorAll(s); }
function haptic() { if (navigator.vibrate) navigator.vibrate(10); }
function nowTime() { return new Date().toTimeString().slice(0, 5); }
function createInviteCode() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }
function avatarText(n) { return ((n || 'U').trim()[0] || 'U').toUpperCase(); }
function todayStart() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function getAgeInWeeks(bd) { if (!bd) return null; var d = Date.now() - new Date(bd).getTime(); return isNaN(d) || d < 0 ? null : Math.floor(d / 604800000); }
function getAgeLabel(w) { if (w == null) return ''; return w < 8 ? w + ' тиж.' : w < 52 ? Math.floor(w / 4.345) + ' міс.' : (w / 52).toFixed(1) + ' р.'; }
function getProgramByAge(w) { if (w == null) return AGE_PROGRAMS[1]; return AGE_PROGRAMS.find(function(p) { return w >= p.minWeeks && w < p.maxWeeks; }) || AGE_PROGRAMS[AGE_PROGRAMS.length - 1]; }

function showToast(msg, type) {
  var c = $('toastContainer'), t = document.createElement('div');
  t.className = 'toast ' + (type || '');
  t.textContent = msg;
  c.appendChild(t);
  requestAnimationFrame(function() { t.classList.add('show'); });
  setTimeout(function() { t.classList.remove('show'); setTimeout(function() { t.remove(); }, 300); }, 3000);
}

function confetti() {
  var canvas = $('confettiCanvas'), colors = ['#0e766e', '#eab308', '#ef4444', '#3b82f6', '#a855f7', '#f97316'];
  for (var i = 0; i < 40; i++) {
    var p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.left = Math.random() * 100 + '%';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.animationDelay = Math.random() * .6 + 's';
    p.style.animationDuration = 2.5 + Math.random() * 1.5 + 's';
    p.style.width = (5 + Math.random() * 6) + 'px';
    p.style.height = (5 + Math.random() * 6) + 'px';
    canvas.appendChild(p);
  }
  setTimeout(function() { canvas.innerHTML = ''; }, 4500);
}

/* ═══ Onboarding ═══ */
function showOnboarding() {
  $('onboarding').classList.remove('hidden');
  $('authScreen').classList.add('hidden');
}

function finishOnboarding() {
  var name = $('obName').value.trim() || '';
  var birth = $('obBirth').value || '';
  $('onboarding').classList.add('hidden');
  $('appContent').classList.remove('hidden');
  localStorage.setItem('ob_done', '1');
  if (name || birth || obMode !== 'pad') {
    savePetProfile({ name: name, birthDate: birth, toiletMode: obMode });
  }
  confetti();
}

function bindOnboarding() {
  $('obNext1').addEventListener('click', function() {
    $$('.ob-screen').forEach(function(s) { s.classList.remove('active'); });
    $('ob2').classList.add('active');
    $$('.ob-dot').forEach(function(d, i) { d.classList.toggle('active', i === 1); });
  });
  $('obNext2').addEventListener('click', function() {
    $$('.ob-screen').forEach(function(s) { s.classList.remove('active'); });
    $('ob3').classList.add('active');
    $$('.ob-dot').forEach(function(d, i) { d.classList.toggle('active', i === 2); });
  });
  $$('.ob-option').forEach(function(btn) {
    btn.addEventListener('click', function() {
      $$('.ob-option').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      obMode = btn.dataset.mode;
    });
  });
  $('obFinish').addEventListener('click', finishOnboarding);
}

/* ═══ Auth ═══ */
function updateAuthUI(loggedIn) {
  $('authScreen').classList.toggle('hidden', loggedIn);
  $('appContent').classList.toggle('hidden', !loggedIn);
  $('logoutBtn').style.display = loggedIn ? '' : 'none';
}

function setActiveTab(id) {
  $$('.tab-panel').forEach(function(p) { p.classList.toggle('active', p.id === id); });
  $$('.nav-tab').forEach(function(b) { b.classList.toggle('active', b.dataset.tab === id); });
  haptic();
}

function openSheet() { $('eventSheet').classList.remove('hidden'); $('eventTime').value = nowTime(); }
function closeSheet() { $('eventSheet').classList.add('hidden'); }

/* ═══ Chart ═══ */
function renderChart() {
  var canvas = $('progressChart');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;
  var rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  var w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);

  // Get last 14 days data
  var days = [];
  for (var i = 13; i >= 0; i--) {
    var d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
    var next = new Date(d); next.setDate(next.getDate() + 1);
    var dayEvents = eventsState.filter(function(e) {
      if (!e.createdAt) return false;
      var ts = e.createdAt.toDate ? e.createdAt.toDate() : new Date(e.createdAt);
      return ts >= d && ts < next;
    });
    var success = dayEvents.filter(function(e) { return e.eventType === 'pad' || e.eventType === 'outdoor'; }).length;
    var miss = dayEvents.filter(function(e) { return e.eventType === 'miss'; }).length;
    var total = success + miss;
    days.push({ date: d, pct: total > 0 ? Math.round((success / total) * 100) : null, success: success, miss: miss });
  }

  var padding = { top: 15, bottom: 20, left: 5, right: 5 };
  var chartW = w - padding.left - padding.right;
  var chartH = h - padding.top - padding.bottom;
  var barW = chartW / 14;

  // Grid lines
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--line').trim();
  ctx.lineWidth = .5;
  [0, 50, 100].forEach(function(v) {
    var y = padding.top + chartH - (v / 100 * chartH);
    ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(w - padding.right, y); ctx.stroke();
  });

  // Bars
  var primary = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
  var danger = getComputedStyle(document.documentElement).getPropertyValue('--danger').trim();
  var faint = getComputedStyle(document.documentElement).getPropertyValue('--faint').trim();

  days.forEach(function(day, i) {
    var x = padding.left + i * barW + barW * .2;
    var bw = barW * .6;
    if (day.pct === null) {
      // No data - small gray dot
      ctx.fillStyle = faint;
      ctx.beginPath();
      ctx.arc(padding.left + i * barW + barW / 2, padding.top + chartH - 3, 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      var barH = Math.max(3, (day.pct / 100) * chartH);
      var y = padding.top + chartH - barH;
      var color = day.pct >= 70 ? primary : day.pct >= 40 ? '#d97706' : danger;
      ctx.fillStyle = color;
      ctx.beginPath();
      var r = Math.min(3, bw / 2);
      ctx.moveTo(x, y + barH);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.lineTo(x + bw - r, y);
      ctx.quadraticCurveTo(x + bw, y, x + bw, y + r);
      ctx.lineTo(x + bw, y + barH);
      ctx.closePath();
      ctx.fill();
    }
    // Day label
    if (i % 3 === 0 || i === 13) {
      ctx.fillStyle = faint;
      ctx.font = '9px system-ui';
      ctx.textAlign = 'center';
      var label = day.date.getDate() + '/' + (day.date.getMonth() + 1);
      ctx.fillText(label, padding.left + i * barW + barW / 2, h - 4);
    }
  });
}

/* ═══ Smart Suggestions ═══ */
function renderSuggestion() {
  var card = $('suggestionCard');
  var text = $('suggestionText');
  if (eventsState.length < 5) { card.classList.add('hidden'); return; }

  var start = todayStart();
  var last7 = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
    var next = new Date(d); next.setDate(next.getDate() + 1);
    var dayEvents = eventsState.filter(function(e) { if (!e.createdAt) return false; var ts = e.createdAt.toDate ? e.createdAt.toDate() : new Date(e.createdAt); return ts >= d && ts < next; });
    last7.push(dayEvents);
  }

  // Analyze triggers for misses
  var missTriggers = {};
  eventsState.filter(function(e) { return e.eventType === 'miss' && e.trigger; }).forEach(function(e) {
    missTriggers[e.trigger] = (missTriggers[e.trigger] || 0) + 1;
  });
  var topTrigger = Object.entries(missTriggers).sort(function(a, b) { return b[1] - a[1]; })[0];

  // Analyze time patterns
  var missHours = eventsState.filter(function(e) { return e.eventType === 'miss' && e.timeLabel; }).map(function(e) { return parseInt(e.timeLabel.split(':')[0]); });
  var avgMissHour = missHours.length > 2 ? Math.round(missHours.reduce(function(a, b) { return a + b; }, 0) / missHours.length) : null;

  // Calculate weekly success rate
  var allToilet = eventsState.filter(function(e) { return e.eventType === 'pad' || e.eventType === 'outdoor' || e.eventType === 'miss'; });
  var recent = allToilet.slice(0, 20);
  var successRate = recent.length > 0 ? Math.round(recent.filter(function(e) { return e.eventType !== 'miss'; }).length / recent.length * 100) : 0;

  var suggestion = '';
  if (successRate >= 80 && recent.length >= 10) {
    suggestion = '🎉 Чудовий прогрес! ' + successRate + '% успіху за останні записи. Можна спробувати трохи розширити територію.';
  } else if (topTrigger && topTrigger[1] >= 3) {
    suggestion = 'Промахи найчастіше "' + topTrigger[0] + '" (' + topTrigger[1] + ' разів). Спробуйте вести на місце ПЕРЕД цим моментом.';
  } else if (avgMissHour !== null) {
    suggestion = 'Промахи частіше бувають ~' + avgMissHour + ':00. Будьте особливо уважні в цей час!';
  } else if (successRate < 50 && recent.length >= 5) {
    suggestion = 'Успішність ' + successRate + '%. Спробуйте зменшити вільну територію і частіше підводити до місця.';
  } else {
    suggestion = getProgramByAge(getAgeInWeeks(currentPet ? currentPet.birthDate : null)).tip;
  }

  card.classList.remove('hidden');
  text.textContent = suggestion;
}

/* ═══ Weekly Report ═══ */
function renderWeeklyReport() {
  var card = $('weeklyCard');
  var content = $('weeklyContent');
  // Show on Mondays or if 7+ days of data
  var today = new Date();
  var isMonday = today.getDay() === 1;
  var dismissed = localStorage.getItem('weekly_dismissed_' + today.toISOString().slice(0, 10));
  if (dismissed || eventsState.length < 7) { card.classList.add('hidden'); return; }
  if (!isMonday && eventsState.length < 20) { card.classList.add('hidden'); return; }

  var weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7); weekStart.setHours(0, 0, 0, 0);
  var weekEvents = eventsState.filter(function(e) { if (!e.createdAt) return false; var ts = e.createdAt.toDate ? e.createdAt.toDate() : new Date(e.createdAt); return ts >= weekStart; });
  var toilet = weekEvents.filter(function(e) { return e.eventType === 'pad' || e.eventType === 'outdoor' || e.eventType === 'miss'; });
  var success = toilet.filter(function(e) { return e.eventType !== 'miss'; }).length;
  var total = toilet.length;
  var pct = total > 0 ? Math.round(success / total * 100) : 0;

  // Previous week for comparison
  var prevStart = new Date(weekStart); prevStart.setDate(prevStart.getDate() - 7);
  var prevEvents = eventsState.filter(function(e) { if (!e.createdAt) return false; var ts = e.createdAt.toDate ? e.createdAt.toDate() : new Date(e.createdAt); return ts >= prevStart && ts < weekStart; });
  var prevToilet = prevEvents.filter(function(e) { return e.eventType === 'pad' || e.eventType === 'outdoor' || e.eventType === 'miss'; });
  var prevPct = prevToilet.length > 0 ? Math.round(prevToilet.filter(function(e) { return e.eventType !== 'miss'; }).length / prevToilet.length * 100) : null;

  var diff = prevPct !== null ? pct - prevPct : null;
  var diffText = diff !== null ? (diff > 0 ? '+' + diff + '%' : diff + '%') : '—';
  var highlight = pct >= 80 ? '🏆 Відмінний тиждень!' : pct >= 60 ? '👍 Непогано, рухаємось!' : '💪 Продовжуйте, звички формуються!';

  card.classList.remove('hidden');
  content.innerHTML = '<div class="weekly-stat"><span>Успішність</span><strong>' + pct + '%</strong></div><div class="weekly-stat"><span>Записів</span><strong>' + weekEvents.length + '</strong></div><div class="weekly-stat"><span>vs минулий тиждень</span><strong>' + diffText + '</strong></div><div class="weekly-highlight">' + highlight + '</div>';
}

/* ═══ Render Home ═══ */
function renderHome() {
  renderKPIs();
  renderProgressRing();
  renderStreak();
  renderDailyChecklist();
  renderTip();
  renderFeed();
  renderHeaderInfo();
  renderChart();
  renderSuggestion();
  renderWeeklyReport();
}

function renderHeaderInfo() {
  var name = (currentPet && currentPet.name) || 'Песик';
  $('petNameHeader').textContent = '🐶 ' + name;
  var weeks = getAgeInWeeks(currentPet ? currentPet.birthDate : null);
  var program = getProgramByAge(weeks);
  $('headerSub').textContent = weeks != null ? getAgeLabel(weeks) + ' · ' + program.stage : 'Заповніть профіль';
  if (currentUser && currentUser.photoURL) $('userAvatar').innerHTML = '<img src="' + currentUser.photoURL + '">';
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
  var s = today.filter(function(x) { return x.eventType === 'pad' || x.eventType === 'outdoor'; }).length;
  var t = s + today.filter(function(x) { return x.eventType === 'miss'; }).length;
  var pct = t > 0 ? Math.round((s / t) * 100) : 0;
  $('ringFill').style.strokeDashoffset = 264 - (264 * pct / 100);
  $('ringPct').textContent = pct + '%';
}

function renderStreak() {
  var allDates = eventsState.map(function(x) { if (!x.createdAt) return null; var ts = x.createdAt.toDate ? x.createdAt.toDate() : new Date(x.createdAt); return ts.toDateString(); }).filter(Boolean);
  var unique = [...new Set(allDates)].sort(function(a, b) { return new Date(b) - new Date(a); });
  var days = 0;
  var today = new Date().toDateString();
  if (unique[0] === today) {
    days = 1;
    for (var i = 0; i < unique.length - 1; i++) {
      if ((new Date(unique[i]) - new Date(unique[i + 1])) / 86400000 <= 1.5) days++; else break;
    }
  }
  if (days >= 7) $('streakText').textContent = days + ' днів поспіль! Неймовірно! 🔥🔥🔥';
  else if (days >= 3) $('streakText').textContent = days + ' днів поспіль! 🔥';
  else if (days >= 1) $('streakText').textContent = 'Сьогодні є записи — тримайте темп!';
  else $('streakText').textContent = 'Додайте запис щоб почати серію!';
}

function renderDailyChecklist() {
  var weeks = getAgeInWeeks(currentPet ? currentPet.birthDate : null);
  var program = getProgramByAge(weeks);
  $('dailyItems').innerHTML = program.plan.map(function(item, i) { return '<div class="daily-item" data-idx="' + i + '"><input type="checkbox" id="dc' + i + '"><span>' + item + '</span></div>'; }).join('');
  $('dailyProgress').textContent = '0/' + program.plan.length;
  $$('.daily-item input').forEach(function(cb) {
    cb.addEventListener('change', function() {
      cb.closest('.daily-item').classList.toggle('done', cb.checked);
      var c = $$('.daily-item input:checked').length;
      var t = $$('.daily-item input').length;
      $('dailyProgress').textContent = c + '/' + t;
      if (c === t) { confetti(); showToast('Всі завдання виконано! 🎉', 'success'); }
      haptic();
    });
  });
}

function renderTip() {
  var weeks = getAgeInWeeks(currentPet ? currentPet.birthDate : null);
  var program = getProgramByAge(weeks);
  var hour = new Date().getHours();
  var tip;
  if (hour < 9) tip = 'Ранок! Після пробудження — одразу на місце для туалету. Не чекайте.';
  else if (hour < 13) tip = program.priorities[0] || program.tip;
  else if (hour < 17) { var k = KNOWLEDGE[Math.floor(Math.random() * KNOWLEDGE.length)]; tip = k.title + ': ' + k.text.slice(0, 100) + '...'; }
  else if (hour < 20) tip = 'Вечір — час для нюхових ігор (10 хв = 30 хв прогулянки по навантаженню на мозок).';
  else tip = 'Перед сном: спокійний вивід на місце, без гри і збудження.';
  $('tipText').textContent = tip;
}

function renderFeed() {
  var list = $('recentLogs');
  if (!eventsState.length) { list.innerHTML = '<div class="empty">🐾<br>Натисніть кнопку вище щоб почати</div>'; return; }
  var start = todayStart();
  var todayEv = eventsState.filter(function(x) { if (!x.createdAt) return false; var ts = x.createdAt.toDate ? x.createdAt.toDate() : new Date(x.createdAt); return ts >= start; });
  var items = todayEv.length ? todayEv : eventsState.slice(0, 10);
  list.innerHTML = items.map(function(item) {
    var conf = TYPE_CONFIG[item.eventType] || { icon: '📌', label: item.eventType, tone: '' };
    return '<div class="feed-item" data-id="' + item.id + '"><div><strong>' + conf.icon + ' ' + conf.label + '</strong><div class="meta">' + (item.timeLabel || '') + (item.trigger ? ' · ' + item.trigger : '') + '</div></div><span class="pill ' + conf.tone + '">' + (item.byName || '') + '</span><div class="delete-bg">Видалити</div></div>';
  }).join('');
  // Swipe to delete
  $$('.feed-item').forEach(function(el) { initSwipe(el); });
}

/* ═══ Swipe to delete ═══ */
function initSwipe(el) {
  var startX = 0, dx = 0, swiping = false;
  el.addEventListener('touchstart', function(e) { startX = e.touches[0].clientX; swiping = true; }, { passive: true });
  el.addEventListener('touchmove', function(e) {
    if (!swiping) return;
    dx = startX - e.touches[0].clientX;
    if (dx > 10) { el.style.transform = 'translateX(' + Math.max(-80, -dx) + 'px)'; el.classList.add('swiping'); }
  }, { passive: true });
  el.addEventListener('touchend', function() {
    swiping = false;
    if (dx > 70) {
      el.style.transform = 'translateX(-100%)';
      el.style.opacity = '0';
      setTimeout(function() { deleteEvent(el.dataset.id); }, 300);
    } else {
      el.style.transform = '';
      el.classList.remove('swiping');
    }
    dx = 0;
  }, { passive: true });
}

async function deleteEvent(id) {
  if (!workspaceId || !id) return;
  try {
    await db.collection('workspaces').doc(workspaceId).collection('events').doc(id).delete();
    showToast('Видалено', 'success');
  } catch (e) { showToast('Помилка', 'error'); }
}

/* ═══ Learn ═══ */
function renderLearn() {
  var weeks = getAgeInWeeks(currentPet ? currentPet.birthDate : null);
  var program = getProgramByAge(weeks);
  $('ageSummaryBadge').textContent = weeks != null ? getAgeLabel(weeks) + ' · ' + program.stage : 'Вкажіть вік';
  $('priorityTips').innerHTML = program.priorities.map(function(t) { return '<div class="plan-item">' + t + '</div>'; }).join('');
  $('courseGrid').innerHTML = COURSES.map(function(c) { return '<button type="button" class="course-btn ' + (c.id === currentCourseId ? 'selected' : '') + '" data-cid="' + c.id + '"><span class="c-badge">' + c.badge + '</span><strong>' + c.title + '</strong><div class="c-meta">' + c.description.slice(0, 65) + '...</div></button>'; }).join('');
  $$('[data-cid]').forEach(function(btn) { btn.addEventListener('click', function() { currentCourseId = btn.dataset.cid; renderLearn(); haptic(); }); });
  var course = COURSES.find(function(c) { return c.id === currentCourseId; }) || COURSES[0];
  $('selectedCourse').innerHTML = '<div class="course-detail"><h4>Кроки</h4><ul>' + course.steps.map(function(s) { return '<li>' + s + '</li>'; }).join('') + '</ul><h4>Помилки</h4><ul class="mistakes">' + course.mistakes.map(function(s) { return '<li>' + s + '</li>'; }).join('') + '</ul><h4>Чекліст</h4><ul class="checks">' + course.checklist.map(function(s) { return '<li>' + s + '</li>'; }).join('') + '</ul></div>';
  $('knowledgeGrid').innerHTML = KNOWLEDGE.map(function(k) { return '<div class="k-card"><strong>' + k.title + '</strong><p>' + k.text + '</p><span class="k-tag">' + k.tag + '</span></div>'; }).join('');
  $('socialChecklist').innerHTML = SOCIAL_ITEMS.map(function(s, i) { return '<div class="social-item"><input type="checkbox" id="sc' + i + '"><span>' + s + '</span></div>'; }).join('');
  $('socialProgress').textContent = '0/' + SOCIAL_ITEMS.length;
  $$('.social-item input').forEach(function(cb) { cb.addEventListener('change', function() { $('socialProgress').textContent = $$('.social-item input:checked').length + '/' + SOCIAL_ITEMS.length; }); });
}

/* ═══ Profile ═══ */
function renderProfile() {
  fillPetForm();
  renderWorkspaceMeta();
  var name = (currentPet && currentPet.name) || 'Песик';
  var weeks = getAgeInWeeks(currentPet ? currentPet.birthDate : null);
  $('profileName').textContent = name;
  $('profileMeta').textContent = weeks != null ? getAgeLabel(weeks) + ' · ' + ((currentPet && currentPet.breed) || '') : '';
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
  $('membersList').innerHTML = (members || []).length ? (members || []).map(function(m) { return '<div class="member-chip">' + (m.photoURL ? '<img src="' + m.photoURL + '">' : '<div class="m-avatar">' + avatarText(m.displayName) + '</div>') + '<span>' + (m.displayName || 'User') + '</span></div>'; }).join('') : '';
}

function renderAll() { renderHome(); renderLearn(); renderProfile(); }

/* ═══ Firebase ═══ */
async function ensureWorkspaceForUser(user) {
  var userDoc = await db.collection('users').doc(user.uid).get();
  if (userDoc.exists && userDoc.data().workspaceId) { workspaceId = userDoc.data().workspaceId; var wsDoc = await db.collection('workspaces').doc(workspaceId).get(); workspaceData = wsDoc.exists ? wsDoc.data() : null; return; }
  var newRef = db.collection('workspaces').doc(); workspaceId = newRef.id;
  var inviteCode = createInviteCode(); var spaceName = (user.displayName || 'Мій').split(' ')[0] + ' простір';
  await newRef.set({ name: spaceName, ownerId: user.uid, inviteCode: inviteCode, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  workspaceData = { name: spaceName, ownerId: user.uid, inviteCode: inviteCode };
  await db.collection('users').doc(user.uid).set({ uid: user.uid, email: user.email || '', displayName: user.displayName || '', photoURL: user.photoURL || '', role: 'owner', workspaceId: workspaceId, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  await db.collection('workspaces').doc(workspaceId).collection('members').doc(user.uid).set({ uid: user.uid, email: user.email || '', displayName: user.displayName || '', photoURL: user.photoURL || '', role: 'owner', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  await db.collection('workspaces').doc(workspaceId).collection('dogs').doc('primary').set({ name: '', birthDate: '', sex: '', breed: '', weight: '', homeDate: '', vaccination: 'не вказано', toiletMode: 'pad', notes: '', createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
}

function subscribePet() { if (!workspaceId) return; if (unsubPet) unsubPet(); unsubPet = db.collection('workspaces').doc(workspaceId).collection('dogs').doc('primary').onSnapshot(function(s) { currentPet = s.exists ? s.data() : null; renderAll(); }); }
function subscribeMembers() { if (!workspaceId) return; if (unsubMembers) unsubMembers(); unsubMembers = db.collection('workspaces').doc(workspaceId).collection('members').onSnapshot(function(s) { var m = []; s.forEach(function(d) { m.push(d.data()); }); renderMembers(m); }); }
function subscribeEvents() { if (!workspaceId) return; if (unsubEvents) unsubEvents(); unsubEvents = db.collection('workspaces').doc(workspaceId).collection('events').orderBy('createdAt', 'desc').limit(500).onSnapshot(function(s) { var r = []; s.forEach(function(d) { r.push(Object.assign({ id: d.id }, d.data())); }); eventsState = r; renderHome(); }); }

async function savePetProfile(payload) {
  if (!currentUser || !workspaceId) return showToast('Увійдіть', 'error');
  await db.collection('workspaces').doc(workspaceId).collection('dogs').doc('primary').set(Object.assign({}, currentPet || {}, payload, { updatedAt: firebase.firestore.FieldValue.serverTimestamp() }), { merge: true });
  petFormDirty = false; showToast('Збережено ✓', 'success'); haptic();
}

async function addEvent(payload) {
  if (!currentUser || !workspaceId) return showToast('Увійдіть', 'error');
  await db.collection('workspaces').doc(workspaceId).collection('events').add({ eventType: payload.eventType, byUid: currentUser.uid, byName: payload.byName || currentUser.displayName || '', trigger: payload.trigger || '', note: payload.note || '', timeLabel: payload.timeLabel || nowTime(), createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  showToast('Додано ✓', 'success'); haptic();
  if (eventsState.length === 9 || eventsState.length === 49 || eventsState.length === 99) { setTimeout(confetti, 300); showToast('🎉 Milestone: ' + (eventsState.length + 1) + ' записів!', 'success'); }
}

async function joinWorkspaceByInvite(code) {
  if (!currentUser) return showToast('Увійдіть', 'error');
  code = code.trim().toUpperCase(); if (!code) throw new Error('Введіть код');
  var snap = await db.collection('workspaces').where('inviteCode', '==', code).limit(1).get();
  if (snap.empty) throw new Error('Код не знайдено');
  workspaceId = snap.docs[0].id; workspaceData = snap.docs[0].data();
  await db.collection('users').doc(currentUser.uid).update({ workspaceId: workspaceId, role: 'member' });
  await db.collection('workspaces').doc(workspaceId).collection('members').doc(currentUser.uid).set({ uid: currentUser.uid, email: currentUser.email || '', displayName: currentUser.displayName || '', photoURL: currentUser.photoURL || '', role: 'member', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  subscribePet(); subscribeMembers(); subscribeEvents(); renderAll(); confetti();
}

/* ═══ Auth ═══ */
function loginGoogle() { auth.signInWithRedirect(googleProvider); }

async function logoutGoogle() {
  if (unsubEvents) { unsubEvents(); unsubEvents = null; }
  if (unsubMembers) { unsubMembers(); unsubMembers = null; }
  if (unsubPet) { unsubPet(); unsubPet = null; }
  await auth.signOut();
  currentUser = null; workspaceId = null; workspaceData = null; currentPet = null; eventsState = [];
  petFormDirty = false; showToast('До зустрічі 👋');
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
      // Show onboarding if first time
      if (!localStorage.getItem('ob_done') && (!currentPet || !currentPet.name)) { showOnboarding(); }
    } catch (e) { console.error('[Boot]', e); showToast('Помилка: ' + e.message, 'error'); }
    $('appLoader').classList.add('hidden');
  });
}

/* ═══ Bindings ═══ */
function bindEvents() {
  $$('.nav-tab').forEach(function(b) { b.addEventListener('click', function() { setActiveTab(b.dataset.tab); }); });
  $$('[data-theme-toggle]').forEach(function(el) { el.addEventListener('click', function() { var n = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', n); localStorage.setItem('theme', n); haptic(); }); });
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

  $('dismissWeekly').addEventListener('click', function() {
    $('weeklyCard').classList.add('hidden');
    localStorage.setItem('weekly_dismissed_' + new Date().toISOString().slice(0, 10), '1');
  });

  // Resize chart
  var resizeTimer;
  window.addEventListener('resize', function() { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderChart, 200); });
}

bindOnboarding();
bindEvents();
bootAuth();

/* ===== Dog Coach AI — Main App ===== */
(function () {
  'use strict';

  const AGE_PROGRAMS = window.AGE_PROGRAMS;
  const COURSES = window.COURSES;
  const KNOWLEDGE = window.KNOWLEDGE;
  const SOCIAL_ITEMS = window.SOCIAL_ITEMS;
  const TOILET_GUIDE = window.TOILET_GUIDE;
  const TYPE_CONFIG = window.TYPE_CONFIG;

  // ===== Firebase Init =====
  const firebaseConfig = window.FIREBASE_CONFIG;
  try {
    firebase.initializeApp(firebaseConfig);
  } catch (e) {
    console.error('Firebase init error:', e);
  }

  const auth = firebase.auth();
  const db = firebase.firestore();
  const googleProvider = new firebase.auth.GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: 'select_account' });
  db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

  // ===== State =====
  let currentUser = null;
  let workspaceId = null;
  let workspaceData = null;
  let currentPet = null;
  let eventsState = [];
  let membersState = [];
  let currentCourseId = 'pee-pad';
  let unsubEvents = null;
  let unsubMembers = null;
  let unsubPet = null;
  let themeMode = localStorage.getItem('dc_theme') || 'light';
  let dailyDone = JSON.parse(localStorage.getItem('dc_daily') || '{}');
  let renderQueued = false;
  let activeTab = 'tabHome';

  // ===== DOM Helpers =====
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const show = (el) => el?.classList.remove('hidden');
  const hide = (el) => el?.classList.add('hidden');
  const showLoading = () => show($('loadingOverlay'));
  const hideLoading = () => hide($('loadingOverlay'));

  // ===== Utilities =====
  const nowTime = () => new Date().toTimeString().slice(0, 5);
  const todayKey = () => new Date().toISOString().slice(0, 10);
  const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const avatarLetter = (name = '') => (name.trim()[0] || 'П').toUpperCase();
  const tsToDate = (ts) => ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
  const haptic = () => { if (navigator.vibrate) navigator.vibrate(8); };

  function getAgeInWeeks(bd) {
    if (!bd) return null;
    const diff = Date.now() - new Date(bd).getTime();
    return isNaN(diff) || diff < 0 ? null : Math.floor(diff / 604800000);
  }

  function weekLabel(weeks) {
    if (weeks == null) return '—';
    if (weeks < 8) return `${weeks} тиж.`;
    if (weeks < 52) return `${Math.floor(weeks / 4.345)} міс.`;
    const y = weeks / 52;
    return y < 2 ? `${y.toFixed(1)} р.` : `${Math.floor(y)} р.`;
  }

  function getProgramByAge(weeks) {
    if (weeks == null) return AGE_PROGRAMS[1] || AGE_PROGRAMS[0];
    return AGE_PROGRAMS.find(p => weeks >= p.minWeeks && weeks < p.maxWeeks) || AGE_PROGRAMS[AGE_PROGRAMS.length - 1];
  }

  // ===== Toast =====
  function toast(msg, type = '') {
    const box = $('toastContainer');
    if (!box) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, 2800);
  }

  // ===== Theme =====
  function setTheme(mode) {
    themeMode = mode === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', themeMode);
    localStorage.setItem('dc_theme', themeMode);
  }

  // ===== Render Functions =====
  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      renderAll();
    });
  }

  function renderHeader() {
    const petName = currentPet?.name?.trim() || 'Песик';
    const weeks = getAgeInWeeks(currentPet?.birthDate);
    const program = getProgramByAge(weeks);
    $('petNameHeader').textContent = petName;
    $('headerSub').textContent = `${weekLabel(weeks)} · ${program.stage}`;
    $('profileName').textContent = petName;
    $('profileMeta').textContent = [currentPet?.breed || 'Порода не вказана', weekLabel(weeks)].join(' · ');
    const avatar = $('userAvatar');
    if (avatar) {
      avatar.innerHTML = currentUser?.photoURL
        ? `<img src="${currentUser.photoURL}" alt="user">`
        : avatarLetter(currentUser?.displayName || petName);
    }
  }

  function renderAgeFocus() {
    const weeks = getAgeInWeeks(currentPet?.birthDate);
    const program = getProgramByAge(weeks);
    const box = $('periodFocus');
    if (!box) return;
    box.innerHTML = `
      <div class="plan-item"><strong>🎯 Пріоритети</strong>${program.priorities.map(x => `<br>• ${x}`).join('')}</div>
      <div class="plan-item"><strong>📋 План</strong>${program.plan.map(x => `<br>• ${x}`).join('')}</div>
      <div class="plan-item"><strong>💡 Підказка</strong><br>${program.tip}</div>
    `;
  }

  function renderDailyPlan() {
    const list = $('dailyItems');
    const badge = $('dailyProgressBadge');
    if (!list || !badge) return;
    const plan = (getProgramByAge(getAgeInWeeks(currentPet?.birthDate))?.plan || []);
    const key = todayKey();
    const done = dailyDone[key] || {};
    const doneCount = Object.values(done).filter(Boolean).length;
    badge.textContent = `${doneCount}/${plan.length}`;

    list.innerHTML = plan.map((item, i) => `
      <label class="daily-item ${done[i] ? 'done' : ''}">
        <input type="checkbox" data-daily="${i}" ${done[i] ? 'checked' : ''}>
        <span>${item}</span>
      </label>
    `).join('');

    $$('[data-daily]').forEach(cb => cb.addEventListener('change', () => {
      const k = todayKey();
      dailyDone[k] = dailyDone[k] || {};
      dailyDone[k][cb.dataset.daily] = cb.checked;
      localStorage.setItem('dc_daily', JSON.stringify(dailyDone));
      renderDailyPlan();
    }));
  }

  function renderKpis() {
    const start = startOfToday();
    const todayEvents = eventsState.filter(e => {
      const ts = tsToDate(e.createdAt);
      return ts && ts >= start;
    });
    const pad = todayEvents.filter(e => e.eventType === 'pad').length;
    const outdoor = todayEvents.filter(e => e.eventType === 'outdoor').length;
    const miss = todayEvents.filter(e => e.eventType === 'miss').length;

    $('kpiPad').textContent = pad;
    $('kpiOutdoor').textContent = outdoor;
    $('kpiMiss').textContent = miss;

    const success = pad + outdoor;
    const total = success + miss;
    const pct = total > 0 ? Math.round(success / total * 100) : 0;

    $('ringPct').textContent = `${pct}%`;
    const ring = $('ringFill');
    if (ring) {
      const circumference = 251.3;
      ring.style.strokeDashoffset = String(circumference - (circumference * pct / 100));
    }
  }

  function renderSuggestion() {
    const text = $('suggestionText');
    if (!text) return;
    const toilet = eventsState.filter(e => ['pad', 'outdoor', 'miss'].includes(e.eventType));
    if (toilet.length < 5) {
      text.textContent = getProgramByAge(getAgeInWeeks(currentPet?.birthDate))?.tip || 'Записуйте події кілька днів для персональних порад.';
      return;
    }
    const recent = toilet.slice(0, 20);
    const success = recent.filter(e => e.eventType !== 'miss').length;
    const rate = Math.round(success / recent.length * 100);
    if (rate >= 80) text.textContent = `🎉 Чудовий прогрес! Успішність ${rate}% за останні ${recent.length} подій.`;
    else if (rate >= 50) text.textContent = `📈 Стабільність: ${rate}%. Продовжуйте фіксувати моменти після сну і їжі.`;
    else text.textContent = `⚠️ Успішність ${rate}%. Спробуйте обмежити простір і частіше виводити на місце.`;
  }

  function renderCourses() {
    const grid = $('courseGrid');
    const viewer = $('selectedCourse');
    if (!grid || !viewer) return;

    grid.innerHTML = COURSES.map(course => `
      <button type="button" class="course-btn ${course.id === currentCourseId ? 'selected' : ''}" data-course-id="${course.id}">
        <span class="c-badge">${course.badge}</span>
        <strong>${course.title}</strong>
        <div class="c-meta">${course.description}</div>
      </button>
    `).join('');

    $$('[data-course-id]').forEach(btn => btn.addEventListener('click', () => {
      currentCourseId = btn.dataset.courseId;
      renderCourses();
      haptic();
    }));

    const course = COURSES.find(c => c.id === currentCourseId) || COURSES[0];
    viewer.innerHTML = `
      <div class="course-detail">
        <h3>${course.title}</h3>
        <p style="color:var(--text-secondary);margin-bottom:1rem">${course.description}</p>
        <h4>Кроки</h4>
        <ul>${course.steps.map(s => `<li>${s}</li>`).join('')}</ul>
        <h4>Помилки</h4>
        <ul class="mistakes">${course.mistakes.map(s => `<li>${s}</li>`).join('')}</ul>
        <h4>Чекліст</h4>
        <ul class="checks">${course.checklist.map(s => `<li>${s}</li>`).join('')}</ul>
      </div>
    `;
  }

  function renderKnowledge() {
    const grid = $('knowledgeGrid');
    if (grid) grid.innerHTML = KNOWLEDGE.map(k => `
      <div class="k-card">
        <strong>${k.title}</strong>
        <p>${k.text}</p>
        <span class="k-tag">${k.tag}</span>
      </div>
    `).join('');
  }

   function renderSocial() {
    const grid = $('socialGrid');
    if (!grid) return;
    const socialDone = JSON.parse(localStorage.getItem('dc_social') || '{}');

    grid.innerHTML = SOCIAL_ITEMS.map(group => `
      <div class="social-group">
        <h5 class="social-group-title">${group.category}</h5>
        ${group.items.map(item => {
          const key = group.category + ':' + item;
          return `<label class="social-item">
            <input type="checkbox" data-social-key="${key}" ${socialDone[key] ? 'checked' : ''}>
            <span>${item}</span>
          </label>`;
        }).join('')}
      </div>
    `).join('');

    $$('[data-social-key]').forEach(cb => cb.addEventListener('change', () => {
      const done = JSON.parse(localStorage.getItem('dc_social') || '{}');
      done[cb.dataset.socialKey] = cb.checked;
      localStorage.setItem('dc_social', JSON.stringify(done));
    }));
  }

  function renderToiletGuide() {
    const grid = $('toiletGuide');
    if (grid) grid.innerHTML = TOILET_GUIDE.map(step => `
      <div class="k-card">
        <strong>${step.title}</strong>
        <p>${step.text}</p>
      </div>
    `).join('');
  }

  function renderMembers() {
    const list = $('membersList');
    if (!list) return;
    list.innerHTML = membersState.length
      ? membersState.map(m => `
          <div class="member-chip">
            <div class="m-avatar">${m.photoURL ? `<img src="${m.photoURL}" alt="">` : avatarLetter(m.displayName)}</div>
            <span>${m.displayName || 'Учасник'}</span>
          </div>
        `).join('')
      : '<div class="empty">Поки що тут тільки ви.</div>';
  }

  function renderWorkspaceMeta() {
    const el = $('inviteCodeView');
    if (el) el.textContent = workspaceData?.inviteCode || '—';
  }

  function fillPetForm() {
    if ($('petName')) $('petName').value = currentPet?.name || '';
    if ($('petBirthDate')) $('petBirthDate').value = currentPet?.birthDate || '';
    if ($('petSex')) $('petSex').value = currentPet?.sex || 'хлопчик';
    if ($('petBreed')) $('petBreed').value = currentPet?.breed || '';
    if ($('petToiletMode')) $('petToiletMode').value = currentPet?.toiletMode || 'pad';
  }

  function renderFeed(targetId) {
    const list = $(targetId);
    if (!list) return;
    if (!eventsState.length) {
      list.innerHTML = '<div class="empty">Немає записів. Натисніть + щоб додати подію.</div>';
      return;
    }
    list.innerHTML = eventsState.slice(0, 30).map(item => {
      const conf = TYPE_CONFIG[item.eventType] || { icon: '•', label: 'Подія' };
      const d = tsToDate(item.createdAt);
      const timeStr = d ? d.toLocaleString('uk', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
      return `
        <div class="feed-item" data-event-id="${item.id}">
          <div>
            <strong>${conf.icon} ${conf.label}</strong>
            <div class="meta">${timeStr}${item.note ? ` · ${item.note}` : ''}</div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" data-delete-event="${item.id}">✕</button>
        </div>
      `;
    }).join('');

    $$(`#${targetId} [data-delete-event]`).forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Видалити цей запис?')) return;
        await deleteEvent(btn.dataset.deleteEvent);
      });
    });
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

    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      const dayEvents = eventsState.filter(e => {
        const ts = tsToDate(e.createdAt);
        return ts && ts >= d && ts < next;
      });
      const success = dayEvents.filter(e => ['pad', 'outdoor'].includes(e.eventType)).length;
      const miss = dayEvents.filter(e => e.eventType === 'miss').length;
      const total = success + miss;
      days.push({ date: d, pct: total ? Math.round(success / total * 100) : null });
    }

    const isDark = themeMode === 'dark';
    const accent = isDark ? '#2dd4bf' : '#0f766e';
    const danger = isDark ? '#f87171' : '#dc2626';
    const warning = isDark ? '#fbbf24' : '#d97706';
    const muted = isDark ? '#78716c' : '#a8a29e';
    const border = isDark ? '#292524' : '#e7e5e4';

    const padding = { top: 10, right: 4, bottom: 20, left: 4 };
    const cw = w - padding.left - padding.right;
    const ch = h - padding.top - padding.bottom;
    const bw = cw / days.length;

    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    [0, 50, 100].forEach(v => {
      const y = padding.top + ch - (v / 100) * ch;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
    });

    days.forEach((day, i) => {
      const x = padding.left + i * bw + bw * 0.2;
      const barW = bw * 0.6;

      if (day.pct == null) {
        ctx.fillStyle = muted;
        ctx.beginPath();
        ctx.arc(x + barW / 2, padding.top + ch - 3, 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const barH = Math.max(3, (day.pct / 100) * ch);
        const y = padding.top + ch - barH;
        ctx.fillStyle = day.pct >= 70 ? accent : day.pct >= 40 ? warning : danger;
        const r = Math.min(3, barW / 2);
        ctx.beginPath();
        ctx.moveTo(x, y + barH);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.lineTo(x + barW - r, y);
        ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
        ctx.lineTo(x + barW, y + barH);
        ctx.closePath();
        ctx.fill();
      }

      if (i % 3 === 0 || i === days.length - 1) {
        ctx.fillStyle = muted;
        ctx.font = '10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(`${day.date.getDate()}/${day.date.getMonth() + 1}`, x + barW / 2, h - 4);
      }
    });
  }

  function renderAll() {
    renderHeader();
    renderAgeFocus();
    renderDailyPlan();
    renderKpis();
    renderSuggestion();
    renderFeed('recentLogs');
    renderFeed('recentLogsDiary');
    renderCourses();
    renderKnowledge();
    renderSocial();
    renderToiletGuide();
    renderMembers();
    renderWorkspaceMeta();
    fillPetForm();
    if (activeTab === 'tabDiary') {
      requestAnimationFrame(() => renderChart('progressChartDiary'));
    }
  }

  // ===== Tab Navigation =====
  function setActiveTab(id) {
    activeTab = id;
    $$('.tab').forEach(p => p.classList.toggle('active', p.id === id));
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
    if (id === 'tabProfile') hide($('fabAddEvent'));
    else show($('fabAddEvent'));
    if (id === 'tabDiary') {
      requestAnimationFrame(() => renderChart('progressChartDiary'));
    }
  }

  // ===== Sheet =====
  function openSheet() {
    show($('eventSheet'));
    $('eventTime').value = nowTime();
  }

  function closeSheet() {
    hide($('eventSheet'));
  }

  // ===== Firestore Operations =====
  async function savePetProfile(payload) {
    if (!currentUser || !workspaceId) return toast('Увійдіть в систему', 'error');
    showLoading();
    try {
      await db.collection('workspaces').doc(workspaceId).collection('dogs').doc('primary').set({
        ...(currentPet || {}),
        ...payload,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      toast('Профіль збережено', 'success');
    } catch (e) {
      console.error(e);
      toast('Помилка збереження', 'error');
    } finally {
      hideLoading();
    }
  }

  async function addEvent(payload) {
    if (!currentUser || !workspaceId) return toast('Увійдіть в систему', 'error');
    try {
      await db.collection('workspaces').doc(workspaceId).collection('events').add({
        eventType: payload.eventType,
        byUid: currentUser.uid,
        byName: currentUser.displayName || 'Я',
        note: payload.note || '',
        timeLabel: payload.timeLabel || nowTime(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      toast('Додано ✓', 'success');
      haptic();
    } catch (e) {
      console.error(e);
      toast('Помилка додавання', 'error');
    }
  }

  async function deleteEvent(id) {
    if (!workspaceId || !id) return;
    try {
      await db.collection('workspaces').doc(workspaceId).collection('events').doc(id).delete();
      toast('Видалено', 'success');
    } catch (e) {
      console.error(e);
      toast('Помилка видалення', 'error');
    }
  }

  // ===== Workspace =====
  async function ensureWorkspaceForUser(user) {
    const udoc = await db.collection('users').doc(user.uid).get();
    if (udoc.exists && udoc.data().workspaceId) {
      workspaceId = udoc.data().workspaceId;
      const wdoc = await db.collection('workspaces').doc(workspaceId).get();
      workspaceData = wdoc.exists ? wdoc.data() : null;
      return;
    }

    const wsRef = db.collection('workspaces').doc();
    workspaceId = wsRef.id;
    const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase();
    workspaceData = { name: `${(user.displayName || 'Мій').split(' ')[0]}`, ownerId: user.uid, inviteCode };

    await wsRef.set({ ...workspaceData, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    await db.collection('users').doc(user.uid).set({
      uid: user.uid, email: user.email || '', displayName: user.displayName || '',
      photoURL: user.photoURL || '', role: 'owner', workspaceId
    }, { merge: true });
    await wsRef.collection('members').doc(user.uid).set({
      uid: user.uid, email: user.email || '', displayName: user.displayName || '',
      photoURL: user.photoURL || '', role: 'owner',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await wsRef.collection('dogs').doc('primary').set({
      name: '', birthDate: '', sex: 'хлопчик', breed: '', toiletMode: 'pad',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  async function joinWorkspaceByInvite(code) {
    const clean = (code || '').trim().toUpperCase();
    if (!clean) throw new Error('Введіть код запрошення');
    const snap = await db.collection('workspaces').where('inviteCode', '==', clean).limit(1).get();
    if (snap.empty) throw new Error('Код не знайдено');

    workspaceId = snap.docs[0].id;
    workspaceData = snap.docs[0].data();

    await db.collection('users').doc(currentUser.uid).set({
      uid: currentUser.uid, email: currentUser.email || '', displayName: currentUser.displayName || '',
      photoURL: currentUser.photoURL || '', role: 'member', workspaceId
    }, { merge: true });
    await db.collection('workspaces').doc(workspaceId).collection('members').doc(currentUser.uid).set({
      uid: currentUser.uid, email: currentUser.email || '', displayName: currentUser.displayName || '',
      photoURL: currentUser.photoURL || '', role: 'member',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    subscribePet();
    subscribeMembers();
    subscribeEvents();
    queueRender();
  }

  // ===== Subscriptions =====
  function subscribePet() {
    unsubPet?.();
    unsubPet = db.collection('workspaces').doc(workspaceId).collection('dogs').doc('primary')
      .onSnapshot(s => {
        currentPet = s.exists ? s.data() : null;
        queueRender();
      });
  }

  function subscribeMembers() {
    unsubMembers?.();
    unsubMembers = db.collection('workspaces').doc(workspaceId).collection('members')
      .onSnapshot(s => {
        membersState = [];
        s.forEach(d => membersState.push(d.data()));
        renderMembers();
      });
  }

  function subscribeEvents() {
    unsubEvents?.();
    unsubEvents = db.collection('workspaces').doc(workspaceId).collection('events')
      .orderBy('createdAt', 'desc').limit(200)
      .onSnapshot(s => {
        eventsState = [];
        s.forEach(d => eventsState.push({ id: d.id, ...d.data() }));
        queueRender();
      });
  }

  // ===== Auth =====
  async function loginGoogle() {
    showLoading();
    try {
      await auth.signInWithPopup(googleProvider);
    } catch (e) {
      console.error('Auth error:', e.code, e.message);
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user') {
        try { await auth.signInWithRedirect(googleProvider); } catch (err) {
          toast(err.message || 'Помилка входу', 'error');
        }
      } else if (e.code === 'auth/unauthorized-domain') {
        toast('Домен не авторизовано. Додайте його в Firebase Console → Auth → Authorized domains', 'error');
      } else {
        toast(e.message || 'Помилка входу', 'error');
      }
    } finally {
      hideLoading();
    }
  }

  async function logout() {
    unsubEvents?.(); unsubMembers?.(); unsubPet?.();
    unsubEvents = unsubMembers = unsubPet = null;
    await auth.signOut();
    currentUser = null; workspaceId = null; workspaceData = null;
    currentPet = null; eventsState = []; membersState = [];
    hide($('appContent'));
    show($('authScreen'));
  }

  // ===== AI Chat =====
  function addChatMessage(text, type) {
    const chat = $('aiChat');
    if (!chat) return;
    const msg = document.createElement('div');
    msg.className = `ai-msg ${type}`;
    msg.textContent = text;
    chat.appendChild(msg);
    chat.scrollTop = chat.scrollHeight;
  }

  function showTypingIndicator() {
    const chat = $('aiChat');
    if (!chat) return;
    const el = document.createElement('div');
    el.className = 'ai-msg loading';
    el.id = 'typingIndicator';
    el.textContent = 'Думаю...';
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
  }

  function removeTypingIndicator() {
    const el = $('typingIndicator');
    if (el) el.remove();
  }

  async function fetchAIResponse(prompt) {
    const weeks = getAgeInWeeks(currentPet?.birthDate);
    const petInfo = currentPet
      ? `Собака: ${currentPet.name || 'Песик'}, вік: ${weekLabel(weeks)}${weeks != null && weeks < 12 ? ' (цуценя до 3 місяців!)' : ''}, порода: ${currentPet.breed || 'невідома'}, стать: ${currentPet.sex || 'невідома'}, режим туалету: ${currentPet.toiletMode || 'pad'}`
      : '';

    const systemPrompt = `Ти — професійний український кінолог-інструктор з 15-річним досвідом.

ПРАВИЛА (обов'язкові):
1. Відповідай ТІЛЬКИ українською мовою. Жодних інших мов, жодних ієрогліфів, жодних латинських термінів без потреби.
2. Максимум 4-5 речень. Конкретні кроки які можна зробити прямо зараз.
3. Враховуй вік собаки: якщо цуценя до 3 місяців — ніяких складних команд, фокус на адаптацію і базовий комфорт.
4. Ніколи не рекомендуй покарання, крики, фізичний вплив.
5. Якщо не знаєш точної відповіді — скажи "зверніться до ветеринара" замість вигадування.
6. Формат: пронумеровані кроки або короткі тези. Без вступів типу "Звичайно!" чи "Чудове питання!".

${petInfo}`;

    try {
      const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'groq/llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature: 0.2,
          max_tokens: 400,
          stream: false
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.choices?.[0]?.message?.content) {
        let text = data.choices[0].message.content.trim();
        // Remove any non-Ukrainian characters (Chinese, Japanese, Korean, etc.)
        text = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\u2e80-\u2eff]/g, '');
        // Clean up leftover artifacts
        text = text.replace(/\s{2,}/g, ' ').trim();
        return text || getLocalFallback(prompt);
      }

      throw new Error('Empty AI response');
    } catch (e) {
      console.warn('AI error, using local fallback:', e.message);
      return getLocalFallback(prompt);
    }
  }

  function getLocalFallback(prompt) {
    const lower = prompt.toLowerCase();
    const weeks = getAgeInWeeks(currentPet?.birthDate);
    const program = getProgramByAge(weeks);

    if (lower.includes('команд') || lower.includes('сідати') || lower.includes('лежати')) {
      return '1) Тримайте ласощі біля носа. 2) Повільно підніміть руку — собака сяде автоматично. 3) Одразу маркер "Так!" + ласощі. 4) Повторюйте 5-8 разів, 2-3 підходи на день. Сесія не довше 2 хвилин.';
    }
    if (lower.includes('гриз') || lower.includes('речі') || lower.includes('взуття')) {
      return '1) Приберіть доступні речі. 2) Дайте 2-3 жувальні іграшки. 3) Коли гризе своє — маркер + похвала. 4) Гризе чуже — мовчки заберіть, дайте іграшку. Більше фізичної і розумової активності знижує потребу гризти.';
    }
    if (lower.includes('гавк') || lower.includes('лає') || lower.includes('шум')) {
      return '1) Знайдіть причину: нудьга, страх, збудження? 2) При гавкоті — не кричіть у відповідь. 3) Навчіть команду "Тихо": чекайте паузу → маркер → ласощі. 4) Збільшіть фізичне навантаження і нюхові ігри.';
    }
    if (lower.includes('соціалізац') || lower.includes('боїться') || lower.includes('страх')) {
      return '1) Не змушуйте підходити до страшного. 2) Покажіть на безпечній відстані. 3) Цікавість = ласощі і похвала. 4) Закінчуйте до ознак стресу. Поступово зменшуйте дистанцію за кілька днів.';
    }
    if (lower.includes('пелюшк') || lower.includes('туалет') || lower.includes('калюж')) {
      return '1) Обмежте простір. 2) Після сну/їжі/гри — мовчки на пелюшку. 3) Зробило — одразу "Так!" + ласощі. 4) Промах — тихо прибрати ензимним засобом. 5) Записуйте час — побачите патерн.';
    }
    if (lower.includes('прогулянк') || lower.includes('повідець') || lower.includes('тягне')) {
      return '1) Собака тягне — зупиніться повністю. 2) Повідець вільний — йдете далі. 3) Беріть ласощі для підкріплення. 4) Перші тижні гуляйте коротко і в тихих місцях. Терпіння — ключ.';
    }
    if (lower.includes('кусає') || lower.includes('зуби') || lower.includes('щипає')) {
      return '1) Кусає — завмріть і тихо "ай". 2) Заберіть увагу на 5 секунд. 3) Дайте іграшку замість руки. 4) Грає спокійно — хваліть. 5) Перезбуджено — пауза або вийдіть з кімнати.';
    }

    return program?.tip || 'Запитайте про конкретну ситуацію: команди, туалет, гризіння, гавкіт, страхи або прогулянки — і я дам покроковий план.';
  }

  async function handleAISubmit(prompt) {
    if (!prompt.trim()) return;

    addChatMessage(prompt, 'user');
    showTypingIndicator();

    try {
      const response = await fetchAIResponse(prompt);
      removeTypingIndicator();
      addChatMessage(response, 'assistant');
    } catch (e) {
      removeTypingIndicator();
      addChatMessage('Виникла помилка. Спробуйте ще раз.', 'assistant');
    }
  }

  // ===== Event Binding =====
  function bindEvents() {
    setTheme(themeMode);

    // Theme toggle
    $$('[data-theme-toggle]').forEach(btn => btn.addEventListener('click', () => {
      setTheme(themeMode === 'dark' ? 'light' : 'dark');
      haptic();
    }));

    // Auth
    $('googleLoginBtn')?.addEventListener('click', loginGoogle);
    $('logoutBtn')?.addEventListener('click', logout);

    // Navigation
    $$('.nav-item').forEach(btn => btn.addEventListener('click', () => {
      setActiveTab(btn.dataset.tab);
      haptic();
    }));

    // FAB & Sheet
    $('fabAddEvent')?.addEventListener('click', openSheet);
    $('sheetBackdrop')?.addEventListener('click', closeSheet);

    // Quick events
    $$('[data-quick-event]').forEach(btn => btn.addEventListener('click', async () => {
      await addEvent({ eventType: btn.dataset.quickEvent, timeLabel: nowTime() });
      closeSheet();
    }));

    // Event form
    $('eventForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const eventType = $('eventType').value;
      const timeLabel = $('eventTime').value || nowTime();
      const note = $('eventNote').value.trim();
      await addEvent({ eventType, timeLabel, note });
      $('eventNote').value = '';
      closeSheet();
    });

    // Pet profile form
    $('petProfileForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await savePetProfile({
        name: $('petName').value.trim(),
        birthDate: $('petBirthDate').value,
        sex: $('petSex').value,
        breed: $('petBreed').value.trim(),
        toiletMode: $('petToiletMode').value
      });
    });

    // Invite code
    $('copyInviteBtn')?.addEventListener('click', async () => {
      if (!workspaceData?.inviteCode) return;
      try {
        await navigator.clipboard.writeText(workspaceData.inviteCode);
        toast('Код скопійовано', 'success');
      } catch {
        const ta = document.createElement('textarea');
        ta.value = workspaceData.inviteCode;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        toast('Код скопійовано', 'success');
      }
    });

    // Join workspace
    $('joinWorkspaceForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = $('inviteCodeInput');
      try {
        await joinWorkspaceByInvite(input.value);
        input.value = '';
        toast('Ви приєдналися!', 'success');
      } catch (err) {
        toast(err.message || 'Не вдалося приєднатися', 'error');
      }
    });

    // AI Chat form
    $('aiForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = $('aiInput');
      const message = input.value.trim();
      if (!message) return;
      input.value = '';
      input.style.height = 'auto';
      await handleAISubmit(message);
    });

    // AI quick prompts
    $$('[data-ai-prompt]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const prompt = btn.dataset.aiPrompt;
        await handleAISubmit(prompt);
        haptic();
      });
    });

    // Clear chat
    $('clearChatBtn')?.addEventListener('click', () => {
      const chat = $('aiChat');
      if (chat) chat.innerHTML = '';
    });

    // Auto-resize AI textarea
    const aiInput = $('aiInput');
    if (aiInput) {
      aiInput.addEventListener('input', () => {
        aiInput.style.height = 'auto';
        aiInput.style.height = Math.min(aiInput.scrollHeight, 100) + 'px';
      });
    }

    // Enter to send (Shift+Enter for newline)
    $('aiInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        $('aiForm')?.requestSubmit();
      }
    });

    // Escape closes sheet
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSheet();
    });

    // Resize re-renders chart
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (activeTab === 'tabDiary') renderChart('progressChartDiary');
      }, 200);
    });
  }

  // ===== Auth State & Boot =====
  function bootAuth() {
    auth.onAuthStateChanged(async (user) => {
      currentUser = user || null;

      if (!currentUser) {
        show($('authScreen'));
        hide($('appContent'));
        return;
      }

      hide($('authScreen'));
      show($('appContent'));
      showLoading();

      try {
        await ensureWorkspaceForUser(currentUser);
        subscribePet();
        subscribeMembers();
        subscribeEvents();
        queueRender();
      } catch (e) {
        console.error('Boot error:', e);
        toast('Помилка завантаження даних', 'error');
      } finally {
        hideLoading();
      }
    });
  }

  // ===== Init =====
  bindEvents();
  bootAuth();

  // Handle redirect result (popup-blocked fallback)
  auth.getRedirectResult().then((result) => {
    if (result?.user) {
      console.log('Redirect login success:', result.user.email);
    }
  }).catch((e) => {
    if (e.code && e.code !== 'auth/no-auth-event') {
      console.error('Redirect error:', e);
      toast('Помилка входу через redirect', 'error');
    }
  });

})();

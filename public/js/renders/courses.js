/**
 * @fileoverview Courses tab — AI chat, course grid, knowledge, social
 */

import { state, STORAGE_KEYS } from '../state.js';
import { $, $$, escapeHtml, haptic, tsToDate } from '../utils.js';
import { getCourses, getKnowledge, getSocial } from '../content-loader.js';
import { setActiveTab } from '../render.js';
import { getTrainingProgram } from '../training-programs.js';

/** @type {boolean} */
let coursesRendered = false;
let knowledgeRendered = false;
let socialRendered = false;

export async function render() {
  renderAcademyShell();
  renderProblemButtons();
  await renderCourseGrid();
  await renderKnowledgeGrid();
  await renderSocialGrid();
  renderToiletGuide();
  renderAcademyProgress();
  renderAcademyLesson();
}

function renderAcademyShell() {
  const tabs = $('academySections');
  if (tabs && !tabs.dataset.bound) {
    tabs.dataset.bound = 'true';
    tabs.querySelectorAll('[data-academy-section]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.ui.academySection = btn.dataset.academySection;
        renderAcademyShell();
        haptic();
      });
    });
  }

  const active = state.ui.academySection || 'programs';
  $$('#academySections [data-academy-section]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.academySection === active);
  });
  $$('[data-academy-panel]').forEach(panel => {
    const isActive = panel.dataset.academyPanel === active;
    panel.classList.toggle('hidden', !isActive);
    panel.hidden = !isActive;
    panel.setAttribute('aria-hidden', String(!isActive));
  });

  const aiBtn = $('academyAiBtn');
  if (aiBtn && !aiBtn.dataset.bound) {
    aiBtn.dataset.bound = 'true';
    aiBtn.addEventListener('click', () => openAiCoach());
  }
}

// ===== PROBLEM BUTTONS (Training Programs) =====

function renderProblemButtons() {
  const panel = $('trainingProgram');
  if (!panel) return;

  $$('.problem-btn').forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = 'true';
    btn.addEventListener('click', () => {
      const problemId = btn.dataset.problem;
      const program = getTrainingProgram(problemId);
      if (!program) return;

      // Toggle selection
      $$('.problem-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      haptic();

      renderTrainingDetail(program, panel);
    });
  });
}

function renderTrainingDetail(program, panel) {
  const pet = state.pet.data;
  const petName = pet?.name || 'ваш песик';

  panel.classList.remove('hidden');
  panel.innerHTML = `
    <div class="card" style="border-left: 4px solid var(--accent)">
      <div class="training-header">
        <span class="training-header-icon">${program.icon}</span>
        <div class="training-header-info">
          <h4>${escapeHtml(program.title)}</h4>
          <p>${escapeHtml(program.desc)}</p>
        </div>
        <span class="training-duration">${escapeHtml(program.duration)}</span>
      </div>

      <div class="training-steps">
        ${program.steps.map((step, i) => `
          <div class="training-step">
            <div class="training-step-num">${i + 1}</div>
            <div class="training-step-content">
              <div class="training-step-title">${escapeHtml(step.title)}</div>
              <div class="training-step-desc">${escapeHtml(step.desc)}</div>
            </div>
          </div>
        `).join('')}
      </div>

      ${program.tip ? `<div class="training-tip">💡 ${escapeHtml(program.tip)}</div>` : ''}
      ${program.mistake ? `<div class="training-mistake">⚠️ ${escapeHtml(program.mistake)}</div>` : ''}

      <button class="btn btn-primary full-width mt-lg" data-academy-ai-prompt="Як відучити ${escapeHtml(petName)} ${escapeHtml(program.title.toLowerCase())}? Детальний план на 2 тижні." type="button">
        Запитати AI детальніше
      </button>
    </div>
  `;

  // Bind AI button
  panel.querySelector('[data-academy-ai-prompt]')?.addEventListener('click', (e) => {
    const prompt = e.currentTarget.dataset.academyAiPrompt;
    if (prompt) openAiCoach(prompt);
  });

  // Scroll to panel
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function openAiCoach(prompt = 'Склади персональний план тренування на цей тиждень.') {
  setActiveTab('tabChat');
  const ai = await import('./ai-tab.js');
  ai.submitPrompt(prompt);
}

// ===== COURSES GRID =====

async function renderCourseGrid() {
  const grid = $('courseGrid');
  const viewer = $('selectedCourse');
  if (!grid || !viewer) return;

  try {
    const courses = await getCourses();
    const filter = state.ui.courseFilter;
    const currentId = state.ui.currentCourseId;

    const filtered = filter === 'all'
      ? courses
      : courses.filter(c => c.level === filter);

    grid.innerHTML = filtered.map(c => {
      const progress = getCourseProgress(c.id, c.checklist?.length || 0);
      return `
        <button type="button" class="course-btn ${c.id === currentId ? 'selected' : ''}" data-course-id="${c.id}">
          <span class="c-badge">${c.badge}</span>
          <strong>${c.title}</strong>
          <div class="c-meta">${c.description}</div>
          ${progress > 0 ? `<div class="progress-bar"><div class="progress-bar-fill" style="width:${progress}%"></div></div>` : ''}
        </button>`;
    }).join('');

    // Bind course selection
    grid.querySelectorAll('[data-course-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.ui.currentCourseId = btn.dataset.courseId;
        haptic();
        renderCourseGrid(); // Re-render with new selection
      });
    });

    // Render selected course detail
    const course = courses.find(c => c.id === currentId) || filtered[0] || courses[0];
    if (course) {
      renderCourseDetail(course, viewer);
    }
  } catch (e) {
    grid.innerHTML = '<p class="text-muted">Завантаження курсів...</p>';
  }
}

function renderCourseDetail(course, container) {
  const progress = JSON.parse(localStorage.getItem(STORAGE_KEYS.courseProgress) || '{}');
  const done = progress[course.id] || {};

  container.innerHTML = `
    <div class="course-detail">
      <h3>${course.title}</h3>
      <p style="color:var(--text-secondary);margin-bottom:1rem">${course.description}</p>
      <h4>Кроки</h4>
      <ul>${course.steps.map(s => `<li>${s}</li>`).join('')}</ul>
      <h4>Помилки</h4>
      <ul class="mistakes">${course.mistakes.map(s => `<li>${s}</li>`).join('')}</ul>
      <h4>Чекліст</h4>
      <ul class="checks">${course.checklist.map((s, i) =>
        `<li><label class="daily-item">
          <input type="checkbox" data-course-check="${course.id}:${i}" ${done[i] ? 'checked' : ''}>
          <span>${s}</span>
        </label></li>`
      ).join('')}</ul>
    </div>`;

  container.querySelectorAll('[data-course-check]').forEach(cb => {
    cb.addEventListener('change', () => {
      const [courseId, idx] = cb.dataset.courseCheck.split(':');
      const p = JSON.parse(localStorage.getItem(STORAGE_KEYS.courseProgress) || '{}');
      if (!p[courseId]) p[courseId] = {};
      p[courseId][idx] = cb.checked;
      localStorage.setItem(STORAGE_KEYS.courseProgress, JSON.stringify(p));
      haptic();
    });
  });
}

function getCourseProgress(courseId, totalChecks) {
  if (totalChecks === 0) return 0;
  const p = JSON.parse(localStorage.getItem(STORAGE_KEYS.courseProgress) || '{}');
  const done = p[courseId] || {};
  return Math.round(Object.values(done).filter(Boolean).length / totalChecks * 100);
}

// ===== KNOWLEDGE =====

async function renderKnowledgeGrid() {
  const grid = $('knowledgeGrid');
  if (!grid || knowledgeRendered) return;

  try {
    const knowledge = await getKnowledge();
    grid.innerHTML = knowledge.map(k => `
      <div class="k-card">
        <strong>${k.title}</strong>
        <p>${k.text}</p>
        <span class="k-tag">${k.tag}</span>
      </div>
    `).join('');
    knowledgeRendered = true;
  } catch {
    grid.innerHTML = '<p class="text-muted">Завантаження...</p>';
  }
}

// ===== SOCIAL =====

async function renderSocialGrid() {
  const grid = $('socialGrid');
  if (!grid || socialRendered) return;

  try {
    const socialItems = await getSocial();
    const done = JSON.parse(localStorage.getItem(STORAGE_KEYS.social) || '{}');
    const totalDone = Object.values(done).filter(Boolean).length;
    const totalItems = socialItems.reduce((s, g) => s + g.items.length, 0);

    grid.innerHTML = `<div style="margin-bottom:0.75rem"><span class="badge">${totalDone}/${totalItems} ✓</span></div>` +
      socialItems.map(group => `
        <div class="social-group">
          <h5 class="social-group-title">${group.category}</h5>
          ${group.items.map(item => {
            const key = `${group.category}:${item}`;
            return `<label class="social-item">
              <input type="checkbox" data-social-key="${escapeHtml(key)}" ${done[key] ? 'checked' : ''}>
              <span>${item}</span>
            </label>`;
          }).join('')}
        </div>
      `).join('');

    grid.querySelectorAll('[data-social-key]').forEach(cb => {
      cb.addEventListener('change', () => {
        const d = JSON.parse(localStorage.getItem(STORAGE_KEYS.social) || '{}');
        d[cb.dataset.socialKey] = cb.checked;
        localStorage.setItem(STORAGE_KEYS.social, JSON.stringify(d));
        haptic();
      });
    });

    socialRendered = true;
  } catch {
    grid.innerHTML = '<p class="text-muted">Завантаження...</p>';
  }
}

// ===== TOILET GUIDE =====

function renderToiletGuide() {
  const grid = $('toiletGuide');
  if (!grid || grid.dataset.rendered) return;
  grid.dataset.rendered = 'true';

  const guide = [
    { title: '1. Знайте коли ⏰', text: 'Після сну, через 15–30 хв після їжі, після гри, кожні 1–2 год.' },
    { title: '2. Ведіть мовчки 🤫', text: 'Несіть на місце без слів і гри.' },
    { title: '3. Чекайте 3–5 хв ⏳', text: 'Нічого за 5 хв → в манеж, спроба через 10 хв.' },
    { title: '4. Хваліть одразу! 🎉', text: 'Клікер + ласощі протягом 3 секунд.' },
    { title: '5. Промах = 0 емоцій 😐', text: 'Мовчки ензимним засобом. Без криків.' },
    { title: '6. Записуйте 📝', text: 'Час кожного туалету → побачите патерн за 3–5 днів.' },
    { title: '7. Менше простору 📦', text: 'Собака не ходить де спить/їсть. Манеж!' },
  ];

  grid.innerHTML = guide.map(s => `
    <div class="k-card"><strong>${s.title}</strong><p>${s.text}</p></div>
  `).join('');
}

function renderAcademyProgress() {
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const last7 = state.events.items.filter(e => {
    const date = tsToDate(e.createdAt);
    return date && date.getTime() >= weekAgo;
  });
  const trainings = last7.filter(e => e.eventType === 'training').length;
  const walks = last7.filter(e => e.eventType === 'walk').length;
  const checks = JSON.parse(localStorage.getItem(STORAGE_KEYS.courseProgress) || '{}');
  const completedChecks = Object.values(checks)
    .flatMap(course => Object.values(course || {}))
    .filter(Boolean).length;

  const title = $('academyProgressTitle');
  const meta = $('academyProgressMeta');
  if (title) title.textContent = `${trainings} тренувань за 7 днів`;
  if (meta) meta.textContent = completedChecks > 0
    ? `${completedChecks} пунктів курсів закрито, ${walks} прогулянок записано`
    : 'Почніть з однієї програми або короткого уроку дня.';

  const grid = $('academyProgressGrid');
  if (!grid) return;
  grid.innerHTML = [
    { label: 'Тренування', value: trainings, hint: 'за 7 днів' },
    { label: 'Прогулянки', value: walks, hint: 'за 7 днів' },
    { label: 'Чеклісти', value: completedChecks, hint: 'закрито' },
  ].map(item => `
    <div class="metric-tile">
      <strong>${item.value}</strong>
      <span>${item.label}</span>
      <small>${item.hint}</small>
    </div>
  `).join('');
}

function renderAcademyLesson() {
  const el = $('academyLesson');
  if (!el) return;
  const petName = state.pet.data?.name || 'собакою';
  el.innerHTML = `
    <div class="lesson-card">
      <span class="eyebrow">5 хвилин</span>
      <h4>Контакт очима перед рухом</h4>
      <p>Станьте поруч із ${escapeHtml(petName)}, дочекайтесь погляду, скажіть маркер і дайте ласощі. Повторіть 5 разів, потім зробіть один крок і нагородіть за спокійний контакт.</p>
      <div class="checklist-compact">
        <label><input type="checkbox"> 5 повторів без натягу</label>
        <label><input type="checkbox"> завершили на успіху</label>
      </div>
    </div>
  `;
}

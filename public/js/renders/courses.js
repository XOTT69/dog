/**
 * @fileoverview Courses tab — course grid, training programs, knowledge, social
 */

import { state, STORAGE_KEYS } from '../state.js';
import { $, $$, escapeHtml, haptic } from '../utils.js';
import { getCourses, getKnowledge, getSocial } from '../content-loader.js';
import { setActiveTab } from '../render.js';
import { confirmDialog } from '../modal.js';
import { getTrainingProgram, TRAINING_PROGRAMS, getTrainingProgress, toggleTrainingStep, getTrainingCompletionPercent, resetTrainingProgress } from '../training-programs.js';

/** @type {boolean} */
let coursesRendered = false;
let knowledgeRendered = false;
let socialRendered = false;

export async function render() {
  renderAcademyProgress();
  renderProblemButtons();
  await renderCourseGrid();
  await renderKnowledgeGrid();
  await renderSocialGrid();
  renderToiletGuide();
}

function renderAcademyProgress() {
  const el = $('academyProgressPct');
  if (!el) return;

  const keys = Object.keys(TRAINING_PROGRAMS);
  const values = keys.map(k => getTrainingCompletionPercent(k)).filter(v => v > 0);
  const avg = values.length ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length) : 0;
  el.textContent = `${avg}%`;
}

// ===== HIDDEN PROBLEMS (can hide irrelevant buttons) =====
const HIDDEN_PROBLEMS_KEY = 'dc_hidden_problems';

function getHiddenProblems() {
  try {
    return JSON.parse(localStorage.getItem(HIDDEN_PROBLEMS_KEY) || '[]');
  } catch { return []; }
}

function toggleHiddenProblem(problemId) {
  const hidden = getHiddenProblems();
  const idx = hidden.indexOf(problemId);
  if (idx === -1) {
    hidden.push(problemId);
  } else {
    hidden.splice(idx, 1);
  }
  localStorage.setItem(HIDDEN_PROBLEMS_KEY, JSON.stringify(hidden));
  renderProblemButtons(); // Re-render
}

// ===== PROBLEM BUTTONS (Training Programs) =====

function renderProblemButtons() {
  const panel = $('trainingProgram');
  if (!panel) return;
  const hiddenProblems = getHiddenProblems();
  let manageMode = panel.dataset.manageMode === 'true';

  $$('.problem-btn').forEach(btn => {
    const problemId = btn.dataset.problem;
    
    // Apply hidden class
    if (hiddenProblems.includes(problemId) && !manageMode) {
      btn.classList.add('hidden-problem');
    } else {
      btn.classList.remove('hidden-problem');
    }

    if (btn.dataset.boundAI) return;
    btn.dataset.boundAI = 'true';
    
    btn.addEventListener('click', () => {
      if (manageMode) {
        // In manage mode — toggle hidden
        toggleHiddenProblem(problemId);
        return;
      }
      const program = getTrainingProgram(problemId);
      if (!program) return;

      // Toggle selection
      $$('.problem-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      haptic();

      renderTrainingDetail(program, panel);
    });
  });

  // Add manage button if not exists
  let manageBtn = $('manageProblemsBtn');
  const problemCard = document.querySelector('.problem-grid')?.parentElement;
  
  if (problemCard && !manageBtn) {
    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex;gap:0.5rem;margin-top:0.75rem';
    footer.innerHTML = `
      <button class="btn btn-ghost btn-sm full-width" id="manageProblemsBtn" type="button">
        ⚙️ Керувати списком
      </button>
    `;
    problemCard.appendChild(footer);
    footer.querySelector('#manageProblemsBtn').addEventListener('click', () => {
      panel.dataset.manageMode = panel.dataset.manageMode !== 'true' ? 'true' : '';
      const btn = footer.querySelector('#manageProblemsBtn');
      if (panel.dataset.manageMode === 'true') {
        btn.textContent = '✅ Готово';
        btn.classList.add('btn-primary');
        btn.classList.remove('btn-ghost');
      } else {
        btn.textContent = '⚙️ Керувати списком';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-ghost');
      }
      renderProblemButtons();
    });
  }
}

function renderTrainingDetail(program, panel) {
  const pet = state.pet.data;
  const petName = pet?.name || 'ваш песик';

  // Get problemId from TRAINING_PROGRAMS
  const problemId = Object.keys(TRAINING_PROGRAMS).find(k => TRAINING_PROGRAMS[k] === program) || '';
  const progress = problemId ? getTrainingProgress(problemId) : { completedSteps: [] };
  const completedSet = new Set(progress.completedSteps);
  const pct = problemId ? getTrainingCompletionPercent(problemId) : 0;

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

      ${pct > 0 ? `
        <div class="training-progress">
          <div class="training-progress-bar">
            <div class="training-progress-fill" style="width:${pct}%"></div>
          </div>
          <div class="training-progress-text">${pct}% виконано ${progress.completedAt ? '🎉' : ''}</div>
        </div>
      ` : ''}

      <div class="training-steps" data-problem-id="${escapeHtml(problemId)}">
        ${program.steps.map((step, i) => {
          const done = completedSet.has(i);
          return `
          <div class="training-step ${done ? 'done' : ''}" data-step-index="${i}">
            <div class="training-step-num" style="background:${done ? 'var(--success)' : 'var(--accent-gradient)'}">${done ? '✓' : (i + 1)}</div>
            <div class="training-step-content">
              <div class="training-step-title" style="${done ? 'text-decoration:line-through;color:var(--text-muted)' : ''}">${escapeHtml(step.title)}</div>
              <div class="training-step-desc">${escapeHtml(step.desc)}</div>
            </div>
            <div style="flex-shrink:0;padding-left:0.5rem">
              <input type="checkbox" ${done ? 'checked' : ''} data-training-step="${problemId}:${i}" style="width:18px;height:18px;accent-color:var(--success)">
            </div>
          </div>
        `}).join('')}
      </div>

      ${program.tip ? `<div class="training-tip">💡 ${escapeHtml(program.tip)}</div>` : ''}
      ${program.mistake ? `<div class="training-mistake">⚠️ ${escapeHtml(program.mistake)}</div>` : ''}

      <div style="display:flex;gap:0.5rem;margin-top:1rem">
        <button class="btn btn-primary full-width" data-ai-prompt="Як відучити ${escapeHtml(petName)} ${escapeHtml(program.title.toLowerCase())}? Детальний план на 2 тижні." type="button">
          🤖 Запитати AI
        </button>
        ${pct > 0 ? `<button class="btn btn-ghost" id="resetTrainingProgressBtn" type="button" style="flex-shrink:0">↺</button>` : ''}
      </div>
    </div>
  `;

  // Bind training step checkboxes
  panel.querySelectorAll('[data-training-step]').forEach(cb => {
    cb.addEventListener('change', () => {
      const [pid, idxStr] = cb.dataset.trainingStep.split(':');
      const idx = parseInt(idxStr);
      toggleTrainingStep(pid, idx);
      // Re-render the detail with updated progress
      renderTrainingDetail(program, panel);
      renderAcademyProgress();
    });
  });

  // Reset progress
  panel.querySelector('#resetTrainingProgressBtn')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Скинути прогрес?',
      message: 'Чекліст цієї програми почнеться спочатку.',
      confirmLabel: 'Скинути',
      danger: true,
    });
    if (ok) {
      resetTrainingProgress(problemId);
      renderTrainingDetail(program, panel);
      renderAcademyProgress();
    }
  });

  // Bind AI button
  panel.querySelector('[data-ai-prompt]')?.addEventListener('click', (e) => {
    const prompt = e.currentTarget.dataset.aiPrompt;
    if (prompt) {
      openCoach(prompt);
    }
  });

  // Scroll to panel
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function openCoach(prompt) {
  setActiveTab('tabChat');
  const chat = await import('./chat.js');
  if (prompt) {
    setTimeout(() => chat.submitPrompt(prompt), 250);
  } else {
    chat.render();
  }
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

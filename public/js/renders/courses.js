/**
 * @fileoverview Academy tab — courses, training programs, knowledge and socialization
 */

import { state, STORAGE_KEYS } from '../state.js';
import { $, $$, escapeHtml, haptic } from '../utils.js';
import { getCourses, getKnowledge, getSocial } from '../content-loader.js';
import { setActiveTab } from '../render.js';
import { confirmDialog } from '../modal.js';
import {
  getTrainingProgram,
  TRAINING_PROGRAMS,
  getTrainingProgress,
  toggleTrainingStep,
  getTrainingCompletionPercent,
  resetTrainingProgress,
} from '../training-programs.js';

let knowledgeRendered = false;
let socialRendered = false;

const HIDDEN_PROBLEMS_KEY = 'dc_hidden_problems';
const PENDING_PROMPT_KEY = 'dc_pending_ai_prompt';

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

  const values = Object.keys(TRAINING_PROGRAMS)
    .map((key) => getTrainingCompletionPercent(key))
    .filter((value) => value > 0);
  const average = values.length
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : 0;

  el.textContent = `${average}%`;
}

function getHiddenProblems() {
  try {
    return JSON.parse(localStorage.getItem(HIDDEN_PROBLEMS_KEY) || '[]');
  } catch {
    return [];
  }
}

function toggleHiddenProblem(problemId) {
  const hidden = getHiddenProblems();
  const index = hidden.indexOf(problemId);

  if (index === -1) hidden.push(problemId);
  else hidden.splice(index, 1);

  localStorage.setItem(HIDDEN_PROBLEMS_KEY, JSON.stringify(hidden));
  renderProblemButtons();
}

function renderProblemButtons() {
  const panel = $('trainingProgram');
  if (!panel) return;

  const hiddenProblems = getHiddenProblems();
  const manageMode = panel.dataset.manageMode === 'true';

  $$('.problem-btn').forEach((button) => {
    const problemId = button.dataset.problem;
    button.classList.toggle('hidden-problem', hiddenProblems.includes(problemId) && !manageMode);

    if (button.dataset.boundAcademy === 'true') return;
    button.dataset.boundAcademy = 'true';

    button.addEventListener('click', () => {
      if (panel.dataset.manageMode === 'true') {
        toggleHiddenProblem(problemId);
        return;
      }

      const program = getTrainingProgram(problemId);
      if (!program) return;

      $$('.problem-btn').forEach((item) => item.classList.remove('selected'));
      button.classList.add('selected');
      haptic();
      renderTrainingDetail(program, panel);
    });
  });

  const problemCard = document.querySelector('.problem-grid')?.parentElement;
  if (!problemCard || $('manageProblemsBtn')) return;

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
    const button = footer.querySelector('#manageProblemsBtn');

    if (panel.dataset.manageMode === 'true') {
      button.textContent = '✅ Готово';
      button.classList.add('btn-primary');
      button.classList.remove('btn-ghost');
    } else {
      button.textContent = '⚙️ Керувати списком';
      button.classList.remove('btn-primary');
      button.classList.add('btn-ghost');
    }

    renderProblemButtons();
  });
}

function renderTrainingDetail(program, panel) {
  const pet = state.pet.data;
  const petName = pet?.name || 'ваш песик';
  const problemId = Object.keys(TRAINING_PROGRAMS).find((key) => TRAINING_PROGRAMS[key] === program) || '';
  const progress = problemId ? getTrainingProgress(problemId) : { completedSteps: [] };
  const completedSet = new Set(progress.completedSteps);
  const percent = problemId ? getTrainingCompletionPercent(problemId) : 0;

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

      ${percent > 0 ? `
        <div class="training-progress">
          <div class="training-progress-bar">
            <div class="training-progress-fill" style="width:${percent}%"></div>
          </div>
          <div class="training-progress-text">${percent}% виконано ${progress.completedAt ? '🎉' : ''}</div>
        </div>
      ` : ''}

      <div class="training-steps" data-problem-id="${escapeHtml(problemId)}">
        ${program.steps.map((step, index) => {
          const done = completedSet.has(index);
          return `
            <div class="training-step ${done ? 'done' : ''}" data-step-index="${index}">
              <div class="training-step-num" style="background:${done ? 'var(--success)' : 'var(--accent-gradient)'}">${done ? '✓' : index + 1}</div>
              <div class="training-step-content">
                <div class="training-step-title" style="${done ? 'text-decoration:line-through;color:var(--text-muted)' : ''}">${escapeHtml(step.title)}</div>
                <div class="training-step-desc">${escapeHtml(step.desc)}</div>
              </div>
              <div style="flex-shrink:0;padding-left:0.5rem">
                <input type="checkbox" ${done ? 'checked' : ''} data-training-step="${problemId}:${index}" style="width:18px;height:18px;accent-color:var(--success)">
              </div>
            </div>
          `;
        }).join('')}
      </div>

      ${program.tip ? `<div class="training-tip">💡 ${escapeHtml(program.tip)}</div>` : ''}
      ${program.mistake ? `<div class="training-mistake">⚠️ ${escapeHtml(program.mistake)}</div>` : ''}

      <div style="display:flex;gap:0.5rem;margin-top:1rem">
        <button class="btn btn-primary full-width" data-ask-chat="Як відучити ${escapeHtml(petName)} ${escapeHtml(program.title.toLowerCase())}? Детальний план на 2 тижні." type="button">
          🤖 Запитати AI
        </button>
        ${percent > 0 ? '<button class="btn btn-ghost" id="resetTrainingProgressBtn" type="button" style="flex-shrink:0">↺</button>' : ''}
      </div>
    </div>
  `;

  panel.querySelectorAll('[data-training-step]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const [id, index] = checkbox.dataset.trainingStep.split(':');
      toggleTrainingStep(id, parseInt(index, 10));
      renderTrainingDetail(program, panel);
      renderAcademyProgress();
    });
  });

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

  panel.querySelector('[data-ask-chat]')?.addEventListener('click', (event) => {
    sendPromptToChat(event.currentTarget.dataset.askChat);
  });

  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function sendPromptToChat(prompt) {
  const cleanPrompt = prompt?.trim();
  if (!cleanPrompt) return;

  sessionStorage.setItem(PENDING_PROMPT_KEY, cleanPrompt);
  setActiveTab('tabChat');
  window.dispatchEvent(new CustomEvent('dogcoach:chat-prompt', {
    detail: { prompt: cleanPrompt },
  }));
}

async function renderCourseGrid() {
  const grid = $('courseGrid');
  const viewer = $('selectedCourse');
  if (!grid || !viewer) return;

  try {
    const courses = await getCourses();
    const filter = state.ui.courseFilter;
    const currentId = state.ui.currentCourseId;
    const filtered = filter === 'all' ? courses : courses.filter((course) => course.level === filter);

    grid.innerHTML = filtered.map((course) => {
      const progress = getCourseProgress(course.id, course.checklist?.length || 0);
      return `
        <button type="button" class="course-btn ${course.id === currentId ? 'selected' : ''}" data-course-id="${course.id}">
          <span class="c-badge">${course.badge}</span>
          <strong>${course.title}</strong>
          <div class="c-meta">${course.description}</div>
          ${progress > 0 ? `<div class="progress-bar"><div class="progress-bar-fill" style="width:${progress}%"></div></div>` : ''}
        </button>
      `;
    }).join('');

    grid.querySelectorAll('[data-course-id]').forEach((button) => {
      button.addEventListener('click', () => {
        state.ui.currentCourseId = button.dataset.courseId;
        haptic();
        renderCourseGrid();
      });
    });

    const course = courses.find((item) => item.id === currentId) || filtered[0] || courses[0];
    if (course) renderCourseDetail(course, viewer);
  } catch {
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
      <ul>${course.steps.map((step) => `<li>${step}</li>`).join('')}</ul>
      <h4>Помилки</h4>
      <ul class="mistakes">${course.mistakes.map((mistake) => `<li>${mistake}</li>`).join('')}</ul>
      <h4>Чекліст</h4>
      <ul class="checks">${course.checklist.map((item, index) => `
        <li><label class="daily-item">
          <input type="checkbox" data-course-check="${course.id}:${index}" ${done[index] ? 'checked' : ''}>
          <span>${item}</span>
        </label></li>
      `).join('')}</ul>
    </div>
  `;

  container.querySelectorAll('[data-course-check]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const [courseId, index] = checkbox.dataset.courseCheck.split(':');
      const savedProgress = JSON.parse(localStorage.getItem(STORAGE_KEYS.courseProgress) || '{}');
      if (!savedProgress[courseId]) savedProgress[courseId] = {};
      savedProgress[courseId][index] = checkbox.checked;
      localStorage.setItem(STORAGE_KEYS.courseProgress, JSON.stringify(savedProgress));
      haptic();
    });
  });
}

function getCourseProgress(courseId, totalChecks) {
  if (totalChecks === 0) return 0;
  const progress = JSON.parse(localStorage.getItem(STORAGE_KEYS.courseProgress) || '{}');
  const done = progress[courseId] || {};
  return Math.round((Object.values(done).filter(Boolean).length / totalChecks) * 100);
}

async function renderKnowledgeGrid() {
  const grid = $('knowledgeGrid');
  if (!grid || knowledgeRendered) return;

  try {
    const knowledge = await getKnowledge();
    grid.innerHTML = knowledge.map((item) => `
      <div class="k-card">
        <strong>${item.title}</strong>
        <p>${item.text}</p>
        <span class="k-tag">${item.tag}</span>
      </div>
    `).join('');
    knowledgeRendered = true;
  } catch {
    grid.innerHTML = '<p class="text-muted">Завантаження...</p>';
  }
}

async function renderSocialGrid() {
  const grid = $('socialGrid');
  if (!grid || socialRendered) return;

  try {
    const socialItems = await getSocial();
    const done = JSON.parse(localStorage.getItem(STORAGE_KEYS.social) || '{}');
    const totalDone = Object.values(done).filter(Boolean).length;
    const totalItems = socialItems.reduce((sum, group) => sum + group.items.length, 0);

    grid.innerHTML = `<div style="margin-bottom:0.75rem"><span class="badge">${totalDone}/${totalItems} ✓</span></div>` +
      socialItems.map((group) => `
        <div class="social-group">
          <h5 class="social-group-title">${group.category}</h5>
          ${group.items.map((item) => {
            const key = `${group.category}:${item}`;
            return `
              <label class="social-item">
                <input type="checkbox" data-social-key="${escapeHtml(key)}" ${done[key] ? 'checked' : ''}>
                <span>${item}</span>
              </label>
            `;
          }).join('')}
        </div>
      `).join('');

    grid.querySelectorAll('[data-social-key]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.social) || '{}');
        saved[checkbox.dataset.socialKey] = checkbox.checked;
        localStorage.setItem(STORAGE_KEYS.social, JSON.stringify(saved));
        haptic();
      });
    });

    socialRendered = true;
  } catch {
    grid.innerHTML = '<p class="text-muted">Завантаження...</p>';
  }
}

function renderToiletGuide() {
  const grid = $('toiletGuide');
  if (!grid || grid.dataset.rendered === 'true') return;
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

  grid.innerHTML = guide.map((step) => `
    <div class="k-card"><strong>${step.title}</strong><p>${step.text}</p></div>
  `).join('');
}

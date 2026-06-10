/**
 * @fileoverview Courses tab — courses, knowledge, social (AI moved to separate tab)
 */

import { state, STORAGE_KEYS } from '../state.js';
import { $, escapeHtml, haptic } from '../utils.js';
import { getCourses, getKnowledge, getSocial } from '../content-loader.js';

let knowledgeRendered = false;
let socialRendered = false;

export async function render() {
  await renderCourseGrid();
  await renderKnowledgeGrid();
  await renderSocialGrid();
  renderToiletGuide();
}

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

    grid.querySelectorAll('[data-course-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.ui.currentCourseId = btn.dataset.courseId;
        haptic();
        renderCourseGrid();
      });
    });

    const course = courses.find(c => c.id === currentId) || filtered[0] || courses[0];
    if (course) {
      renderCourseDetail(course, viewer);
    }
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

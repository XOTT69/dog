/**
 * @fileoverview Profile tab — pet form, health, workspace, push, export
 */

import { state } from '../state.js';
import { $, escapeHtml, avatarLetter, haptic, safeJsonParse } from '../utils.js';
import { MS_PER_DAY } from '../constants.js';
import { savePetProfile, subscribePush, getIdToken } from '../firebase.js';
import { toast, showLoading, hideLoading } from '../render.js';
import { renderHealthSchedule, isDewormingDue, isVaccinationDue } from '../vaccination.js';

/** @type {boolean} */
let bound = false;

export function render() {
  fillPetForm();
  renderMembers();
  renderWorkspaceMeta();
  renderHealthAlerts();
  renderHealthScheduleUI();
  renderMedicationTracker();
  if (!bound) bindProfileEvents();
}

// ===== FILL FORM =====

function fillPetForm() {
  const pet = state.pet.data;

  const setVal = (id, val) => { const el = $(id); if (el) el.value = val || ''; };
  setVal('petName', pet?.name);
  setVal('petBirthDate', pet?.birthDate);
  setVal('petSex', pet?.sex || 'хлопчик');
  setVal('petBreed', pet?.breed);
  setVal('petWeight', pet?.weight);
  setVal('petToiletMode', pet?.toiletMode || 'pad');
  setVal('petIssues', pet?.issues);
  setVal('petLastVaccine', pet?.lastVaccine);
  setVal('petLastDeworming', pet?.lastDeworming);
  setVal('petLastHeat', pet?.lastHeat);

  // Heat field visibility
  const heatField = $('heatDateField');
  if (heatField) heatField.style.display = pet?.sex === 'дівчинка' ? '' : 'none';

  // Adapt UI for cats
  const isCat = pet?.petType === 'cat';
  const toiletField = document.querySelector('[for="petToiletMode"]');
  const toiletSelect = $('petToiletMode');
  if (toiletField) toiletField.parentElement.style.display = isCat ? 'none' : '';
  if (toiletSelect) toiletSelect.disabled = isCat;
  // Change card title
  const profileCardTitle = document.querySelector('#tabProfile .card:first-child .card-title');
  if (profileCardTitle) profileCardTitle.textContent = isCat ? '🐱 Дані кота' : '🐕 Дані собаки';

  // Push status
  const ps = $('pushStatus');
  if (ps) {
    if (!('Notification' in window)) ps.textContent = '❌ Не підтримується';
    else if (Notification.permission === 'granted') ps.textContent = '✅ Увімкнені';
    else if (Notification.permission === 'denied') ps.textContent = '❌ Заблоковані';
    else ps.textContent = '';
  }
}

// ===== MEMBERS =====

function renderMembers() {
  const list = $('membersList');
  if (!list) return;

  const members = state.members.items;
  if (!members.length) {
    list.innerHTML = '<p class="text-muted">Поки тільки ви</p>';
    return;
  }

  list.innerHTML = members.map(m => `
    <div class="member-chip">
      <div class="m-avatar">
        ${m.photoURL
          ? `<img src="${escapeHtml(m.photoURL)}" alt="" loading="lazy">`
          : escapeHtml(avatarLetter(m.displayName))
        }
      </div>
      <span>${escapeHtml(m.displayName || 'Учасник')}</span>
    </div>
  `).join('');
}

// ===== WORKSPACE META =====

function renderWorkspaceMeta() {
  const el = $('inviteCodeView');
  if (el) el.textContent = state.workspace.data?.inviteCode || '—';
}

// ===== HEALTH ALERTS =====

function renderHealthAlerts() {
  // Show warnings if deworming or vaccination is due
  const alerts = [];
  if (isDewormingDue()) {
    alerts.push('💊 Дегельмінтизація потрібна! Зверніться до ветеринара.');
  }
  if (isVaccinationDue()) {
    alerts.push('💉 Щорічна вакцинація потрібна! Зверніться до ветеринара.');
  }

  // Update push status with health info
  const ps = $('pushStatus');
  if (ps && alerts.length > 0) {
    ps.innerHTML = alerts.map(a => `<div style="color:var(--warning);margin-top:0.25rem">${a}</div>`).join('');
  }
}

// ===== HEALTH SCHEDULE UI =====

function renderHealthScheduleUI() {
  const container = $('healthScheduleList');
  if (!container) return;
  renderHealthSchedule(container);
}

// ===== BIND EVENTS =====

function bindProfileEvents() {
  bound = true;

  // Pet profile form
  $('petProfileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Validate birth date
    const birthDate = $('petBirthDate')?.value;
    if (birthDate) {
      const date = new Date(birthDate);
      const now = new Date();
      if (date > now) {
        toast("Дата народження не може бути в майбутньому 📅", 'error');
        return;
      }
      const maxAge = new Date();
      maxAge.setFullYear(maxAge.getFullYear() - 20);
      if (date < maxAge) {
        toast("Перевірте дату народження 🐕", 'error');
        return;
      }
    }
    
    showLoading();
    try {
      await savePetProfile({
        name: $('petName')?.value.trim() || '',
        birthDate: birthDate || '',
        sex: $('petSex')?.value || 'хлопчик',
        breed: $('petBreed')?.value.trim() || '',
        weight: $('petWeight')?.value || '',
        toiletMode: $('petToiletMode')?.value || 'pad',
        issues: $('petIssues')?.value.trim() || '',
      });
      toast('Збережено ✓', 'success');
    } catch (e) {
      toast('Помилка збереження', 'error');
    } finally {
      hideLoading();
    }
  });

  // Health save
  $('saveHealthBtn')?.addEventListener('click', async () => {
    showLoading();
    try {
      await savePetProfile({
        lastVaccine: $('petLastVaccine')?.value || '',
        lastDeworming: $('petLastDeworming')?.value || '',
        lastHeat: $('petLastHeat')?.value || '',
      });
      toast('Збережено ✓', 'success');
    } catch {
      toast('Помилка', 'error');
    } finally {
      hideLoading();
    }
  });

  // Sex change → show/hide heat field
  $('petSex')?.addEventListener('change', () => {
    const hf = $('heatDateField');
    if (hf) hf.style.display = $('petSex').value === 'дівчинка' ? '' : 'none';
  });

  // Push notifications
  $('enablePushBtn')?.addEventListener('click', async () => {
    if (!('Notification' in window)) {
      toast('Не підтримується', 'error');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await subscribePush();
      toast('Увімкнені! 🔔', 'success');
    } else {
      toast('Відхилено', 'error');
    }
    fillPetForm(); // Update status display
  });

  // Copy invite code
  $('copyInviteBtn')?.addEventListener('click', () => {
    const code = state.workspace.data?.inviteCode;
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      toast('Скопійовано ✓', 'success');
      haptic();
    });
  });

  // Join workspace
  $('joinWorkspaceForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('inviteCodeInput');
    const code = input?.value.trim().toUpperCase();
    if (!code) return;

    showLoading();
    try {
      const token = await getIdToken();
      const response = await fetch('/api/join-workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ code }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не знайдено');

      if (input) input.value = '';
      toast('Приєдналися! 🎉', 'success');
      // Reload to re-subscribe
      window.location.reload();
    } catch (err) {
      toast(err.message || 'Помилка', 'error');
    } finally {
      hideLoading();
    }
  });

  // Export data
  $('exportDataBtn')?.addEventListener('click', () => {
    const events = state.events.items;
    if (!events.length) { toast('Немає даних', 'error'); return; }

    const data = {
      exportDate: new Date().toISOString(),
      pet: state.pet.data || {},
      events: events.map(e => ({
        type: e.eventType,
        time: e.createdAt?.toDate ? e.createdAt.toDate().toISOString() : null,
        note: e.note,
        value: e.value,
      })),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dogcoach_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    toast('Експортовано ✓', 'success');
  });
}

// ===== MEDICATION TRACKER =====

function renderMedicationTracker() {
  const container = $('medicationTracker');
  if (!container) return;

  // Dynamically import medication module
    import('../medication.js').then((m) => {
    const {
      getMedications,
      getTodaySchedule,
      getDueMedications,
      MEDICATION_TYPES,
      logDose,
      addMedication,
      deleteMedication,
      getMedicationLog,
    } = m;
    const meds = getMedications();
    const todaySchedule = getTodaySchedule();
    const dueMeds = getDueMedications();

    if (!meds.length && !container.dataset.expanded) {
      container.innerHTML = `
        <h4 class="card-title">💊 Трекер ліків</h4>
        <p class="text-muted" style="margin-bottom:0.75rem">Відстежуйте прийом ліків, вітамінів та профілактичних засобів.</p>
        <button class="btn btn-primary full-width" id="addFirstMedBtn" type="button">➕ Додати перший препарат</button>
      `;
      return;
    }

    const dueCount = dueMeds.length;
    const todayTaken = todaySchedule.filter(s => s.takenToday).length;
    const totalRecurring = todaySchedule.filter(s => s.med.intervalDays > 0).length;

    let html = `
      <div class="card-header">
        <h4 class="card-title">💊 Трекер ліків</h4>
        <div style="display:flex;gap:0.5rem;align-items:center">
          ${dueCount > 0 ? `<span class="badge danger">${dueCount} прострочено</span>` : ''}
          <button class="btn btn-ghost btn-sm" id="addMedBtn" type="button">+</button>
        </div>
      </div>
    `;

    // Today's schedule summary
    if (totalRecurring > 0) {
      html += `<div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.75rem">
        Сьогодні: ${todayTaken}/${totalRecurring} прийнято
        <div class="progress-bar" style="margin-top:0.25rem">
          <div class="progress-bar-fill" style="width:${Math.round((todayTaken / totalRecurring) * 100)}%"></div>
        </div>
      </div>`;
    }

    // Due medications warning
    if (dueMeds.length > 0) {
      html += `<div style="margin-bottom:0.75rem">`;
      for (const { med, daysSince } of dueMeds) {
        const typeInfo = MEDICATION_TYPES[med.type] || MEDICATION_TYPES.other;
        const daysOver = daysSince !== null ? daysSince - med.intervalDays : 0;
        html += `
          <div class="feed-item" style="border-left:3px solid var(--warning);margin-bottom:0.35rem">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <strong>${typeInfo.icon} ${escapeHtml(med.name)}</strong>
              <button class="btn btn-primary btn-sm" data-med-log="${med.id}" type="button">✓ Прийнято</button>
            </div>
            <div class="meta" style="color:var(--warning)">
              ${daysSince === null ? '⚠️ Не приймали жодного разу' : `⚠️ Прострочено на ${daysOver} дн.`}
            </div>
          </div>
        `;
      }
      html += `</div>`;
    }

    // Medication list
    html += `<div id="medList" style="display:${container.dataset.expanded ? 'block' : 'none'}">`;
    for (const item of todaySchedule) {
      const typeInfo = MEDICATION_TYPES[item.med.type] || MEDICATION_TYPES.other;
      const daysAgo = item.lastLog
        ? Math.floor((Date.now() - item.lastLog.timestamp) / MS_PER_DAY)
        : null;
      
      html += `
        <div class="feed-item" style="border-left:3px solid ${item.takenToday ? 'var(--success)' : item.isDue ? 'var(--warning)' : 'var(--border)'};margin-bottom:0.35rem">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <strong>${typeInfo.icon} ${escapeHtml(item.med.name)}</strong>
              ${item.med.dosage ? `<span class="text-muted" style="font-size:0.78rem"> · ${escapeHtml(item.med.dosage)}</span>` : ''}
            </div>
            <div style="display:flex;gap:0.35rem;align-items:center">
              ${!item.takenToday ? `<button class="btn btn-primary btn-sm" data-med-log="${item.med.id}" type="button">✓</button>` : '<span style="color:var(--success);font-size:0.8rem">✅</span>'}
              <button class="btn btn-ghost btn-sm" data-med-info="${item.med.id}" type="button">📋</button>
              <button class="btn btn-ghost btn-sm" data-med-delete="${item.med.id}" type="button" style="color:var(--danger)">✕</button>
            </div>
          </div>
          <div class="meta">
            ${item.med.intervalDays > 0 ? `Кожні ${item.med.intervalDays} дн.` : 'Одноразово'}
            ${daysAgo !== null ? ` · Востаннє ${daysAgo} дн. тому` : ''}
            ${item.takenToday ? ` · Сьогодні ${item.lastLog?.time || ''}` : ''}
          </div>
          ${item.med.notes ? `<div class="text-muted" style="font-size:0.78rem">📝 ${escapeHtml(item.med.notes)}</div>` : ''}
        </div>
      `;
    }
    html += `</div>`;

    // Toggle expand/collapse
    html += `<button class="btn btn-ghost btn-sm full-width" id="toggleMedListBtn" type="button" style="margin-top:0.5rem">
      ${container.dataset.expanded ? '▲ Сховати' : '▼ Показати всі'}
    </button>`;

    container.innerHTML = html;

    // Bind medication events (use already loaded module m)
    bindMedicationEvents(container, {
      getMedications, getTodaySchedule, getDueMedications,
      MEDICATION_TYPES, logDose, addMedication, deleteMedication, getMedicationLog,
      INTERVAL_SUGGESTIONS: m.INTERVAL_SUGGESTIONS,
    });
  }).catch(() => {
    container.innerHTML = '<p class="text-muted">Помилка завантаження трекера</p>';
  });
}

function bindMedicationEvents(container, api) {
  if (container.dataset.medBound) return;
  container.dataset.medBound = 'true';

  const { getMedications, logDose, addMedication, deleteMedication, getMedicationLog, MEDICATION_TYPES, INTERVAL_SUGGESTIONS } = api;

  // Log dose
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-med-log]');
    if (btn) {
      const medId = btn.dataset.medLog;
      const note = prompt('Нотатка (необов\'язково):') || '';
      logDose(medId, note);
      toast('✅ Записано!', 'success');
      renderMedicationTracker();
    }
  });

  // Show info / log
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-med-info]');
    if (btn) {
      const medId = btn.dataset.medInfo;
      const meds = getMedications();
      const med = meds.find(m => m.id === medId);
      if (!med) return;

      const log = getMedicationLog(medId, 5);
      const typeInfo = MEDICATION_TYPES[med.type] || MEDICATION_TYPES.other;

      const logHtml = log.length
        ? log.map(l => `<div style="font-size:0.78rem;color:var(--text-secondary)">${l.date} ${l.time} ${l.note ? '— ' + escapeHtml(l.note) : ''}</div>`).join('')
        : '<div class="text-muted">Ще не приймали</div>';

      alert(`💊 ${med.name}
Тип: ${typeInfo.label}
Дозування: ${med.dosage || '—'}
Інтервал: ${med.intervalDays > 0 ? `кожні ${med.intervalDays} дн.` : 'одноразово'}
Нотатки: ${med.notes || '—'}

📋 Останні прийоми:
${logHtml}`);
    }
  });

  // Delete medication
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-med-delete]');
    if (btn) {
      const medId = btn.dataset.medDelete;
      if (confirm('Видалити цей препарат?')) {
        deleteMedication(medId);
        toast('Видалено', 'success');
        renderMedicationTracker();
      }
    }
  });

  // Toggle list
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('#toggleMedListBtn');
    if (btn) {
      const isExpanded = container.dataset.expanded === 'true';
      container.dataset.expanded = isExpanded ? 'false' : 'true';
      renderMedicationTracker();
    }
  });

  // Add medication (first or subsequent)
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('#addFirstMedBtn, #addMedBtn');
    if (btn) {
      showAddMedicationDialog(api);
    }
  });
}

function showAddMedicationDialog(api) {
  const { MEDICATION_TYPES, INTERVAL_SUGGESTIONS } = api;
  
  // Build a simple modal-like prompt sequence
  const name = prompt('Назва препарату:');
  if (!name?.trim()) return;

  const typeKeys = Object.keys(MEDICATION_TYPES);
  const typePrompt = typeKeys.map((k, i) => `${i + 1}. ${MEDICATION_TYPES[k].icon} ${MEDICATION_TYPES[k].label}`).join('\n');
  const typeChoice = prompt(`Тип препарату:\n${typePrompt}\n\nВведіть номер (1-${typeKeys.length}):`);
  const typeIdx = parseInt(typeChoice) - 1;
  const type = typeKeys[typeIdx] || 'other';

  const dosage = prompt('Дозування (необов\'язково):') || '';

  const intervalPrompt = INTERVAL_SUGGESTIONS.map((s, i) => `${i + 1}. ${s.label}`).join('\n');
  const intervalChoice = prompt(`Як часто приймати?\n${intervalPrompt}\n\nВведіть номер (1-${INTERVAL_SUGGESTIONS.length}):`);
  const intervalIdx = parseInt(intervalChoice) - 1;
  const intervalDays = INTERVAL_SUGGESTIONS[intervalIdx]?.days ?? 0;

  const notes = prompt('Нотатки (необов\'язково):') || '';

  try {
    addMedication({ name: name.trim(), type, dosage, intervalDays, notes });
    toast(`💊 ${name.trim()} додано!`, 'success');
    renderMedicationTracker();
  } catch (e) {
    toast('Помилка додавання', 'error');
  }
}

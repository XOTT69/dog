/**
 * @fileoverview Profile tab — pet form, health, workspace, push, export
 */

import { state } from '../state.js';
import { $, escapeHtml, avatarLetter, haptic } from '../utils.js';
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

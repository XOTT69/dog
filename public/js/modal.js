import { escapeHtml } from './utils.js';

function closeModal(modal, value) {
  modal.classList.remove('show');
  setTimeout(() => modal.remove(), 180);
  modal._resolve(value);
}

function createModal({ title, body, actions = [] }) {
  const modal = document.createElement('div');
  modal.className = 'modal-layer';
  modal.innerHTML = `
    <div class="modal-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <div class="modal-header">
        <h3>${escapeHtml(title)}</h3>
        <button class="icon-btn modal-close" type="button" aria-label="Закрити">×</button>
      </div>
      <div class="modal-body">${body}</div>
      <div class="modal-actions"></div>
    </div>
  `;

  const actionsEl = modal.querySelector('.modal-actions');
  for (const action of actions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn ${action.className || 'btn-ghost'}`;
    btn.textContent = action.label;
    btn.addEventListener('click', () => action.onClick?.(modal));
    actionsEl.appendChild(btn);
  }

  modal.querySelector('.modal-close')?.addEventListener('click', () => closeModal(modal, null));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(modal, null);
  });
  document.addEventListener('keydown', function onKey(e) {
    if (!document.body.contains(modal)) {
      document.removeEventListener('keydown', onKey);
      return;
    }
    if (e.key === 'Escape') closeModal(modal, null);
  });

  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('show'));
  modal.querySelector('input, select, textarea, button')?.focus();
  return modal;
}

export function confirmDialog({ title = 'Підтвердити дію', message = '', confirmLabel = 'Підтвердити', cancelLabel = 'Скасувати', danger = false } = {}) {
  return new Promise((resolve) => {
    const modal = createModal({
      title,
      body: `<p class="modal-copy">${escapeHtml(message)}</p>`,
      actions: [
        { label: cancelLabel, className: 'btn-ghost', onClick: (m) => closeModal(m, false) },
        { label: confirmLabel, className: danger ? 'btn-danger' : 'btn-primary', onClick: (m) => closeModal(m, true) },
      ],
    });
    modal._resolve = resolve;
  });
}

export function promptDialog({ title = 'Введіть значення', message = '', label = '', placeholder = '', value = '', required = false, multiline = false, confirmLabel = 'Зберегти' } = {}) {
  return new Promise((resolve) => {
    const inputTag = multiline ? 'textarea' : 'input';
    const inputAttrs = multiline ? 'rows="3"' : 'type="text"';
    const modal = createModal({
      title,
      body: `
        ${message ? `<p class="modal-copy">${escapeHtml(message)}</p>` : ''}
        <label class="modal-field">
          <span>${escapeHtml(label)}</span>
          <${inputTag} id="modalPromptInput" ${inputAttrs} placeholder="${escapeHtml(placeholder)}">${multiline ? escapeHtml(value) : ''}</${inputTag}>
        </label>
      `,
      actions: [
        { label: 'Скасувати', className: 'btn-ghost', onClick: (m) => closeModal(m, null) },
        { label: confirmLabel, className: 'btn-primary', onClick: (m) => {
          const input = m.querySelector('#modalPromptInput');
          const val = input?.value?.trim() || '';
          if (required && !val) {
            input?.focus();
            input?.classList.add('invalid');
            return;
          }
          closeModal(m, val);
        } },
      ],
    });
    modal._resolve = resolve;
    const input = modal.querySelector('#modalPromptInput');
    if (input && !multiline) input.value = value;
  });
}

export function infoDialog({ title = 'Інформація', html = '', confirmLabel = 'Готово' } = {}) {
  return new Promise((resolve) => {
    const modal = createModal({
      title,
      body: html,
      actions: [
        { label: confirmLabel, className: 'btn-primary', onClick: (m) => closeModal(m, true) },
      ],
    });
    modal._resolve = resolve;
  });
}

export function formDialog({ title, fields, submitLabel = 'Зберегти' }) {
  return new Promise((resolve) => {
    const body = `<form id="modalForm" class="modal-form">
      ${fields.map((field) => {
        const common = `id="modal_${field.name}" name="${field.name}" ${field.required ? 'required' : ''}`;
        if (field.type === 'select') {
          return `<label class="modal-field"><span>${escapeHtml(field.label)}</span><select ${common}>${field.options.map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('')}</select></label>`;
        }
        if (field.type === 'textarea') {
          return `<label class="modal-field"><span>${escapeHtml(field.label)}</span><textarea ${common} rows="${field.rows || 3}" placeholder="${escapeHtml(field.placeholder || '')}">${escapeHtml(field.value || '')}</textarea></label>`;
        }
        return `<label class="modal-field"><span>${escapeHtml(field.label)}</span><input ${common} type="${field.type || 'text'}" value="${escapeHtml(field.value || '')}" placeholder="${escapeHtml(field.placeholder || '')}" min="${escapeHtml(field.min || '')}" max="${escapeHtml(field.max || '')}" step="${escapeHtml(field.step || '')}"></label>`;
      }).join('')}
    </form>`;

    const modal = createModal({
      title,
      body,
      actions: [
        { label: 'Скасувати', className: 'btn-ghost', onClick: (m) => closeModal(m, null) },
        { label: submitLabel, className: 'btn-primary', onClick: (m) => {
          const form = m.querySelector('#modalForm');
          if (!form?.reportValidity()) return;
          const data = {};
          for (const field of fields) {
            data[field.name] = form.elements[field.name]?.value?.trim() || '';
          }
          closeModal(m, data);
        } },
      ],
    });
    modal._resolve = resolve;
  });
}

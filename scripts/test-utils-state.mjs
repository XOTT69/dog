import assert from 'node:assert/strict';

const store = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key) => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  },
});
Object.defineProperty(globalThis, 'window', {
  value: {
    matchMedia: () => ({ matches: false }),
  },
});
Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true, vibrate: () => false },
  configurable: true,
});
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

const utils = await import('../public/js/utils.js');
const stateModule = await import('../public/js/state.js');

assert.equal(utils.localDateKey(new Date('2026-06-25T12:00:00')), '2026-06-25');
assert.equal(utils.weekLabel(null), '—');
assert.equal(utils.weekLabel(10), '2 міс.');
assert.deepEqual(utils.calcToiletStats([
  { eventType: 'pee_success' },
  { eventType: 'poo_miss' },
  { eventType: 'walk' },
]), { success: 1, miss: 1, total: 2, rate: 50 });
assert.equal(utils.escapeHtml('<b>x</b>'), '&lt;b&gt;x&lt;/b&gt;');

let notified = false;
const unsub = stateModule.subscribe('ui.theme', () => { notified = true; });
stateModule.state.ui.theme = 'dark';
await new Promise(resolve => setTimeout(resolve, 5));
assert.equal(notified, true);
unsub();

stateModule.persistTheme();
assert.equal(localStorage.getItem(stateModule.STORAGE_KEYS.theme), 'dark');

console.log('unit ok');

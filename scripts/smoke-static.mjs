import assert from 'node:assert/strict';
import fs from 'node:fs';

const jsonFiles = [
  'package.json',
  'public/manifest.webmanifest',
  'firebase/firestore.indexes.json',
  'public/content/breeds.json',
  'public/content/courses.json',
  'public/content/knowledge.json',
  'public/content/protocols.json',
  'public/content/social.json',
  'public/content/tips.json',
];

for (const file of jsonFiles) {
  JSON.parse(fs.readFileSync(file, 'utf8'));
}

const html = fs.readFileSync('public/index.html', 'utf8');
assert.match(html, /id="tabCalendar"/);
assert.match(html, /data-tab="tabCalendar"/);
assert.doesNotMatch(html, /user-scalable=no|maximum-scale/);

const localRefs = [...html.matchAll(/(?:href|src)="\/(?!\/)([^"#?]+)/g)]
  .map(match => `public/${match[1]}`);
for (const ref of new Set(localRefs)) {
  assert.equal(fs.existsSync(ref), true, `Missing referenced asset: ${ref}`);
}

const sw = fs.readFileSync('public/sw.js', 'utf8');
for (const asset of ['/js/modal.js', '/js/renders/calendar.js']) {
  assert.equal(sw.includes(asset), true, `Service worker does not cache ${asset}`);
}

console.log('static smoke ok');

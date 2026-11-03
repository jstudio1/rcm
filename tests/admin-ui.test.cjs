// The admin menu structure: few menus, every editing screen reachable from exactly one tab.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.resolve(__dirname, '../admin/admin.js'), 'utf8');

test('admin menus: six menus, every screen placed once, nothing orphaned', () => {
  const block = /const MENUS = \[([\s\S]*?)\n  \];/.exec(src)[1];
  const menus = [...block.matchAll(/\{ id: '([\w-]+)', label: '([^']+)'/g)].map(m => m[1]);
  assert.deepEqual(menus, ['home', 'content', 'store', 'report', 'media', 'settings']);
  const parts = [];
  for (const m of block.matchAll(/tab\('([\w-]+)',\s*'[^']+'(?:,\s*\[([^\]]*)\])?\)/g)) { parts.push(m[1]); if (m[2]) parts.push(...[...m[2].matchAll(/'([\w-]+)'/g)].map(x => x[1])); }
  assert.equal(new Set(parts).size, parts.length, 'a screen appears in two tabs');
  // every screen defined in PARTS (literal ids + the generated page-settings and delete/odds ones)
  const defined = new Set([...src.matchAll(/^    \{ id: '([\w-]+)', g: /gm)].map(m => m[1]));
  for (const k of ['rewards', 'gameplay', 'drivers', 'news', 'faq']) defined.add('p-' + k);
  for (const k of ['delete', 'odds']) defined.add('p-' + k);
  for (const id of defined) assert.ok(parts.includes(id), 'screen "' + id + '" is not reachable from any menu');
  for (const id of parts) assert.ok(defined.has(id), 'menu points at unknown screen "' + id + '"');
  assert.ok(parts.length >= 25 && parts.length <= 40);
  for (const m of block.split(/\n    \{ id: '/).slice(1)) assert.ok((m.match(/tab\(/g) || []).length <= 8, 'too many tabs in one menu');
});

test('admin help texts name menus that exist', () => {
  assert.equal(/เมนู ข้อมูลเว็บ|หน้าเว็บ → |ตั้งค่าเว็บ → /.test(src), false, 'an old menu name is still mentioned');
});

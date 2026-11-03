// The admin menu structure: few menus, every editing screen reachable from exactly one tab.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.resolve(__dirname, '../admin/admin.js'), 'utf8');

test('admin menus: six menus, every screen placed once, nothing orphaned', () => {
  const block = /const MENUS = \[([\s\S]*?)\n  \];/.exec(src)[1];
  const menus = [...block.matchAll(/^    \{ id: '([\w-]+)', label: '([^']+)'/gm)].map(m => m[1]);
  assert.deepEqual(menus, ['home', 'content', 'store', 'report', 'media', 'settings']);
  // Settings is a dropdown: Login & Register holds the login, register, API and account/top-up screens as its own tabs
  const groups = [...block.matchAll(/^      \{ id: '([\w-]+)', label: '([^']+)', tabs: \[(.*)\] \}/gm)].map(m => [m[1], m[2], [...m[3].matchAll(/tab\('([\w-]+)'/g)].map(x => x[1])]);
  assert.deepEqual(groups.map(g => g[0]), ['site', 'lr', 'acct', 'hist']);
  assert.deepEqual(groups.find(g => g[0] === 'lr'), ['lr', 'Login & Register', ['lr-login', 'lr-register', 'lr-api', 'lr-member']]);
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

test('content lists use cards with filters and a side editor; wide screens use their space', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../admin/admin.css'), 'utf8');
  for (const t of ['thumb: n => n.image', 'thumb: g => g.image', 'thumb: d => d.image', 'thumb: r => r.image']) assert.ok(src.includes(t), t + ' (cards show the picture)');
  assert.ok(src.includes("filters: [['tag', 'หมวด', NEWS_TAGS.map("), 'news can be filtered by category');
  assert.ok(/\.a-split\.has-sel\{grid-template-columns:minmax\(0,1fr\) minmax\(460px,40%\)\}/.test(css), 'side editor beside the list on wide screens');
  assert.ok(/body\.a-sheet\{overflow:hidden\}/.test(css) && /\.a-split\.has-sel \.a-panel\{position:fixed;inset:0/.test(css), 'full-screen sheet on small screens');
  assert.ok(/\.a-main\{[^}]*max-width:1[5-9]\d\dpx/.test(css), 'the page is no longer capped at 1000px');
  assert.ok(/@media\(min-width:1280px\)\{\s*\.a-cols\{grid-template-columns:repeat\(2/.test(css), 'settings boxes sit side by side on wide screens');
});

test('small screens: top bar with a menu button and a slide-in menu; desktop keeps the side menu', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../admin/admin.css'), 'utf8');
  assert.ok(src.includes("class: 'a-burger'") && src.includes("class: 'a-top'") && src.includes("class: 'a-back'"), 'top bar, menu button and backdrop exist');
  assert.ok(/\.a-top,\.a-back,\.a-close\{display:none\}/.test(css), 'hidden on wide screens');
  assert.ok(/@media\(max-width:900px\)\{\s*\.a-top\{display:flex[^}]*position:sticky/.test(css), 'sticky top bar on small screens');
  assert.ok(/\.a-side\{position:fixed[^}]*transform:translateX\(-105%\)/.test(css) && /\.a-side\.open\{transform:none/.test(css), 'the menu slides in over the page');
  assert.ok(/Escape' && drawerOpen/.test(src), 'Esc closes it');
});

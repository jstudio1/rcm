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
  assert.ok(/@media\(min-width:1280px\)\{\s*\.a-cols\{columns:2/.test(css) && /\.a-cols \.a-box,\.a-cols \.a-seo\{[^}]*break-inside:avoid/.test(css), 'settings boxes pack into two columns on wide screens, with no holes under a short box');
});

test('small screens: top bar with a menu button and a slide-in menu; desktop keeps the side menu', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../admin/admin.css'), 'utf8');
  assert.ok(src.includes("class: 'a-burger'") && src.includes("class: 'a-top'") && src.includes("class: 'a-back'"), 'top bar, menu button and backdrop exist');
  assert.ok(/\.a-top,\.a-back,\.a-close\{display:none\}/.test(css), 'hidden on wide screens');
  assert.ok(/@media\(max-width:900px\)\{\s*\.a-top\{display:flex[^}]*position:sticky/.test(css), 'sticky top bar on small screens');
  assert.ok(/\.a-side\{position:fixed[^}]*transform:translateX\(-105%\)/.test(css) && /\.a-side\.open\{transform:none/.test(css), 'the menu slides in over the page');
  assert.ok(/Escape' && drawerOpen/.test(src), 'Esc closes it');
});

test('responsive audit: nothing can widen a page, phones get compact controls, long lists are paged', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../admin/admin.css'), 'utf8');
  assert.ok(/\.a-box,\.a-in,\.a-pb\{grid-template-columns:minmax\(0,1fr\)\}/.test(css), 'boxes cannot grow past their column');
  assert.ok(/\.a-list\{grid-template-columns:minmax\(0,1fr\)\}/.test(css), 'old-style list rows cannot grow past the page');
  assert.ok(/\.a-shell\{grid-template-columns:minmax\(0,1fr\)\}/.test(css), 'the single column is allowed to shrink');
  assert.ok(/@media\(max-width:560px\)\{[\s\S]*\.a-media\{grid-template-columns:repeat\(2/.test(css) && /\.an-stack thead\{display:none\}/.test(css), 'phones: two-column media, tables as cards');
  assert.ok(/\.a-chk input\{flex:none\}/.test(css), 'checkboxes keep one size');
  assert.ok(src.includes('shownN') && src.includes('a-more'), 'media library shows 36 files at a time');
  assert.ok(src.includes('tabs.scrollLeft'), 'the open tab is scrolled into view on small screens');
});

test('a wrapper that only redraws a box joins the columns like the box (admin account page)', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../admin/admin.css'), 'utf8');
  assert.ok(src.includes("const host = h('div', { class: 'a-host' }") && src.includes("e.classList.contains('a-host')"), 'the 2-step box is grouped with the password box');
  assert.ok(/\.a-host\{display:contents\}/.test(css));
});

test('settings pages: an index of numbered sections, each with a title and one sentence; a "go to section" menu on narrow screens', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../admin/admin.css'), 'utf8');
  const tabs = /const SET_TABS = \[([^\]]+)\]/.exec(src)[1];
  for (const id of ['general', 'lr-api', 'p-privacy', 'p-terms', 'p-support', 'p-delete', 'p-odds', 'cookies', 'prereg', 'en', 'home', 'links']) assert.ok(tabs.includes("'" + id + "'"), id + ' uses the settings layout');
  assert.ok(src.includes("h('nav', { class: 'a-toc'") && src.includes("class: 'a-toc-sel'") && src.includes('IntersectionObserver'), 'index, narrow-screen menu, and the index follows the scroll');
  assert.ok(/\.a-set\{display:grid;grid-template-columns:232px minmax\(0,1fr\)/.test(css), 'index beside the sections on wide screens');
  assert.ok(/\.a-secs \.a-sec>h3::before[^{]*\{content:counter\(sec\)/.test(css), 'sections are numbered');
  assert.ok(/@media\(max-width:1100px\)\{[\s\S]*?\.a-toc\{display:none\}[\s\S]*?\.a-toc-sel\{display:block;position:sticky/.test(css), 'narrow screens: a sticky "go to section" menu instead of a side rail');
  assert.ok(/\.a-note\{border-left:3px solid rgba\(143,176,255/.test(css), 'notes are calm, not red alarms');
});

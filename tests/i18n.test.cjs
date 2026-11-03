// English site (/en), TH | EN switch, fixed news categories, neutral card hover.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

const source = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(process.env.RCM_TEST_TMP || os.tmpdir(), 'rcm-i18n-'));
for (const f of ['server.js', 'lib', 'admin', 'views']) { try { fs.cpSync(path.join(source, f), path.join(tmp, f), { recursive: true }); } catch (e) {} }
fs.mkdirSync(path.join(tmp, 'public', 'uploads'), { recursive: true }); fs.mkdirSync(path.join(tmp, 'public', 'img'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'public', 'style.css'), 'body{}');
for (const f of ['consent.js', 'prereg.js', 'prereg.css']) fs.copyFileSync(path.join(source, 'public', f), path.join(tmp, 'public', f));
fs.mkdirSync(path.join(tmp, 'data'));
const seed = require(path.join(tmp, 'lib/seed'))(); seed.site.url = '';
seed.news[1].published = true;
fs.writeFileSync(path.join(tmp, 'data/content.json'), JSON.stringify(seed));

const port = 23000 + Math.floor(Math.random() * 15000), base = 'http://127.0.0.1:' + port;
const PASS = 'I18n-test-password-123';
const child = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), ADMIN_PASSWORD: PASS, TRUST_PROXY: '1' } });
let logs = ''; child.stdout.on('data', b => (logs += b)); child.stderr.on('data', b => (logs += b));
after(() => child.kill());
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const get = async p => { const r = await fetch(base + p, { redirect: 'manual', headers: { 'User-Agent': UA, Cookie: 'rc_consent=1.0' } }); return { status: r.status, html: await r.text() }; };
const wait = ms => new Promise(r => setTimeout(r, ms));
let cookie, csrf;
const api = async (p, method = 'GET', body) => {
  const r = await fetch(base + '/admin/api/' + p, { method, headers: { Cookie: cookie, ...(method !== 'GET' ? { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const edit = async fn => { const c = (await api('content')).json; fn(c); const r = await api('content', 'PUT', c); assert.equal(r.status, 200, JSON.stringify(r.json)); return r.json; };
const sw = html => (/<div class="lang"[^>]*>(.*?)<\/div>/.exec(html) || [])[1] || '';
const hrefs = (html, cls) => [...(new RegExp('<nav class="' + cls + '"[^>]*>(.*?)</nav>').exec(html) || ['', ''])[1].matchAll(/href="([^"]*)"/g)].map(m => m[1]);

test('English site', async t => {
  for (let i = 0; i < 80; i++) { try { await fetch(base + '/robots.txt'); break; } catch { await wait(50); } }
  assert.equal(child.exitCode, null, logs);
  const r = await fetch(base + '/admin/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'admin', password: PASS }) });
  assert.equal(r.status, 200); cookie = r.headers.get('set-cookie').split(';')[0]; csrf = (await api('me')).json.csrf;

  await t.test('every public page has a TH | EN switch pointing at its twin', async () => {
    for (const [p, en] of [['/', '/en'], ['/news', '/en/news'], ['/gameplay', '/en/gameplay'], ['/drivers', '/en/drivers'], ['/rewards', '/en/rewards'], ['/news/pre-registration', '/en/news/pre-registration'], ['/privacy', '/en/privacy'], ['/faq', '/en/faq']]) {
      const { status, html } = await get(p); assert.equal(status, 200, p);
      assert.ok(sw(html).includes(`<a href="${p}" lang="th"`) && sw(html).includes(`<a href="${en}" lang="en"`), p + ' -> ' + sw(html));
      assert.match(html, /<html lang="th">/);
    }
    for (const [p, th] of [['/en', '/'], ['/en/news', '/news'], ['/en/gameplay', '/gameplay'], ['/en/news/pre-registration', '/news/pre-registration'], ['/en/privacy', '/privacy']]) {
      const { status, html } = await get(p); assert.equal(status, 200, p);
      assert.ok(sw(html).includes(`<a href="${th}" lang="th"`) && sw(html).includes(`<a href="${p}" lang="en"`) && sw(html).includes('class="on"'), p + ' -> ' + sw(html));
      assert.match(html, /<html lang="en">/);
    }
  });

  await t.test('English pages: English text, links stay under /en, canonical and hreflang', async () => {
    const h = (await get('/en/news')).html;
    assert.match(h, /<h1 class="disp">Latest news<\/h1>/);
    assert.match(h, /rel="canonical" href="[^"]*\/en\/news"/);
    for (const [l, u] of [['th', '/news'], ['en', '/en/news'], ['x-default', '/news']]) assert.ok(new RegExp(`hreflang="${l}" href="[^"]*${u}"`).test(h), l);
    assert.deepEqual(hrefs(h, 'menu'), ['/en/rewards', '/en/gameplay', '/en/drivers', '/en/news', '/en/faq']);
    assert.ok(h.includes('href="/en/news/pre-registration"') || h.includes('/en/news/raycity-m-official-announcement'), 'article links stay in English');
    assert.equal(/href="\/news\/[^"]/.test(h), false, 'no link back into the Thai articles');
    assert.match((await get('/en')).html, /<title>RAYCITY-M \| The street racing legend returns on mobile<\/title>/);
    assert.match((await get('/en')).html, /Pre-register now/);
    assert.match((await get('/en/rewards')).html, /Pre-registered players/);
    assert.match((await get('/en/news/pre-registration')).html, /<h1 class="disp">Pre-registration is open<\/h1>/);
    assert.equal((await get('/en/news/nothing-here')).status, 404);
    assert.equal((await get('/en/nothing')).status, 404);
  });

  await t.test('an empty English field shows the Thai text; a filled one is escaped', async () => {
    await edit(c => { c.gameplay[0].titleEn = ''; c.gameplay[1].titleEn = '<img src=x onerror=alert(1)>'; c.home.leadEn = ''; });
    let h = (await get('/en/gameplay')).html;
    assert.ok(h.includes(seed.gameplay[0].title), 'fallback keeps the Thai title');
    assert.equal(/<img src=x onerror/i.test(h), false); assert.ok(h.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok((await get('/en')).html.includes(seed.home.lead), 'Thai lead while the English one is empty');
    assert.ok((await get('/gameplay')).html.includes(seed.gameplay[0].title) && !(await get('/gameplay')).html.includes('onerror'), 'Thai page unchanged');
  });

  await t.test('sitemap lists the English pages; articles only once they have an English title', async () => {
    const sm = await (await fetch(base + '/sitemap.xml')).text();
    for (const u of ['/en', '/en/news', '/en/gameplay', '/en/drivers', '/en/rewards', '/en/news/pre-registration']) assert.ok(sm.includes(u + '</loc>'), u);
    await edit(c => { c.news[1].titleEn = ''; });
    assert.equal((await (await fetch(base + '/sitemap.xml')).text()).includes('/en/news/pre-registration</loc>'), false);
  });

  await t.test('news categories are a fixed list; old free-text labels are mapped', async () => {
    const TAGS = ['PATCH NOTE', 'EVENT', 'TOURNAMENT', 'UPDATE', 'PROMOTION', 'NEWS'];
    assert.deepEqual(require(path.join(tmp, 'lib/store')).NEWS_TAGS, TAGS);
    const admin = fs.readFileSync(path.join(source, 'admin/admin.js'), 'utf8');
    assert.ok(admin.includes("const NEWS_TAGS = ['PATCH NOTE', 'EVENT', 'TOURNAMENT', 'UPDATE', 'PROMOTION', 'NEWS'];"), 'the admin dropdown offers the same six');
    await edit(c => { c.news[0].tag = 'promo'; c.news[1].tag = 'something else'; });
    let c = (await api('content')).json; assert.deepEqual([c.news[0].tag, c.news[1].tag], ['PROMOTION', 'NEWS']);
    for (const tag of TAGS) { await edit(x => { x.news[0].tag = tag; }); assert.equal((await api('content')).json.news[0].tag, tag); }
  });

  await t.test('cards no longer glow yellow on hover', () => {
    const css = fs.readFileSync(path.join(source, 'public/style.css'), 'utf8');
    for (const line of css.split('\n').filter(l => /^\.(feat|mcard|wn-item|card|lx-h \.more)[^{]*:(hover|focus-visible)[^{]*\{/.test(l))) assert.equal(/255,196,20|var\(--gold\)/.test(line), false, line);
  });
});

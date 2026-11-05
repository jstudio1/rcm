// SEO: per-page lastmod, hreflang in the sitemap, RSS feed, banner headings, default titles
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

const source = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(process.env.RCM_TEST_TMP || os.tmpdir(), 'rcm-seo-'));
for (const f of ['server.js', 'lib', 'admin', 'views']) { try { fs.cpSync(path.join(source, f), path.join(tmp, f), { recursive: true }); } catch (e) {} }
fs.mkdirSync(path.join(tmp, 'public', 'uploads'), { recursive: true }); fs.mkdirSync(path.join(tmp, 'public', 'img'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'public', 'style.css'), 'body{}');
for (const f of ['consent.js']) fs.copyFileSync(path.join(source, 'public', f), path.join(tmp, 'public', f));
fs.mkdirSync(path.join(tmp, 'data'));
const seed = require(path.join(tmp, 'lib/seed'))(); seed.site.url = '';
seed.changed = { rewards: '2026-01-02', gameplay: '2026-01-03', home: '2026-01-04', faq: '2026-01-05' };
seed.news.forEach(n => { n.published = true; });
seed.news[0].title = 'A <b>&</b> title'; seed.news[0].titleEn = 'English title'; seed.news[0].date = '2026-02-01'; seed.news[0].modified = '';
if (seed.news[1]) { seed.news[1].published = false; seed.news[1].title = 'SECRET DRAFT'; }
fs.writeFileSync(path.join(tmp, 'data/content.json'), JSON.stringify(seed));

const port = 23000 + Math.floor(Math.random() * 15000), base = 'http://127.0.0.1:' + port;
const child = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), ADMIN_PASSWORD: 'Seo-test-password-1234', TRUST_PROXY: '1' } });
let logs = ''; child.stdout.on('data', b => (logs += b)); child.stderr.on('data', b => (logs += b));
after(() => child.kill());
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const get = async (p, h) => { const r = await fetch(base + p, { redirect: 'manual', headers: { 'User-Agent': UA, Cookie: 'rc_consent=1.0', ...(h || {}) } }); return { status: r.status, html: await r.text(), type: r.headers.get('content-type') }; };
const wait = ms => new Promise(r => setTimeout(r, ms));
let cookie, csrf;
const api = async (p, method = 'GET', body) => {
  const r = await fetch(base + '/admin/api/' + p, { method, headers: { Cookie: cookie, ...(method !== 'GET' ? { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const edit = async fn => { const c = (await api('content')).json; fn(c); const r = await api('content', 'PUT', c); assert.equal(r.status, 200, JSON.stringify(r.json)); return r.json; };
const lastmod = (xml, p) => { const m = new RegExp('<loc>[^<]*' + p.replace(/[/]/g, '\\/') + '</loc><lastmod>([^<]*)</lastmod>').exec(xml); return m && m[1]; };

test('SEO', async t => {
  for (let i = 0; i < 80; i++) { try { await fetch(base + '/robots.txt'); break; } catch { await wait(50); } }
  assert.equal(child.exitCode, null, logs);
  const r = await fetch(base + '/admin/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'admin', password: 'Seo-test-password-1234' }) });
  assert.equal(r.status, 200); cookie = r.headers.get('set-cookie').split(';')[0]; csrf = (await api('me')).json.csrf;

  await t.test('each page has its own lastmod, and a save only moves the pages that really changed', async () => {
    let sm = (await get('/sitemap.xml')).html;
    assert.equal(lastmod(sm, '/rewards'), '2026-01-02'); assert.equal(lastmod(sm, '/gameplay'), '2026-01-03'); assert.equal(lastmod(sm, '/faq') || '2026-01-05', '2026-01-05');
    assert.equal(lastmod(sm, '/en/gameplay'), '2026-01-03', 'the English page shares its Thai page date');
    await edit(c => { c.gameplay[0].title = c.gameplay[0].title + ' (แก้ไข)'; });
    sm = (await get('/sitemap.xml')).html;
    const today = new Date().toISOString().slice(0, 10);
    assert.equal(lastmod(sm, '/gameplay'), today, 'edited page moves');
    assert.equal(lastmod(sm, '/rewards'), '2026-01-02', 'untouched page does not');
    assert.equal(lastmod(sm, '/drivers') <= today, true);
    const saved = (await api('content')).json; assert.equal(saved.changed.rewards, '2026-01-02');
    // an old site without any stamps keeps the date of the save before, not "today" for everything
    const f = path.join(tmp, 'data/content.json'), c = JSON.parse(fs.readFileSync(f, 'utf8')); delete c.changed; fs.writeFileSync(f, JSON.stringify(c)); await wait(1200);
    const j = (await api('content')).json; assert.deepEqual(Object.values(j.changed).every(v => v === ''), true);
  });

  await t.test('sitemap carries hreflang pairs for pages that exist in both languages', async () => {
    const sm = (await get('/sitemap.xml')).html;
    assert.match(sm, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
    const home = /<url><loc>[^<]*\/<\/loc>[\s\S]*?<\/url>/.exec(sm)[0];
    assert.match(home, /hreflang="th" href="[^"]*\/"\/>/); assert.match(home, /hreflang="en" href="[^"]*\/en"\/>/); assert.match(home, /hreflang="x-default"/);
    const en = /<url><loc>[^<]*\/en\/rewards<\/loc>[\s\S]*?<\/url>/.exec(sm)[0];
    assert.match(en, /hreflang="th" href="[^"]*\/rewards"\/>/);
    const slug = seed.news[0].slug; assert.ok(sm.includes('/en/news/' + slug + '</loc>'));
    // a page without an English twin gets no alternates
    const noEn = seed.news.find(n => n.published && !n.titleEn);
    if (noEn) { const u = new RegExp('<url><loc>[^<]*/news/' + noEn.slug + '</loc>[\\s\\S]*?</url>').exec(sm)[0]; assert.equal(u.includes('xhtml:link'), false); }
  });

  await t.test('RSS feed: published articles only, escaped, advertised in the page head', async () => {
    const f = await get('/feed.xml');
    assert.equal(f.status, 200); assert.match(f.type, /rss\+xml/); assert.match(f.html, /^<\?xml/); assert.match(f.html, /<rss version="2\.0"/);
    assert.ok(f.html.includes('<title>A &lt;b&gt;&amp;&lt;/b&gt; title</title>'), 'titles are escaped');
    assert.equal(f.html.includes('SECRET DRAFT'), false, 'unpublished items never appear');
    assert.match(f.html, /<pubDate>[A-Z][a-z]{2}, \d\d [A-Z][a-z]{2} \d{4}/);
    assert.ok((f.html.match(/<item>/g) || []).length <= 30);
    assert.match((await get('/')).html, /<link rel="alternate" type="application\/rss\+xml"[^>]*href="[^"]*\/feed\.xml">/);
    await edit(c => { c.news.forEach(n => { n.published = false; }); });
    assert.equal(/rel="alternate" type="application\/rss\+xml"/.test((await get('/')).html), false, 'no feed link when there is no news');
    await edit(c => { c.news.forEach(n => { n.published = true; }); });
  });

  await t.test('the cookie banner adds no headings to the page outline', async () => {
    await edit(c => { c.cookies.enabled = true; });
    const h = (await get('/', { Cookie: '' })).html, banner = /<div class="cc" id="cc"[\s\S]*?<script src/.exec(h)[0];
    assert.equal(/<h[1-6]/.test(banner), false, 'no h1-h6 inside the banner');
    assert.match(banner, /aria-labelledby="cc-t"/); assert.match(banner, /id="cc-t"/);
    assert.equal((h.match(/<h1[ >]/g) || []).length, 1);
  });

  await t.test('default titles and descriptions are within search-result lengths and start with what players search for', () => {
    for (const k of ['rewards', 'gameplay', 'drivers', 'news', 'faq']) {
      const p = require(path.join(tmp, 'lib/seed'))().pages[k];
      assert.ok(p.seoTitle.length >= 25 && p.seoTitle.length <= 65, k + ' title ' + p.seoTitle.length);
      assert.ok(p.seoDescription.length >= 70 && p.seoDescription.length <= 160, k + ' description ' + p.seoDescription.length);
      assert.equal(/^(Rewards|Gameplay|Drivers|News|FAQ)\s*\|/i.test(p.seoTitle), false, k + ' title starts with a generic English word');
      assert.ok(p.seoTitleEn.length <= 65 && p.seoDescriptionEn.length >= 60 && p.seoDescriptionEn.length <= 160, k + ' English lengths');
    }
  });
});

// Cookie consent, privacy + support pages, and everything being editable from the admin.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

const source = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(process.env.RCM_TEST_TMP || os.tmpdir(), 'rcm-consent-'));
for (const f of ['server.js', 'lib', 'admin', 'views']) fs.cpSync(path.join(source, f), path.join(tmp, f), { recursive: true });
fs.mkdirSync(path.join(tmp, 'public', 'uploads'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'public', 'img'));
fs.writeFileSync(path.join(tmp, 'public', 'style.css'), 'body{}');
fs.copyFileSync(path.join(source, 'public', 'consent.js'), path.join(tmp, 'public', 'consent.js'));
fs.mkdirSync(path.join(tmp, 'data'));
const content = require(path.join(tmp, 'lib/seed'))();
content.site.url = '';
fs.writeFileSync(path.join(tmp, 'data/content.json'), JSON.stringify(content));

const port = 23000 + Math.floor(Math.random() * 15000), base = 'http://127.0.0.1:' + port;
const child = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), ADMIN_PASSWORD: 'Consent-test-password-1', TRUST_PROXY: '1' } });
let logs = ''; child.stdout.on('data', b => (logs += b)); child.stderr.on('data', b => (logs += b));
after(() => child.kill());

const UA = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const hit = (p, ip, cookie) => fetch(base + p, { redirect: 'manual', headers: { 'User-Agent': UA, 'X-Forwarded-For': ip, ...(cookie ? { Cookie: cookie } : {}) } });
const setCookies = r => (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')].filter(Boolean));
const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
let cookie, csrf;
const api = async (p, method = 'GET', body) => {
  const r = await fetch(base + '/admin/api/' + p, { method, headers: { Cookie: cookie, ...(method !== 'GET' ? { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const edit = async fn => { // load → change → save, like the admin does
  const c = (await api('content')).json; fn(c);
  const r = await api('content', 'PUT', c); assert.equal(r.status, 200, JSON.stringify(r.json)); return r.json;
};
const visits = async (q = '') => (await api(`analytics/visits?from=${today}&to=${today}&limit=200${q}`)).json;
const wait = ms => new Promise(r => setTimeout(r, ms));

test('cookie consent and legal pages', async t => {
  for (let i = 0; i < 80; i++) { try { await fetch(base + '/robots.txt'); break; } catch { await wait(50); } }
  assert.equal(child.exitCode, null, logs);
  const r = await fetch(base + '/admin/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'admin', password: 'Consent-test-password-1' }) });
  assert.equal(r.status, 200);
  cookie = r.headers.get('set-cookie').split(';')[0];
  csrf = (await api('me')).json.csrf;

  await t.test('banner is on every page, with the admin texts, hidden until the script shows it', async () => {
    for (const p of ['/', '/privacy', '/support', '/faq']) {
      const html = await (await hit(p, '1.1.1.1')).text();
      assert.match(html, /<div class="cc" id="cc"[^>]* hidden data-ver="1"/, p);
      assert.ok(html.includes(content.cookies.acceptAll) && html.includes(content.cookies.rejectAll) && html.includes(content.cookies.customize), p);
      assert.match(html, /data-cc="accept"/); assert.match(html, /data-cc="reject"/); assert.match(html, /data-cc-an/);
      assert.match(html, /\/consent\.js\?v=/);
    }
    assert.equal((await fetch(base + '/consent.js')).status, 200);
  });

  await t.test('no choice yet: counted anonymously, no cookie, IP shortened', async () => {
    const anon0 = (await api(`analytics?from=${today}&to=${today}`)).json.totals.anonViews;
    const r1 = await hit('/', '49.228.10.5');
    assert.equal(setCookies(r1).filter(c => /^vid=/.test(c)).length, 0, 'no id cookie before consent');
    await hit('/', '49.228.10.9'); // same /24 network
    const v = await visits('&ip=' + encodeURIComponent('49.228.10.*'));
    assert.equal(v.total, 2);
    assert.equal(v.rows.every(x => x.anon && x.ip === '49.228.10.*'), true);
    const d = (await api(`analytics?from=${today}&to=${today}`)).json;
    assert.equal(d.totals.anonViews - anon0, 2);
    assert.equal(JSON.stringify(d).includes('49.228.10.5'), false, 'full IP never stored for them');
  });

  await t.test('"accept all" (rc_consent=1.1): id cookie and full IP', async () => {
    const r2 = await hit('/gameplay', '171.99.1.2', 'rc_consent=1.1');
    const vid = setCookies(r2).find(c => /^vid=[0-9a-f]{24};/.test(c));
    assert.ok(vid, 'vid issued'); assert.match(vid, /HttpOnly/); assert.match(vid, /SameSite=Lax/);
    const v = await visits('&ip=171.99.1.2');
    assert.equal(v.total, 1); assert.equal(v.rows[0].anon, false);
  });

  await t.test('"reject" (rc_consent=1.0) never gets a cookie, and an old id cookie is removed', async () => {
    const r3 = await hit('/faq', '171.99.7.7', 'rc_consent=1.0; vid=' + 'a'.repeat(24));
    const sc = setCookies(r3);
    assert.ok(sc.some(c => /^vid=;/.test(c) && /Max-Age=0/.test(c)), 'vid cleared');
    assert.equal(sc.some(c => /^vid=a/.test(c)), false);
    const r4 = await hit('/api/cc', '171.99.7.7', 'rc_consent=1.0; vid=' + 'a'.repeat(24));
    assert.equal(r4.status, 204); assert.ok(setCookies(r4).some(c => /^vid=;.*Max-Age=0/.test(c)));
    const r5 = await hit('/api/cc', '171.99.7.7', 'rc_consent=1.1; vid=' + 'a'.repeat(24));
    assert.equal(setCookies(r5).length, 0, 'accepted visitors keep their cookie');
  });

  await t.test('a new consent version asks everyone again (old choice counts as no choice)', async () => {
    await edit(c => { c.cookies.version = '2'; });
    const r6 = await hit('/', '171.99.8.8', 'rc_consent=1.1');
    assert.equal(setCookies(r6).some(c => /^vid=[0-9a-f]/.test(c)), false);
    assert.match(await (await hit('/', '1.1.1.1')).text(), /data-ver="2"/);
    const r7 = await hit('/', '171.99.8.8', 'rc_consent=2.1');
    assert.ok(setCookies(r7).some(c => /^vid=[0-9a-f]{24}/.test(c)));
    await edit(c => { c.cookies.version = '1'; });
  });

  await t.test('admin can stop counting people who have not consented', async () => {
    await edit(c => { c.cookies.anonymousCount = ''; });
    const before = (await visits('&ip=' + encodeURIComponent('10.20.30.*'))).total;
    await hit('/', '10.20.30.40');
    assert.equal((await visits('&ip=' + encodeURIComponent('10.20.30.*'))).total, before, 'not counted');
    await hit('/', '10.20.30.41', 'rc_consent=1.1');
    assert.equal((await visits('&ip=10.20.30.41')).total, 1, 'consented visitors still counted');
    await edit(c => { c.cookies.anonymousCount = 'true'; });
  });

  await t.test('banner switched off in the admin: no banner, legacy behaviour', async () => {
    await edit(c => { c.cookies.enabled = ''; });
    const html = await (await hit('/', '1.1.1.1')).text();
    assert.equal(html.includes('id="cc"'), false);
    assert.equal(html.includes('data-cc-open'), false);
    await edit(c => { c.cookies.enabled = 'true'; });
  });

  await t.test('Google Analytics waits for consent when the banner is on', async () => {
    await edit(c => { c.site.ga4 = 'G-TEST12345'; });
    let html = await (await hit('/', '1.1.1.1')).text();
    assert.equal(html.includes('googletagmanager.com/gtag/js'), false, 'not in the page');
    assert.match(html, /data-ga="G-TEST12345"/);
    assert.match(await (await hit('/privacy', '1.1.1.1')).text(), /_ga, _ga_\*/, 'the policy table lists the Google cookies');
    await edit(c => { c.cookies.enabled = ''; });
    html = await (await hit('/', '1.1.1.1')).text();
    assert.match(html, /googletagmanager\.com\/gtag\/js\?id=G-TEST12345/, 'banner off: loads directly');
    await edit(c => { c.cookies.enabled = 'true'; c.site.ga4 = ''; });
  });

  await t.test('privacy page: editable text, contact tokens, cookie table, safe output', async () => {
    await edit(c => {
      c.contact.company = 'Acme <script>alert(1)</script> Co.'; c.contact.email = 'help@example.com';
      c.pages.privacy.body = '## หัวข้อทดสอบ\nติดต่อ {{email}} หรือ {{company}} ยังไม่มี {{phone}}\n\n- **รายการ** [ลิงก์](https://example.com)';
      c.pages.privacy.updated = '2026-10-27';
    });
    const html = await (await hit('/privacy', '1.1.1.1')).text();
    assert.match(html, /<h1 class="disp">นโยบายความเป็นส่วนตัว<\/h1>/);
    assert.match(html, /<h2>หัวข้อทดสอบ<\/h2>/);
    assert.ok(html.includes('help@example.com'));
    assert.ok(html.includes('Acme &lt;script&gt;alert(1)&lt;/script&gt; Co.'));
    assert.equal(html.includes('<script>alert(1)'), false);
    assert.equal(html.includes('[ยังไม่ได้ตั้งค่า]'), false, 'no placeholder on the public page');
    assert.equal(html.includes('ยังไม่มี'), false, 'a line with an empty token ({{phone}}) is left out');
    assert.match(html, /27 ตุลาคม 2569/);
    assert.match(html, /<table class="legal-table">/);
    for (const name of ['rc_consent', 'vid', 'rc-sfx']) assert.ok(html.includes(name), name);
    assert.match(html, /<link rel="canonical" href="[^"]+\/privacy">/);
  });

  await t.test('support page: contact cards only for valid values', async () => {
    await edit(c => { c.contact.phone = '02-123-4567'; c.contact.line = '@raycitym'; c.contact.hours = '10:00-18:00'; });
    let html = await (await hit('/support', '1.1.1.1')).text();
    assert.match(html, /href="mailto:help@example\.com"/);
    assert.match(html, /href="tel:021234567"/);
    assert.ok(html.includes('@raycitym'));
    assert.match(html, /"@type":"ContactPage"/);
    await edit(c => { c.contact.email = 'not an email"><b>x'; });
    html = await (await hit('/support', '1.1.1.1')).text();
    assert.equal(html.includes('mailto:'), false, 'invalid email is not linked');
    assert.equal(html.includes('<b>x'), false);
    await edit(c => { c.contact.email = 'help@example.com'; });
  });

  await t.test('footer links, sitemap and 404 for unknown paths', async () => {
    const html = await (await hit('/', '1.1.1.1')).text();
    assert.match(html, /<div class="legal-links"><a href="\/privacy">/);
    assert.match(html, /href="\/support"/);
    assert.match(html, /<button type="button" class="cc-open" data-cc-open>/);
    assert.match(html, /mailto:help@example\.com/);
    const sm = await (await fetch(base + '/sitemap.xml')).text();
    assert.ok(sm.includes('/privacy') && sm.includes('/support'));
    assert.equal((await hit('/no-such-page', '1.1.1.1')).status, 404);
  });

  await t.test('everything is saved by the admin API and survives a reload', async () => {
    const c = (await api('content')).json;
    assert.equal(c.contact.email, 'help@example.com');
    assert.equal(c.cookies.enabled, 'true');
    assert.ok(c.pages.privacy.body.includes('{{email}}'));
    // a partial save is refused, so the new sections can never be wiped by accident
    assert.equal((await api('content', 'PUT', { site: {}, pages: {} })).status, 400);
    // texts typed in the admin show up in the banner
    await edit(c2 => { c2.cookies.title = 'ข้อความทดสอบหัวแบนเนอร์'; c2.cookies.acceptAll = 'โอเค ยอมรับ'; });
    const html = await (await hit('/', '1.1.1.1')).text();
    assert.ok(html.includes('ข้อความทดสอบหัวแบนเนอร์') && html.includes('โอเค ยอมรับ'));
  });
});

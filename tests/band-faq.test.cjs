// Home game band and the FAQ page.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

const source = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(process.env.RCM_TEST_TMP || os.tmpdir(), 'rcm-band-'));
for (const f of ['server.js', 'lib', 'admin', 'views']) { try { fs.cpSync(path.join(source, f), path.join(tmp, f), { recursive: true }); } catch (e) {} }
fs.mkdirSync(path.join(tmp, 'public', 'uploads'), { recursive: true }); fs.mkdirSync(path.join(tmp, 'public', 'img'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'public', 'style.css'), 'body{}');
for (const f of ['consent.js', 'prereg.js', 'prereg.css', 'site.js']) fs.copyFileSync(path.join(source, 'public', f), path.join(tmp, 'public', f));
fs.mkdirSync(path.join(tmp, 'data'));
const seed = require(path.join(tmp, 'lib/seed'))(); seed.site.url = '';
fs.writeFileSync(path.join(tmp, 'data/content.json'), JSON.stringify(seed));

const port = 23000 + Math.floor(Math.random() * 15000), base = 'http://127.0.0.1:' + port;
const PASS = 'Band-test-password-123';
const child = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), ADMIN_PASSWORD: PASS, TRUST_PROXY: '1' } });
let logs = ''; child.stdout.on('data', b => (logs += b)); child.stderr.on('data', b => (logs += b));
after(() => child.kill());
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const get = async p => { const r = await fetch(base + p, { redirect: 'manual', headers: { 'User-Agent': UA, Cookie: 'rc_consent=1.0' } }); return { status: r.status, html: await r.text(), csp: r.headers.get('content-security-policy') }; };
const wait = ms => new Promise(r => setTimeout(r, ms));
let cookie, csrf;
const api = async (p, method = 'GET', body) => {
  const r = await fetch(base + '/admin/api/' + p, { method, headers: { Cookie: cookie, ...(method !== 'GET' ? { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const edit = async fn => { const c = (await api('content')).json; fn(c); const r = await api('content', 'PUT', c); assert.equal(r.status, 200, JSON.stringify(r.json)); return r.json; };
const cfgOf = html => JSON.parse(/id="prereg" data-cfg="([^"]*)"/.exec(html)[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
const states = html => [...html.matchAll(/<li class="pr-col (\w+)" data-goal="(\d+)"/g)].map(m => m[1] + ':' + m[2]);

test('game band on the home page, FAQ page', async t => {
  for (let i = 0; i < 80; i++) { try { await fetch(base + '/robots.txt'); break; } catch { await wait(50); } }
  assert.equal(child.exitCode, null, logs);
  const r = await fetch(base + '/admin/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'admin', password: PASS }) });
  assert.equal(r.status, 200); cookie = r.headers.get('set-cookie').split(';')[0]; csrf = (await api('me')).json.csrf;

  await t.test('the band sits between pre-registration and the latest news, with two buttons and a picture', async () => {
    const h = (await get('/')).html;
    const iPre = h.indexOf('id="prereg"'), iBand = h.indexOf('class="gb"'), iNews = h.indexOf('id="latest"');
    assert.ok(iPre > 0 && iBand > iPre && (iNews < 0 || iBand < iNews), 'order: pre-registration, band, news');
    assert.match(h, /<h2 class="gb-t">RAYCITY-M<\/h2>/); assert.match(h, /class="gb-b1"[^>]*data-stay/, 'no link yet = "coming soon"'); assert.match(h, /class="gb-img"/);
  });

  await t.test('the home page script reveals fade-in sections (otherwise the band text and picture stay invisible)', () => {
    const hero = fs.readFileSync(path.join(source, 'public/hero.js'), 'utf8');
    assert.ok(/querySelectorAll\('\.rv'\)/.test(hero) && /classList\.add\('in'\)/.test(hero), 'hero.js shows .rv elements');
  });

  await t.test('band texts are escaped, links checked, and it can be switched off', async () => {
    await edit(c => { c.home.bandTitle = '<img src=x onerror=alert(1)>'; c.home.bandLink1 = 'javascript:alert(1)'; c.home.bandLink2 = '/register'; c.home.bandImage = 'javascript:alert(1)'; });
    let h = (await get('/')).html;
    assert.equal(/<img src=x onerror|href="javascript:|src="javascript:/i.test(h), false);
    assert.match(h, /<a class="gb-b2" href="\/register">/);
    assert.match((await get('/en')).html, /Create an account/, 'English button text on /en');
    await edit(c => { c.home.bandOn = false; });
    h = (await get('/')).html; assert.equal(h.includes('class="gb"'), false);
  });

  await t.test('FAQ: search box, numbered questions, help box, and the Google FAQ data stays', async () => {
    const h = (await get('/faq')).html;
    assert.match(h, /data-fq-q/); assert.match(h, /<span class="n">01<\/span>/); assert.match(h, /<details class="fq-i" open>/, 'the first one is open');
    assert.match(h, /"@type":"FAQPage"/);
    const en = (await get('/en/faq')).html; assert.match(en, /Search questions/);
    const js = fs.readFileSync(path.join(source, 'public/site.js'), 'utf8'); assert.equal(/innerHTML|insertAdjacentHTML/.test(js), false);
  });
});

// Two-step secret encrypted at rest (DATA_KEY), Secure cookie default for https sites, shorter default statistics retention
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

const source = path.resolve(__dirname, '..');
function makeSite(tag, siteUrl) {
  const tmp = fs.mkdtempSync(path.join(process.env.RCM_TEST_TMP || os.tmpdir(), 'rcm-' + tag + '-'));
  for (const f of ['server.js', 'lib', 'admin', 'views']) { try { fs.cpSync(path.join(source, f), path.join(tmp, f), { recursive: true }); } catch (e) {} }
  fs.mkdirSync(path.join(tmp, 'public', 'uploads'), { recursive: true }); fs.mkdirSync(path.join(tmp, 'public', 'img'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'public', 'style.css'), 'body{}'); fs.mkdirSync(path.join(tmp, 'data'));
  const seed = require(path.join(tmp, 'lib/seed'))(); seed.site.url = siteUrl;
  fs.writeFileSync(path.join(tmp, 'data/content.json'), JSON.stringify(seed));
  return tmp;
}
const children = []; after(() => children.forEach(c => c.kill()));
function start(tmp, env) {
  const port = 23000 + Math.floor(Math.random() * 15000);
  const child = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), ADMIN_PASSWORD: 'Secrets-test-password-12', TRUST_PROXY: '', ...env } });
  let logs = ''; child.stdout.on('data', b => (logs += b)); child.stderr.on('data', b => (logs += b)); children.push(child);
  return { child, base: 'http://127.0.0.1:' + port, logs: () => logs };
}
const wait = ms => new Promise(r => setTimeout(r, ms));
async function ready(s) { for (let i = 0; i < 100; i++) { try { await fetch(s.base + '/robots.txt'); return; } catch { await wait(50); } } throw new Error('server did not start: ' + s.logs()); }
async function login(s, code) {
  const r = await fetch(s.base + '/admin/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'admin', password: 'Secrets-test-password-12', code }) });
  return { status: r.status, setCookie: r.headers.get('set-cookie') || '' };
}

test('two-step secret is encrypted on disk when DATA_KEY is set', async t => {
  const tmp = makeSite('secrets', '');
  const totp = require(path.join(tmp, 'lib/totp'));
  await t.test('seal / open round trip, wrong key and tampering are refused', () => {
    const sec = totp.newSecret(), key = 'a-long-test-key-1234567890';
    const s = totp.seal(sec, key);
    assert.match(s, /^enc1:[A-Za-z0-9_-]+$/); assert.equal(s.includes(sec), false);
    assert.equal(totp.open(s, key), sec);
    assert.notEqual(totp.seal(sec, key), s, 'a fresh random IV each time');
    assert.throws(() => totp.open(s, 'another-long-test-key-0000'));
    assert.throws(() => totp.open(s, ''));
    const flip = 'enc1:' + Buffer.from(Buffer.from(s.slice(5), 'base64url').map((b, i) => (i === 40 ? b ^ 1 : b))).toString('base64url');
    assert.throws(() => totp.open(flip, key), 'a changed byte is detected');
    assert.equal(totp.open(sec, ''), sec, 'an older plain secret is still readable');
  });

  const KEY = 'server-data-key-abcdefghijklmnop';
  let srv = start(tmp, { DATA_KEY: KEY }); await ready(srv);
  let secret, cookie, csrf;
  await t.test('enabling two-step stores only the encrypted secret, and login still works', async () => {
    const a = await login(srv, ''); assert.equal(a.status, 200); cookie = a.setCookie.split(';')[0];
    csrf = (await (await fetch(srv.base + '/admin/api/me', { headers: { Cookie: cookie } })).json()).csrf;
    const post = (p, b) => fetch(srv.base + '/admin/api/' + p, { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    const begin = await (await post('2fa/begin', { current: 'Secrets-test-password-12' })).json(); secret = begin.secret; assert.match(secret, /^[A-Z2-7]{32}$/);
    const en = await post('2fa/enable', { code: totp.hotp(secret, Math.floor(Date.now() / 30000)) }); assert.equal(en.status, 200, await en.text());
    const raw = fs.readFileSync(path.join(tmp, 'data/admin.json'), 'utf8');
    assert.equal(raw.includes(secret), false, 'the plain secret is not on disk');
    assert.match(raw, /"secret":"enc1:/);
    fs.writeFileSync(path.join(tmp, 'data/limits.json'), '{}');
    const ok = await login(srv, totp.hotp(secret, Math.floor(Date.now() / 30000) + 1)); assert.equal(ok.status, 200, 'password + code works while the key is present');
    assert.equal((await login(srv, '')).status, 401);
  });

  await t.test('without the key, two-step logins are refused (never accepted), with a clear log line', async () => {
    srv.child.kill(); await wait(300);
    srv = start(tmp, { DATA_KEY: '' }); await ready(srv);
    fs.writeFileSync(path.join(tmp, 'data/limits.json'), '{}');
    assert.equal((await login(srv, totp.hotp(secret, Math.floor(Date.now() / 30000) + 1))).status, 401);
    assert.equal((await login(srv, '')).status, 401, 'and a password alone is not enough');
    assert.match(srv.logs(), /cannot be read \(DATA_KEY missing or wrong\)/);
  });

  await t.test('an older plain secret is encrypted on the next start once DATA_KEY is set', async () => {
    srv.child.kill(); await wait(300);
    const f = path.join(tmp, 'data/admin.json'), d = JSON.parse(fs.readFileSync(f, 'utf8'));
    d.users[0].totp.secret = secret; d.users[0].totp.last = 0; fs.writeFileSync(f, JSON.stringify(d));
    srv = start(tmp, { DATA_KEY: KEY }); await ready(srv);
    const after = fs.readFileSync(f, 'utf8');
    assert.equal(after.includes(secret), false); assert.match(after, /"secret":"enc1:/);
    assert.match(srv.logs(), /encrypted with DATA_KEY: 1/);
    fs.writeFileSync(path.join(tmp, 'data/limits.json'), '{}');
    assert.equal((await login(srv, totp.hotp(secret, Math.floor(Date.now() / 30000)))).status, 200, 'still the same codes');
  });
});

test('admin cookie is Secure whenever the main domain is https, even if the proxy forgets to say so', async t => {
  const https = start(makeSite('sec-https', 'https://example.test'), {}); await ready(https);
  const plain = start(makeSite('sec-plain', ''), {}); await ready(plain);
  await t.test('https site', async () => {
    // (a direct plain-http request would be redirected; a loopback peer is treated as a possible local proxy and not redirected)
    const r = await login(https, ''); assert.equal(r.status, 200); assert.match(r.setCookie, /; Secure/); assert.match(r.setCookie, /HttpOnly/); assert.match(r.setCookie, /SameSite=Strict/);
  });
  await t.test('site without a main domain keeps working over plain http (local use)', async () => {
    const r = await login(plain, ''); assert.equal(r.status, 200); assert.equal(/; Secure/.test(r.setCookie), false);
  });
});

test('statistics are kept 90 days by default (ANALYTICS_DAYS changes it)', () => {
  const run = env => require('child_process').execFileSync(process.execPath, ['-e', "console.log(require('./lib/analytics').KEEP_DAYS)"], { cwd: source, env: { ...process.env, ...env } }).toString().trim();
  assert.equal(run({ ANALYTICS_DAYS: '' }), '90'); assert.equal(run({ ANALYTICS_DAYS: '400' }), '400'); assert.equal(run({ ANALYTICS_DAYS: '5' }), '30');
});

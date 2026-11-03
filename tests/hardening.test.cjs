// Second security round: two-step login, idle sessions, request flood limits, slow bodies, analytics caps, security.txt
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const source = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(process.env.RCM_TEST_TMP || os.tmpdir(), 'rcm-hardening-'));
for (const f of ['server.js', 'lib', 'admin', 'views']) { try { fs.cpSync(path.join(source, f), path.join(tmp, f), { recursive: true }); } catch (e) {} }
fs.mkdirSync(path.join(tmp, 'public', 'uploads'), { recursive: true }); fs.mkdirSync(path.join(tmp, 'public', 'img'), { recursive: true });
for (const f of ['style.css', 'consent.js', 'site.js', 'hero.js', 'loader.js']) { try { fs.copyFileSync(path.join(source, 'public', f), path.join(tmp, 'public', f)); } catch (e) {} }
fs.mkdirSync(path.join(tmp, 'data'), { recursive: true });
const seed = require(path.join(tmp, 'lib/seed'))(); seed.site.url = '';
fs.writeFileSync(path.join(tmp, 'data/content.json'), JSON.stringify(seed));
const totp = require(path.join(tmp, 'lib/totp'));

const port = 23000 + Math.floor(Math.random() * 15000), base = 'http://127.0.0.1:' + port;
const PASS = 'Hardening-test-password-12';
const child = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), ADMIN_PASSWORD: PASS, TRUST_PROXY: '1', RATE_LIMIT_PER_MIN: '40', SESSION_IDLE_MIN: '1', ANALYTICS_MAX_PER_IP_HOUR: '5' } });
let logs = ''; child.stdout.on('data', b => (logs += b)); child.stderr.on('data', b => (logs += b));
after(() => { child.kill(); });
const wait = ms => new Promise(r => setTimeout(r, ms));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function login(code, who) {
  const r = await fetch(base + '/admin/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': who || '198.51.100.1' }, body: JSON.stringify({ user: 'admin', password: PASS, code }) });
  const set = r.headers.get('set-cookie') || '';
  return { status: r.status, cookie: (/sid=[^;]+/.exec(set) || [''])[0] };
}
async function api(cookie, csrf, p, method = 'GET', body, who) {
  const r = await fetch(base + '/admin/api/' + p, { method, headers: { Cookie: cookie, 'X-Forwarded-For': who || '198.51.100.1', ...(method !== 'GET' ? { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null), cookie: ((r.headers.get('set-cookie') || '').match(/sid=[^;]+/) || [''])[0] };
}

test('hardening round 2', async t => {
  for (let i = 0; i < 80; i++) { try { await fetch(base + '/robots.txt'); break; } catch { await wait(50); } }
  assert.equal(child.exitCode, null, logs);

  await t.test('totp: RFC 6238 vectors, replay and drift', () => {
    const secret = totp.b32encode(Buffer.from('12345678901234567890'));
    assert.equal(totp.hotp(secret, Math.floor(59000 / 30000)), '287082');
    assert.equal(totp.hotp(secret, Math.floor(1111111109000 / 30000)), '081804');
    const now = 1111111109000, step = Math.floor(now / 30000);
    assert.equal(totp.verify(secret, '081804', 0, now), step);
    assert.equal(totp.verify(secret, '081804', step, now), 0, 'the same code is never accepted twice');
    assert.equal(totp.verify(secret, '081804', 0, now + 30000), step, 'one step of clock drift is fine');
    assert.equal(totp.verify(secret, '081804', 0, now + 120000), 0, 'but not more');
    for (const bad of ['', '12345', '1234567', 'abcdef', null, undefined, '08180 4x']) assert.equal(totp.verify(secret, bad, 0, now), 0);
    assert.equal(totp.b32decode(totp.newSecret()).length, 20);
  });

  let cookie, csrf, secret;
  await t.test('two-step login can be switched on, is then required, and cannot be replayed', async () => {
    const a = await login(''); assert.equal(a.status, 200); cookie = a.cookie;
    csrf = (await api(cookie, '', 'me')).json.csrf;
    assert.equal((await api(cookie, csrf, '2fa')).json.enabled, false);
    assert.equal((await api(cookie, csrf, '2fa/begin', 'POST', { current: 'wrong-password-123' })).status, 400);
    const b = await api(cookie, csrf, '2fa/begin', 'POST', { current: PASS });
    assert.equal(b.status, 200); assert.match(b.json.secret, /^[A-Z2-7]{32}$/); assert.match(b.json.uri, /^otpauth:\/\/totp\/RAYCITY-M:admin\?secret=/);
    secret = b.json.secret;
    assert.equal((await api(cookie, csrf, '2fa/enable', 'POST', { code: '000000' })).status, 400, 'a wrong code does not switch it on');
    assert.equal((await api(cookie, csrf, '2fa')).json.enabled, false);
    const en = await api(cookie, csrf, '2fa/enable', 'POST', { code: totp.hotp(secret, Math.floor(Date.now() / 30000)) });
    assert.equal(en.status, 200, JSON.stringify(en.json)); assert.ok(en.cookie, 'the browser that switched it on keeps a session');
    const old = cookie; cookie = en.cookie;
    assert.equal((await api(old, csrf, 'me')).status, 401, 'every other session is signed out');
    assert.equal((await api(cookie, csrf, '2fa')).json.enabled, true);

    fs.writeFileSync(path.join(tmp, 'data/limits.json'), '{}');
    assert.equal((await login('')).status, 401, 'password alone is no longer enough');
    assert.equal((await login('123456')).status, 401);
    const good = totp.hotp(secret, Math.floor(Date.now() / 30000) + 1); // the step after the one used to switch it on
    const ok = await login(good); assert.equal(ok.status, 200, 'password + code works');
    assert.equal((await login(good)).status, 401, 'the same code cannot be used again');
    fs.writeFileSync(path.join(tmp, 'data/limits.json'), '{}');
  });

  await t.test('two-step login can only be switched off with the password and a fresh code', async () => {
    const cur = Math.floor(Date.now() / 30000);
    assert.equal((await api(cookie, csrf, '2fa/disable', 'POST', { current: 'wrong-password-123', code: totp.hotp(secret, cur) })).status, 400);
    assert.equal((await api(cookie, csrf, '2fa/disable', 'POST', { current: PASS, code: '000000' })).status, 400);
    assert.equal((await api(cookie, csrf, '2fa')).json.enabled, true, 'still on after failed attempts');
    // a code already used to sign in is refused; forget the replay marker to prove a fresh one works
    const f = path.join(tmp, 'data/admin.json'), a = JSON.parse(fs.readFileSync(f, 'utf8')), u = a.users.find(x => x.user === 'admin');
    assert.ok(u.totp.last >= cur - 1, 'the last used step is remembered');
    u.totp.last = 0; fs.writeFileSync(f, JSON.stringify(a));
    const off = await api(cookie, csrf, '2fa/disable', 'POST', { current: PASS, code: totp.hotp(secret, cur) });
    assert.equal(off.status, 200, JSON.stringify(off.json)); assert.ok(off.cookie);
    cookie = off.cookie;
    assert.equal((await api(cookie, csrf, '2fa')).json.enabled, false);
    assert.equal((await login('')).status, 200, 'password alone works again');
  });

  await t.test('security.txt appears only with a contact address', async () => {
    assert.equal((await fetch(base + '/.well-known/security.txt', { headers: { 'User-Agent': UA } })).status, 404);
    // set a report address through the admin API
    fs.writeFileSync(path.join(tmp, 'data/limits.json'), '{}');
    const a = await login(''); assert.equal(a.status, 200);
    const cs = (await api(a.cookie, '', 'me')).json.csrf;
    const content = (await api(a.cookie, cs, 'content')).json;
    content.contact = Object.assign({}, content.contact, { reportEmail: 'security@example.com' });
    assert.equal((await api(a.cookie, cs, 'content', 'PUT', content)).status, 200);
    const r = await fetch(base + '/.well-known/security.txt', { headers: { 'User-Agent': UA } });
    assert.equal(r.status, 200); const txt = await r.text();
    assert.match(txt, /^Contact: mailto:security@example\.com\n/); assert.match(txt, /\nExpires: \d{4}-\d\d-\d\dT[\d:]+Z\n/);
    cookie = a.cookie; csrf = cs;
  });

  await t.test('a successful login gives its attempt back (signing in repeatedly is not guessing)', async () => {
    fs.writeFileSync(path.join(tmp, 'data/limits.json'), '{}');
    for (let i = 0; i < 8; i++) assert.equal((await login('', '198.51.100.77')).status, 200, 'login ' + i);
  });

  await t.test('idle sessions end, active ones carry on', async () => {
    const a = await login('', '198.51.100.88'); const cs = (await api(a.cookie, '', 'me', 'GET', null, '198.51.100.88')).json.csrf;
    assert.equal((await api(a.cookie, cs, 'media', 'GET', null, '198.51.100.88')).status, 200);
    // make the session look idle for longer than SESSION_IDLE_MIN (1 minute)
    const f = path.join(tmp, 'data/sessions.json'); const all = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const k of Object.keys(all)) all[k].seen = Date.now() - 5 * 60e3;
    fs.writeFileSync(f, JSON.stringify(all));
    assert.equal((await api(a.cookie, cs, 'media', 'GET', null, '198.51.100.88')).status, 401);
  });

  await t.test('one address cannot flood the site; local proxy traffic without a forwarded address is not limited', async () => {
    let limited = 0;
    for (let i = 0; i < 60; i++) { const r = await fetch(base + '/robots.txt', { headers: { 'X-Forwarded-For': '203.0.113.9' } }); if (r.status === 429) { limited++; assert.equal(r.headers.get('retry-after'), '60'); } }
    assert.ok(limited >= 15 && limited <= 25, 'limited ' + limited);
    assert.equal((await fetch(base + '/robots.txt', { headers: { 'X-Forwarded-For': '203.0.113.10' } })).status, 200, 'another address is unaffected');
    for (let i = 0; i < 60; i++) assert.equal((await fetch(base + '/robots.txt')).status, 200);
  });

  await t.test('a client that drips a login body slowly is cut off and cannot hold the login for long', async () => {
    const t0 = Date.now();
    const sock = net.connect(port, '127.0.0.1');
    await new Promise(r => sock.on('connect', r));
    sock.write('POST /admin/api/login HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 200\r\n\r\n{"user"');
    const closed = await new Promise(r => { sock.on('close', () => r(true)); sock.on('error', () => r(true)); sock.on('data', () => {}); setTimeout(() => r(false), 14000); });
    sock.destroy();
    assert.equal(closed, true, 'connection closed by the server');
    assert.ok(Date.now() - t0 < 13000, 'within the 10 second body deadline');
  });

  await t.test('visit recording is capped per address per hour', async () => {
    const day = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
    const f = path.join(tmp, 'data/visits', day + '.jsonl');
    const count = () => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(l => l.includes('"ip":"203.0.113.50"')).length; } catch (e) { return 0; } };
    for (let i = 0; i < 12; i++) await fetch(base + '/rewards?x=' + i, { headers: { 'User-Agent': UA, 'X-Forwarded-For': '203.0.113.50', Cookie: 'rc_consent=1.1' } });
    await wait(2500);
    assert.equal(count(), 5, 'only the first ANALYTICS_MAX_PER_IP_HOUR (5) views of one address are written');
  });

  await t.test('repeated identical pages are compressed once', async () => {
    const h = { 'Accept-Encoding': 'br', 'User-Agent': UA, Cookie: 'rc_consent=1.0' };
    const a = await fetch(base + '/faq', { headers: h }), b = await fetch(base + '/faq', { headers: h });
    assert.equal(a.headers.get('content-encoding'), 'br'); assert.equal(await a.text(), await b.text());
  });

  await t.test('a lock left behind by a crashed process is cleared; a fresh one still blocks', () => {
    const locked = require(path.join(tmp, 'lib/lock')), f = path.join(tmp, 'data/stale-test');
    fs.writeFileSync(f + '.lock', '999999');
    assert.throws(() => locked(f, () => 1), e => e.code === 503, 'a recent lock is respected');
    const old = new Date(Date.now() - 5 * 60e3); fs.utimesSync(f + '.lock', old, old);
    assert.equal(locked(f, () => 'ran'), 'ran', 'an old lock is taken over');
    assert.equal(fs.existsSync(f + '.lock'), false, 'and released afterwards');
  });

  await t.test('statistics ranges are bounded before anything is built', async () => {
    const a = await login('', '198.51.100.99'), cs = (await api(a.cookie, '', 'me', 'GET', null, '198.51.100.99')).json.csrf;
    const t0 = Date.now();
    for (const p of ['analytics?from=0001-01-01&to=9999-12-31', 'analytics/visits?from=0001-01-01&to=9999-12-31', 'analytics?from=2026-01-01&to=2026-12-31&x=1']) {
      const r = await api(a.cookie, cs, p, 'GET', null, '198.51.100.99');
      if (!p.includes('x=1')) assert.equal(r.status, 400, p);
    }
    assert.ok(Date.now() - t0 < 3000, 'answered quickly');
  });

  await t.test('uploaded media is world-readable (a front web server running as another user must be able to serve it)', async () => {
    const a = await login('', '198.51.100.120'), cs = (await api(a.cookie, '', 'me', 'GET', null, '198.51.100.120')).json.csrf;
    const png = Buffer.alloc(24); Buffer.from('89504e470d0a1a0a', 'hex').copy(png); png.writeUInt32BE(1, 16); png.writeUInt32BE(1, 20);
    const r = await fetch(base + '/admin/api/upload', { method: 'POST', headers: { Cookie: a.cookie, 'X-CSRF-Token': cs, 'Content-Type': 'image/png', 'X-Forwarded-For': '198.51.100.120' }, body: Buffer.concat([png, Buffer.alloc(40)]) });
    assert.equal(r.status, 200); const { url } = await r.json();
    if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(tmp, 'public', url)).mode & 0o777, 0o644);
  });

  await t.test('fix-uploads makes old 600 uploads readable and leaves everything else alone', () => {
    const fix = require(path.join(tmp, 'lib/fixuploads')), d = fs.mkdtempSync(path.join(tmp, 'fx-'));
    fs.writeFileSync(path.join(d, 'a.png'), 'x', { mode: 0o600 }); fs.writeFileSync(path.join(d, 'b.png'), 'x', { mode: 0o644 }); fs.mkdirSync(path.join(d, 'sub'));
    const r = fix(d);
    assert.equal(r.total, 2);
    if (process.platform !== 'win32') { assert.equal(r.fixed, 1); assert.equal(fs.statSync(path.join(d, 'a.png')).mode & 0o777, 0o644); }
    assert.deepEqual(fix(path.join(d, 'missing')), { total: 0, fixed: 0 });
  });

  await t.test('admin responses carry the cross-origin and framing protections', async () => {
    const r = await fetch(base + '/admin/api/me', { headers: { Cookie: cookie } });
    assert.equal(r.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal(r.headers.get('x-frame-options'), 'DENY'); assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal((await fetch(base + '/', { headers: { 'User-Agent': UA } })).headers.get('x-permitted-cross-domain-policies'), 'none');
  });
});

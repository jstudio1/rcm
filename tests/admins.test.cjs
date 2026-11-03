// Several admin accounts (owner + admins), profiles, and the site-wide maintenance switch.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { spawn } = require('child_process');

const source = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(process.env.RCM_TEST_TMP || os.tmpdir(), 'rcm-admins-'));
for (const f of ['server.js', 'lib', 'admin', 'views']) { try { fs.cpSync(path.join(source, f), path.join(tmp, f), { recursive: true }); } catch (e) {} }
fs.mkdirSync(path.join(tmp, 'public', 'uploads'), { recursive: true }); fs.mkdirSync(path.join(tmp, 'public', 'img'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'public', 'style.css'), 'body{}');
fs.copyFileSync(path.join(source, 'public', 'consent.js'), path.join(tmp, 'public', 'consent.js'));
fs.mkdirSync(path.join(tmp, 'data'));
const seed = require(path.join(tmp, 'lib/seed'))(); seed.site.url = '';
fs.writeFileSync(path.join(tmp, 'data/content.json'), JSON.stringify(seed));
// a site installed before several accounts existed: the old one-account file
const OWNER_PW = 'Owner-password-12345';
const salt = crypto.randomBytes(16).toString('hex');
fs.writeFileSync(path.join(tmp, 'data/admin.json'), JSON.stringify({ user: 'admin', salt, hash: crypto.scryptSync(OWNER_PW, salt, 64).toString('hex') }));

const port = 23000 + Math.floor(Math.random() * 15000), base = 'http://127.0.0.1:' + port;
const child = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), TRUST_PROXY: '1' } });
let logs = ''; child.stdout.on('data', b => (logs += b)); child.stderr.on('data', b => (logs += b));
after(() => child.kill());
const wait = ms => new Promise(r => setTimeout(r, ms));
let ipN = 10;
const fresh = () => '203.0.113.' + (ipN++);
async function login(user, password, code) {
  const r = await fetch(base + '/admin/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': fresh() }, body: JSON.stringify({ user, password, code }) });
  const ck = r.headers.get('set-cookie'); const cookie = ck ? ck.split(';')[0] : '';
  let csrf = ''; if (r.status === 200) csrf = (await (await fetch(base + '/admin/api/me', { headers: { Cookie: cookie } })).json()).csrf;
  return { status: r.status, cookie, csrf };
}
const api = async (s, p, method = 'GET', body) => {
  const r = await fetch(base + '/admin/api/' + p, { method, headers: { Cookie: s.cookie, 'X-Forwarded-For': fresh(), ...(method !== 'GET' ? { 'X-CSRF-Token': s.csrf, 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const page = async p => { const r = await fetch(base + p, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/124.0', Cookie: 'rc_consent=1.0' } }); return { status: r.status, html: await r.text(), retry: r.headers.get('retry-after') }; };

test('admin accounts and maintenance', async t => {
  for (let i = 0; i < 80; i++) { try { await fetch(base + '/robots.txt'); break; } catch { await wait(50); } }
  assert.equal(child.exitCode, null, logs);
  let owner;

  await t.test('the old one-account file still signs in, as the owner', async () => {
    owner = await login('admin', OWNER_PW); assert.equal(owner.status, 200);
    const me = (await api(owner, 'me')).json.me;
    assert.deepEqual([me.user, me.role], ['admin', 'owner']);
    assert.equal((await login('ADMIN', OWNER_PW)).status, 200, 'the name is not case sensitive');
    assert.equal((await login('nobody', OWNER_PW)).status, 401);
  });

  await t.test('profile: names and email are saved, cleaned and checked', async () => {
    const r = await api(owner, 'profile', 'PUT', { first: 'สมชาย<script>', last: 'ใจดี', nick: 'ชาย', email: 'owner@example.com' });
    assert.equal(r.status, 200); assert.equal(r.json.me.first, 'สมชายscript'); assert.equal(r.json.me.nick, 'ชาย');
    assert.equal((await api(owner, 'profile', 'PUT', { email: 'not-an-email' })).status, 400);
    assert.equal((await api(owner, 'me')).json.me.email, 'owner@example.com', 'a bad save changes nothing');
  });

  let staff, staffId;
  await t.test('the owner adds an admin; the add needs the owner\'s own password and valid details', async () => {
    const base = { user: 'staff01', password: 'Staff-password-1234', first: 'Staff', email: 'staff@example.com', current: OWNER_PW };
    assert.equal((await api(owner, 'admins', 'POST', Object.assign({}, base, { current: 'wrong-password-xyz' }))).status, 400);
    assert.equal((await api(owner, 'admins', 'POST', Object.assign({}, base, { user: 'a b' }))).status, 400);
    assert.equal((await api(owner, 'admins', 'POST', Object.assign({}, base, { password: 'short' }))).status, 400);
    assert.equal((await api(owner, 'admins', 'POST', Object.assign({}, base, { user: 'ADMIN' }))).status, 400, 'names are unique');
    const r = await api(owner, 'admins', 'POST', base); assert.equal(r.status, 200, JSON.stringify(r.json));
    staffId = r.json.admin.id; assert.equal(r.json.admin.role, 'admin');
    const list = await api(owner, 'admins');
    assert.equal(list.json.canManage, true); assert.equal(list.json.items.length, 2);
    assert.equal(/salt|hash|secret|"totp"/.test(JSON.stringify(list.json)), false, 'the list never carries password hashes or 2FA keys');
    staff = await login('staff01', 'Staff-password-1234'); assert.equal(staff.status, 200);
  });

  await t.test('an admin edits content but cannot manage admins', async () => {
    assert.equal((await api(staff, 'me')).json.me.role, 'admin');
    assert.equal((await api(staff, 'content')).status, 200);
    const l = await api(staff, 'admins'); assert.equal(l.json.canManage, false);
    assert.equal((await api(staff, 'admins', 'POST', { user: 'evil01', password: 'Evil-password-12345', current: 'Staff-password-1234' })).status, 403);
    assert.equal((await api(staff, 'admins/owner/remove', 'POST', { current: 'Staff-password-1234' })).status, 403);
    assert.equal((await api(staff, 'admins/owner/password', 'POST', { password: 'Taken-over-12345', current: 'Staff-password-1234' })).status, 403);
    assert.equal((await login('admin', OWNER_PW)).status, 200, 'the owner is untouched');
  });

  await t.test('each account has its own password and 2FA; changing one never signs the others out', async () => {
    const r = await api(staff, 'password', 'POST', { current: 'Staff-password-1234', next: 'Staff-password-5678' });
    assert.equal(r.status, 200);
    assert.equal((await api(owner, 'me')).status, 200, 'the owner stays signed in');
    assert.equal((await api(staff, 'me')).status, 401, 'the staff\'s old session ended');
    staff = await login('staff01', 'Staff-password-5678'); assert.equal(staff.status, 200);
    const b = await api(staff, '2fa/begin', 'POST', { current: 'Staff-password-5678' }); assert.equal(b.status, 200);
    assert.match(b.json.uri, /RAYCITY-M:staff01\?/);
    assert.equal((await api(owner, '2fa')).json.enabled, false, 'the owner\'s 2FA is separate');
  });

  await t.test('the owner resets and removes another admin; never themselves', async () => {
    assert.equal((await api(owner, 'admins/' + staffId + '/password', 'POST', { password: 'Reset-password-9999', current: OWNER_PW })).status, 200);
    assert.equal((await api(staff, 'me')).status, 401, 'a reset signs that admin out');
    assert.equal((await login('staff01', 'Staff-password-5678')).status, 401);
    staff = await login('staff01', 'Reset-password-9999'); assert.equal(staff.status, 200);
    assert.equal((await api(owner, 'admins/owner/remove', 'POST', { current: OWNER_PW })).status, 400, 'the owner cannot remove themselves');
    assert.equal((await api(owner, 'admins/' + staffId + '/remove', 'POST', { current: OWNER_PW })).status, 200);
    assert.equal((await api(staff, 'me')).status, 401, 'a removed admin is out at once');
    assert.equal((await login('staff01', 'Reset-password-9999')).status, 401);
    const a = JSON.parse(fs.readFileSync(path.join(tmp, 'data/admin.json'), 'utf8'));
    assert.equal(a.v, 2); assert.equal(a.users.length, 1);
  });

  await t.test('maintenance: every public page shows the maintenance page (503) until it is switched off', async () => {
    assert.equal((await page('/')).status, 200);
    const pv = await page('/?preview=maintenance'); assert.equal(pv.status, 200); assert.match(pv.html, /class="mnt-box"/);
    const c = (await api(owner, 'content')).json; c.site.maintenance = true; c.site.maintenanceUntil = '<b>18:00</b>';
    assert.equal((await api(owner, 'content', 'PUT', c)).status, 200);
    for (const p of ['/', '/news', '/gameplay', '/rewards', '/privacy', '/login', '/account', '/news/x', '/nothing', '/sitemap.xml']) {
      const r = await page(p); assert.equal(r.status, 503, p); assert.equal(r.retry, '3600', p); assert.match(r.html, /class="mnt-box"/, p);
      assert.match(r.html, /noindex/, p); assert.equal(r.html.includes('<b>18:00</b>'), false, 'text is escaped');
    }
    assert.match((await page('/en')).html, /Down for maintenance/);
    assert.equal((await page('/robots.txt')).status, 200); assert.equal((await page('/style.css')).status, 200);
    assert.equal((await api(owner, 'content')).status, 200, 'the admin keeps working');
    c.site.maintenance = false; const c2 = (await api(owner, 'content')).json; c2.site.maintenance = false;
    assert.equal((await api(owner, 'content', 'PUT', c2)).status, 200);
    assert.equal((await page('/')).status, 200); assert.equal((await page('/news')).status, 200);
  });
});

// Pre-registration rewards: counter, goals, mock/API source, escaping, fallbacks.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

const source = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(process.env.RCM_TEST_TMP || os.tmpdir(), 'rcm-prereg-'));
for (const f of ['server.js', 'lib', 'admin', 'views']) { try { fs.cpSync(path.join(source, f), path.join(tmp, f), { recursive: true }); } catch (e) {} }
fs.mkdirSync(path.join(tmp, 'public', 'uploads'), { recursive: true }); fs.mkdirSync(path.join(tmp, 'public', 'img'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'public', 'style.css'), 'body{}');
for (const f of ['consent.js', 'prereg.js', 'prereg.css']) fs.copyFileSync(path.join(source, 'public', f), path.join(tmp, 'public', f));
fs.mkdirSync(path.join(tmp, 'data'));
const seed = require(path.join(tmp, 'lib/seed'))(); seed.site.url = '';
fs.writeFileSync(path.join(tmp, 'data/content.json'), JSON.stringify(seed));

const port = 23000 + Math.floor(Math.random() * 15000), base = 'http://127.0.0.1:' + port;
const PASS = 'Prereg-test-password-12';
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
const rw = (id, milestone, target, title) => ({ id, milestone, target, title: title || 'R' + id, desc: 'd', image: '', alt: '', status: '' });

test('pre-registration rewards', async t => {
  for (let i = 0; i < 80; i++) { try { await fetch(base + '/robots.txt'); break; } catch { await wait(50); } }
  assert.equal(child.exitCode, null, logs);
  const r = await fetch(base + '/admin/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'admin', password: PASS }) });
  assert.equal(r.status, 200); cookie = r.headers.get('set-cookie').split(';')[0]; csrf = (await api('me')).json.csrf;

  await t.test('rewards page and home show the counter, the track and the goal cards (mockup number)', async () => {
    for (const p of ['/rewards', '/']) {
      const { status, html } = await get(p); assert.equal(status, 200, p);
      assert.match(html, /<b data-count data-n="13002">13,002<\/b>/, p); assert.ok(html.includes('/prereg.js') && html.includes('/prereg.css'), p);
      assert.deepEqual(states(html), ['reached:1000', 'reached:3000', 'reached:5000', 'reached:10000', 'next:20000', 'locked:30000'], p);
      assert.deepEqual([...html.matchAll(/<li class="pr-col \w+" data-goal="\d+" style="--f:([\d.]+)%/g)].map(m => Number(m[1])), [100, 100, 100, 30, 0, 0], 'the line between two goals is filled as far as the count has come: ' + p);
      assert.match(html, /data-goal="1000" style="--f:100%;--lead:100%"/, 'the lead-in up to the first goal is full once it is reached');
      assert.match(html, /อีกเพียง <b data-left>6,998<\/b> คน/); assert.match(html, /<b data-reached>4<\/b> \/ 6/);
      assert.ok(html.includes('ถึงเป้าหมายแล้ว') && html.includes('เป้าหมายถัดไป') && html.includes('ยังไม่ถึงเป้า'));
    }
    assert.match((await get('/rewards')).html, /<h1 class="disp">รวมพลังสตาร์ <em>ปลดล็อกรางวัล<\/em><\/h1>/);
    assert.match((await get('/')).html, /<h2 class="disp">รวมพลังสตาร์/);
    assert.equal(((await get('/')).html.match(/<h1/g) || []).length, 1, 'one h1 on the home page');
    const pr = (await get('/rewards')).html; assert.match(pr, /aria-pressed="true"/); assert.equal(cfgOf(pr).api, '');
  });

  await t.test('before the first goal the lead-in shows the progress; equal goals never divide by zero; goals stay on one line', async () => {
    await edit(c => { c.prereg.mockCount = '2500'; c.rewards = [rw('a', '', '10000', 'A'), rw('b', '', '10000', 'B'), rw('c', '', '20000', 'C')]; });
    const h = (await get('/rewards')).html;
    assert.match(h, /data-goal="10000" style="--f:0%;--lead:25%"/, '2,500 of 10,000 = a quarter of the way to the first goal');
    assert.equal(/NaN|Infinity/.test(h), false);
    const css = fs.readFileSync(path.join(source, 'public/prereg.css'), 'utf8');
    assert.ok(/\.pr-grid\{[^}]*grid-auto-flow:column/.test(css), 'goals never wrap to a second row on wide screens');
    await edit(c => { c.prereg.mockCount = '13002'; c.rewards = seed.rewards; });
  });

  await t.test('closing time: countdown before it, closed state after it (button, register page, portal)', async () => {
    const fmt = d => new Date(d + 7 * 3600e3).toISOString().slice(0, 16);
    await edit(c => { c.prereg.endAt = fmt(Date.now() + 3 * 86400e3 + 3600e3); c.portal.enabled = true; c.portal.registerOpen = true; });
    let h = (await get('/rewards')).html, home = (await get('/')).html;
    assert.match(h, /class="pr-cd" data-cd data-end="\d+"/); assert.match(h, /data-cd-v>3 วัน 0\d:\d\d:\d\d</);
    assert.match(home, /class="dk-cd" data-cd/, 'countdown under the register button on the home page');
    assert.equal((await get('/register')).status, 200, 'sign-up open before the time');
    await edit(c => { c.prereg.endAt = fmt(Date.now() - 60e3); });
    h = (await get('/rewards')).html; home = (await get('/')).html;
    assert.equal(h.includes('data-cd'), false); assert.match(h, /class="btn pr-btn" type="button" disabled>/); assert.match(h, /ปิดรับลงทะเบียนแล้ว/);
    assert.match(home, /<button class="btn" type="button" disabled>ปิดรับลงทะเบียนแล้ว<\/button>/);
    assert.equal((await get('/register')).status, 404, 'the sign-up page closes by itself');
    assert.equal((await get('/login')).html.includes('href="/register"'), false);
    await edit(c => { c.prereg.endAt = 'not a date'; });
    assert.equal((await get('/register')).status, 200, 'a broken value means no closing time');
    await edit(c => { c.prereg.endAt = ''; c.portal.enabled = false; });
  });

  await t.test('the number drives which goals are reached; goals are sorted; all-done message', async () => {
    await edit(c => { c.prereg.mockCount = '30,000'; });
    let h = (await get('/rewards')).html;
    assert.equal(states(h).every(s => s.startsWith('reached')), true); assert.ok(h.includes('ถึงทุกเป้าหมายแล้ว')); assert.match(h, /<b data-reached>6<\/b> \/ 6/);
    await edit(c => { c.prereg.mockCount = '0'; c.rewards.reverse(); });
    h = (await get('/rewards')).html;
    assert.deepEqual(states(h).map(x => x.split(':')[1]), ['1000', '3000', '5000', '10000', '20000', '30000'], 'shown in order whatever the order saved');
    assert.equal(states(h)[0].startsWith('next'), true);
    await edit(c => { c.prereg.mockCount = '13002'; c.rewards.reverse(); });
  });

  await t.test('goal comes from "target" or the milestone label (50K, 1.5M); rows without a goal are left out', async () => {
    await edit(c => { c.prereg.mockCount = '13002'; c.rewards = [rw('a', '50K', '', 'A'), rw('b', '', '2,500', 'B'), rw('c', '1.5M', '', 'C'), rw('d', 'soon', '', 'DDD')]; });
    const h = (await get('/rewards')).html;
    assert.deepEqual(states(h), ['reached:2500', 'next:50000', 'locked:1500000']);
    assert.equal(h.includes('DDD'), false);
    await edit(c => { c.rewards.forEach(x => { x.milestone = 'soon'; x.target = ''; }); });
    const none = await get('/rewards'); assert.equal(none.status, 200); assert.equal(none.html.includes('id="prereg"'), false, 'no goals = no section, no empty counter');
  });

  await t.test('switched off: plain reward cards on /rewards, nothing on home; "show on home" is separate', async () => {
    await edit(c => { c.rewards = [rw('r1', '5,000', '5000', 'ไอเทมต้อนรับ')]; c.prereg.mockCount = '13002'; c.prereg.enabled = false; });
    const plain = (await get('/rewards')).html; assert.equal(plain.includes('id="prereg"'), false); assert.match(plain, /<div class="cards c4">/); assert.ok(plain.includes('ไอเทมต้อนรับ'));
    assert.equal((await get('/')).html.includes('id="prereg"'), false);
    await edit(c => { c.prereg.enabled = true; c.prereg.onHome = false; });
    assert.ok((await get('/rewards')).html.includes('id="prereg"')); assert.equal((await get('/')).html.includes('id="prereg"'), false);
    await edit(c => { c.prereg.onHome = true; });
    assert.ok((await get('/')).html.includes('id="prereg"'));
  });

  await t.test('API mode: only a safe https address is used, only its origin joins the page policy, the number stays the fallback', async () => {
    assert.match((await get('/rewards')).csp, /connect-src 'self'(;|$)/);
    await edit(c => { c.prereg.mode = 'api'; c.prereg.apiUrl = 'https://game.example.com/api/prereg/count?x=1#frag'; });
    const ok = await get('/rewards'), cfg = cfgOf(ok.html);
    assert.equal(cfg.api, 'https://game.example.com/api/prereg/count?x=1');
    assert.match(ok.csp, /connect-src 'self' https:\/\/game\.example\.com(;| )/); assert.equal(ok.csp.includes('/api/'), false, 'origin only');
    assert.match(ok.html, /<b data-count data-n="13002">/, 'the server still draws the fallback number');
    await edit(c => { c.prereg.apiUrl = 'http://localhost:4000/count'; });
    assert.equal(cfgOf((await get('/rewards')).html).api, 'http://localhost:4000/count');
    for (const bad of ['http://evil.example.com/c', 'javascript:alert(1)', 'https://u:p@game.example.com/c', 'ftp://x.example.com/', '//evil.example.com/c', 'nope', '']) {
      await edit(c => { c.prereg.apiUrl = bad; });
      const g = await get('/rewards'); assert.equal(cfgOf(g.html).api, '', bad); assert.match(g.csp, /connect-src 'self'(;|$)/, bad);
    }
    await edit(c => { c.prereg.mode = 'mock'; c.prereg.apiUrl = ''; });
  });

  await t.test('everything typed in the admin is escaped', async () => {
    const X = '<img src=x onerror=alert(1)>';
    await edit(c => {
      for (const k of ['eyebrow', 'title', 'titleAccent', 'intro', 'statusLabel', 'counterLabel', 'unit', 'nextText', 'allDoneText', 'goalsLabel', 'reachedCount', 'reachedLabel', 'nextLabel', 'lockedLabel', 'viewLabel', 'detailReached', 'detailLocked']) c.prereg[k] = X + ' {n}';
      Object.assign(c.rewards[0], { title: X, desc: X, image: 'javascript:alert(1)', alt: '"><svg onload=1>' });
    });
    for (const p of ['/rewards', '/']) { const h = (await get(p)).html; assert.equal(/<img src=x onerror|<svg onload|src="javascript:/i.test(h), false, p); }
  });

  await t.test('a site saved before this existed gets the defaults and keeps its old rewards', async () => {
    const f = path.join(tmp, 'data/content.json'), c = JSON.parse(fs.readFileSync(f, 'utf8'));
    delete c.prereg; c.rewards = [{ id: 'r1', milestone: '50K', title: 'เก่า', desc: 'x', status: 'LOCKED' }];
    const saved = fs.readFileSync(f, 'utf8'); fs.writeFileSync(f, JSON.stringify(c)); await wait(1300);
    const h = (await get('/rewards')).html; assert.ok(h.includes('13,002') && h.includes('เก่า'), 'counter default, old reward shown');
    const got = (await api('content')).json; assert.equal(got.prereg.mode, 'mock'); assert.equal(got.rewards[0].target, '');
    fs.writeFileSync(f, saved); await wait(1300);
  });

  await t.test('script is text-only and fetches the count without cookies', () => {
    const js = fs.readFileSync(path.join(source, 'public/prereg.js'), 'utf8');
    assert.ok(js.includes("setProperty('--f'"), 'the live count moves the fill too');
    for (const bad of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']) assert.equal(js.includes(bad), false, bad);
    assert.ok(js.includes("credentials: 'omit'"));
  });
});

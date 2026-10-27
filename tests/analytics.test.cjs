// Visitor statistics: collection rules, device/source detection, date ranges and admin-only access.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

const source = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(process.env.RCM_TEST_TMP || os.tmpdir(), 'rcm-analytics-'));
for (const f of ['server.js', 'lib', 'admin', 'views']) fs.cpSync(path.join(source, f), path.join(tmp, f), { recursive: true });
fs.mkdirSync(path.join(tmp, 'public', 'uploads'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'public', 'img'));
fs.writeFileSync(path.join(tmp, 'public', 'style.css'), 'body{}');
fs.mkdirSync(path.join(tmp, 'data'));
const content = require(path.join(tmp, 'lib/seed'))();
content.site.url = '';
fs.writeFileSync(path.join(tmp, 'data/content.json'), JSON.stringify(content));

const port = 23000 + Math.floor(Math.random() * 15000), base = 'http://127.0.0.1:' + port;
const child = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), ADMIN_PASSWORD: 'Analytics-test-password-1', TRUST_PROXY: '1' } });
let logs = ''; child.stdout.on('data', b => (logs += b)); child.stderr.on('data', b => (logs += b));
after(() => child.kill());

const UA = {
  android: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  pc: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 Edg/124.0',
  bot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
};
// these tests are about counting, so visitors here have accepted analytics in the cookie banner (see consent.test.cjs for the rest)
const hit = (p, ua, ip, extra = {}) => {
  const h = { 'User-Agent': ua, 'X-Forwarded-For': ip, ...(extra.headers || {}) };
  h.Cookie = ['rc_consent=1.1', h.Cookie].filter(Boolean).join('; ');
  return fetch(base + p, { redirect: 'manual', method: extra.method || 'GET', headers: h });
};
const dayOf = t => new Date(t + 7 * 3600e3).toISOString().slice(0, 10);
let cookie, csrf;
const api = async p => { const r = await fetch(base + '/admin/api/' + p, { headers: { Cookie: cookie } }); return { status: r.status, json: await r.json().catch(() => null) }; };

test('visitor statistics', async t => {
  for (let i = 0; i < 80; i++) { try { await fetch(base + '/robots.txt'); break; } catch { await new Promise(r => setTimeout(r, 50)); } }
  assert.equal(child.exitCode, null, logs);
  const today = dayOf(Date.now());

  await t.test('day boundary follows Thailand time (UTC+7)', () => {
    const A = require(path.join(tmp, 'lib/analytics'));
    assert.equal(A.dayOf(Date.parse('2026-10-25T16:59:59Z')), '2026-10-25');
    assert.equal(A.dayOf(Date.parse('2026-10-25T17:00:00Z')), '2026-10-26');
    assert.equal(A.validDay('2026-02-30'), false);
    assert.equal(A.validDay('2026-10-26'), true);
  });

  await t.test('devices, apps and bots are told apart', () => {
    const { parseUA } = require(path.join(tmp, 'lib/analytics'));
    assert.deepEqual([parseUA(UA.android).d, parseUA(UA.android).os, parseUA(UA.android).bot], ['android', 'Android', false]);
    assert.deepEqual([parseUA(UA.ios).d, parseUA(UA.ios).os], ['ios', 'iOS']);
    assert.deepEqual([parseUA(UA.pc).d, parseUA(UA.pc).b], ['desktop', 'Edge']);
    assert.equal(parseUA(UA.ios + ' Line/14.2.0').b, 'LINE');
    assert.equal(parseUA('Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 [FBAN/FB4A;FBAV/450.0]').b, 'Facebook');
    for (const ua of [UA.bot, '', 'curl/8.4.0', 'Mozilla/5.0 Chrome-Lighthouse', 'python-requests/2.31']) assert.equal(parseUA(ua).bot, true, ua);
  });

  await t.test('only real page views are counted', async () => {
    const r1 = await hit('/', UA.android, '49.228.10.5', { headers: { Referer: 'https://l.facebook.com/' } });
    assert.equal(r1.status, 200);
    const set = r1.headers.get('set-cookie') || '';
    assert.match(set, /^vid=[0-9a-f]{24};/);
    assert.match(set, /HttpOnly/); assert.match(set, /SameSite=Lax/);
    const vid = set.split(';')[0];
    // same person comes back (cookie) and walks inside the site: one unique visitor, two views, internal referrer ignored
    await hit('/gameplay', UA.android, '49.228.10.5', { headers: { Cookie: vid, Referer: base + '/' } });
    await hit('/?utm_source=line_oa', UA.ios, '171.99.1.2');
    await hit('/rewards', UA.pc, '1.2.3.4', { headers: { Referer: 'https://www.google.com/search' } });
    const rb = await hit('/', UA.bot, '66.249.1.1');
    assert.equal(rb.headers.get('set-cookie'), null, 'bots get no cookie');
    // never counted: HEAD, 404 pages, static files, admin
    await hit('/', UA.pc, '9.9.9.9', { method: 'HEAD' });
    await hit('/no-such-page', UA.pc, '9.9.9.8');
    await hit('/style.css', UA.pc, '9.9.9.7');
    await hit('/admin', UA.pc, '9.9.9.6');
    await hit('/', UA.pc, '9.9.9.5', { headers: { 'Sec-Purpose': 'prefetch' } });
  });

  await t.test('statistics API is admin-only', async () => {
    for (const p of ['analytics', 'analytics/visits']) assert.equal((await fetch(base + '/admin/api/' + p)).status, 401);
    const r = await fetch(base + '/admin/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'admin', password: 'Analytics-test-password-1' }) });
    assert.equal(r.status, 200);
    cookie = r.headers.get('set-cookie').split(';')[0];
    csrf = (await api('me')).json.csrf;
    assert.ok(csrf);
  });

  await t.test('numbers: traffic, real views, unique visitors, IPs, devices, sources', async () => {
    const { status, json: d } = await api(`analytics?from=${today}&to=${today}`);
    assert.equal(status, 200);
    assert.deepEqual([d.totals.views, d.totals.visitors, d.totals.bots, d.totals.traffic, d.totals.ips], [4, 3, 1, 5, 3]);
    assert.deepEqual([d.totals.newVisitors, d.totals.returningVisitors], [3, 0]);
    const dev = Object.fromEntries(d.devices.map(x => [x.key, [x.views, x.visitors]]));
    assert.deepEqual([dev.android, dev.ios, dev.desktop], [[2, 1], [1, 1], [1, 1]]);
    const src = Object.fromEntries(d.sources);
    assert.equal(src.Facebook, 1); assert.equal(src.Google, 1); assert.equal(src['แคมเปญ: line_oa'], 1);
    assert.equal(Object.keys(src).some(k => /internal|localhost|127\.0\.0\.1/.test(k)), false);
    assert.deepEqual(d.ips.map(x => x.ip).sort(), ['1.2.3.4', '171.99.1.2', '49.228.10.5']);
    assert.equal(d.ips.find(x => x.ip === '49.228.10.5').views, 2);
    assert.equal(d.hourly.length, 24);
    assert.equal(d.hourly.reduce((n, x) => n + x.views, 0), 4);
  });

  await t.test('past days, ranges, growth and cumulative series', async () => {
    const dir = path.join(tmp, 'data/visits');
    const day = n => dayOf(Date.now() - n * 86400e3);
    const line = (n, v, ip, extra = {}) => JSON.stringify({ t: Date.parse(day(n) + 'T05:00:00Z'), ip, p: '/', d: 'android', os: 'Android', b: 'Chrome', r: '', v, ...extra });
    fs.writeFileSync(path.join(dir, day(1) + '.jsonl'), [line(1, 'a'.repeat(24), '5.5.5.5', { n: 1 }), line(1, 'a'.repeat(24), '5.5.5.5'), line(1, 'b'.repeat(24), '5.5.5.6', { n: 1 }), 'not json at all', JSON.stringify({ t: Date.parse(day(1) + 'T06:00:00Z'), ip: '66.1.1.1', p: '/', d: 'other', bot: 1, ua: 'bingbot' })].join('\n') + '\n');
    fs.writeFileSync(path.join(dir, day(2) + '.jsonl'), line(2, 'a'.repeat(24), '5.5.5.5', { n: 1 }) + '\n');
    const y = (await api(`analytics?from=${day(1)}&to=${day(1)}`)).json;
    assert.deepEqual([y.totals.views, y.totals.visitors, y.totals.bots, y.prev.views], [3, 2, 1, 1]);
    const w = (await api(`analytics?from=${day(2)}&to=${today}`)).json;
    assert.equal(w.series.length, 3);
    assert.equal(w.totals.visitors, 5, 'a, b and the 3 visitors from today');
    assert.deepEqual(w.series.map(x => x.cumViews), [1, 4, 8]);
    assert.deepEqual(w.series.map(x => x.cumVisitors), [1, 2, 5]);
    assert.equal(w.prev.to, day(3));
    assert.equal(w.days, 3);
    // a day with no file is simply zero
    const none = (await api(`analytics?from=${day(30)}&to=${day(30)}`)).json;
    assert.deepEqual([none.totals.views, none.totals.visitors], [0, 0]);
  });

  await t.test('bad or impossible ranges are refused', async () => {
    const day = n => dayOf(Date.now() - n * 86400e3);
    for (const q of ['from=2026-13-40&to=2026-10-01', 'from=abc', `from=${today}&to=2000-01-01`, 'from=2020-01-01&to=2026-10-01', "from=2026-10-01'&to=2026-10-02"]) assert.equal((await api('analytics?' + q)).status, 400, q);
    const future = dayOf(Date.now() + 3 * 86400e3);
    assert.equal((await api(`analytics?from=${today}&to=${future}`)).status, 400);
    assert.equal((await api('analytics')).status, 200, 'defaults to today');
    assert.ok(day(0) === today);
  });

  await t.test('visit log: newest first, filter by IP, bots hidden unless asked', async () => {
    const all = (await api(`analytics/visits?from=${today}&to=${today}`)).json;
    assert.equal(all.total, 4);
    assert.equal(all.rows[0].t >= all.rows[all.rows.length - 1].t, true);
    assert.equal(all.rows.some(r => r.bot), false);
    const one = (await api(`analytics/visits?from=${today}&to=${today}&ip=49.228.10.5`)).json;
    assert.equal(one.total, 2);
    assert.equal(one.rows.every(r => r.ip === '49.228.10.5'), true);
    const withBots = (await api(`analytics/visits?from=${today}&to=${today}&bots=1`)).json;
    assert.equal(withBots.total, 5);
    assert.equal(withBots.rows.find(r => r.bot).bot_name, 'Googlebot');
    const page = (await api(`analytics/visits?from=${today}&to=${today}&limit=2&offset=2`)).json;
    assert.equal(page.rows.length, 2);
  });

  await t.test('statistics are read-only and logs are not downloadable', async () => {
    const r = await fetch(base + '/admin/api/analytics', { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: '{}' });
    assert.ok([404, 405].includes(r.status));
    for (const p of ['/data/visits/' + today + '.jsonl', '/visits/' + today + '.jsonl', '/../data/visits/' + today + '.jsonl']) assert.notEqual((await fetch(base + p)).status, 200);
  });
});

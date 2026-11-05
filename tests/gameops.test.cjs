// Game operations back office mockup: dashboard, players, histories, coupons, reward codes (admin API + plugin wiring)
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

const source = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(process.env.RCM_TEST_TMP || os.tmpdir(), 'rcm-gameops-'));
for (const f of ['server.js', 'lib', 'admin', 'views']) { try { fs.cpSync(path.join(source, f), path.join(tmp, f), { recursive: true }); } catch (e) {} }
fs.mkdirSync(path.join(tmp, 'public', 'uploads'), { recursive: true }); fs.mkdirSync(path.join(tmp, 'public', 'img'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'public', 'style.css'), 'body{}'); fs.mkdirSync(path.join(tmp, 'data'));
const seed = require(path.join(tmp, 'lib/seed'))(); seed.site.url = '';
fs.writeFileSync(path.join(tmp, 'data/content.json'), JSON.stringify(seed));

const port = 23000 + Math.floor(Math.random() * 15000), base = 'http://127.0.0.1:' + port;
const child = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), ADMIN_PASSWORD: 'Gameops-test-password-12', TRUST_PROXY: '' } });
let logs = ''; child.stdout.on('data', b => (logs += b)); child.stderr.on('data', b => (logs += b));
after(() => child.kill());
const wait = ms => new Promise(r => setTimeout(r, ms));
let cookie, csrf;
const api = async (p, method = 'GET', body) => {
  const r = await fetch(base + '/admin/api/gameops/' + p, { method, headers: { Cookie: cookie, ...(method !== 'GET' ? { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const ok = async (...a) => { const r = await api(...a); assert.equal(r.status, 200, JSON.stringify(r.json)); return r.json; };
const bad = async (msgRe, ...a) => { const r = await api(...a); assert.equal(r.status, 400, JSON.stringify(r.json)); if (msgRe) assert.match(r.json.error, msgRe); return r.json; };

test('game operations mockup', async t => {
  for (let i = 0; i < 80; i++) { try { await fetch(base + '/robots.txt'); break; } catch { await wait(50); } }
  assert.equal(child.exitCode, null, logs);
  assert.equal((await fetch(base + '/admin/api/gameops/dashboard')).status, 401, 'admin only');
  const r = await fetch(base + '/admin/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'admin', password: 'Gameops-test-password-12' }) });
  assert.equal(r.status, 200); cookie = r.headers.get('set-cookie').split(';')[0]; csrf = (await (await fetch(base + '/admin/api/me', { headers: { Cookie: cookie } })).json()).csrf;
  const noCsrf = await fetch(base + '/admin/api/gameops/players/suspend', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(noCsrf.status, 403, 'changes need the CSRF token');

  await t.test('dashboard: totals agree with the 30-day series', async () => {
    const d = await ok('dashboard'), T = d.totals, S = d.series;
    assert.equal(d.mock, true); assert.equal(S.days.length, 30); assert.equal(S.signups.length, 30); assert.equal(S.topupBaht.length, 30);
    assert.equal(S.days[29], d.today); assert.equal(S.days[0] < S.days[29], true);
    assert.equal(T.signups30, S.signups.reduce((a, b) => a + b, 0)); assert.equal(T.signupsToday, S.signups[29]); assert.equal(T.topupToday, S.topupBaht[29]);
    assert.equal(T.topup30, S.topupBaht.reduce((a, b) => a + b, 0)); assert.equal(T.signups7, S.signups.slice(-7).reduce((a, b) => a + b, 0));
    assert.ok(T.accounts >= T.signups30 && T.accounts > 1000, 'a plausible number of accounts');
    assert.ok(T.online >= 0 && T.online <= T.accounts); assert.ok(S.signups.every(n => n > 0) && S.topupBaht.every(n => n >= 0));
    assert.ok(d.latestSignups.length === 6 && d.latestTopups.length === 6);
    const again = await ok('dashboard'); assert.deepEqual(again.series.signups.slice(0, 28), S.signups.slice(0, 28), 'the data set is the same every time');
  });

  await t.test('players: search, status filter, paging and limits', async () => {
    const all = await ok('players');
    assert.equal(all.items.length, 20); assert.equal(all.page, 1); assert.ok(all.pages > 10);
    for (const k of ['id', 'username', 'email', 'character', 'joined', 'status', 'cash']) assert.ok(k in all.items[0], k);
    assert.match(all.items[0].email, /@example\.(com|org|net)$/, 'sample addresses never belong to real people');
    assert.equal((await ok('players?limit=500')).items.length <= 100, true, 'page size is capped');
    assert.equal((await ok('players?page=99999')).page, all.pages, 'a page past the end becomes the last one');
    const q = all.items[3].username; const hit = await ok('players?q=' + encodeURIComponent(q)); assert.ok(hit.items.some(p => p.username === q));
    assert.equal((await ok('players?q=zzzz-not-a-player')).total, 0);
    assert.equal((await ok('players?status=suspended')).total, 0);
    assert.equal((await ok('players?q=' + encodeURIComponent("'; DROP TABLE x;--<script>"))).total, 0, 'odd search text is just text');
  });

  let target;
  await t.test('edit: validates, strips markup, keeps the username fixed', async () => {
    target = (await ok('players?q=turbo')).items[0];
    await bad(/อีเมล/, 'players/update', 'POST', { id: target.id, email: 'nope', character: 'ok name' });
    await bad(/ชื่อตัวละคร/, 'players/update', 'POST', { id: target.id, email: 'a@b.co', character: 'x' });
    await bad(/ไม่พบ/, 'players/update', 'POST', { id: 'p99999', email: 'a@b.co', character: 'ok name' });
    const u = await ok('players/update', 'POST', { id: target.id, email: 'changed@example.org', character: 'Ace<b>Racer', note: '<img src=x onerror=1>ติดตามดู', username: 'hacker' });
    assert.equal(u.email, 'changed@example.org'); assert.equal(u.character, 'AcebRacer', 'angle brackets are removed'); assert.equal(u.note.includes('<'), false); assert.equal(u.username, target.username);
    assert.equal((await ok('players?q=' + encodeURIComponent(target.username))).items.find(p => p.id === target.id).email, 'changed@example.org', 'the change is kept');
  });

  await t.test('top up a player: bounds, reason, suspended accounts, and it shows in the history without counting as sales', async () => {
    const before = (await ok('dashboard')).totals.topupToday, cash0 = (await ok('players?q=' + encodeURIComponent(target.username))).items.find(p => p.id === target.id).cash;
    for (const cash of [0, -5, 1000001, 'abc']) await bad(/แคช/, 'players/topup', 'POST', { id: target.id, cash, note: 'ทดสอบ' });
    await bad(/เหตุผล/, 'players/topup', 'POST', { id: target.id, cash: 100, note: '' });
    const p = await ok('players/topup', 'POST', { id: target.id, cash: 2500, note: 'ชดเชยระบบขัดข้อง' }); assert.equal(p.cash, cash0 + 2500);
    const h = await ok('history/topups?q=' + encodeURIComponent(target.username)); const g = h.items.find(x => x.by === 'admin' && x.cash === 2500);
    assert.ok(g, 'the gift is in the history, with the admin\'s name'); assert.equal(g.price, 0); assert.equal(g.method, 'แอดมินเติมให้');
    assert.equal((await ok('dashboard')).totals.topupToday, before, 'gifts are not sales');
  });

  await t.test('suspend and unsuspend', async () => {
    await bad(/เหตุผล/, 'players/suspend', 'POST', { id: target.id, suspended: true, reason: '' });
    const s = await ok('players/suspend', 'POST', { id: target.id, suspended: true, reason: 'ใช้โปรแกรมช่วยเล่น' }); assert.equal(s.status, 'suspended'); assert.equal(s.reason, 'ใช้โปรแกรมช่วยเล่น');
    assert.equal((await ok('players?status=suspended')).total, 1); assert.equal((await ok('dashboard')).totals.suspended, 1);
    await bad(/ระงับ/, 'players/topup', 'POST', { id: target.id, cash: 100, note: 'ทดสอบ' });
    const u = await ok('players/suspend', 'POST', { id: target.id, suspended: false }); assert.equal(u.status, 'active'); assert.equal(u.reason, '');
    assert.equal((await ok('players?status=suspended')).total, 0);
  });

  await t.test('histories: filters and shape', async () => {
    const all = await ok('history/topups'), d = await ok('dashboard');
    assert.ok(all.summary.baht >= d.totals.topup30 && all.summary.count > 1000, 'the summary covers the whole filtered list (90 days of data), not just one page');
    const last30 = await ok('history/topups?from=' + d.series.days[0] + '&to=' + d.today); assert.equal(last30.summary.baht, d.totals.topup30, 'the same 30 days as the dashboard');
    const failed = await ok('history/topups?status=failed'); assert.ok(failed.total > 0 && failed.items.every(x => x.status === 'failed'));
    const today = await ok('history/topups?from=' + d.today + '&to=' + d.today); assert.ok(today.items.every(x => x.day === d.today));
    assert.equal(today.summary.baht, d.totals.topupToday, 'the day filter adds up to the dashboard');
    assert.equal((await ok('history/topups?from=garbage')).total, all.total, 'a bad date is ignored');
    const c = await ok('history/coupons'); assert.ok(c.total > 100); for (const k of ['ts', 'username', 'code', 'title', 'result']) assert.ok(k in c.items[0], k);
    const cs = await ok('history/coupons?q=WELCOME-RC'); assert.ok(cs.total > 0 && cs.items.every(x => x.code === 'WELCOME-RC' || x.username.includes('WELCOME-RC')));
    const k = await ok('history/codes'); assert.ok(k.total > 50); for (const f of ['ts', 'username', 'code', 'batch', 'rewards']) assert.ok(f in k.items[0], f); assert.match(k.items[0].code, /^[A-Z0-9]+-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    assert.ok(all.items.every((x, i, a) => i === 0 || a[i - 1].ts >= x.ts), 'newest first');
  });

  await t.test('coupons: create, validate, toggle, delete', async () => {
    const list0 = (await ok('coupons')).items; assert.equal(list0.length, 4); assert.ok(list0.find(c => c.code === 'OLD-2025').state === 'expired');
    await bad(/ชื่อคูปอง/, 'coupons/create', 'POST', { title: '', kind: 'percent', value: 10 });
    await bad(/ประเภท/, 'coupons/create', 'POST', { title: 'ทดสอบ', kind: 'nope', value: 10 });
    await bad(/1–100/, 'coupons/create', 'POST', { title: 'ทดสอบ', kind: 'percent', value: 150 });
    await bad(/ชื่อไอเทม/, 'coupons/create', 'POST', { title: 'ทดสอบ', kind: 'item', value: 2, itemName: '' });
    await bad(/รหัสคูปอง/, 'coupons/create', 'POST', { title: 'ทดสอบ', kind: 'cash', value: 5, code: 'a b!' });
    await bad(/วัน/, 'coupons/create', 'POST', { title: 'ทดสอบ', kind: 'cash', value: 5, start: '2026-12-31', end: '2026-01-01' });
    await bad(/วัน/, 'coupons/create', 'POST', { title: 'ทดสอบ', kind: 'cash', value: 5, start: 'tomorrow' });
    const c = await ok('coupons/create', 'POST', { code: 'holiday15', title: 'ส่วนลดวันหยุด 15%', kind: 'percent', value: 15, limit: 100, perUser: 1 });
    assert.equal(c.code, 'HOLIDAY15'); assert.equal(c.own, true);
    await bad(/มีรหัส/, 'coupons/create', 'POST', { code: 'HOLIDAY15', title: 'ซ้ำ', kind: 'cash', value: 5 });
    await bad(/มีรหัส/, 'coupons/create', 'POST', { code: 'welcome-rc', title: 'ซ้ำกับของเดิม', kind: 'cash', value: 5 });
    const auto = await ok('coupons/create', 'POST', { title: 'สุ่มรหัส', kind: 'item', value: 1, itemName: 'Neon Pack' }); assert.match(auto.code, /^RC-[A-Z2-9]{6}$/);
    const mine = (await ok('coupons')).items.find(x => x.code === 'HOLIDAY15'); assert.equal(mine.state, 'on'); assert.equal(mine.used, 0);
    assert.equal((await ok('coupons/toggle', 'POST', { code: 'HOLIDAY15', active: false })).active, false); assert.equal((await ok('coupons')).items.find(x => x.code === 'HOLIDAY15').state, 'off');
    await ok('coupons/toggle', 'POST', { code: 'HOLIDAY15', active: true }); await bad(/ไม่พบ/, 'coupons/toggle', 'POST', { code: 'NOPE', active: true });
    await bad(/เฉพาะคูปองที่สร้าง/, 'coupons/delete', 'POST', { code: 'WELCOME-RC' });
    await ok('coupons/delete', 'POST', { code: 'HOLIDAY15' }); assert.equal((await ok('coupons')).items.some(x => x.code === 'HOLIDAY15'), false);
  });

  await t.test('reward codes: create unique codes, validate, view and export only your own batches', async () => {
    const good = { name: 'แจกทางไลฟ์', prefix: 'live1111', count: 40, maxUses: 1, rewards: [{ type: 'cash', qty: 1000 }, { type: 'item', name: 'Nitro Boost', qty: 3 }] };
    await bad(/ชื่อชุด/, 'codes/create', 'POST', Object.assign({}, good, { name: '' }));
    await bad(/คำนำหน้า/, 'codes/create', 'POST', Object.assign({}, good, { prefix: 'a' }));
    await bad(/คำนำหน้า/, 'codes/create', 'POST', Object.assign({}, good, { prefix: 'bad prefix!' }));
    for (const count of [0, 1001, 'x']) await bad(/1–1,000/, 'codes/create', 'POST', Object.assign({}, good, { count }));
    await bad(/รางวัล/, 'codes/create', 'POST', Object.assign({}, good, { rewards: [] }));
    await bad(/ประเภทรางวัล/, 'codes/create', 'POST', Object.assign({}, good, { rewards: [{ type: 'nope', qty: 1 }] }));
    await bad(/จำนวนรางวัล/, 'codes/create', 'POST', Object.assign({}, good, { rewards: [{ type: 'cash', qty: 0 }] }));
    await bad(/ชื่อไอเทม/, 'codes/create', 'POST', Object.assign({}, good, { rewards: [{ type: 'item', name: '', qty: 1 }] }));
    await bad(/วันหมดอายุ/, 'codes/create', 'POST', Object.assign({}, good, { expires: '2020-01-01' }));
    const b = await ok('codes/create', 'POST', good);
    assert.equal(b.codes.length, 40); assert.equal(new Set(b.codes).size, 40, 'no duplicate codes'); assert.ok(b.codes.every(c => /^LIVE1111-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(c)), 'no look-alike characters (0 O 1 I)');
    assert.deepEqual(b.rewards.map(r => r.name), ['แคช', 'Nitro Boost']);
    const list = (await ok('codes')).items; assert.equal(list.length, 4); const mine = list.find(x => x.id === b.id); assert.equal(mine.count, 40); assert.equal(mine.own, true);
    const view = await ok('codes/batch?id=' + b.id); assert.deepEqual(view.codes, b.codes);
    await bad(/เฉพาะชุดที่สร้าง/, 'codes/batch?id=b-launch'); await bad(/เฉพาะชุดที่สร้าง/, 'codes/batch?id=nope');
    const b2 = await ok('codes/create', 'POST', Object.assign({}, good, { count: 40 })); assert.equal(b2.codes.some(c => b.codes.includes(c)), false, 'codes are unique across batches');
    const file = fs.readFileSync(path.join(tmp, 'data/gameops.json'), 'utf8'); assert.ok(file.includes(b.codes[0]), 'created codes are kept');
    const audit = JSON.parse(file).audit.map(a => a.action); for (const a of ['แก้ไขข้อมูลผู้เล่น', 'เติมแคชให้ผู้เล่น', 'ระงับบัญชี', 'ปลดระงับบัญชี', 'สร้างคูปอง', 'ลบคูปอง', 'สร้างโค้ดรางวัล']) assert.ok(audit.includes(a), 'logged: ' + a);
  });

  await t.test('revenue overview: channels, payers, prices and top 10 all add up', async () => {
    const d = await ok('dashboard'), R = await ok('revenue'), T = R.totals, sum = (l, f) => l.reduce((a, x) => a + f(x), 0);
    assert.equal(R.range.from, d.today); assert.equal(R.range.to, d.today); assert.equal(R.range.days, 1);
    assert.equal(T.revenue, d.totals.topupToday, 'today agrees with the dashboard');
    assert.equal(R.channels.length, 5, 'every top-up method of the storefront is listed'); assert.deepEqual(R.channels.map(c => c.name), ['TrueMoney CashCard', 'Razer Gold', 'PromptPay', 'Alipay', 'TrueMoney Wallet']);
    assert.equal(sum(R.channels, c => c.revenue), T.revenue); assert.equal(sum(R.channels, c => c.count), T.count); assert.equal(R.channels.every(c => c.share >= 0 && c.share <= 100), true);
    assert.deepEqual(R.channels.map(c => c.mode), ['code', 'code', 'checkout', 'checkout', 'checkout']);
    assert.equal(R.payers.first + R.payers.repeat, R.payers.total); assert.equal(R.payers.total, T.players); assert.ok(Math.abs(R.payers.firstPct + R.payers.repeatPct - 100) < 0.2 || R.payers.total === 0);
    assert.equal(sum(R.prices, p => p.count), T.count); assert.equal(sum(R.prices, p => p.baht), T.revenue); assert.deepEqual(R.prices.map(p => p.price), [50, 90, 150, 300, 500, 1000], 'prices follow the storefront packages');
    for (const p of R.prices) assert.equal(sum(Object.values(p.byChannel), n => n), p.count);
    assert.equal(R.top.length, 10, 'always the ten biggest spenders of all time, even on a day when few of them paid'); assert.ok(R.top.every((x, i, a) => i === 0 || a[i - 1].lifetimeBaht >= x.lifetimeBaht), 'ranked by total ever topped up, highest first'); assert.deepEqual(R.top.map(x => x.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const k of ['rank', 'username', 'email', 'character', 'joined', 'status', 'periodBaht', 'periodCount', 'lifetimeBaht', 'lifetimeCount', 'last', 'channels']) assert.ok(R.top.length === 0 || k in R.top[0], k);
    assert.ok(R.top.every(x => x.lifetimeBaht >= x.periodBaht && /@example\./.test(x.email)));
    assert.ok(T.closing.created >= T.closing.paid && T.closing.notPaid === T.closing.created - T.closing.paid);
    assert.equal(R.prev.to, new Date(Date.parse(d.today + 'T00:00:00Z') - 86400e3).toISOString().slice(0, 10), 'the comparison period is the day before'); assert.equal(R.prev.partial, true);
  });

  await t.test('revenue overview: periods, comparison, first-time vs repeat, validation', async () => {
    const d = await ok('dashboard'), day0 = d.series.days[0];
    const R30 = await ok('revenue?from=' + day0 + '&to=' + d.today);
    assert.equal(R30.totals.revenue, d.totals.topup30, 'the 30 days agree with the dashboard'); assert.equal(R30.series.days.length, 30); assert.equal(R30.series.baht.reduce((a, b) => a + b, 0), R30.totals.revenue);
    assert.equal(R30.range.days, 30); assert.equal(R30.prev.to < day0, true); assert.equal(typeof R30.totals.delta, 'number');
    assert.equal(R30.top.length, 10);
    const allTime = await ok('revenue?from=' + new Date(Date.parse(d.today + 'T00:00:00Z') - 364 * 86400e3).toISOString().slice(0, 10) + '&to=' + d.today), yesterday = await ok('revenue?from=' + R30.series.days[28] + '&to=' + R30.series.days[28]);
    assert.deepEqual(R30.top.map(x => x.username), allTime.top.map(x => x.username), 'the ranking does not change with the period');
    assert.deepEqual(yesterday.top.map(x => [x.username, x.lifetimeBaht]), R30.top.map(x => [x.username, x.lifetimeBaht]));
    assert.ok(allTime.top.every(x => x.periodBaht === x.lifetimeBaht), 'over the whole history the period total is the lifetime total');
    assert.ok(R30.top.every(x => x.periodBaht <= x.lifetimeBaht) && R30.top.some(x => x.periodBaht < x.lifetimeBaht || x.periodBaht === 0), 'period columns show what was paid in the period');
    const all = await ok('revenue?from=' + new Date(Date.parse(d.today + 'T00:00:00Z') - 364 * 86400e3).toISOString().slice(0, 10) + '&to=' + d.today);
    assert.equal(all.payers.repeat, 0, 'when the period covers all the data, nobody has paid "before" it'); assert.equal(all.payers.first, all.payers.total);
    assert.equal(all.totals.delta, null, 'nothing before the data starts to compare with');
    const yday = yesterday; assert.equal(yday.prev.partial, false); assert.equal(yday.totals.revenue, R30.series.baht[28]);
    await bad(/ไม่หลัง/, 'revenue?from=2026-11-04&to=2026-11-01');
    await bad(/ไม่ถูกต้อง/, 'revenue?from=garbage'); await bad(/ไม่ถูกต้อง/, 'revenue?from=2026-02-30&to=2026-03-01'); await bad(/366/, 'revenue?from=2020-01-01&to=' + d.today);
    assert.equal((await ok('revenue?from=' + d.today + '&to=2099-01-01')).range.to, d.today, 'the future is cut at today');
  });

  await t.test('revenue overview follows the storefront top-up settings (names and prices), and gifts are not sales', async () => {
    const get = async () => (await (await fetch(base + '/admin/api/content', { headers: { Cookie: cookie } })).json());
    const c = await get(); const pp = c.topup.methods.find(m => m.id === 'promptpay');
    const before = await ok('revenue?from=2020-01-01'.replace('2020-01-01', new Date(Date.now() + 7 * 3600e3 - 29 * 86400e3).toISOString().slice(0, 10)));
    pp.name = 'PromptPay QR'; pp.packages[0].price = '55';
    const put = await fetch(base + '/admin/api/content', { method: 'PUT', headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: JSON.stringify(c) }); assert.equal(put.status, 200);
    const R = await ok('revenue?from=' + new Date(Date.now() + 7 * 3600e3 - 29 * 86400e3).toISOString().slice(0, 10));
    assert.ok(R.channels.some(x => x.name === 'PromptPay QR')); assert.ok(R.prices.some(p => p.price === 55)); assert.equal(R.prices.some(p => p.price === 50), true, 'other methods still sell the 50 baht package');
    assert.notEqual(R.totals.revenue, before.totals.revenue, 'the changed price changes the money');
    const dis = await get(); dis.topup.methods.find(m => m.id === 'alipay').enabled = 'false';
    assert.equal((await fetch(base + '/admin/api/content', { method: 'PUT', headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: JSON.stringify(dis) })).status, 200);
    assert.equal((await ok('revenue')).channels.find(x => x.id === 'alipay').enabled, false, 'a method switched off on the storefront is still listed (it has history) and marked');
    const rv = (await ok('revenue')).totals.revenue; const p = (await ok('players?q=turbo')).items[0];
    await ok('players/topup', 'POST', { id: p.id, cash: 99999, note: 'ทดสอบไม่นับเป็นรายได้' }); assert.equal((await ok('revenue')).totals.revenue, rv);
    const back = await get(); back.topup.methods.find(m => m.id === 'promptpay').name = 'PromptPay'; back.topup.methods.find(m => m.id === 'promptpay').packages[0].price = '50'; back.topup.methods.find(m => m.id === 'alipay').enabled = 'true';
    assert.equal((await fetch(base + '/admin/api/content', { method: 'PUT', headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: JSON.stringify(back) })).status, 200);
  });

  await t.test('top-up channel logos reach every part of the back office that names a channel', async () => {
    const R = await ok('revenue'); assert.deepEqual(R.channels.map(c => c.logo), ['truemoney-cashcard', 'razer-gold', 'promptpay', 'alipay', 'truemoney-wallet'].map(id => '/img/pay/' + id + '.webp'));
    const h = await ok('history/topups'); const paid = h.items.find(x => !x.by); assert.match(paid.logo, /^\/img\/pay\/[a-z-]+\.webp$/); assert.equal(h.items.find(x => x.by) ? h.items.find(x => x.by).logo : '', '');
    assert.ok(R.top.every(x => x.channelLogos.length === x.channels.length && x.channelLogos.every(l => /^\/img\/pay\//.test(l))), 'a logo for every channel a top player used');
    assert.ok((await ok('dashboard')).latestTopups.every(x => /^\/img\/pay\//.test(x.logo)));
    const src = fs.readFileSync(path.join(source, 'admin/gameops.js'), 'utf8'); for (const fn of ['payLogo(c.logo', 'payLogo(x.logo', 'payChip(']) assert.ok(src.includes(fn), fn);
    assert.match(fs.readFileSync(path.join(source, 'admin/admin.js'), 'utf8'), /ph: \(\) => PAY_LOGOS\[m\.id\]/, 'the settings editor previews the standard logo');
    for (const f of ['alipay', 'promptpay', 'razer-gold', 'truemoney-cashcard', 'truemoney-wallet']) assert.ok(fs.statSync(path.join(source, 'public/img/pay', f + '.webp')).size > 1000, f);
  });

  await t.test('unknown routes and bad bodies', async () => {
    assert.equal((await api('nope')).status, 404); assert.equal((await api('players/nope', 'POST', {})).status, 404);
    const r = await fetch(base + '/admin/api/gameops/players/update', { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: '{bad json' });
    assert.equal(r.status, 400);
  });

  await t.test('the admin page loads the plugin before admin.js, and the plugin builds DOM nodes only', async () => {
    const html = await (await fetch(base + '/admin')).text();
    assert.ok(html.indexOf('/admin/gameops.js') > 0 && html.indexOf('/admin/gameops.js') < html.indexOf('/admin/admin.js'));
    const js = await fetch(base + '/admin/gameops.js'); assert.equal(js.status, 200); assert.match(js.headers.get('content-type'), /javascript/); assert.match(js.headers.get('content-security-policy'), /script-src 'self'/);
    const src = await js.text();
    for (const badStr of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']) assert.equal(src.includes(badStr), false, badStr);
    assert.match(fs.readFileSync(path.join(source, 'admin/admin.js'), 'utf8'), /RC_ADMIN_PLUGINS/);
  });
});

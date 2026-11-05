// Game operations back office: dashboard, player accounts, histories, coupons and reward codes.
// A MOCKUP until the game's own admin API is connected (see ADMIN_API_SPEC_TH.md): the numbers come from a fixed pseudo-random
// data set generated in memory (the same on every start, always "relative to today" so the 30-day charts are never empty),
// and what an admin does here (suspend, edit, top up a player, create coupons / reward codes) is kept in data/gameops.json.
// Nothing here touches real players, money or the game.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const locked = require('./lock');

const FILE = path.join(__dirname, '..', 'data', 'gameops.json');
const user = msg => Object.assign(new Error(msg), { user: true });

// ---------- time (Thailand, UTC+7) ----------
const bkk = (t = Date.now()) => new Date(t + 7 * 3600e3);
const dayStr = d => d.toISOString().slice(0, 10);
const todayStr = t => dayStr(bkk(t));
const nowMinute = t => { const d = bkk(t); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const dayAgo = (ago, t) => dayStr(new Date(Date.parse(todayStr(t) + 'T00:00:00Z') - ago * 86400e3));
const stamp = (ago, minute, t) => dayAgo(ago, t) + ' ' + String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0');
const isWeekend = (ago, t) => { const w = new Date(Date.parse(dayAgo(ago, t) + 'T00:00:00Z')).getUTCDay(); return w === 0 || w === 6; };

// ---------- the fixed pseudo-random data set ----------
function rng(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (r, list) => list[Math.floor(r() * list.length)];
const weighted = (r, items, weights) => { let x = r() * weights.reduce((a, b) => a + b, 0); for (let i = 0; i < items.length; i++) { x -= weights[i]; if (x <= 0) return items[i]; } return items[items.length - 1]; };

const ADJ = ['turbo', 'nitro', 'drift', 'street', 'night', 'neon', 'rapid', 'ghost', 'apex', 'lucky', 'king', 'speed', 'storm', 'red', 'silver', 'iron', 'sky', 'wild'];
const NOUN = ['racer', 'fox', 'wolf', 'rider', 'blade', 'shark', 'phoenix', 'tiger', 'drifter', 'viper', 'hawk', 'comet', 'rocket', 'knight'];
const CHARS = ['นักซิ่งสายฟ้า', 'เสือดำ', 'พายุทะเลทราย', 'ราชาดริฟต์', 'หมาป่าเงิน', 'จอมแข่ง', 'ไนโตรแดง', 'ฟ้าผ่า', 'เงาราตรี', 'อินทรีเหล็ก', 'มังกรนีออน', 'ดาวหาง'];
const MAIL = ['example.com', 'example.org', 'example.net'];
// the top-up channels of the storefront (Settings > top-up methods): the sample data is generated per channel id and price slot,
// and names / prices are read from the site's current settings when shown, so this back office always matches the front end
const DEFAULT_METHODS = [['truemoney-cashcard', 'TrueMoney CashCard', 'code'], ['razer-gold', 'Razer Gold', 'code'], ['promptpay', 'PromptPay', 'checkout'], ['alipay', 'Alipay', 'checkout'], ['truemoney-wallet', 'TrueMoney Wallet', 'checkout']];
const PRICES = [50, 90, 150, 300, 500, 1000];
const { logoFor } = require('./paylogos');
const num = v => Number(String(v == null ? '' : v).replace(/,/g, '')) || 0;
function siteMethods() {
  let list = []; try { list = (require('./store').getContent().topup || {}).methods || []; } catch (e) {}
  const out = new Map();
  for (const m of list) out.set(String(m.id), { id: String(m.id), name: m.name || m.id, logo: logoFor(String(m.id), m.logo), mode: m.mode === 'code' ? 'code' : 'checkout', enabled: m.enabled === true || m.enabled === 'true', packages: (m.packages || []).map(x => ({ price: num(x.price), cash: num(x.cash), point: num(x.point) })) });
  for (const [id, name, mode] of DEFAULT_METHODS) if (!out.has(id)) out.set(id, { id, name, mode, logo: logoFor(id), enabled: true, packages: PRICES.map(pr => ({ price: pr, cash: pr * 100, point: Math.round(pr * .76) })) });
  return out;
}
const pkgOf = (m, pi) => (m && m.packages[pi]) || { price: PRICES[pi], cash: PRICES[pi] * 100, point: Math.round(PRICES[pi] * .76) };

const BASE_COUPONS = [
  { code: 'WELCOME-RC', title: 'ส่วนลด 20% ร้านค้าในเกม', kind: 'percent', value: 20, limit: 5000, perUser: 1, start: '', end: '' },
  { code: 'NEON-FREE', title: 'ฟรี Neon Pack 1 วัน', kind: 'item', value: 1, itemName: 'Neon Pack (1 วัน)', limit: 2000, perUser: 1, start: '', end: '' },
  { code: 'TOPUP-BONUS', title: 'โบนัสเติมเงิน +500 แคช', kind: 'cash', value: 500, limit: 1000, perUser: 1, start: '', end: '' },
  { code: 'OLD-2025', title: 'คูปองโปรโมชันปีที่แล้ว', kind: 'percent', value: 10, limit: 0, perUser: 1, start: '2025-01-01', end: '2025-12-31' }
];
const BASE_BATCHES = [
  { id: 'b-launch', name: 'โค้ดต้อนรับผู้เล่นใหม่', prefix: 'WELCOME', count: 500, rewards: [{ type: 'point', name: 'แต้มพ้อย', qty: 50 }], maxUses: 1, expires: '', ago: 70 },
  { id: 'b-event', name: 'กิจกรรมเปิดตัว', prefix: 'LAUNCH', count: 200, rewards: [{ type: 'cash', name: 'แคช', qty: 1000 }, { type: 'item', name: 'Nitro Boost', qty: 3 }], maxUses: 1, expires: '', ago: 40 },
  { id: 'b-fb', name: 'แจกทางเพจ Facebook', prefix: 'FBFAN', count: 100, rewards: [{ type: 'item', name: 'Neon Pack', qty: 1 }], maxUses: 1, expires: '', ago: 15 }
];

let BASE = null;
function base() {
  if (BASE) return BASE;
  const r = rng(20261105);
  const players = [], seenName = new Set();
  for (let d = 364; d >= 0; d--) {
    const spike = d === 12 ? 2.2 : 1;
    const n = Math.round((4 + 30 * Math.exp(-d / 45)) * (isWeekend(d) ? 1.35 : 1) * (0.7 + 0.6 * r()) * spike);
    for (let i = 0; i < n; i++) {
      let name, tries = 0;
      do { name = pick(r, ADJ) + '_' + pick(r, NOUN) + (r() < .55 ? Math.floor(r() * 99) : ''); tries++; } while (seenName.has(name) && tries < 30);
      if (seenName.has(name)) name += Math.floor(r() * 9000 + 100);
      seenName.add(name);
      const idx = players.length + 1;
      players.push({ id: 'p' + String(idx).padStart(5, '0'), username: name, email: name.replace(/_/g, '.') + '@' + pick(r, MAIL), character: r() < .5 ? pick(r, CHARS) + (r() < .4 ? Math.floor(r() * 99) : '') : name.split('_').map(x => x[0].toUpperCase() + x.slice(1)).join(''),
        ago: d, minute: Math.floor(r() * 1440), cash: 0 });
    }
  }
  const topups = [];
  const IDS = DEFAULT_METHODS.map(x => x[0]);
  for (let d = 364; d >= 0; d--) {
    const n = Math.round((9 + 17 * Math.exp(-d / 70)) * (isWeekend(d) ? 1.4 : 1) * (0.7 + 0.6 * r()));
    const pool = players.filter(p => p.ago >= d);
    for (let i = 0; i < n && pool.length; i++) {
      // a few long-time players pay far more often than the rest (a skewed pick), as in a real game
      const p = pool[Math.floor(Math.pow(r(), 1.8) * pool.length)], pi = weighted(r, [0, 1, 2, 3, 4, 5], [30, 25, 20, 12, 9, 4]);
      const mid = weighted(r, IDS, [26, 9, 38, 9, 18]), checkout = DEFAULT_METHODS.find(x => x[0] === mid)[2] === 'checkout';
      topups.push({ id: 't' + (topups.length + 1), uid: p.id, ago: d, minute: Math.floor(r() * 1440), mid, pi, status: weighted(r, ['success', 'failed', 'pending'], checkout ? [83, 12, 5] : [96, 3, 1]), by: '' });
    }
  }
  const coupons = [];
  BASE_COUPONS.forEach((c, ci) => { const n = [420, 260, 180, 40][ci]; for (let i = 0; i < n; i++) { const p = players[Math.floor(r() * players.length)]; const d = Math.min(p.ago, Math.floor(r() * 60)); coupons.push({ uid: p.id, ago: Math.max(0, d), minute: Math.floor(r() * 1440), code: c.code, result: r() < .94 ? 'ใช้สำเร็จ' : 'ล้มเหลว: ' + pick(r, ['หมดอายุ', 'ใช้ครบสิทธิ์แล้ว']) }); } });
  const codes = [], ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand4 = () => Array.from({ length: 4 }, () => ALPHA[Math.floor(r() * ALPHA.length)]).join('');
  BASE_BATCHES.forEach((b, bi) => { const n = [210, 90, 35][bi]; for (let i = 0; i < n; i++) { const p = players[Math.floor(r() * players.length)]; codes.push({ uid: p.id, ago: Math.max(0, Math.min(b.ago, p.ago) - Math.floor(r() * 10)), minute: Math.floor(r() * 1440), code: b.prefix + '-' + rand4() + '-' + rand4(), batch: b.id }); } });
  const byId = new Map(players.map(p => [p.id, p]));
  BASE = { players, topups, coupons, codes, byId };
  return BASE;
}

// ---------- what admins did here (kept on disk) ----------
let cache = null, cacheM = -1;
const blank = () => ({ players: {}, topups: [], coupons: [], couponOff: {}, batches: [], audit: [] });
function state() {
  let m = -1; try { m = fs.statSync(FILE).mtimeMs; } catch (e) {}
  if (cache && m === cacheM) return cache;
  try { cache = Object.assign(blank(), JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch (e) { cache = blank(); }
  cacheM = m; return cache;
}
function mutate(fn) {
  return locked(FILE, () => {
    cache = null; const s = state(), out = fn(s);
    s.audit = s.audit.slice(-200);
    const tmp = FILE + '.' + process.pid + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(s), { mode: 0o600 }); fs.renameSync(tmp, FILE);
    cache = null; return out;
  });
}
const log = (s, by, action, target, detail) => s.audit.push({ ts: new Date().toISOString(), by, action, target, detail: String(detail || '').slice(0, 200) });

// ---------- views of the data ----------
const visible = (o, t) => o.ago > 0 || o.minute <= nowMinute(t);
// cash a player has received from successful top-ups (paid ones in the data set + the ones an admin gave)
function cashMap(s, t) {
  const m = new Map(), M = siteMethods();
  for (const x of base().topups) if (x.status === 'success' && visible(x, t)) m.set(x.uid, (m.get(x.uid) || 0) + pkgOf(M.get(x.mid), x.pi).cash);
  for (const x of s.topups) m.set(x.uid, (m.get(x.uid) || 0) + x.cash);
  return m;
}
function playerView(p, s, t, cm) {
  const o = s.players[p.id] || {}, cash = (cm || cashMap(s, t)).get(p.id) || 0;
  return { id: p.id, username: p.username, email: o.email || p.email, character: o.character || p.character, joined: stamp(p.ago, p.minute, t), status: o.suspended ? 'suspended' : 'active',
    reason: o.suspended ? o.reason || '' : '', note: o.note || '', cash };
}
const players = t => { const b = base(), s = state(), cm = cashMap(s, t); return b.players.filter(p => visible(p, t)).map(p => playerView(p, s, t, cm)); };
const nameOf = (id, s, t) => { const p = base().byId.get(id); return p ? p.username : id; };

function allTopups(t) {
  const b = base(), s = state(), M = siteMethods(), out = [];
  for (const x of b.topups) if (visible(x, t)) { const m = M.get(x.mid), pk = pkgOf(m, x.pi); out.push({ id: x.id, uid: x.uid, ts: stamp(x.ago, x.minute, t), day: dayAgo(x.ago, t), username: nameOf(x.uid), mid: x.mid, method: m ? m.name : x.mid, logo: m ? m.logo : logoFor(x.mid), price: pk.price, cash: pk.cash, point: pk.point, status: x.status, by: '' }); }
  for (const x of s.topups) out.push({ id: x.id, uid: x.uid, ts: x.ts, day: x.ts.slice(0, 10), username: nameOf(x.uid), mid: '', method: x.method, logo: '', price: 0, cash: x.cash, point: 0, status: 'success', by: x.by, note: x.note || '' });
  return out.sort((a, c) => (a.ts < c.ts ? 1 : a.ts > c.ts ? -1 : 0));
}

function dashboard(t = Date.now()) {
  const ps = players(t), tops = allTopups(t), today = todayStr(t);
  const days = Array.from({ length: 30 }, (_, i) => dayAgo(29 - i, t));
  const sign = Object.fromEntries(days.map(d => [d, 0])), top = Object.fromEntries(days.map(d => [d, { baht: 0, count: 0, gift: 0 }]));
  for (const p of ps) { const d = p.joined.slice(0, 10); if (d in sign) sign[d]++; }
  for (const x of tops) { const d = x.day; if (!(d in top)) continue; if (x.by) top[d].gift += x.cash; else if (x.status === 'success') { top[d].baht += x.price; top[d].count++; } }
  // players online: follows the time of day (quiet at dawn, busiest in the evening) with a little noise that changes every 5 minutes
  const hour = bkk(t).getUTCHours() + bkk(t).getUTCMinutes() / 60, shape = 0.5 - 0.5 * Math.cos(((hour - 5) / 24) * 2 * Math.PI);
  const noise = rng(Math.floor(t / 300e3))();
  const suspended = ps.filter(p => p.status === 'suspended').length;
  const online = Math.max(0, Math.min(ps.length - suspended, Math.round((70 + 310 * shape) * (0.93 + 0.14 * noise))));
  const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0), last = n => days.slice(-n);
  return {
    mock: true, generatedAt: new Date(t).toISOString(), today,
    totals: { accounts: ps.length, suspended, online, signupsToday: sign[today], signups7: sum(last(7), d => sign[d]), signups30: sum(days, d => sign[d]),
      topupToday: top[today].baht, topupTodayCount: top[today].count, topup7: sum(last(7), d => top[d].baht), topup30: sum(days, d => top[d].baht), gift30: sum(days, d => top[d].gift) },
    series: { days, signups: days.map(d => sign[d]), topupBaht: days.map(d => top[d].baht), topupCount: days.map(d => top[d].count) },
    latestSignups: ps.slice().sort((a, c) => (a.joined < c.joined ? 1 : -1)).slice(0, 6).map(p => ({ username: p.username, character: p.character, joined: p.joined })),
    latestTopups: tops.filter(x => !x.by).slice(0, 6)
  };
}

const page = (list, q) => {
  const limit = Math.max(5, Math.min(100, Number(q.limit) || 20)), total = list.length, pages = Math.max(1, Math.ceil(total / limit)), pg = Math.max(1, Math.min(pages, Number(q.page) || 1));
  return { items: list.slice((pg - 1) * limit, pg * limit), total, page: pg, pages, limit };
};
const like = (v, q) => !q || String(v).toLowerCase().includes(String(q).toLowerCase());
const cleanQ = v => String(v || '').trim().slice(0, 60);

function listPlayers(q, t = Date.now()) {
  const text = cleanQ(q.q), status = ['active', 'suspended'].includes(q.status) ? q.status : '';
  const list = players(t).filter(p => (!status || p.status === status) && (like(p.username, text) || like(p.email, text) || like(p.character, text)));
  list.sort((a, c) => (a.joined < c.joined ? 1 : -1));
  return page(list, q);
}
const need = (id, t) => { const p = base().players.find(x => x.id === id); if (!p || !visible(p, t)) throw user('ไม่พบบัญชีผู้เล่นนี้'); return p; };
const EMAIL_RE = /^[^\s@<>"']{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
const text = (v, min, max, label) => { const s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, '').trim(); if (s.length < min || s.length > max) throw user(label + ' ต้องยาว ' + min + '–' + max + ' ตัวอักษร'); return s; };

function updatePlayer(b, by, t = Date.now()) {
  const p = need(String(b.id || ''), t);
  const email = text(b.email, 5, 120, 'อีเมล'); if (!EMAIL_RE.test(email)) throw user('อีเมลไม่ถูกต้อง');
  const character = text(b.character, 2, 24, 'ชื่อตัวละคร'), note = String(b.note || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 200);
  mutate(s => { s.players[p.id] = Object.assign(s.players[p.id] || {}, { email, character, note }); log(s, by, 'แก้ไขข้อมูลผู้เล่น', p.username, 'อีเมล/ชื่อตัวละคร'); });
  return playerView(p, state(), t);
}
function suspendPlayer(b, by, t = Date.now()) {
  const p = need(String(b.id || ''), t), on = b.suspended === true || b.suspended === 'true';
  const reason = on ? text(b.reason, 3, 200, 'เหตุผล') : '';
  mutate(s => { const o = s.players[p.id] = s.players[p.id] || {}; o.suspended = on; o.reason = reason; o.by = by; o.at = new Date().toISOString(); log(s, by, on ? 'ระงับบัญชี' : 'ปลดระงับบัญชี', p.username, reason); });
  return playerView(p, state(), t);
}
function topupPlayer(b, by, t = Date.now()) {
  const p = need(String(b.id || ''), t), cash = Math.floor(Number(b.cash));
  if (!(cash >= 1 && cash <= 1000000)) throw user('จำนวนแคชต้องอยู่ระหว่าง 1 ถึง 1,000,000');
  const note = text(b.note, 3, 200, 'เหตุผล/หมายเหตุ');
  if (playerView(p, state(), t).status === 'suspended') throw user('บัญชีนี้ถูกระงับอยู่ ปลดระงับก่อนเติมเงิน');
  mutate(s => { const id = 'g' + crypto.randomBytes(5).toString('hex'); s.topups.push({ id, uid: p.id, ts: stamp(0, nowMinute(t), t), method: 'แอดมินเติมให้', cash, by, note }); log(s, by, 'เติมแคชให้ผู้เล่น', p.username, cash + ' แคช: ' + note); s.topups = s.topups.slice(-2000); });
  return playerView(p, state(), t);
}

function historyTopups(q, t = Date.now()) {
  const text_ = cleanQ(q.q), st = ['success', 'failed', 'pending'].includes(q.status) ? q.status : '', from = /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? q.from : '', to = /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : '';
  const list = allTopups(t).filter(x => (!st || x.status === st) && (!from || x.day >= from) && (!to || x.day <= to) && (like(x.username, text_) || like(x.method, text_)));
  const paid = list.filter(x => !x.by && x.status === 'success');
  const out = page(list, q);
  out.summary = { count: paid.length, baht: paid.reduce((a, x) => a + x.price, 0), cash: list.filter(x => x.status === 'success').reduce((a, x) => a + x.cash, 0) };
  return out;
}
function couponMap(s) { return new Map(BASE_COUPONS.concat(s.coupons).map(c => [c.code, c])); }
function historyCoupons(q, t = Date.now()) {
  const text_ = cleanQ(q.q), s = state(), cm = couponMap(s);
  const list = base().coupons.filter(x => visible(x, t)).map(x => ({ ts: stamp(x.ago, x.minute, t), username: nameOf(x.uid), code: x.code, title: (cm.get(x.code) || {}).title || '', result: x.result }))
    .filter(x => like(x.username, text_) || like(x.code, text_)).sort((a, c) => (a.ts < c.ts ? 1 : -1));
  return page(list, q);
}
function batchOf(id, s) { return BASE_BATCHES.concat(s.batches).find(b => b.id === id); }
function historyCodes(q, t = Date.now()) {
  const text_ = cleanQ(q.q), s = state();
  const list = base().codes.filter(x => visible(x, t)).map(x => { const b = batchOf(x.batch, s) || {}; return { ts: stamp(x.ago, x.minute, t), username: nameOf(x.uid), code: x.code, batch: b.name || '', rewards: (b.rewards || []).map(r => r.name + ' ×' + r.qty).join(', ') }; })
    .filter(x => like(x.username, text_) || like(x.code, text_) || like(x.batch, text_)).sort((a, c) => (a.ts < c.ts ? 1 : -1));
  return page(list, q);
}

// ---------- revenue overview ----------
const DATE_RE0 = /^\d{4}-\d{2}-\d{2}$/;
const addDay = (d, n) => dayStr(new Date(Date.parse(d + 'T00:00:00Z') + n * 86400e3));
const validDate = d => DATE_RE0.test(d) && dayStr(new Date(Date.parse(d + 'T00:00:00Z'))) === d;
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
function revenue(q, t = Date.now()) {
  const today = todayStr(t);
  let from = q.from || today, to = q.to || today;
  if (!validDate(from) || !validDate(to)) throw user('วันที่ไม่ถูกต้อง');
  if (to > today) to = today;
  if (from > to) throw user('วันเริ่มต้นต้องไม่หลังวันสิ้นสุด');
  const days = Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400e3) + 1;
  if (days > 366) throw user('เลือกช่วงเวลาได้สูงสุด 366 วัน');
  const prevTo = addDay(from, -1), prevFrom = addDay(prevTo, -(days - 1)), cut = nowMinute(t), partial = to === today;
  const M = siteMethods(), all = allTopups(t).filter(x => !x.by);       // gifts from admins are not sales
  const minuteOf = x => Number(x.ts.slice(11, 13)) * 60 + Number(x.ts.slice(14, 16));
  const inR = (x, a, b) => x.day >= a && x.day <= b;
  const cur = all.filter(x => inR(x, from, to)), prevAll = all.filter(x => inR(x, prevFrom, prevTo) && !(partial && x.day === prevTo && minuteOf(x) > cut));
  const paid = cur.filter(x => x.status === 'success'), prevPaid = prevAll.filter(x => x.status === 'success');
  const sum = l => l.reduce((a, x) => a + x.price, 0), uniq = l => new Set(l.map(x => x.uid)).size;
  const revenue_ = sum(paid), prevRev = sum(prevPaid);
  // channels: every top-up method of the storefront, even when it had no sales in the period
  const channels = [...M.values()].map(m => {
    const a = cur.filter(x => x.mid === m.id), p = a.filter(x => x.status === 'success');
    return { id: m.id, name: m.name, logo: m.logo, mode: m.mode, enabled: m.enabled, revenue: sum(p), count: p.length, players: uniq(p), share: pct(sum(p), revenue_), attempts: a.length, failed: a.length - p.length, rate: pct(p.length, a.length) };
  });
  const co = channels.filter(c => c.mode === 'checkout'), created = co.reduce((a, c) => a + c.attempts, 0), coPaid = co.reduce((a, c) => a + c.count, 0);
  // paying players: first-ever paid top-up inside the period = "first time", the rest had paid before = "repeat"
  const firstTs = new Map();
  for (const x of all) if (x.status === 'success' && (!firstTs.has(x.uid) || x.ts < firstTs.get(x.uid))) firstTs.set(x.uid, x.ts);
  const payers = new Set(paid.map(x => x.uid)); let first = 0;
  for (const u of payers) { const d = firstTs.get(u).slice(0, 10); if (d >= from && d <= to) first++; }
  // price table (prices come from the storefront's packages)
  const prices = new Map();
  for (const m of M.values()) for (const pk of m.packages) if (pk.price > 0 && !prices.has(pk.price)) prices.set(pk.price, { price: pk.price, cash: pk.cash, count: 0, baht: 0, byChannel: {}, ids: new Set() });
  for (const x of paid) { const r = prices.get(x.price) || (prices.set(x.price, { price: x.price, cash: x.cash, count: 0, baht: 0, byChannel: {}, ids: new Set() }), prices.get(x.price)); r.count++; r.baht += x.price; r.ids.add(x.uid); r.byChannel[x.mid] = (r.byChannel[x.mid] || 0) + 1; }
  const priceRows = [...prices.values()].sort((a, c) => a.price - c.price).map(r => ({ price: r.price, cash: r.cash, count: r.count, players: r.ids.size, baht: r.baht, share: pct(r.baht, revenue_), byChannel: r.byChannel }));
  // top 10 paying players in the period (account details from the player list)
  const byU = new Map(), life = new Map();
  for (const x of all) if (x.status === 'success') { const l = life.get(x.uid) || { baht: 0, count: 0, last: '', ch: new Set() }; l.baht += x.price; l.count++; if (x.ts > l.last) l.last = x.ts; l.ch.add(x.method); life.set(x.uid, l); }
  for (const x of paid) { const o = byU.get(x.uid) || { baht: 0, count: 0, last: '', ch: new Set() }; o.baht += x.price; o.count++; if (x.ts > o.last) o.last = x.ts; o.ch.add(x.method); byU.set(x.uid, o); }
  const logoByName = new Map([...M.values()].map(m => [m.name, m.logo]));
  const pv = new Map(players(t).map(p => [p.id, p]));
  // the ranking is by the TOTAL a player has ever topped up (not by the selected period); the period columns only show what they paid within it
  const top = [...life.entries()].sort((a, c) => c[1].baht - a[1].baht || c[1].count - a[1].count || (a[0] < c[0] ? -1 : 1)).slice(0, 10).map(([uid, l], i) => {
    const p = pv.get(uid) || {}, o = byU.get(uid) || { baht: 0, count: 0 };
    return { rank: i + 1, username: p.username || uid, email: p.email || '', character: p.character || '', joined: (p.joined || '').slice(0, 10), status: p.status || 'active', lifetimeBaht: l.baht, lifetimeCount: l.count, periodBaht: o.baht, periodCount: o.count, last: l.last, channels: [...l.ch], channelLogos: [...l.ch].map(n => logoByName.get(n) || '') };
  });
  const dayList = Array.from({ length: days }, (_, i) => addDay(from, i)), perDay = Object.fromEntries(dayList.map(d => [d, { baht: 0, count: 0 }]));
  for (const x of paid) { perDay[x.day].baht += x.price; perDay[x.day].count++; }
  return {
    mock: true, today, range: { from, to, days }, prev: { from: prevFrom, to: prevTo, partial },
    totals: { revenue: revenue_, prevRevenue: prevRev, delta: prevRev > 0 ? Math.round(((revenue_ - prevRev) / prevRev) * 1000) / 10 : null, count: paid.length, prevCount: prevPaid.length, players: payers.size, average: paid.length ? Math.round((revenue_ / paid.length) * 100) / 100 : 0,
      closing: { created, paid: coPaid, notPaid: created - coPaid, rate: pct(coPaid, created) } },
    channels, payers: { total: payers.size, first, repeat: payers.size - first, firstPct: pct(first, payers.size), repeatPct: pct(payers.size - first, payers.size) },
    prices: priceRows, top, series: { days: dayList, baht: dayList.map(d => perDay[d].baht), count: dayList.map(d => perDay[d].count) }
  };
}

// ---------- coupons ----------
function couponUsage(code) { return base().coupons.filter(x => x.code === code && x.result === 'ใช้สำเร็จ').length; }
function listCoupons(t = Date.now()) {
  const s = state(), today = todayStr(t);
  return BASE_COUPONS.map(c => Object.assign({}, c, { own: false })).concat(s.coupons.map(c => Object.assign({}, c, { own: true }))).map(c => {
    const off = !!s.couponOff[c.code], expired = !!c.end && c.end < today, notYet = !!c.start && c.start > today;
    return Object.assign(c, { used: couponUsage(c.code) + (c.own ? 0 : 0), active: !off, state: off ? 'off' : expired ? 'expired' : notYet ? 'soon' : 'on' });
  });
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function createCoupon(b, by, t = Date.now()) {
  const s0 = state(); if (s0.coupons.length >= 200) throw user('สร้างคูปองได้สูงสุด 200 ใบในโหมดตัวอย่าง');
  let code = String(b.code || '').trim().toUpperCase();
  if (!code) code = 'RC-' + Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[crypto.randomInt(32)]).join('');
  if (!/^[A-Z0-9-]{4,24}$/.test(code)) throw user('รหัสคูปองใช้ A-Z 0-9 และ - ยาว 4–24 ตัว');
  const title = text(b.title, 2, 80, 'ชื่อคูปอง'), kind = ['percent', 'cash', 'item'].includes(b.kind) ? b.kind : '';
  if (!kind) throw user('เลือกประเภทคูปอง');
  const value = Math.floor(Number(b.value)), limit = Math.floor(Number(b.limit || 0)), perUser = Math.floor(Number(b.perUser || 1));
  if (kind === 'percent' && !(value >= 1 && value <= 100)) throw user('ส่วนลด % ต้องอยู่ระหว่าง 1–100');
  if (kind !== 'percent' && !(value >= 1 && value <= 1000000)) throw user('จำนวนต้องอยู่ระหว่าง 1–1,000,000');
  if (!(limit >= 0 && limit <= 1000000)) throw user('จำนวนสิทธิ์รวมต้องอยู่ระหว่าง 0–1,000,000 (0 = ไม่จำกัด)');
  if (!(perUser >= 1 && perUser <= 100)) throw user('สิทธิ์ต่อผู้เล่นต้องอยู่ระหว่าง 1–100');
  const itemName = kind === 'item' ? text(b.itemName, 2, 40, 'ชื่อไอเทม') : '';
  const start = String(b.start || ''), end = String(b.end || '');
  for (const d of [start, end]) if (d && !DATE_RE.test(d)) throw user('วันที่ไม่ถูกต้อง');
  if (start && end && end < start) throw user('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม');
  return mutate(s => {
    if (couponMap(s).has(code)) throw user('มีรหัสคูปองนี้แล้ว');
    const c = { code, title, kind, value, itemName, limit, perUser, start, end, created: new Date(t).toISOString(), by };
    s.coupons.push(c); log(s, by, 'สร้างคูปอง', code, title); return Object.assign({}, c, { own: true });
  });
}
function toggleCoupon(b, by) {
  const code = String(b.code || ''), on = b.active === true || b.active === 'true';
  return mutate(s => { if (!couponMap(s).has(code)) throw user('ไม่พบคูปองนี้'); if (on) delete s.couponOff[code]; else s.couponOff[code] = true; log(s, by, on ? 'เปิดคูปอง' : 'ปิดคูปอง', code, ''); return { code, active: on }; });
}
function deleteCoupon(b, by) {
  const code = String(b.code || '');
  return mutate(s => { const i = s.coupons.findIndex(c => c.code === code); if (i < 0) throw user('ลบได้เฉพาะคูปองที่สร้างในหน้านี้'); s.coupons.splice(i, 1); delete s.couponOff[code]; log(s, by, 'ลบคูปอง', code, ''); return { code }; });
}

// ---------- reward codes ----------
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rand4 = () => Array.from({ length: 4 }, () => ALPHA[crypto.randomInt(ALPHA.length)]).join('');
function listBatches() {
  const s = state(), usedBy = {};
  for (const x of base().codes) usedBy[x.batch] = (usedBy[x.batch] || 0) + 1;
  return BASE_BATCHES.map(b => ({ id: b.id, name: b.name, prefix: b.prefix, count: b.count, rewards: b.rewards, maxUses: b.maxUses, expires: b.expires, created: dayAgo(b.ago), by: 'ระบบ (ตัวอย่าง)', used: usedBy[b.id] || 0, own: false }))
    .concat(s.batches.map(b => ({ id: b.id, name: b.name, prefix: b.prefix, count: b.count, rewards: b.rewards, maxUses: b.maxUses, expires: b.expires, created: b.created.slice(0, 10), by: b.by, used: 0, own: true })));
}
function createBatch(b, by, t = Date.now()) {
  const name = text(b.name, 2, 60, 'ชื่อชุดโค้ด'), prefix = String(b.prefix || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{2,12}$/.test(prefix)) throw user('คำนำหน้าใช้ A-Z 0-9 ยาว 2–12 ตัว');
  const count = Math.floor(Number(b.count)), maxUses = Math.floor(Number(b.maxUses || 1));
  if (!(count >= 1 && count <= 1000)) throw user('จำนวนโค้ดต้องอยู่ระหว่าง 1–1,000');
  if (!(maxUses >= 1 && maxUses <= 1000)) throw user('จำนวนครั้งที่ใช้ได้ต่อโค้ดต้องอยู่ระหว่าง 1–1,000');
  const rewards = (Array.isArray(b.rewards) ? b.rewards : []).slice(0, 6).map(r => {
    const type = ['cash', 'point', 'item'].includes(r && r.type) ? r.type : '', qty = Math.floor(Number(r && r.qty));
    if (!type) throw user('เลือกประเภทรางวัล'); if (!(qty >= 1 && qty <= 10000000)) throw user('จำนวนรางวัลต้องอยู่ระหว่าง 1–10,000,000');
    return { type, name: type === 'cash' ? 'แคช' : type === 'point' ? 'แต้มพ้อย' : text(r.name, 2, 40, 'ชื่อไอเทม'), qty };
  });
  if (!rewards.length) throw user('ใส่รางวัลอย่างน้อย 1 รายการ');
  const expires = String(b.expires || ''); if (expires && (!DATE_RE.test(expires) || expires < todayStr(t))) throw user('วันหมดอายุไม่ถูกต้อง (ต้องไม่ใช่วันที่ผ่านมาแล้ว)');
  return mutate(s => {
    if (s.batches.length >= 100) throw user('สร้างชุดโค้ดได้สูงสุด 100 ชุดในโหมดตัวอย่าง');
    if (s.batches.reduce((a, x) => a + x.codes.length, 0) + count > 20000) throw user('โควตาโค้ดในโหมดตัวอย่างเต็ม (20,000 โค้ด)');
    const taken = new Set([].concat(...s.batches.map(x => x.codes))), codes = [];
    while (codes.length < count) { const c = prefix + '-' + rand4() + '-' + rand4(); if (!taken.has(c)) { taken.add(c); codes.push(c); } }
    const batch = { id: 'b' + crypto.randomBytes(5).toString('hex'), name, prefix, count, rewards, maxUses, expires, created: new Date(t).toISOString(), by, codes };
    s.batches.push(batch); log(s, by, 'สร้างโค้ดรางวัล', name, count + ' โค้ด');
    return { id: batch.id, name, prefix, count, rewards, maxUses, expires, created: batch.created.slice(0, 10), by, codes };
  });
}
function batchCodes(id) {
  const b = state().batches.find(x => x.id === String(id || ''));
  if (!b) throw user('ดูรายการโค้ดได้เฉพาะชุดที่สร้างในหน้านี้');
  return { id: b.id, name: b.name, prefix: b.prefix, count: b.count, codes: b.codes };
}

// the route table used by the admin API: [method, route] -> handler(query, body, adminName)
function handle(route, method, query, body, by) {
  const q = query || {}, r = route.replace(/^gameops\//, '');
  if (method === 'GET') {
    if (r === 'dashboard') return dashboard();
    if (r === 'players') return listPlayers(q);
    if (r === 'revenue') return revenue(q);
    if (r === 'history/topups') return historyTopups(q);
    if (r === 'history/coupons') return historyCoupons(q);
    if (r === 'history/codes') return historyCodes(q);
    if (r === 'coupons') return { items: listCoupons() };
    if (r === 'codes') return { items: listBatches() };
    if (r === 'codes/batch') return batchCodes(q.id);
  } else if (method === 'POST') {
    if (r === 'players/update') return updatePlayer(body, by);
    if (r === 'players/suspend') return suspendPlayer(body, by);
    if (r === 'players/topup') return topupPlayer(body, by);
    if (r === 'coupons/create') return createCoupon(body, by);
    if (r === 'coupons/toggle') return toggleCoupon(body, by);
    if (r === 'coupons/delete') return deleteCoupon(body, by);
    if (r === 'codes/create') return createBatch(body, by);
  }
  return undefined;
}

module.exports = { handle, revenue, dashboard, listPlayers, historyTopups, historyCoupons, historyCodes, listCoupons, listBatches, createCoupon, createBatch, updatePlayer, suspendPlayer, topupPlayer, toggleCoupon, deleteCoupon, batchCodes, EMAIL_RE };

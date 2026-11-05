// JSON-file storage (atomic writes) + content validation + admin account.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const seed = require('./seed');
const locked = require('./lock');

const DIR = path.join(__dirname, '..', 'data');
const CONTENT = path.join(DIR, 'content.json');
const ADMIN = path.join(DIR, 'admin.json');
fs.mkdirSync(DIR, { recursive: true });

function writeAtomic(file, text) {
  const tmp = file + '.' + process.pid + '.' + crypto.randomBytes(8).toString('hex') + '.tmp';
  fs.writeFileSync(tmp, text, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

const str = (v, max = 20000) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max);
const slugify = s => str(s, 200).trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^\p{L}\p{M}\p{N}-]/gu, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
const newId = () => crypto.randomBytes(4).toString('hex');

// news categories are a fixed list; older free-text labels are mapped to the closest one
const NEWS_TAGS = ['PATCH NOTE', 'EVENT', 'TOURNAMENT', 'UPDATE', 'PROMOTION', 'NEWS'];
const TAG_ALIAS = { PATCH: 'PATCH NOTE', 'PATCH NOTES': 'PATCH NOTE', PATCHNOTE: 'PATCH NOTE', TOURNAMENTS: 'TOURNAMENT', PROMO: 'PROMOTION', PROMOTIONS: 'PROMOTION', UPDATES: 'UPDATE', EVENTS: 'EVENT' };
function newsTag(t) {
  const v = str(t, 60).trim().toUpperCase().replace(/\s+/g, ' ');
  return NEWS_TAGS.includes(v) ? v : TAG_ALIAS[v] || 'NEWS';
}

// which parts of the content make up each public page, so the sitemap can say when that page really changed
const SECTIONS = {
  home: c => [c.home, c.site, c.slides], rewards: c => [c.pages.rewards, c.rewards], gameplay: c => [c.pages.gameplay, c.gameplay], drivers: c => [c.pages.drivers, c.drivers],
  news: c => [c.pages.news], faq: c => [c.pages.faq, c.faq], privacy: c => [c.pages.privacy, c.legal, c.contact, c.cookies], terms: c => [c.pages.terms, c.legal, c.contact],
  support: c => [c.pages.support, c.contact, c.supportFaq], delete: c => [c.pages.delete], odds: c => [c.pages.odds]
};
// Keep only the shape we know, so a bad save can never break the public pages.
function clean(input) {
  const d = seed();
  const out = {};
  const obj = (src, def) => { const o = {}; for (const k of Object.keys(def)) o[k] = str(src && src[k], k === 'body' || k === 'bodyEn' ? 100000 : 20000); return o; };
  // sections added after a site was first saved start from the built-in defaults instead of blanks
  // fields added later fall back to the built-in default; fields saved empty by the admin stay empty
  const objOrDefault = (src, def) => {
    if (!src || typeof src !== 'object') return Object.assign({}, def);
    const o = {};
    for (const k of Object.keys(def)) o[k] = k in src ? str(src[k], k === 'body' || k === 'bodyEn' ? 100000 : 20000) : def[k];
    return o;
  };
  out.site = objOrDefault(input.site, d.site);
  out.links = { social: obj(input.links && input.links.social, d.links.social), download: obj(input.links && input.links.download, d.links.download), show: objOrDefault(input.links && input.links.show, d.links.show) };
  out.home = objOrDefault(input.home, d.home);
  out.pages = {};
  const LENIENT = new Set(['privacy', 'terms', 'support', 'faq', 'delete', 'odds', 'rewards', 'gameplay', 'drivers', 'news']);
  for (const k of Object.keys(d.pages)) out.pages[k] = (LENIENT.has(k) ? objOrDefault : obj)(input.pages && input.pages[k], d.pages[k]);
  out.portal = objOrDefault(input.portal, d.portal);
  out.prereg = objOrDefault(input.prereg, d.prereg);
  // top-up methods: each has its own price table; only a few short text fields are kept
  const money = v => str(v, 12).replace(/[^\d.,]/g, '');
  const srcMethods = input.topup && Array.isArray(input.topup.methods) ? input.topup.methods : d.topup.methods;
  out.topup = {
    methods: srcMethods.slice(0, 12).map(m => {
      m = m || {};
      const o = { id: str(m.id, 40).replace(/[^\w-]/g, '') || newId() };
      for (const k of ['name', 'title', 'logo', 'codeLabel', 'codePh', 'note']) o[k] = str(m[k], 300);
      o.enabled = m.enabled === false || m.enabled === 'false' ? 'false' : 'true';
      o.mode = m.mode === 'checkout' ? 'checkout' : 'code';
      o.packages = (Array.isArray(m.packages) ? m.packages : []).slice(0, 30).map(x => ({ price: money(x && x.price), cash: money(x && x.cash), point: money(x && x.point) })).filter(x => x.price);
      return o;
    })
  };
  out.contact = objOrDefault(input.contact, d.contact);
  out.cookies = objOrDefault(input.cookies, d.cookies);
  out.legal = objOrDefault(input.legal, d.legal);
  const list = (key, fields) => (Array.isArray(input[key]) ? input[key] : []).slice(0, 500).map(it => {
    const o = { id: str(it && it.id, 40) || newId() };
    for (const f of fields) o[f] = str(it && it[f], f === 'body' || f === 'bodyEn' ? 100000 : 5000);
    return o;
  });
  out.rewards = list('rewards', ['milestone', 'target', 'title', 'desc', 'image', 'alt', 'status', 'titleEn', 'descEn', 'altEn']);
  // the home slider: sites saved before it existed start with the built-in slides; at most 20
  out.slides = Array.isArray(input.slides) ? list('slides', ['image', 'alt', 'title', 'caption', 'link', 'altEn', 'titleEn', 'captionEn']).slice(0, 20) : d.slides.map(s => Object.assign({}, s));
  out.gameplay = list('gameplay', ['title', 'desc', 'image', 'alt', 'titleEn', 'descEn', 'altEn']);
  out.drivers = list('drivers', ['title', 'desc', 'image', 'alt', 'pos', 'badge', 'titleEn', 'descEn', 'altEn', 'badgeEn']);
  // lists saved before English existed: items that are still the built-in ones get their built-in English text
  const withEnglish = (key, items, defaults) => items.map((it, i) => {
    const raw = (input[key] || [])[i] || {}, def = defaults.find(x => x.id === it.id);
    if (def && !('qEn' in raw) && !('aEn' in raw)) { it.qEn = str(def.qEn); it.aEn = str(def.aEn); }
    return it;
  });
  out.faq = withEnglish('faq', list('faq', ['q', 'a', 'qEn', 'aEn']), d.faq);
  out.supportFaq = Array.isArray(input.supportFaq) ? withEnglish('supportFaq', list('supportFaq', ['q', 'a', 'qEn', 'aEn']), d.supportFaq) : d.supportFaq.map(x => Object.assign({}, x));
  out.changed = {};
  for (const k of Object.keys(SECTIONS)) { const v = String(input.changed && input.changed[k] || ''); out.changed[k] = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; }
  const seen = new Set();
  out.news = list('news', ['title', 'slug', 'date', 'tag', 'image', 'imageAlt', 'excerpt', 'body', 'seoTitle', 'seoDescription', 'modified', 'titleEn', 'excerptEn', 'bodyEn']).map((n, i) => {
    const src = (input.news || [])[i] || {};
    n.published = src.published === true || src.published === 'true';
    n.tag = newsTag(n.tag);
    n.date = /^\d{4}-\d{2}-\d{2}/.test(n.date) ? n.date.slice(0, 10) : new Date().toISOString().slice(0, 10);
    let s = slugify(n.slug || n.title) || 'news-' + n.id;
    while (seen.has(s)) s += '-' + newId().slice(0, 3);
    seen.add(s); n.slug = s;
    return n;
  });
  return out;
}

// cached in memory, but re-read whenever content.json changes on disk, so a save made by
// another Node process (hosts like Plesk may run several) shows up everywhere straight away
let cache, cacheMtime = 0, checkedAt = 0;
function getContent() {
  const now = Date.now();
  if (cache && now - checkedAt < 1000) return cache;
  checkedAt = now;
  if (!fs.existsSync(CONTENT)) writeAtomic(CONTENT, JSON.stringify(seed(), null, 2));
  let mtime = 0; try { mtime = fs.statSync(CONTENT).mtimeMs; } catch (e) {}
  if (cache && mtime === cacheMtime) return cache;
  try { cache = clean(JSON.parse(fs.readFileSync(CONTENT, 'utf8'))); cacheMtime = mtime; }
  catch (e) { console.error('content.json unreadable, using defaults:', e.message); if (!cache) cache = seed(); }
  return cache;
}
// last time the content was saved (used for sitemap <lastmod>)
function savedAt() { try { return fs.statSync(CONTENT).mtime.toISOString(); } catch (e) { return ''; } }
// every save keeps a copy of the previous version (last 40)
const HIST = path.join(DIR, 'history');
function revision() { return crypto.createHash('sha256').update(fs.readFileSync(CONTENT)).digest('hex'); }
function saveContent(input) {
  if (!input._revision || input._revision !== revision()) throw Object.assign(new Error('Content changed; reload before saving'), { code: 409 });
  const c = clean(input);
  // each news item remembers when it last really changed (for Google's dateModified)
  cache = null;
  const prev = getContent(), stamp = new Date().toISOString();
  const sig = n => JSON.stringify(Object.assign({}, n, { modified: '' }));
  for (const n of c.news) {
    const o = prev.news.find(x => x.id === n.id);
    n.modified = !o || sig(o) !== sig(n) ? stamp : (o.modified || '');
  }
  // a page's "last modified" moves only when its own content changed; pages never stamped keep the time of the save before this one
  const prevDay = savedAt().slice(0, 10) || stamp.slice(0, 10);
  for (const [k, parts] of Object.entries(SECTIONS)) {
    const same = JSON.stringify(parts(prev)) === JSON.stringify(parts(c));
    c.changed[k] = same ? (prev.changed && prev.changed[k]) || prevDay : stamp.slice(0, 10);
  }
  try {
    fs.mkdirSync(HIST, { recursive: true });
    if (fs.existsSync(CONTENT)) fs.copyFileSync(CONTENT, path.join(HIST, new Date().toISOString().replace(/[:.]/g, '-') + '.json'));
    const old = fs.readdirSync(HIST).filter(f => f.endsWith('.json')).sort();
    for (const f of old.slice(0, Math.max(0, old.length - 40))) fs.unlinkSync(path.join(HIST, f));
  } catch (e) { console.error('history:', e.message); }
  writeAtomic(CONTENT, JSON.stringify(c, null, 2));
  cache = c;
  try { cacheMtime = fs.statSync(CONTENT).mtimeMs; } catch (e) {}
  return Object.assign({}, c, { _revision: revision() });
}
function listHistory() {
  try {
    return fs.readdirSync(HIST).filter(f => /^[\w.-]+\.json$/.test(f)).sort().reverse().map(f => ({ id: f, time: f.slice(0, -5).replace(/T(\d\d)-(\d\d)-(\d\d)-(\d+)Z/, 'T$1:$2:$3.$4Z') }));
  } catch (e) { return []; }
}
function readHistory(id) {
  if (!/^[\w.-]+\.json$/.test(id) || id.includes('..')) return null;
  try { return clean(JSON.parse(fs.readFileSync(path.join(HIST, id), 'utf8'))); } catch (e) { return null; }
}

// ---- admin accounts (scrypt hashes) ----
// data/admin.json holds { v: 2, users: [{ id, user, salt, hash, totp?, role, first, last, nick, email, created }] }.
// The first account is the owner: only the owner can add, remove or reset other admins. A site saved with the old
// single-account file ({ user, salt, hash, totp }) is read as one owner account and rewritten in the new shape on the next change.
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const USER_RE = /^[A-Za-z0-9_.-]{3,32}$/;
const EMAIL_RE = /^[^\s@<>"']{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
function readAdmins() {
  const a = JSON.parse(fs.readFileSync(ADMIN, 'utf8'));
  if (a && Array.isArray(a.users)) return a;
  const one = { id: 'owner', user: a.user, salt: a.salt, hash: a.hash, role: 'owner', first: '', last: '', nick: '', email: '', created: '' };
  if (a.totp) one.totp = a.totp;
  return { v: 2, users: [one] };
}
const writeAdmins = d => writeAtomic(ADMIN, JSON.stringify({ v: 2, users: d.users }));
const byId = (d, id) => d.users.find(u => u.id === id) || null;
const byName = (d, name) => d.users.find(u => u.user.toLowerCase() === String(name).toLowerCase()) || null;
function ensureAdmin() {
  if (fs.existsSync(ADMIN)) return null;
  const user = process.env.ADMIN_USER || 'admin';
  const generated = !process.env.ADMIN_PASSWORD;
  const pw = process.env.ADMIN_PASSWORD || crypto.randomBytes(18).toString('base64url');
  if (pw.length < 12 || pw.length > 200) throw new Error('ADMIN_PASSWORD must be 12-200 characters');
  const salt = crypto.randomBytes(16).toString('hex');
  writeAdmins({ users: [{ id: 'owner', user, salt, hash: hash(pw, salt), role: 'owner', first: '', last: '', nick: '', email: '', created: new Date().toISOString() }] });
  return { user, password: generated ? pw : null };
}
// async scrypt so password checks don't freeze the server for everyone else.
// An unknown name still costs one full scrypt, so the answer time doesn't tell which names exist. Returns the account id or null.
const DUMMY_SALT = crypto.randomBytes(16).toString('hex'), DUMMY_HASH = crypto.randomBytes(64);
async function checkLogin(user, pw) {
  const d = readAdmins(), u = byName(d, String(user || ''));
  pw = String(pw).slice(0, 1024);
  const h = await new Promise((ok, no) => crypto.scrypt(pw, u ? u.salt : DUMMY_SALT, 64, (e, k) => (e ? no(e) : ok(k))));
  const ok = crypto.timingSafeEqual(h, u ? Buffer.from(u.hash, 'hex') : DUMMY_HASH);
  if (!ok || !u) return null;
  const now = byId(readAdmins(), u.id);
  return now && now.hash === u.hash ? u.id : null;
}
async function checkPassword(id, pw) { const u = byId(readAdmins(), id); return !!u && (await checkLogin(u.user, pw)) === id; }
// changes whenever this account's name, password, role or two-step key changes, or it is removed (which signs its sessions out)
function authVersion(id) {
  const u = byId(readAdmins(), id);
  if (!u) return 'gone';
  return crypto.createHash('sha256').update(JSON.stringify([u.id, u.user, u.salt, u.hash, u.role, u.totp ? 'totp' : ''])).digest('hex');
}
const need = (expected, id) => { if (expected !== authVersion(id)) throw Object.assign(new Error('Credentials changed'), { code: 409 }); };
// ---- optional two-step login (authenticator app), per account: { totp: { secret, last } } ----
const totp = require('./totp');
const dataKey = () => { const k = String(process.env.DATA_KEY || ''); return k.length >= 16 ? k : ''; };
let keyWarned = false;
function openSecret(u) {
  try { return totp.open(u.totp.secret, dataKey()); }
  catch (e) { if (!keyWarned) { keyWarned = true; console.error('two-step secret cannot be read (DATA_KEY missing or wrong): two-step logins are refused until it is fixed'); } return null; }
}
// encrypts any plain two-step secret already on disk (run at start-up when DATA_KEY is set)
function sealSecrets() {
  const key = dataKey(); if (!key || !fs.existsSync(ADMIN)) return 0;
  const d = readAdmins(); let n = 0;
  for (const u of d.users) if (u.totp && !String(u.totp.secret).startsWith('enc1:')) { u.totp.secret = totp.seal(u.totp.secret, key); n++; }
  if (n) writeAdmins(d);
  return n;
}
function totpEnabled(id) { try { const u = byId(readAdmins(), id); return !!(u && u.totp); } catch (e) { return false; } }
// a correct code is accepted once only: the step it belongs to is remembered
function totpCheck(id, code) {
  const d = readAdmins(), u = byId(d, id);
  if (!u) return false;
  if (!u.totp) return true;
  const secret = openSecret(u);
  if (!secret) return false;
  const step = totp.verify(secret, code, u.totp.last);
  if (!step) return false;
  u.totp.last = step; writeAdmins(d);
  return true;
}
function totpEnable(id, secret, code, expected) {
  need(expected, id);
  const step = totp.verify(secret, code, 0);
  if (!step) return false;
  const d = readAdmins(); byId(d, id).totp = { secret: dataKey() ? totp.seal(secret, dataKey()) : secret, last: step }; writeAdmins(d);
  return true;
}
function totpDisable(id, expected) { need(expected, id); const d = readAdmins(); delete byId(d, id).totp; writeAdmins(d); }
const adminName = id => { const u = byId(readAdmins(), id); return u ? u.user : ''; };
function setPassword(id, pw, expected) {
  need(expected, id);
  const d = readAdmins(), u = byId(d, id);
  u.salt = crypto.randomBytes(16).toString('hex'); u.hash = hash(pw, u.salt);
  writeAdmins(d);
}
// ---- profiles and the list of admins (never includes password hashes or two-step keys) ----
const pub = u => ({ id: u.id, user: u.user, role: u.role, first: u.first || '', last: u.last || '', nick: u.nick || '', email: u.email || '', twofa: !!u.totp, created: u.created || '' });
const profile = id => { const u = byId(readAdmins(), id); return u ? pub(u) : null; };
const listAdmins = () => readAdmins().users.map(pub);
const bad = msg => Object.assign(new Error(msg), { user: true });
function cleanProfile(p) {
  const s = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n);
  const o = { first: s(p.first, 60), last: s(p.last, 60), nick: s(p.nick, 40), email: s(p.email, 200) };
  if (o.email && !EMAIL_RE.test(o.email)) throw bad('อีเมลไม่ถูกต้อง');
  return o;
}
function setProfile(id, p) { const d = readAdmins(), u = byId(d, id); if (!u) throw bad('ไม่พบบัญชี'); Object.assign(u, cleanProfile(p || {})); writeAdmins(d); return pub(u); }
function addAdmin(p) {
  const d = readAdmins();
  const user = String(p.user || '').trim();
  if (!USER_RE.test(user)) throw bad('ชื่อผู้ใช้ต้องยาว 3–32 ตัว ใช้ a-z 0-9 _ . - เท่านั้น');
  if (['__proto__', 'constructor', 'prototype'].includes(user.toLowerCase())) throw bad('ใช้ชื่อผู้ใช้นี้ไม่ได้');
  if (byName(d, user)) throw bad('มีชื่อผู้ใช้นี้แล้ว');
  const pw = typeof p.password === 'string' ? p.password : '';
  if (pw.length < 12 || pw.length > 200) throw bad('รหัสผ่านเริ่มต้นต้องยาว 12–200 ตัวอักษร');
  if (d.users.length >= 20) throw bad('เพิ่มได้สูงสุด 20 บัญชี');
  const salt = crypto.randomBytes(16).toString('hex');
  const u = Object.assign({ id: crypto.randomBytes(6).toString('hex'), user, salt, hash: hash(pw, salt), role: 'admin', created: new Date().toISOString() }, cleanProfile(p));
  d.users.push(u); writeAdmins(d);
  return pub(u);
}
function removeAdmin(id, by) {
  const d = readAdmins(), u = byId(d, id);
  if (!u) throw bad('ไม่พบบัญชี');
  if (id === by) throw bad('ลบบัญชีของตัวเองไม่ได้');
  if (u.role === 'owner') throw bad('ลบบัญชีเจ้าของไม่ได้');
  d.users = d.users.filter(x => x.id !== id); writeAdmins(d);
}
function resetPassword(id, pw, clearTotp) {
  const d = readAdmins(), u = byId(d, id);
  if (!u) throw bad('ไม่พบบัญชี');
  if (typeof pw !== 'string' || pw.length < 12 || pw.length > 200) throw bad('รหัสผ่านใหม่ต้องยาว 12–200 ตัวอักษร');
  u.salt = crypto.randomBytes(16).toString('hex'); u.hash = hash(pw, u.salt);
  if (clearTotp) delete u.totp;
  writeAdmins(d);
}

// ---- admin sessions, kept on disk so logins survive restarts and work across several Node processes ----
// Only a SHA-256 of each token is stored, so a copy of this file can't be used to log in.
const SESS = path.join(DIR, 'sessions.json');
const tokenId = t => crypto.createHash('sha256').update(String(t)).digest('hex');
function readSessions() {
  try { const o = JSON.parse(fs.readFileSync(SESS, 'utf8')); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
}
function writeSessions(all) {
  const t = Date.now();
  for (const k of Object.keys(all)) if (!all[k] || all[k].exp < t) delete all[k];
  writeAtomic(SESS, JSON.stringify(all));
}
const sessions = {
  // a session belongs to one admin account; it ends when that account's password, role or two-step key changes, or it is removed
  get(token) { const s = token && readSessions()[tokenId(token)]; return s && s.uid && s.exp > Date.now() && s.version === authVersion(s.uid) ? s : null; },
  set(token, s) { const all = readSessions(); all[tokenId(token)] = s; writeSessions(all); },
  delete(token) { const all = readSessions(); delete all[tokenId(token)]; writeSessions(all); },
  keepOnly(token) { const id = tokenId(token), all = readSessions(); writeSessions(all[id] ? { [id]: all[id] } : {}); },
  prune() { writeSessions(readSessions()); }
};

// ---- failed-login counters, also on disk so the lockout holds across restarts and Node processes ----
// Keys are hashed client addresses: { n: failures, until: locked-until ms, last: last failure ms }
const LIMITS = path.join(DIR, 'limits.json');
const readLimits = () => { try { const o = JSON.parse(fs.readFileSync(LIMITS, 'utf8')); if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('Invalid rate-limit storage'); return o; } catch (e) { if (e.code === 'ENOENT') return {}; throw e; } };
const limits = {
  reserve(who, account) { return locked(LIMITS, () => {
    const now = Date.now(), all = readLimits(), keys = [tokenId('ip:' + who), tokenId('account:' + String(account || 'admin').toLowerCase().slice(0, 64))];
    const rows = keys.map(k => all[k] && all[k].until > now ? all[k] : { n: 0, until: now + 15 * 60e3, last: now });
    if (rows[0].n >= 5 || rows[1].n >= 50) return false;
    rows.forEach((r, i) => { r.n++; r.last = now; all[keys[i]] = r; });
    for (const k of Object.keys(all)) if (!all[k] || all[k].until <= now) delete all[k];
    writeAtomic(LIMITS, JSON.stringify(all)); return true;
  }); },
  // a successful login gives its attempt back, so signing in several times is never mistaken for guessing
  refund(who, account) { return locked(LIMITS, () => {
    const all = readLimits(), now = Date.now();
    for (const k of [tokenId('ip:' + who), tokenId('account:' + String(account || 'admin').toLowerCase().slice(0, 64))]) if (all[k] && all[k].until > now && all[k].n > 0) all[k].n--;
    writeAtomic(LIMITS, JSON.stringify(all));
  }); },
  get(who) { return readLimits()[tokenId('ip:' + who)] || null; },
  set(who, v) { const all = readLimits(); all[tokenId('ip:' + who)] = v; writeAtomic(LIMITS, JSON.stringify(all)); },
  delete(who) { const all = readLimits(), k = tokenId('ip:' + who); if (all[k]) { delete all[k]; writeAtomic(LIMITS, JSON.stringify(all)); } },
  prune() { const t = Date.now(), all = readLimits(); for (const k of Object.keys(all)) if (!all[k] || (all[k].until < t && all[k].last < t - 3600e3)) delete all[k]; writeAtomic(LIMITS, JSON.stringify(all)); }
};

for (const k of ['set', 'delete', 'keepOnly', 'prune']) { const fn = sessions[k]; sessions[k] = (...args) => locked(SESS, () => fn(...args)); }
for (const k of ['set', 'delete', 'prune']) { const fn = limits[k]; limits[k] = (...args) => locked(LIMITS, () => fn(...args)); }
module.exports = { NEWS_TAGS, snapshot: () => locked(CONTENT, () => { cache = null; const c = getContent(); return Object.assign({}, c, { _revision: revision() }); }), authVersion, revision, limits, getContent, savedAt, saveContent: input => locked(CONTENT, () => saveContent(input)), listHistory, readHistory, ensureAdmin: () => locked(ADMIN, () => ensureAdmin()), checkLogin, checkPassword, sessions,
  setPassword: (id, pw, expected) => locked(ADMIN, () => setPassword(id, pw, expected)),
  sealSecrets: () => locked(ADMIN, () => sealSecrets()), totpEnabled, adminName, totpCheck: (id, code) => locked(ADMIN, () => totpCheck(id, code)), totpEnable: (id, sec, code, expected) => locked(ADMIN, () => totpEnable(id, sec, code, expected)), totpDisable: (id, expected) => locked(ADMIN, () => totpDisable(id, expected)),
  profile, listAdmins, setProfile: (id, p) => locked(ADMIN, () => setProfile(id, p)), addAdmin: p => locked(ADMIN, () => addAdmin(p)), removeAdmin: (id, by) => locked(ADMIN, () => removeAdmin(id, by)), resetPassword: (id, pw, clear) => locked(ADMIN, () => resetPassword(id, pw, clear)) };

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
  out.site = obj(input.site, d.site);
  out.links = { social: obj(input.links && input.links.social, d.links.social), download: obj(input.links && input.links.download, d.links.download) };
  out.home = obj(input.home, d.home);
  out.pages = {};
  const LENIENT = new Set(['privacy', 'terms', 'support']);
  for (const k of Object.keys(d.pages)) out.pages[k] = (LENIENT.has(k) ? objOrDefault : obj)(input.pages && input.pages[k], d.pages[k]);
  out.contact = objOrDefault(input.contact, d.contact);
  out.cookies = objOrDefault(input.cookies, d.cookies);
  out.legal = objOrDefault(input.legal, d.legal);
  const list = (key, fields) => (Array.isArray(input[key]) ? input[key] : []).slice(0, 500).map(it => {
    const o = { id: str(it && it.id, 40) || newId() };
    for (const f of fields) o[f] = str(it && it[f], f === 'body' ? 100000 : 5000);
    return o;
  });
  out.rewards = list('rewards', ['milestone', 'title', 'desc', 'status']);
  out.gameplay = list('gameplay', ['title', 'desc', 'image', 'alt']);
  out.drivers = list('drivers', ['title', 'desc', 'image', 'alt', 'pos', 'badge']);
  out.faq = list('faq', ['q', 'a']);
  out.supportFaq = Array.isArray(input.supportFaq) ? list('supportFaq', ['q', 'a']) : d.supportFaq.map(x => Object.assign({}, x));
  const seen = new Set();
  out.news = list('news', ['title', 'slug', 'date', 'tag', 'image', 'imageAlt', 'excerpt', 'body', 'seoTitle', 'seoDescription', 'modified']).map((n, i) => {
    const src = (input.news || [])[i] || {};
    n.published = src.published === true || src.published === 'true';
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

// ---- admin account (scrypt hash) ----
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
function ensureAdmin() {
  if (fs.existsSync(ADMIN)) return null;
  const user = process.env.ADMIN_USER || 'admin';
  const generated = !process.env.ADMIN_PASSWORD;
  const pw = process.env.ADMIN_PASSWORD || crypto.randomBytes(18).toString('base64url');
  if (pw.length < 12 || pw.length > 200) throw new Error('ADMIN_PASSWORD must be 12-200 characters');
  const salt = crypto.randomBytes(16).toString('hex');
  writeAtomic(ADMIN, JSON.stringify({ user, salt, hash: hash(pw, salt) }));
  return { user, password: generated ? pw : null };
}
// async scrypt so password checks don't freeze the server for everyone else
async function checkLogin(user, pw) {
  const a = JSON.parse(fs.readFileSync(ADMIN, 'utf8'));
  pw = String(pw).slice(0, 1024);
  const h = await new Promise((ok, no) => crypto.scrypt(pw, a.salt, 64, (e, k) => (e ? no(e) : ok(k))));
  const ok = crypto.timingSafeEqual(h, Buffer.from(a.hash, 'hex'));
  const uok = crypto.timingSafeEqual(crypto.createHash('sha256').update(String(user)).digest(), crypto.createHash('sha256').update(a.user).digest());
  return ok && uok && a.hash === JSON.parse(fs.readFileSync(ADMIN, 'utf8')).hash;
}
function authVersion() { return crypto.createHash('sha256').update(fs.readFileSync(ADMIN)).digest('hex'); }
function setPassword(pw, expected) {
  if (expected !== authVersion()) throw Object.assign(new Error('Credentials changed'), { code: 409 });
  const a = JSON.parse(fs.readFileSync(ADMIN, 'utf8'));
  a.salt = crypto.randomBytes(16).toString('hex');
  a.hash = hash(pw, a.salt);
  writeAtomic(ADMIN, JSON.stringify(a));
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
  get(token) { const s = token && readSessions()[tokenId(token)]; return s && s.exp > Date.now() && s.version === authVersion() ? s : null; },
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
  reserve(who) { return locked(LIMITS, () => {
    const now = Date.now(), all = readLimits(), keys = [tokenId('ip:' + who), tokenId('account:admin')];
    const rows = keys.map(k => all[k] && all[k].until > now ? all[k] : { n: 0, until: now + 15 * 60e3, last: now });
    if (rows[0].n >= 5 || rows[1].n >= 50) return false;
    rows.forEach((r, i) => { r.n++; r.last = now; all[keys[i]] = r; });
    for (const k of Object.keys(all)) if (!all[k] || all[k].until <= now) delete all[k];
    writeAtomic(LIMITS, JSON.stringify(all)); return true;
  }); },
  get(who) { return readLimits()[tokenId('ip:' + who)] || null; },
  set(who, v) { const all = readLimits(); all[tokenId('ip:' + who)] = v; writeAtomic(LIMITS, JSON.stringify(all)); },
  delete(who) { const all = readLimits(), k = tokenId('ip:' + who); if (all[k]) { delete all[k]; writeAtomic(LIMITS, JSON.stringify(all)); } },
  prune() { const t = Date.now(), all = readLimits(); for (const k of Object.keys(all)) if (!all[k] || (all[k].until < t && all[k].last < t - 3600e3)) delete all[k]; writeAtomic(LIMITS, JSON.stringify(all)); }
};

for (const k of ['set', 'delete', 'keepOnly', 'prune']) { const fn = sessions[k]; sessions[k] = (...args) => locked(SESS, () => fn(...args)); }
for (const k of ['set', 'delete', 'prune']) { const fn = limits[k]; limits[k] = (...args) => locked(LIMITS, () => fn(...args)); }
module.exports = { snapshot: () => locked(CONTENT, () => { cache = null; const c = getContent(); return Object.assign({}, c, { _revision: revision() }); }), authVersion, revision, limits, getContent, savedAt, saveContent: input => locked(CONTENT, () => saveContent(input)), listHistory, readHistory, ensureAdmin: () => locked(ADMIN, () => ensureAdmin()), checkLogin, setPassword: (pw, expected) => locked(ADMIN, () => setPassword(pw, expected)), sessions };

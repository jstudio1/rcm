// JSON-file storage (atomic writes) + content validation + admin account.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const seed = require('./seed');

const DIR = path.join(__dirname, '..', 'data');
const CONTENT = path.join(DIR, 'content.json');
const ADMIN = path.join(DIR, 'admin.json');
fs.mkdirSync(DIR, { recursive: true });

function writeAtomic(file, text) {
  const tmp = file + '.' + process.pid + '.tmp';
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
  const obj = (src, def) => { const o = {}; for (const k of Object.keys(def)) o[k] = str(src && src[k]); return o; };
  out.site = obj(input.site, d.site);
  out.links = { social: obj(input.links && input.links.social, d.links.social), download: obj(input.links && input.links.download, d.links.download) };
  out.home = obj(input.home, d.home);
  out.pages = {};
  for (const k of Object.keys(d.pages)) out.pages[k] = obj(input.pages && input.pages[k], d.pages[k]);
  const list = (key, fields) => (Array.isArray(input[key]) ? input[key] : []).slice(0, 500).map(it => {
    const o = { id: str(it && it.id, 40) || newId() };
    for (const f of fields) o[f] = str(it && it[f], f === 'body' ? 100000 : 5000);
    return o;
  });
  out.rewards = list('rewards', ['milestone', 'title', 'desc', 'status']);
  out.gameplay = list('gameplay', ['title', 'desc', 'image', 'alt']);
  out.drivers = list('drivers', ['title', 'desc', 'image', 'pos', 'badge']);
  out.faq = list('faq', ['q', 'a']);
  const seen = new Set();
  out.news = list('news', ['title', 'slug', 'date', 'tag', 'image', 'excerpt', 'body', 'seoTitle', 'seoDescription']).map((n, i) => {
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

let cache;
function getContent() {
  if (cache) return cache;
  if (!fs.existsSync(CONTENT)) writeAtomic(CONTENT, JSON.stringify(seed(), null, 2));
  try { cache = clean(JSON.parse(fs.readFileSync(CONTENT, 'utf8'))); }
  catch (e) { console.error('content.json unreadable, using defaults:', e.message); cache = seed(); }
  return cache;
}
// every save keeps a copy of the previous version (last 40)
const HIST = path.join(DIR, 'history');
function saveContent(input) {
  const c = clean(input);
  try {
    fs.mkdirSync(HIST, { recursive: true });
    if (fs.existsSync(CONTENT)) fs.copyFileSync(CONTENT, path.join(HIST, new Date().toISOString().replace(/[:.]/g, '-') + '.json'));
    const old = fs.readdirSync(HIST).filter(f => f.endsWith('.json')).sort();
    for (const f of old.slice(0, Math.max(0, old.length - 40))) fs.unlinkSync(path.join(HIST, f));
  } catch (e) { console.error('history:', e.message); }
  writeAtomic(CONTENT, JSON.stringify(c, null, 2));
  cache = c;
  return c;
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
  const pw = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  const salt = crypto.randomBytes(16).toString('hex');
  writeAtomic(ADMIN, JSON.stringify({ user, salt, hash: hash(pw, salt) }));
  return { user, password: generated ? pw : null };
}
function checkLogin(user, pw) {
  const a = JSON.parse(fs.readFileSync(ADMIN, 'utf8'));
  const h = Buffer.from(hash(String(pw), a.salt), 'hex');
  const ok = crypto.timingSafeEqual(h, Buffer.from(a.hash, 'hex'));
  const uok = crypto.timingSafeEqual(crypto.createHash('sha256').update(String(user)).digest(), crypto.createHash('sha256').update(a.user).digest());
  return ok && uok;
}
function setPassword(pw) {
  const a = JSON.parse(fs.readFileSync(ADMIN, 'utf8'));
  a.salt = crypto.randomBytes(16).toString('hex');
  a.hash = hash(pw, a.salt);
  writeAtomic(ADMIN, JSON.stringify(a));
}

module.exports = { getContent, saveContent, listHistory, readHistory, ensureAdmin, checkLogin, setPassword };

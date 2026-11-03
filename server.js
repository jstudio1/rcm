// RAYCITY-M website: server-rendered public pages + admin-only back office. No npm dependencies.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { pipeline } = require('stream');
const locked = require('./lib/lock');
const store = require('./lib/store');
const { render, PAGES, LOADER_STYLES } = require('./lib/render');
const psi = require('./lib/pagespeed');
const analytics = require('./lib/analytics');
const linkcheck = require('./lib/linkcheck');
const totp = require('./lib/totp');
const portal = require('./lib/portal');
const prereg = require('./lib/prereg');
let linkCheckBusy = false, linkCheckLast = 0;
const pending2fa = new Map(); // session token -> { secret, exp }: a two-step key that is shown but not yet confirmed

const PORT = +process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const ADMIN_DIR = path.join(__dirname, 'admin');
const UPLOADS = path.join(PUBLIC, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });
// files uploaded by older versions were saved as 600; make them readable by a front web server (no-op on Windows)
try { const r = require('./lib/fixuploads')(UPLOADS); if (r.fixed) console.log('uploads: made ' + r.fixed + ' file(s) readable by the web server'); } catch (e) { console.error('fix-uploads:', e.message); }

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.woff2': 'font/woff2' };
// uploadable media: extension, size limit, and a check on the file's first bytes
const UPLOAD_TYPES = {
  'image/jpeg': { ext: '.jpg', max: 10e6, sig: b => b[0] === 0xff && b[1] === 0xd8 },
  'image/png': { ext: '.png', max: 10e6, sig: b => b.length >= 24 && b.slice(0, 8).toString('hex') === '89504e470d0a1a0a' && b.readUInt32BE(16) > 0 && b.readUInt32BE(20) > 0 },
  'image/webp': { ext: '.webp', max: 10e6, sig: b => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' },
  'image/gif': { ext: '.gif', max: 10e6, sig: b => ['GIF87a', 'GIF89a'].includes(b.slice(0, 6).toString()) && b.readUInt16LE(6) > 0 && b.readUInt16LE(8) > 0 },
  'video/mp4': { ext: '.mp4', max: 60e6, sig: b => b.slice(4, 8).toString() === 'ftyp' },
  'video/webm': { ext: '.webm', max: 60e6, sig: b => b.slice(0, 4).toString('hex') === '1a45dfa3' }
};
const MEDIA_EXT = { '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.webp': 'image', '.gif': 'image', '.svg': 'image', '.mp4': 'video', '.webm': 'video' };
const MEDIA_DIRS = [['img', path.join(PUBLIC, 'img')], ['uploads', UPLOADS]];

function listMedia() {
  const out = [];
  for (const [prefix, dir] of MEDIA_DIRS) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch (e) { continue; }
    const set = new Set(names.map(n => n.toLowerCase()));
    for (const name of names) {
      const kind = MEDIA_EXT[path.extname(name).toLowerCase()];
      if (!kind) continue;
      // a .webp made as the fast twin of a .jpg/.png is served automatically: list only the original
      const stem = name.toLowerCase().replace(/\.webp$/, '');
      if (stem !== name.toLowerCase() && ['.jpg', '.jpeg', '.png'].some(e => set.has(stem + e))) continue;
      try {
        const st = fs.statSync(path.join(dir, name));
        if (st.isFile()) out.push({ url: '/' + prefix + '/' + name, name, kind, size: st.size, time: st.mtimeMs, deletable: prefix === 'uploads' });
      } catch (e) {}
    }
  }
  return out.sort((a, b) => b.time - a.time);
}

const sessions = store.sessions; // token -> { exp, csrf }, stored in data/sessions.json
const fails = store.limits; // failed logins per client, shared via data/limits.json
const SESSION_MS = 8 * 3600e3;
const IDLE_MS = (Number(process.env.SESSION_IDLE_MIN) || 120) * 60e3;

// X-Forwarded-* headers are only believed when they come from a reverse proxy on this machine
// (e.g. Plesk nginx), or when TRUST_PROXY=1. Anyone else could fake them.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
// no remote address = connected over a local socket (e.g. Plesk/Passenger), which is also a local proxy
// (the peer address is captured when the request arrives: once a client disconnects it reads as empty,
// which must not be mistaken for a local proxy)
const peer = req => (req.peer !== undefined ? req.peer : (req.peer = req.socket.remoteAddress || ''));
const trustedPeers = new Set((process.env.TRUST_PROXY_IPS || '').split(',').map(s => s.trim()).filter(Boolean));
const fromProxy = req => { const a = peer(req); return process.env.TRUST_PROXY === '1' && (a === '' || LOOPBACK.has(a) || trustedPeers.has(a)); };
const fwd = (req, name) => fromProxy(req) && req.headers[name] ? String(req.headers[name]).split(',').map(s => s.trim()) : null;
const isHttps = req => !!req.socket.encrypted || (fwd(req, 'x-forwarded-proto') || [])[0] === 'https';
// 'https' / 'http' only when we are SURE how the visitor connected; null when a proxy on this machine (Plesk nginx,
// Passenger) may be hiding it. Redirects only ever act on a sure 'http', so a host that forgets to forward the
// scheme can never cause a redirect loop.
const knownProto = req => {
  if (req.socket.encrypted) return 'https';
  const p = (fwd(req, 'x-forwarded-proto') || [])[0];
  if (p) return p === 'https' ? 'https' : 'http';
  if (fromProxy(req)) return null;
  const a = peer(req);
  return (a === '' || LOOPBACK.has(a)) ? null : 'http'; // a direct remote connection that is not TLS is plain http
};
const HOST_RE = /^(?:[a-z0-9-]+(?:\.[a-z0-9-]+)*|\[[0-9a-f:.]+\])(?::\d{1,5})?$/i;
const SITE_URL_RE = /^https?:\/\/(?:[a-z0-9-]+(?:\.[a-z0-9-]+)*|\[[0-9a-f:.]+\])(?::\d{1,5})?$/i;
const baseUrl = (req, c) => {
  const set = String(c.site.url || '').trim().replace(/\/+$/, '');
  if (SITE_URL_RE.test(set)) return set;
  // no domain set in admin: fall back to the request's host, but only a local one or one listed in SITE_HOSTS.
  // Any other Host / X-Forwarded-Host could be chosen by a visitor and would end up in canonical and share links.
  const host = String((fwd(req, 'x-forwarded-host') || [])[0] || req.headers.host || '').toLowerCase();
  const name = host.replace(/:\d{1,5}$/, '').replace(/^\[|\]$/g, '');
  const allowed = String(process.env.SITE_HOSTS || '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
  const local = name === 'localhost' || name.endsWith('.localhost') || /^127\.\d+\.\d+\.\d+$/.test(name) || name === '::1';
  return (isHttps(req) ? 'https' : 'http') + '://' + (HOST_RE.test(host) && (local || allowed.includes(name)) ? host : 'localhost');
};
// public address of a page on the live site (PageSpeed needs the real domain, not localhost)
const siteUrlFor = (p, c) => { const s = String(c.site.url || '').trim().replace(/\/+$/, ''); return SITE_URL_RE.test(s) ? s + p : ''; };
// client address for login rate limiting; behind a local proxy, the last X-Forwarded-For entry is the one it added
const ip = req => { const f = fwd(req, 'x-forwarded-for'); return (f && f[f.length - 1]) || peer(req); };
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('=')).filter(p => p[0]).map(([k, ...v]) => [k, v.join('=')]));

// ---- compression: brotli (or gzip) for text; images and video are already compressed ----
const COMPRESSIBLE = /^(text\/|application\/(json|xml|javascript)|image\/svg)/;
const pickEnc = req => { const a = String(req && req.headers['accept-encoding'] || ''); return /\bbr\b/.test(a) ? 'br' : /\bgzip\b/.test(a) ? 'gzip' : null; };
const squeeze = (buf, enc, q) => enc === 'br'
  ? zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: q, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } })
  : zlib.gzipSync(buf, { level: Math.min(9, q) });

function send(res, code, body, type, extra) {
  type = type || 'text/html; charset=utf-8';
  const hd = Object.assign({ 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' }, extra || {});
  let buf = body == null ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  const enc = COMPRESSIBLE.test(type) && buf.length >= 860 ? pickEnc(res.req) : null;
  if (enc) {
    // compressing is the most expensive thing a request can make the server do: identical pages are compressed once
    const key = buf.length < 400e3 ? enc + '|' + crypto.createHash('sha1').update(buf).digest('base64url') : '';
    let z = key && zcache.get(key);
    if (!z) { z = squeeze(buf, enc, 5); if (key) { if (zcache.size > 200) zcache.clear(); zcache.set(key, z); } }
    buf = z; hd['Content-Encoding'] = enc;
  }
  if (COMPRESSIBLE.test(type)) hd.Vary = 'Accept-Encoding';
  hd['Content-Length'] = buf.length;
  res.writeHead(code, hd);
  res.end(res.req && res.req.method === 'HEAD' ? undefined : buf);
}
// HTML pages: an ETag lets returning visitors get a tiny "304 Not Modified" instead of the whole page
function sendPage(req, res, code, html, extra) {
  const etag = 'W/"' + crypto.createHash('sha1').update(html).digest('base64url').slice(0, 20) + '"';
  const hd = Object.assign({ 'Cache-Control': 'no-cache', ETag: etag }, extra || {});
  if (code === 200 && !(extra && extra['Set-Cookie']) && req.headers['if-none-match'] === etag) { res.writeHead(304, hd); return res.end(); }
  send(res, code, html, 'text/html; charset=utf-8', hd);
}
const json = (res, code, obj, extra) => send(res, code, JSON.stringify(obj), 'application/json; charset=utf-8', Object.assign({ 'Cache-Control': 'no-store' }, extra));

// Bodies are held in memory, so how many are read at once is capped. Small ones (login, settings) have their own
// pool and a short deadline, so a few connections that drip bytes slowly can neither fill the pool that big saves
// and uploads use nor keep a login slot busy for minutes.
const pools = { small: 0, big: 0 };
function readRaw(req, limit) {
  const kind = limit <= 1e5 ? 'small' : 'big';
  if (pools[kind] >= (kind === 'small' ? 32 : 4)) return Promise.reject(Object.assign(new Error('Busy'), { code: 503 }));
  pools[kind]++;
  let timer;
  return new Promise((resolve, reject) => {
    let n = 0; const parts = [];
    timer = setTimeout(() => { reject(Object.assign(new Error('too slow'), { code: 408 })); req.destroy(); }, kind === 'small' ? 10e3 : 120e3);
    req.on('data', ch => { n += ch.length; if (n > limit) { reject(Object.assign(new Error('too large'), { code: 413 })); req.destroy(); } else parts.push(ch); });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
    req.on('aborted', () => reject(new Error('Request aborted')));
  }).finally(() => { clearTimeout(timer); pools[kind]--; });
}
const readBody = async (req, limit) => (await readRaw(req, limit)).toString('utf8');

function session(req) {
  const t = cookies(req).sid;
  const s = t && sessions.get(t);
  if (!s) return null;
  const now = Date.now();
  if (s.exp < now) { sessions.delete(t); return null; }
  // a session that has been left alone for a while ends (a stolen, forgotten tab can't be used later)
  if (s.seen && now - s.seen > IDLE_MS) { sessions.delete(t); return null; }
  if (!s.seen || now - s.seen > 300e3) { try { sessions.set(t, Object.assign({}, s, { seen: now })); } catch (e) {} }
  return Object.assign({ token: t }, s);
}

// compressed copies of static text files, rebuilt when the file changes
const zcache = new Map();
// supports byte ranges so videos can seek and play on iPhone/Safari; ETag/Last-Modified allow 304 replies
function pipeFile(file, res, options) { pipeline(fs.createReadStream(file, options), res, () => {}); }
function serveFile(req, res, file, cache, vary) {
  fs.stat(file, (err, st) => {
    try {
    if (err || !st.isFile()) return send(res, 404, 'Not found', 'text/plain');
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const etag = `W/"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
    const hd = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': cache || 'public, max-age=300', 'X-Content-Type-Options': 'nosniff', 'Last-Modified': st.mtime.toUTCString(), ETag: etag };
    if (vary) hd.Vary = vary;
    const ims = Date.parse(req.headers['if-modified-since'] || '');
    if (req.headers['if-none-match'] === etag || (!req.headers['if-none-match'] && ims && Math.floor(st.mtimeMs / 1000) <= Math.floor(ims / 1000))) { res.writeHead(304, hd); return res.end(); }
    // text files (css/js/svg/xml): send a cached brotli/gzip copy
    const enc = COMPRESSIBLE.test(type) && st.size >= 860 ? pickEnc(req) : null;
    if (COMPRESSIBLE.test(type)) {
      hd.Vary = [vary, 'Accept-Encoding'].filter(Boolean).join(', ');
      delete hd['Accept-Ranges'];
      if (enc) {
        const k = file + '|' + enc + '|' + etag;
        let z = zcache.get(k);
        if (!z) { z = squeeze(fs.readFileSync(file), enc, 5); if (zcache.size > 200) zcache.clear(); zcache.set(k, z); }
        res.writeHead(200, Object.assign(hd, { 'Content-Encoding': enc, 'Content-Length': z.length }));
        return res.end(req.method === 'HEAD' ? undefined : z);
      }
    }
    const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (r && (r[1] || r[2])) {
      let a = r[1] ? +r[1] : Math.max(0, st.size - +r[2]), b = r[1] && r[2] ? Math.min(+r[2], st.size - 1) : st.size - 1;
      if (a >= st.size || a > b) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, Object.assign(hd, { 'Content-Range': `bytes ${a}-${b}/${st.size}`, 'Content-Length': b - a + 1 }));
      return req.method === 'HEAD' ? res.end() : pipeFile(file, res, { start: a, end: b });
    }
    res.writeHead(200, Object.assign(hd, { 'Content-Length': st.size }));
    if (req.method === 'HEAD') return res.end();
    pipeFile(file, res);
    } catch (e) { if (!res.headersSent) send(res, 500, 'File unavailable', 'text/plain'); else res.destroy(); }
  });
}
function serveStatic(req, res, root, rel, cache) {
  let p; try { p = decodeURIComponent(rel); } catch (e) { return send(res, 400, 'Bad request', 'text/plain'); }
  if (/[\\:\x00-\x1f]/.test(p)) return send(res, 403, 'Forbidden', 'text/plain');
  let file = path.normalize(path.join(root, p));
  if (!file.startsWith(root + path.sep) || p.includes('\0')) return send(res, 403, 'Forbidden', 'text/plain');
  try { file = fs.realpathSync(file); const realRoot = fs.realpathSync(root); if (!file.startsWith(realRoot + path.sep)) return send(res, 403, 'Forbidden', 'text/plain'); } catch (e) { return send(res, 404, 'Not found', 'text/plain'); }
  if (!/^\/(?:img|uploads|fonts)\//i.test(p) && !['/favicon.ico', '/fonts.css', '/ga.js', '/account.js', '/account.css', '/prereg.js', '/prereg.css', '/consent.js', '/hero.js', '/loader.js', '/site.js', '/style.css'].includes(p)) return send(res, 404, 'Not found', 'text/plain');
  const staticExt = path.extname(file).toLowerCase();
  if (/^\/(?:img|uploads)\//i.test(p) && !MEDIA_EXT[staticExt] && staticExt !== '.ico') return send(res, 404, 'Not found', 'text/plain');
  // only known web file types are served (no .rar/.zip/.psd or other stray files left in public/)
  if (!MIME[path.extname(file).toLowerCase()] || /[\\/]\./.test(p)) return send(res, 404, 'Not found', 'text/plain');
  // uploaded files can never run as a page, even if a file is crafted to look like HTML
  if (p.replace(/\\/g, '/').toLowerCase().startsWith('/uploads/')) res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  // a .jpg/.png with a .webp twin next to it: browsers that accept WebP get the smaller file
  if (/\.(jpe?g|png)$/i.test(file)) {
    const twin = file.replace(/\.(jpe?g|png)$/i, '.webp');
    if (hasFile(twin) && twinFresh(file, twin)) {
      // "Vary: Accept" on both answers so shared caches never hand WebP to a browser that can't show it
      return serveFile(req, res, /image\/webp/.test(req.headers.accept || '') ? twin : file, cache, 'Accept');
    }
  }
  serveFile(req, res, file, cache);
}
// small existence cache so WebP lookups don't hit the disk on every request
const fcache = new Map();
function hasFile(f) {
  try { if (!fs.realpathSync(f).startsWith(fs.realpathSync(PUBLIC) + path.sep)) return false; } catch (e) { return false; }
  const c = fcache.get(f), now = Date.now();
  if (c && now - c.t < 30e3) return c.ok;
  let ok = false; try { ok = fs.statSync(f).isFile(); } catch (e) {}
  if (fcache.size > 2000) fcache.clear();
  fcache.set(f, { ok, t: now });
  return ok;
}
// a WebP twin only counts if it isn't older than its original: if someone replaces track.jpg,
// visitors must get the new picture, not the outdated track.webp (1 minute of slack for copies made together)
function twinFresh(file, twin) {
  try { return fs.statSync(twin).mtimeMs >= fs.statSync(file).mtimeMs - 60e3; } catch (e) { return false; }
}
// browser cache lifetimes: versioned (?v=) files and uploads never change, built-in images rarely do
function cacheFor(p, url) {
  if (url.searchParams.has('v') || p.startsWith('/fonts/') || p.startsWith('/uploads/')) return 'public, max-age=31536000, immutable';
  if (p.startsWith('/img/')) return 'public, max-age=604800, stale-while-revalidate=86400';
  if (/\.(css|js)$/.test(p)) return 'no-cache';
  return 'public, max-age=86400';
}

const ADMIN_CSP = "default-src 'self'; img-src 'self' data: https:; media-src 'self' https:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
// public pages: scripts only from this site, no plugins, can't be framed by other sites
const PUBLIC_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https:; media-src 'self' https:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'";
// when a Google Analytics 4 ID is set in the admin, pages may also load gtag and report to Google
const GA_CSP = PUBLIC_CSP
  .replace("script-src 'self'", "script-src 'self' https://www.googletagmanager.com")
  .replace("connect-src 'self'", "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com");
const GA_RE = /^G-[A-Z0-9]{4,15}$/;
const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Content-Security-Policy': PUBLIC_CSP
};

async function adminApi(req, res, url) {
  const route = url.pathname.slice('/admin/api/'.length);
  const m = req.method;
  if (['POST', 'PUT'].includes(m) && route !== 'upload' && String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') return json(res, 415, { error: 'Expected application/json' });
  if (route === 'login' && m === 'POST') {
    const who = ip(req);
    
    let b; try { b = JSON.parse(await readBody(req, 4096)); } catch (e) { return json(res, 400, { error: 'bad request' }); }
    if (!b || typeof b !== 'object' || typeof b.user !== 'string' || typeof b.password !== 'string') return json(res, 400, { error: 'bad request' });
    if (b.user.length > 200 || b.password.length > 1024) return json(res, 400, { error: 'bad request' });
    if (!fails.reserve(who, b.user)) return json(res, 429, { error: 'Too many attempts; retry in 15 minutes' });
    const uid = await store.checkLogin(b.user, b.password);
    const version = uid ? store.authVersion(uid) : '';
    // with two-step login on, the code is always part of the answer: a wrong password and a wrong code look the same
    const codeOk = !!uid && (!store.totpEnabled(uid) || (typeof b.code === 'string' && store.totpCheck(uid, b.code)));
    if (uid && codeOk && version === store.authVersion(uid)) {
      fails.refund(who, b.user);
      const token = crypto.randomBytes(32).toString('base64url'), csrf = crypto.randomBytes(24).toString('base64url');
      sessions.set(token, { uid, exp: Date.now() + SESSION_MS, csrf, version, seen: Date.now() });
      const secure = (isHttps(req) || process.env.COOKIE_SECURE === '1') ? '; Secure' : '';
      return json(res, 200, { ok: true }, { 'Set-Cookie': `sid=${token}; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=${SESSION_MS / 1000}${secure}` });
    }
    return json(res, 401, { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }

  const s = session(req);
  if (!s) return json(res, 401, { error: 'unauthorized' });
  const tok = String(req.headers['x-csrf-token'] || '');
  if (m !== 'GET' && (!/^[A-Za-z0-9_-]{32}$/.test(tok) || tok.length !== s.csrf.length || !crypto.timingSafeEqual(Buffer.from(tok), Buffer.from(s.csrf)))) return json(res, 403, { error: 'csrf' });

  try {
    if (route === 'me' && m === 'GET') return json(res, 200, { csrf: s.csrf, me: store.profile(s.uid) });
    if (route === 'logout' && m === 'POST') { sessions.delete(s.token); return json(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=0' }); }
    if (route === 'content' && m === 'GET') return json(res, 200, store.snapshot());
    if (route === 'history' && m === 'GET') return json(res, 200, { items: store.listHistory() });
    if (route.startsWith('history/') && m === 'GET') {
      const old = store.readHistory(decodeURIComponent(route.slice(8)));
      return old ? json(res, 200, old) : json(res, 404, { error: 'not found' });
    }
    if (route === 'content' && m === 'PUT') {
      const b = JSON.parse(await readBody(req, 4e6));
      // a save must carry the whole site; anything partial would blank the missing parts, so refuse it
      const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
      const complete = isObj(b) && ['site', 'links', 'home', 'pages'].every(k => isObj(b[k])) && isObj(b.links.social) && isObj(b.links.download)
        && ['news', 'gameplay', 'rewards', 'drivers', 'faq'].every(k => Array.isArray(b[k]));
      if (!complete) return json(res, 400, { error: 'ข้อมูลไม่ครบ ระบบไม่บันทึกเพื่อป้องกันเนื้อหาหาย' });
      if (!session(req)) return json(res, 401, { error: 'unauthorized' });
      const saved = store.saveContent(b);
      return json(res, 200, saved);
    }
    // ---- visitor statistics (read only) ----
    if (route === 'analytics' && m === 'GET') {
      const today = analytics.dayOf(Date.now()), q = url.searchParams;
      const to = q.get('to') || today, from = q.get('from') || to;
      if (to > today) return json(res, 400, { error: 'ไม่สามารถดูวันที่ในอนาคต' });
      return json(res, 200, Object.assign(analytics.report(from, to), { today, keepDays: analytics.KEEP_DAYS }));
    }
    if (route === 'analytics/visits' && m === 'GET') {
      const today = analytics.dayOf(Date.now()), q = url.searchParams;
      const to = q.get('to') || today, from = q.get('from') || to;
      return json(res, 200, analytics.visits(from, to, { ip: String(q.get('ip') || '').slice(0, 64), limit: q.get('limit'), offset: q.get('offset'), bots: q.get('bots') === '1' }));
    }
    // ---- store URLs: the final addresses to type into App Store Connect / Play Console, and a check that they open ----
    if (route === 'urls' && m === 'GET') {
      const c = store.getContent(), base = String(c.site.url || '').trim().replace(/\/+$/, '');
      return json(res, 200, { base: SITE_URL_RE.test(base) ? base : '', items: render.LEGAL_ORDER.map(k => ({ key: k, label: render.legalLabel(c, k, false) || k, path: render.LEGAL_PATH[k], exists: render.pageExists(c, k), en: render.hasEnglish(c, k) })) });
    }
    if (route === 'urls/check' && m === 'POST') {
      const c = store.getContent(), base = String(c.site.url || '').trim().replace(/\/+$/, '');
      if (!/^https:\/\//i.test(base) || !SITE_URL_RE.test(base)) return json(res, 400, { error: 'ตั้ง "โดเมนหลัก" เป็น https://... ในตั้งค่า → เว็บไซต์ & SEO ก่อน' });
      if (linkCheckBusy || Date.now() - linkCheckLast < 10e3) return json(res, 429, { error: 'กำลังตรวจอยู่ หรือเพิ่งตรวจไป รอสักครู่' });
      linkCheckBusy = true;
      try {
        const urls = [];
        for (const k of render.LEGAL_ORDER) if (render.pageExists(c, k)) { urls.push([k, 'th', base + render.LEGAL_PATH[k]]); if (render.hasEnglish(c, k)) urls.push([k, 'en', base + '/en' + render.LEGAL_PATH[k]]); }
        const results = [];
        for (const [key, lang, u] of urls) results.push(Object.assign({ key, lang }, await linkcheck.check(u)));
        return json(res, 200, { results });
      } finally { linkCheckBusy = false; linkCheckLast = Date.now(); }
    }
    // ---- PageSpeed Insights: status/history, start a test, settings ----
    if (route === 'pagespeed' && m === 'GET') {
      const c = store.getContent();
      const pages = [['/', 'หน้าแรก']].concat(PAGES.map(k => ['/' + k, c.pages[k].navLabel || k]))
        .concat(c.news.filter(n => n.published).map(n => ['/news/' + encodeURIComponent(n.slug), 'ข่าว: ' + n.title]));
      return json(res, 200, Object.assign(psi.status(), { siteUrl: siteUrlFor('/', c) ? siteUrlFor('', c) : '', pages }));
    }
    if (route === 'pagespeed/run' && m === 'POST') {
      const b = JSON.parse(await readBody(req, 4096)) || {};
      const c = store.getContent();
      const strategy = b.strategy === 'desktop' ? 'desktop' : 'mobile';
      const p = typeof b.path === 'string' ? b.path : '/';
      const known = ['/'].concat(PAGES.map(k => '/' + k), c.news.filter(n => n.published).map(n => '/news/' + encodeURIComponent(n.slug)));
      if (!known.includes(p)) return json(res, 400, { error: 'ไม่พบหน้านี้' });
      const target = siteUrlFor(p, c);
      if (!target) return json(res, 400, { error: 'ตั้ง "โดเมนหลัก" ในตั้งค่า → เว็บไซต์ & SEO ก่อน (Google ตรวจได้เฉพาะเว็บที่ออนไลน์)' });
      if (!psi.start(strategy, p, target, 'manual')) return json(res, 409, { error: 'กำลังตรวจอยู่ รอให้เสร็จก่อน' });
      return json(res, 202, { ok: true });
    }
    if (route === 'pagespeed/settings' && m === 'POST') {
      const b = JSON.parse(await readBody(req, 4096)) || {};
      try { psi.saveSettings(b); } catch (e) { if (e.user) return json(res, 400, { error: e.message }); throw e; }
      return json(res, 200, psi.status());
    }
    if (route === 'media' && m === 'GET') return json(res, 200, { items: listMedia() });
    // raw file body; the type comes from Content-Type and must match the file's first bytes
    if (route === 'upload' && m === 'POST') {
      const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const t = UPLOAD_TYPES[type];
      if (!t) return json(res, 400, { error: 'รองรับเฉพาะรูป JPG, PNG, WEBP, GIF และวิดีโอ MP4, WEBM' });
      let buf;
      try { buf = await readRaw(req, t.max); } catch (e) { return json(res, e.code === 503 ? 503 : 413, { error: e.code === 503 ? 'Upload busy; retry later' : 'ไฟล์ใหญ่เกิน ' + t.max / 1e6 + 'MB' }); }
      if (buf.length < 12 || !t.sig(buf)) return json(res, 400, { error: 'ไฟล์เสียหายหรือไม่ตรงกับนามสกุล' });
      const name = Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex') + t.ext;
      if (!session(req)) return json(res, 401, { error: 'unauthorized' });
      const quotaError = locked(path.join(__dirname, 'data', 'uploads-quota'), () => {
      const maxStorage = Number(process.env.UPLOAD_QUOTA_BYTES) || 1024 * 1024 * 1024;
      const used = fs.readdirSync(UPLOADS).reduce((n, f) => { const st = fs.lstatSync(path.join(UPLOADS, f)); return n + (st.isFile() ? st.size : 0); }, 0);
      if (used + buf.length > maxStorage) return true;
      // uploaded media is public by nature: 0644, so a front web server (Plesk/nginx serving static files itself) running as another user can read it
      fs.writeFileSync(path.join(UPLOADS, name), buf, { flag: 'wx', mode: 0o644 });
      return false;
      });
      if (quotaError) return json(res, 413, { error: 'Upload storage quota exceeded' });
      return json(res, 200, { url: '/uploads/' + name });
    }
    // only files uploaded through the admin can be deleted; built-in /img files are protected
    if (route === 'media' && m === 'DELETE') {
      const name = path.basename(url.searchParams.get('name') || '');
      if (!name || !MEDIA_EXT[path.extname(name).toLowerCase()]) return json(res, 400, { error: 'ชื่อไฟล์ไม่ถูกต้อง' });
      const file = path.join(UPLOADS, name);
      if (!fs.existsSync(file)) return json(res, 404, { error: 'ไม่พบไฟล์' });
      fs.unlinkSync(file);
      return json(res, 200, { ok: true });
    }
    if (route === 'password' && m === 'POST') {
      // wrong "current password" guesses count toward the same lockout as the login form
      const who = ip(req);
      const b = JSON.parse(await readBody(req, 4096)) || {};
      const user = store.adminName(s.uid);
      if (!fails.reserve(who, user)) return json(res, 429, { error: 'Too many attempts; retry in 15 minutes' });
      if (!await store.checkPassword(s.uid, String(b.current || ''))) {
        return json(res, 400, { error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
      }
      const next = typeof b.next === 'string' ? b.next : '';
      if (next.length < 10 || next.length > 200) return json(res, 400, { error: 'รหัสผ่านใหม่ต้องยาว 10–200 ตัวอักษร' });
      store.setPassword(s.uid, next, s.version); fails.refund(who, user);
      // this account's other sessions end (its version changed); this browser gets a fresh one. Other admins stay signed in.
      sessions.delete(s.token);
      const token = crypto.randomBytes(32).toString('base64url');
      sessions.set(token, { uid: s.uid, exp: Date.now() + SESSION_MS, csrf: s.csrf, version: store.authVersion(s.uid), seen: Date.now() });
      const secure = (isHttps(req) || process.env.COOKIE_SECURE === '1') ? '; Secure' : '';
      return json(res, 200, { ok: true }, { 'Set-Cookie': `sid=${token}; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=${SESSION_MS / 1000}${secure}` });
    }
    // ---- own profile; the list of admins; the owner adds, removes and resets other admins (confirming with their own password) ----
    if (route === 'profile' && m === 'PUT') {
      const b = JSON.parse(await readBody(req, 4096)) || {};
      return json(res, 200, { me: store.setProfile(s.uid, b) });
    }
    if (route === 'admins' && m === 'GET') return json(res, 200, { items: store.listAdmins(), canManage: (store.profile(s.uid) || {}).role === 'owner' });
    const am = /^admins(?:\/([a-z0-9]{3,16})\/(remove|password))?$/.exec(route);
    if (am && m === 'POST') {
      if ((store.profile(s.uid) || {}).role !== 'owner') return json(res, 403, { error: 'เฉพาะเจ้าของระบบ (บัญชีแรก) เท่านั้นที่จัดการแอดมินได้' });
      const who = ip(req), b = JSON.parse(await readBody(req, 4096)) || {}, me = store.adminName(s.uid);
      if (!fails.reserve(who, me)) return json(res, 429, { error: 'Too many attempts; retry in 15 minutes' });
      if (!await store.checkPassword(s.uid, String(b.current || ''))) return json(res, 400, { error: 'รหัสผ่านของคุณไม่ถูกต้อง' });
      fails.refund(who, me);
      if (!am[1]) return json(res, 200, { admin: store.addAdmin(b) });
      if (am[2] === 'remove') { store.removeAdmin(am[1], s.uid); return json(res, 200, { ok: true }); }
      store.resetPassword(am[1], b.password, b.clear2fa === true); return json(res, 200, { ok: true });
    }
    // ---- two-step login (authenticator app): status, start, confirm, switch off ----
    // Changing it signs every other session out, so the browser doing it gets a fresh session straight away.
    if (route === '2fa' && m === 'GET') return json(res, 200, { enabled: store.totpEnabled(s.uid) });
    if (route.startsWith('2fa/') && m === 'POST') {
      const who = ip(req);
      const b = JSON.parse(await readBody(req, 4096)) || {};
      const fresh = () => {
        sessions.delete(s.token);
        const token = crypto.randomBytes(32).toString('base64url');
        sessions.set(token, { uid: s.uid, exp: Date.now() + SESSION_MS, csrf: s.csrf, version: store.authVersion(s.uid), seen: Date.now() });
        const secure = (isHttps(req) || process.env.COOKIE_SECURE === '1') ? '; Secure' : '';
        return { 'Set-Cookie': `sid=${token}; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=${SESSION_MS / 1000}${secure}` };
      };
      const me = store.adminName(s.uid);
      if (!fails.reserve(who, me)) return json(res, 429, { error: 'Too many attempts; retry in 15 minutes' });
      if (route === '2fa/begin') {
        if (store.totpEnabled(s.uid)) return json(res, 400, { error: 'เปิดใช้อยู่แล้ว' });
        if (!await store.checkPassword(s.uid, String(b.current || ''))) return json(res, 400, { error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
        const secret = totp.newSecret();
        pending2fa.set(s.token, { secret, exp: Date.now() + 10 * 60e3 });
        return json(res, 200, { secret, uri: totp.uri(secret, me, 'RAYCITY-M') });
      }
      if (route === '2fa/enable') {
        const p = pending2fa.get(s.token);
        if (!p || p.exp < Date.now()) return json(res, 400, { error: 'หมดเวลา เริ่มตั้งค่าใหม่อีกครั้ง' });
        if (!store.totpEnable(s.uid, p.secret, String(b.code || ''), s.version)) return json(res, 400, { error: 'รหัสไม่ถูกต้อง ตรวจว่านาฬิกาเครื่องตรงและลองรหัสใหม่' });
        pending2fa.delete(s.token); fails.refund(who, me);
        return json(res, 200, { ok: true }, fresh());
      }
      if (route === '2fa/disable') {
        if (!await store.checkPassword(s.uid, String(b.current || ''))) return json(res, 400, { error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
        if (!store.totpCheck(s.uid, String(b.code || ''))) return json(res, 400, { error: 'รหัสไม่ถูกต้อง' });
        store.totpDisable(s.uid, s.version); fails.refund(who, me);
        return json(res, 200, { ok: true }, fresh());
      }
    }
  } catch (e) {
    if (e.user) return json(res, 400, { error: e.message });
    if (![409, 413, 503].includes(e.code) && !(e instanceof SyntaxError)) console.error('admin api ' + route + ':', e.message);
    return json(res, [409, 413, 503].includes(e.code) ? e.code : 400, { error: e.code === 409 ? 'ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่ก่อนบันทึก' : e.code === 503 ? 'ระบบกำลังบันทึก กรุณาลองใหม่' : e.code === 413 ? 'ข้อมูลใหญ่เกินไป' : 'ข้อมูลไม่ถูกต้อง' });
  }
  return json(res, 404, { error: 'not found' });
}

// ---- visitor statistics: one anonymous first-party cookie (vid) tells returning visitors apart ----
// consent given in the cookie banner: true (analytics ok), false (declined), null (no valid choice yet)
const isOn = v => v === true || v === 'true' || v === '1';
const consentVersion = c => String((c.cookies || {}).version || '1').replace(/[^\w-]/g, '').slice(0, 12) || '1';
function consentOf(req, c) {
  if (!isOn((c.cookies || {}).enabled)) return true; // banner switched off in the admin: no consent step at all
  const m = /^([\w-]{1,12})\.([01])$/.exec(cookies(req).rc_consent || '');
  return !m || m[1] !== consentVersion(c) ? null : m[2] === '1';
}
const cookieAttrs = req => `Path=/; HttpOnly; SameSite=Lax${isHttps(req) || process.env.COOKIE_SECURE === '1' ? '; Secure' : ''}`;
const clearVid = req => `vid=; Max-Age=0; ${cookieAttrs(req)}`;

// ---- visitor statistics. With consent: id cookie (vid) + full IP. Without: counted anonymously (masked IP, no cookie), or not at all ----
function track(req, extra, p, url, c) {
  if (req.method !== 'GET') return;
  if (/prefetch|prerender/i.test(String(req.headers['sec-purpose'] || req.headers.purpose || ''))) return;
  const ua = String(req.headers['user-agent'] || '');
  let vid = '', isNew = false, anon = false;
  const out = [];
  if (!analytics.parseUA(ua).bot) {
    if (consentOf(req, c) === true) {
      const ck = cookies(req).vid;
      vid = /^[0-9a-f]{24}$/.test(ck || '') ? ck : '';
      if (!vid) {
        vid = crypto.randomBytes(12).toString('hex'); isNew = true;
        out.push(`vid=${vid}; Max-Age=31536000; ${cookieAttrs(req)}`);
      }
    } else {
      if (cookies(req).vid) out.push(clearVid(req)); // the id cookie must not outlive a "no"
      anon = true;
    }
  }
  if (out.length) extra['Set-Cookie'] = out.length === 1 ? out[0] : out;
  if (anon && !isOn((c.cookies || {}).anonymousCount)) return; // admin chose: count nobody without consent
  analytics.record({ t: Date.now(), ip: ip(req), path: p, vid, isNew, anon, ua, ref: req.headers.referer, host: (fwd(req, 'x-forwarded-host') || [])[0] || req.headers.host, utm: url.searchParams.get('utm_source') });
}

// One address cannot flood the site: a generous per-minute cap on requests (a page and all its files is about 30).
// Local proxies without a forwarded address are not limited, or everyone behind them would share one allowance.
const RATE_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN) || 900;
const rate = new Map();
// a local proxy sends visitor addresses but TRUST_PROXY is off: say so once, since every visitor then looks like one address
let proxyWarned = false;
function warnProxy(req) {
  if (proxyWarned || process.env.TRUST_PROXY === '1' || !req.headers['x-forwarded-for']) return;
  const a = peer(req); if (a !== '' && !LOOPBACK.has(a)) return;
  proxyWarned = true;
  console.warn('WARNING: requests arrive through a local proxy with X-Forwarded-For, but TRUST_PROXY is not 1. Login lockouts and the request limit cannot tell visitors apart. Set TRUST_PROXY=1 (see README).');
}
function tooMany(req) {
  warnProxy(req);
  const who = ip(req);
  if (!who || LOOPBACK.has(who)) return false;
  const now = Date.now();
  let r = rate.get(who);
  if (!r || now - r.t >= 60e3) { if (rate.size > 50000) rate.clear(); r = { t: now, n: 0 }; rate.set(who, r); }
  return ++r.n > RATE_PER_MIN;
}

const server = http.createServer(async (req, res) => {
  try {
    peer(req); // remember who connected before anything async happens
    for (const [k, v] of Object.entries(BASE_HEADERS)) res.setHeader(k, v);
    if (isHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    if (!req.url.startsWith('/') || req.url.startsWith('//') || /[\\\x00-\x20]/.test(req.url)) return send(res, 400, 'Bad request', 'text/plain');
    const url = new URL(req.url, 'http://x');
    if (tooMany(req)) return send(res, 429, 'Too many requests', 'text/plain', { 'Retry-After': '60' });
    if (url.pathname.startsWith('/admin/api/') && !['GET', 'HEAD'].includes(req.method)) {
      const origin = req.headers.origin;
      const wantHost = (fwd(req, 'x-forwarded-host') || [])[0] || req.headers.host, kp = knownProto(req);
      let sameOrigin = !origin;
      if (origin) { try { const o = new URL(origin); sameOrigin = o.host === wantHost && (!kp || o.protocol === kp + ':'); } catch (e) { sameOrigin = false; } }
      if (req.headers['sec-fetch-site'] === 'cross-site' || !sameOrigin) return json(res, 403, { error: 'origin' });
    }
    const configured = String(store.getContent().site.url || '').trim().replace(/\/+$/, '');
    if (SITE_URL_RE.test(configured || '') && new URL(configured).protocol === 'https:' && knownProto(req) === 'http') {
      res.writeHead(308, { Location: new URL(configured).origin + url.pathname + url.search }); return res.end();
    }
    const p = url.pathname;

    // ---------- admin (the only place that can change anything) ----------
    if (p === '/admin' || p.startsWith('/admin/')) {
      const sec = { 'Content-Security-Policy': ADMIN_CSP, 'X-Frame-Options': 'DENY', 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store', 'Cross-Origin-Resource-Policy': 'same-origin' };
      if (p.startsWith('/admin/api/')) { for (const [k, v] of Object.entries(sec)) res.setHeader(k, v); return await adminApi(req, res, url); }
      if (p === '/admin' || p === '/admin/') return send(res, 200, fs.readFileSync(path.join(ADMIN_DIR, 'index.html')), 'text/html; charset=utf-8', sec);
      if (p === '/admin/admin.js' || p === '/admin/admin.css') return send(res, 200, fs.readFileSync(path.join(ADMIN_DIR, p.slice(7))), MIME[path.extname(p)], sec);
      return send(res, 404, 'Not found', 'text/plain', sec);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');

    const c = store.getContent(), base = baseUrl(req, c);
    const moved = to => { res.writeHead(301, { Location: to, 'Cache-Control': 'public, max-age=3600' }); res.end(); };

    // ---------- one address per page (avoids duplicate content in Google) ----------
    // www <-> bare domain and http -> https, only when the admin has set the main domain
    const canon = SITE_URL_RE.test(String(c.site.url || '').replace(/\/+$/, '')) ? new URL(c.site.url) : null;
    if (canon) {
      const host = String((fwd(req, 'x-forwarded-host') || [])[0] || req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
      const ch = canon.hostname.toLowerCase();
      const wwwTwin = host === 'www.' + ch || 'www.' + host === ch;
      const plainHttp = host === ch && canon.protocol === 'https:' && (fwd(req, 'x-forwarded-proto') || [])[0] === 'http';
      if (wwwTwin || plainHttp) return moved(canon.origin + p + url.search);
    }
    if (p === '/index.html') return moved('/' + url.search);
    // (leading slashes are collapsed too: "//evil.com/" must never become a redirect to another site)
    if (p.length > 1 && p.endsWith('/')) return moved('/' + p.replace(/^\/+|\/+$/g, '') + url.search);

    const ga = GA_RE.test(c.site.ga4 || '');
    // the member portal may talk to the API address set in the admin (and only that address)
    const ao = [portal.enabled(c) ? portal.apiOrigin(c) : '', prereg.enabled(c) ? prereg.apiOrigin(c) : ''].filter((o, i, a) => o && a.indexOf(o) === i).join(' ');
    const page = (html, code) => {
      const csp = ga ? GA_CSP : PUBLIC_CSP;
      const extra = ga || ao ? { 'Content-Security-Policy': ao ? csp.replace("connect-src 'self'", "connect-src 'self' " + ao) : csp } : {};
      if (!code || code === 200) { try { track(req, extra, p, url, c); } catch (e) { console.error('track:', e.message); } }
      return sendPage(req, res, code || 200, html, extra);
    };

    // ---------- maintenance: the whole public site is closed until an admin opens it again ----------
    // the admin's "preview" button: shows the maintenance page without closing the site
    if (p === '/' && url.searchParams.get('preview') === 'maintenance') return sendPage(req, res, 200, render.maintenance(c, base, 'th'), { 'Cache-Control': 'no-store' });
    if (isOn(c.site.maintenance) && (!/\.[a-z0-9]+$/i.test(p) || p === '/sitemap.xml') && p !== '/api/cc') {
      const html = render.maintenance(c, base, /^\/en(\/|$)/.test(p) ? 'en' : 'th');
      return sendPage(req, res, 503, html, { 'Retry-After': '3600', 'Cache-Control': 'no-store' });
    }

    // ---------- public pages ----------
    // "/home" is an internal alias of "/" for hosts (e.g. Plesk nginx) that never forward the bare root to Node
    // ?loader=preview[&style=tacho] shows a loading-screen design even while it's switched off (admin preview buttons)
    if (p === '/' || p === '/home') {
      const pv = url.searchParams.get('loader') === 'preview' ? (LOADER_STYLES.includes(url.searchParams.get('style')) ? url.searchParams.get('style') : (c.site.loaderStyle || 'launcher')) : null;
      return page(render.home(c, base, { loaderPreview: pv }));
    }
    if (['/rewards', '/gameplay', '/drivers', '/news', '/faq', '/privacy', '/terms', '/support'].includes(p)) return page(render[p.slice(1)](c, base));
    // member portal: only exists while it is switched on in the admin (and registration only while it is open)
    if (portal.PATHS[p]) {
      const key = portal.PATHS[p];
      return portal.enabled(c) && (key !== 'register' || portal.registerOpen(c)) && (key !== 'forgot' || portal.forgotOpen(c)) && (key !== 'topup' || portal.topupOn(c)) ? page(render.account(c, base, key)) : page(render.notFound(c, base), 404);
    }
    // the English site: same pages and data, English twin fields where they are filled in
    if (p === '/en' || /^\/en\/(rewards|gameplay|drivers|news)$/.test(p)) {
      const lc = render.localize(c);
      return page(p === '/en' ? render.home(lc, base, {}) : render[p.slice(4)](lc, base));
    }
    if (p.startsWith('/en/news/')) {
      let slug; try { slug = decodeURIComponent(p.slice(9)).replace(/\/$/, ''); } catch (e) { return page(render.notFound(c, base), 404); }
      const lc = render.localize(c), n = lc.news.find(x => x.published && x.slug === slug);
      return n ? page(render.article(lc, base, n)) : page(render.notFound(c, base), 404);
    }
    // English versions of the legal pages (same content, lang="en", linked with hreflang)
    if (p === '/en/privacy' || p === '/en/terms' || p === '/en/support' || p === '/en/faq' || p === '/en/delete-account' || p === '/en/odds') {
      const key = p === '/en/delete-account' ? 'delete' : p.slice(4);
      return render.hasEnglish(c, key) ? page(render[key + 'En'](c, base)) : page(render.notFound(c, base), 404);
    }
    // account deletion + loot-box odds: exist only once they have a title and text in the admin
    if (p === '/delete-account' || p === '/odds') {
      const key = p === '/odds' ? 'odds' : 'delete';
      const pg = c.pages[key] || {};
      return pg.h1 && String(pg.body || '').trim() ? page(render[key](c, base)) : page(render.notFound(c, base), 404);
    }
    // called by the cookie banner right after a "no": drops the id cookie straight away (JavaScript can't, it is HttpOnly)
    if (p === '/api/cc') {
      const hd = { 'Cache-Control': 'no-store' };
      if (consentOf(req, c) !== true && cookies(req).vid) hd['Set-Cookie'] = clearVid(req);
      res.writeHead(204, hd); return res.end();
    }
    if (p.startsWith('/news/')) {
      let slug; try { slug = decodeURIComponent(p.slice(6)).replace(/\/$/, ''); } catch (e) { return page(render.notFound(c, base), 404); }
      const n = c.news.find(x => x.published && x.slug === slug);
      return n ? page(render.article(c, base, n)) : page(render.notFound(c, base), 404);
    }
    if (p === '/sitemap.xml') return send(res, 200, render.sitemap(c, base, store.savedAt()), MIME['.xml'], { 'Cache-Control': 'no-cache' });
    // where security researchers can report a problem (RFC 9116); only published when a contact address is set in the admin
    if (p === '/.well-known/security.txt') {
      const ct = c.contact || {}, mail = [ct.reportEmail, ct.email].find(v => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(v || '')));
      if (!mail) return page(render.notFound(c, base), 404);
      const exp = new Date(Date.now() + 365 * 86400e3).toISOString().replace(/\.\d+Z$/, 'Z');
      return send(res, 200, `Contact: mailto:${mail}\nExpires: ${exp}\nPreferred-Languages: th, en\nCanonical: ${base}/.well-known/security.txt\n`, 'text/plain; charset=utf-8', { 'Cache-Control': 'public, max-age=86400' });
    }
    if (p === '/robots.txt') return send(res, 200, render.robots(base), MIME['.txt'], { 'Cache-Control': 'public, max-age=3600' });

    // ---------- static files ----------
    if (/\.[a-z0-9]+$/i.test(p)) return serveStatic(req, res, PUBLIC, p, cacheFor(p, url));
    return page(render.notFound(c, base), 404);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, e.code === 503 ? 503 : 500, e.code === 503 ? 'Storage busy; retry later' : 'Server error', 'text/plain');
    else res.destroy();
  }
});

setInterval(() => {
  const t = Date.now();
  try { sessions.prune(); } catch (e) {}
  try { fails.prune(); } catch (e) {}
  for (const [k, v] of pending2fa) if (v.exp < t) pending2fa.delete(k);
}, 600e3).unref();
// daily PageSpeed auto-check (only does anything when switched on in the admin)
setInterval(() => { try { psi.autoTick(p => siteUrlFor(p, store.getContent())); } catch (e) { console.error('pagespeed auto:', e.message); } }, 300e3).unref();
// a stray error must never take the whole site down
process.on('unhandledRejection', e => console.error('unhandled:', e));
// drop clients that send headers or bodies too slowly (slowloris-style)
server.maxHeadersCount = 100;
server.maxRequestsPerSocket = 1000;
server.setTimeout(30e3, socket => socket.destroy());
server.headersTimeout = 20e3;
server.requestTimeout = 300e3;

const created = store.ensureAdmin();
server.listen(PORT, () => {
  console.log(`Site:   http://localhost:${PORT}/`);
  console.log(`Admin:  http://localhost:${PORT}/admin`);
  if (created) {
    console.log('\n=== Admin account created (shown once) ===');
    console.log('user:    ' + created.user);
    console.log(created.password ? 'password: ' + created.password : 'password: (from ADMIN_PASSWORD)');
    console.log('Change it after the first login.\n');
  }
});

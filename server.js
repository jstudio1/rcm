// RAYCITY-M website: server-rendered public pages + admin-only back office. No npm dependencies.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./lib/store');
const { render } = require('./lib/render');

const PORT = +process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const ADMIN_DIR = path.join(__dirname, 'admin');
const UPLOADS = path.join(PUBLIC, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8' };
// uploadable media: extension, size limit, and a check on the file's first bytes
const UPLOAD_TYPES = {
  'image/jpeg': { ext: '.jpg', max: 10e6, sig: b => b[0] === 0xff && b[1] === 0xd8 },
  'image/png': { ext: '.png', max: 10e6, sig: b => b.slice(0, 4).toString('hex') === '89504e47' },
  'image/webp': { ext: '.webp', max: 10e6, sig: b => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' },
  'image/gif': { ext: '.gif', max: 10e6, sig: b => b.slice(0, 4).toString() === 'GIF8' },
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
    for (const name of names) {
      const kind = MEDIA_EXT[path.extname(name).toLowerCase()];
      if (!kind) continue;
      try {
        const st = fs.statSync(path.join(dir, name));
        if (st.isFile()) out.push({ url: '/' + prefix + '/' + name, name, kind, size: st.size, time: st.mtimeMs, deletable: prefix === 'uploads' });
      } catch (e) {}
    }
  }
  return out.sort((a, b) => b.time - a.time);
}

const sessions = new Map(); // token -> { exp, csrf }
const fails = new Map();    // ip -> { n, until }
const SESSION_MS = 8 * 3600e3;

// X-Forwarded-* headers are only believed when they come from a reverse proxy on this machine
// (e.g. Plesk nginx), or when TRUST_PROXY=1. Anyone else could fake them.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const fromProxy = req => process.env.TRUST_PROXY === '1' || LOOPBACK.has(req.socket.remoteAddress);
const fwd = (req, name) => fromProxy(req) && req.headers[name] ? String(req.headers[name]).split(',').map(s => s.trim()) : null;
const isHttps = req => !!req.socket.encrypted || (fwd(req, 'x-forwarded-proto') || [])[0] === 'https';
const HOST_RE = /^(?:[a-z0-9-]+(?:\.[a-z0-9-]+)*|\[[0-9a-f:.]+\])(?::\d{1,5})?$/i;
const SITE_URL_RE = /^https?:\/\/(?:[a-z0-9-]+(?:\.[a-z0-9-]+)*|\[[0-9a-f:.]+\])(?::\d{1,5})?$/i;
const baseUrl = (req, c) => {
  const set = String(c.site.url || '').trim().replace(/\/+$/, '');
  if (SITE_URL_RE.test(set)) return set;
  // no domain set in admin: fall back to the request's host, but only if it looks like a real host name
  const host = (fwd(req, 'x-forwarded-host') || [])[0] || req.headers.host || '';
  return (isHttps(req) ? 'https' : 'http') + '://' + (HOST_RE.test(host) ? host.toLowerCase() : 'localhost');
};
// client address for login rate limiting; behind a local proxy, the last X-Forwarded-For entry is the one it added
const ip = req => { const f = fwd(req, 'x-forwarded-for'); return (f && f[f.length - 1]) || req.socket.remoteAddress || ''; };
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('=')).filter(p => p[0]).map(([k, ...v]) => [k, v.join('=')]));

function send(res, code, body, type, extra) {
  res.writeHead(code, Object.assign({
    'Content-Type': type || 'text/html; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  }, extra || {}));
  res.end(body);
}
const json = (res, code, obj, extra) => send(res, code, JSON.stringify(obj), 'application/json; charset=utf-8', Object.assign({ 'Cache-Control': 'no-store' }, extra));

function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    let n = 0; const parts = [];
    req.on('data', ch => { n += ch.length; if (n > limit) { reject(Object.assign(new Error('too large'), { code: 413 })); req.destroy(); } else parts.push(ch); });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}
const readBody = async (req, limit) => (await readRaw(req, limit)).toString('utf8');

function session(req) {
  const t = cookies(req).sid;
  const s = t && sessions.get(t);
  if (!s) return null;
  if (s.exp < Date.now()) { sessions.delete(t); return null; }
  return Object.assign({ token: t }, s);
}

// supports byte ranges so videos can seek and play on iPhone/Safari
function serveFile(req, res, file, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found', 'text/plain');
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const hd = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': cache || 'public, max-age=300', 'X-Content-Type-Options': 'nosniff', 'Last-Modified': st.mtime.toUTCString() };
    const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (r && (r[1] || r[2])) {
      let a = r[1] ? +r[1] : Math.max(0, st.size - +r[2]), b = r[1] && r[2] ? Math.min(+r[2], st.size - 1) : st.size - 1;
      if (a >= st.size || a > b) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, Object.assign(hd, { 'Content-Range': `bytes ${a}-${b}/${st.size}`, 'Content-Length': b - a + 1 }));
      return req.method === 'HEAD' ? res.end() : fs.createReadStream(file, { start: a, end: b }).pipe(res);
    }
    res.writeHead(200, Object.assign(hd, { 'Content-Length': st.size }));
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}
function serveStatic(req, res, root, rel, cache) {
  let p; try { p = decodeURIComponent(rel); } catch (e) { return send(res, 400, 'Bad request', 'text/plain'); }
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root + path.sep) || p.includes('\0')) return send(res, 403, 'Forbidden', 'text/plain');
  // only known web file types are served (no .rar/.zip/.psd or other stray files left in public/)
  if (!MIME[path.extname(file).toLowerCase()] || /[\\/]\./.test(p)) return send(res, 404, 'Not found', 'text/plain');
  // uploaded files can never run as a page, even if a file is crafted to look like HTML
  if (p.startsWith('/uploads/')) res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  serveFile(req, res, file, cache);
}

const ADMIN_CSP = "default-src 'self'; img-src 'self' data: https:; media-src 'self' https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
// public pages: scripts only from this site, no plugins, can't be framed by other sites
const PUBLIC_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; media-src 'self' https:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'";
const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy': PUBLIC_CSP
};

async function adminApi(req, res, url) {
  const route = url.pathname.slice('/admin/api/'.length);
  const m = req.method;
  if (route === 'login' && m === 'POST') {
    const who = ip(req);
    const f = fails.get(who) || { n: 0, until: 0, last: 0 };
    if (f.until > Date.now()) return json(res, 429, { error: 'ลองผิดหลายครั้งเกินไป กรุณารอ 15 นาที' });
    let b; try { b = JSON.parse(await readBody(req, 4096)); } catch (e) { return json(res, 400, { error: 'bad request' }); }
    if (!b || typeof b !== 'object' || typeof b.user !== 'string' || typeof b.password !== 'string') return json(res, 400, { error: 'bad request' });
    if (await store.checkLogin(b.user, b.password)) {
      fails.delete(who);
      const token = crypto.randomBytes(32).toString('base64url'), csrf = crypto.randomBytes(24).toString('base64url');
      sessions.set(token, { exp: Date.now() + SESSION_MS, csrf });
      const secure = (isHttps(req) || process.env.COOKIE_SECURE) ? '; Secure' : '';
      return json(res, 200, { ok: true }, { 'Set-Cookie': `sid=${token}; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=${SESSION_MS / 1000}${secure}` });
    }
    f.n++; f.last = Date.now();
    if (f.n >= 5) { f.until = Date.now() + 15 * 60e3; f.n = 0; }
    fails.set(who, f);
    return json(res, 401, { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }

  const s = session(req);
  if (!s) return json(res, 401, { error: 'unauthorized' });
  const tok = String(req.headers['x-csrf-token'] || '');
  if (m !== 'GET' && (tok.length !== s.csrf.length || !crypto.timingSafeEqual(Buffer.from(tok), Buffer.from(s.csrf)))) return json(res, 403, { error: 'csrf' });

  try {
    if (route === 'me' && m === 'GET') return json(res, 200, { csrf: s.csrf });
    if (route === 'logout' && m === 'POST') { sessions.delete(s.token); return json(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=0' }); }
    if (route === 'content' && m === 'GET') return json(res, 200, store.getContent());
    if (route === 'history' && m === 'GET') return json(res, 200, { items: store.listHistory() });
    if (route.startsWith('history/') && m === 'GET') {
      const old = store.readHistory(decodeURIComponent(route.slice(8)));
      return old ? json(res, 200, old) : json(res, 404, { error: 'not found' });
    }
    if (route === 'content' && m === 'PUT') {
      const saved = store.saveContent(JSON.parse(await readBody(req, 4e6)));
      return json(res, 200, saved);
    }
    if (route === 'media' && m === 'GET') return json(res, 200, { items: listMedia() });
    // raw file body; the type comes from Content-Type and must match the file's first bytes
    if (route === 'upload' && m === 'POST') {
      const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const t = UPLOAD_TYPES[type];
      if (!t) return json(res, 400, { error: 'รองรับเฉพาะรูป JPG, PNG, WEBP, GIF และวิดีโอ MP4, WEBM' });
      let buf;
      try { buf = await readRaw(req, t.max); } catch (e) { return json(res, 413, { error: 'ไฟล์ใหญ่เกิน ' + t.max / 1e6 + 'MB' }); }
      if (buf.length < 12 || !t.sig(buf)) return json(res, 400, { error: 'ไฟล์เสียหายหรือไม่ตรงกับนามสกุล' });
      const name = Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex') + t.ext;
      fs.writeFileSync(path.join(UPLOADS, name), buf);
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
      const who = ip(req), f = fails.get(who) || { n: 0, until: 0, last: 0 };
      if (f.until > Date.now()) return json(res, 429, { error: 'ลองผิดหลายครั้งเกินไป กรุณารอ 15 นาที' });
      const b = JSON.parse(await readBody(req, 4096)) || {};
      const user = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'admin.json'), 'utf8')).user;
      if (!await store.checkLogin(user, String(b.current || ''))) {
        f.n++; f.last = Date.now(); if (f.n >= 5) { f.until = Date.now() + 15 * 60e3; f.n = 0; } fails.set(who, f);
        return json(res, 400, { error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
      }
      const next = typeof b.next === 'string' ? b.next : '';
      if (next.length < 10 || next.length > 200) return json(res, 400, { error: 'รหัสผ่านใหม่ต้องยาว 10–200 ตัวอักษร' });
      store.setPassword(next);
      for (const k of sessions.keys()) if (k !== s.token) sessions.delete(k);
      return json(res, 200, { ok: true });
    }
  } catch (e) {
    return json(res, e.code === 413 ? 413 : 400, { error: e.code === 413 ? 'ข้อมูลใหญ่เกินไป' : 'ข้อมูลไม่ถูกต้อง' });
  }
  return json(res, 404, { error: 'not found' });
}

const server = http.createServer(async (req, res) => {
  try {
    for (const [k, v] of Object.entries(BASE_HEADERS)) res.setHeader(k, v);
    if (isHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;

    // ---------- admin (the only place that can change anything) ----------
    if (p === '/admin' || p.startsWith('/admin/')) {
      const sec = { 'Content-Security-Policy': ADMIN_CSP, 'X-Frame-Options': 'DENY', 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' };
      if (p.startsWith('/admin/api/')) { for (const [k, v] of Object.entries(sec)) res.setHeader(k, v); return await adminApi(req, res, url); }
      if (p === '/admin' || p === '/admin/') return send(res, 200, fs.readFileSync(path.join(ADMIN_DIR, 'index.html')), 'text/html; charset=utf-8', sec);
      if (p === '/admin/admin.js' || p === '/admin/admin.css') return send(res, 200, fs.readFileSync(path.join(ADMIN_DIR, p.slice(7))), MIME[path.extname(p)], sec);
      return send(res, 404, 'Not found', 'text/plain', sec);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');

    const c = store.getContent(), base = baseUrl(req, c);
    const page = (html, code) => send(res, code || 200, html, 'text/html; charset=utf-8', { 'Cache-Control': 'no-cache' });

    // ---------- public pages ----------
    // "/home" is an internal alias of "/" for hosts (e.g. Plesk nginx) that never forward the bare root to Node
    if (p === '/' || p === '/home') return page(render.home(c, base));
    if (['/rewards', '/gameplay', '/drivers', '/news', '/faq'].includes(p)) return page(render[p.slice(1)](c, base));
    if (p.startsWith('/news/')) {
      let slug; try { slug = decodeURIComponent(p.slice(6)).replace(/\/$/, ''); } catch (e) { return page(render.notFound(c, base), 404); }
      const n = c.news.find(x => x.published && x.slug === slug);
      return n ? page(render.article(c, base, n)) : page(render.notFound(c, base), 404);
    }
    if (p === '/sitemap.xml') return send(res, 200, render.sitemap(c, base), MIME['.xml'], { 'Cache-Control': 'no-cache' });
    if (p === '/robots.txt') return send(res, 200, render.robots(base), MIME['.txt']);

    // ---------- static files ----------
    if (/\.[a-z0-9]+$/i.test(p)) {
      const long = p.startsWith('/img/') || p.startsWith('/uploads/');
      return serveStatic(req, res, PUBLIC, p, long ? 'public, max-age=86400' : 'no-cache');
    }
    return page(render.notFound(c, base), 404);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, 'Server error', 'text/plain');
  }
});

setInterval(() => {
  const t = Date.now();
  for (const [k, v] of sessions) if (v.exp < t) sessions.delete(k);
  for (const [k, v] of fails) if (v.until < t && v.last < t - 3600e3) fails.delete(k);
}, 600e3).unref();
// a stray error must never take the whole site down
process.on('unhandledRejection', e => console.error('unhandled:', e));
// drop clients that send headers or bodies too slowly (slowloris-style)
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

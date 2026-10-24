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

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8' };
const IMG_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

const sessions = new Map(); // token -> { exp, csrf }
const fails = new Map();    // ip -> { n, until }
const SESSION_MS = 8 * 3600e3;

const baseUrl = (req, c) => {
  if (c.site.url && /^https?:\/\//.test(c.site.url)) return c.site.url.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  return proto + '://' + (req.headers['x-forwarded-host'] || req.headers.host || 'localhost');
};
const ip = req => req.socket.remoteAddress || '';
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

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let n = 0; const parts = [];
    req.on('data', ch => { n += ch.length; if (n > limit) { reject(Object.assign(new Error('too large'), { code: 413 })); req.destroy(); } else parts.push(ch); });
    req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
    req.on('error', reject);
  });
}

function session(req) {
  const t = cookies(req).sid;
  const s = t && sessions.get(t);
  if (!s) return null;
  if (s.exp < Date.now()) { sessions.delete(t); return null; }
  return Object.assign({ token: t }, s);
}

function serveFile(res, file, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found', 'text/plain');
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': cache || 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(file).pipe(res);
  });
}
function serveStatic(res, root, rel, cache) {
  let p; try { p = decodeURIComponent(rel); } catch (e) { return send(res, 400, 'Bad request', 'text/plain'); }
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root + path.sep) || p.includes('\0')) return send(res, 403, 'Forbidden', 'text/plain');
  serveFile(res, file, cache);
}

const ADMIN_CSP = "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; frame-ancestors 'none'; form-action 'self'";

async function adminApi(req, res, url) {
  const route = url.pathname.slice('/admin/api/'.length);
  const m = req.method;
  if (route === 'login' && m === 'POST') {
    const f = fails.get(ip(req)) || { n: 0, until: 0 };
    if (f.until > Date.now()) return json(res, 429, { error: 'ลองผิดหลายครั้งเกินไป กรุณารอ 15 นาที' });
    let b; try { b = JSON.parse(await readBody(req, 4096)); } catch (e) { return json(res, 400, { error: 'bad request' }); }
    if (store.checkLogin(b.user || '', b.password || '')) {
      fails.delete(ip(req));
      const token = crypto.randomBytes(32).toString('base64url'), csrf = crypto.randomBytes(24).toString('base64url');
      sessions.set(token, { exp: Date.now() + SESSION_MS, csrf });
      const secure = (req.headers['x-forwarded-proto'] === 'https' || process.env.COOKIE_SECURE) ? '; Secure' : '';
      return json(res, 200, { ok: true }, { 'Set-Cookie': `sid=${token}; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=${SESSION_MS / 1000}${secure}` });
    }
    f.n++; if (f.n >= 5) { f.until = Date.now() + 15 * 60e3; f.n = 0; }
    fails.set(ip(req), f);
    return json(res, 401, { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }

  const s = session(req);
  if (!s) return json(res, 401, { error: 'unauthorized' });
  if (m !== 'GET' && req.headers['x-csrf-token'] !== s.csrf) return json(res, 403, { error: 'csrf' });

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
    if (route === 'upload' && m === 'POST') {
      const b = JSON.parse(await readBody(req, 14e6));
      const mm = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(b.data || '');
      if (!mm) return json(res, 400, { error: 'รองรับเฉพาะไฟล์ JPG, PNG, WEBP, GIF' });
      const buf = Buffer.from(mm[2], 'base64');
      if (buf.length > 10e6) return json(res, 413, { error: 'ไฟล์ใหญ่เกิน 10MB' });
      const name = Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex') + IMG_EXT[mm[1]];
      fs.writeFileSync(path.join(UPLOADS, name), buf);
      return json(res, 200, { url: '/uploads/' + name });
    }
    if (route === 'password' && m === 'POST') {
      const b = JSON.parse(await readBody(req, 4096));
      const user = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'admin.json'), 'utf8')).user;
      if (!store.checkLogin(user, b.current || '')) return json(res, 400, { error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
      if (String(b.next || '').length < 10) return json(res, 400, { error: 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 10 ตัวอักษร' });
      store.setPassword(String(b.next));
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
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;

    // ---------- admin (the only place that can change anything) ----------
    if (p === '/admin' || p.startsWith('/admin/')) {
      const sec = { 'Content-Security-Policy': ADMIN_CSP, 'X-Frame-Options': 'DENY', 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' };
      if (p.startsWith('/admin/api/')) return adminApi(req, res, url);
      if (p === '/admin' || p === '/admin/') return send(res, 200, fs.readFileSync(path.join(ADMIN_DIR, 'index.html')), 'text/html; charset=utf-8', sec);
      if (p === '/admin/admin.js' || p === '/admin/admin.css') return send(res, 200, fs.readFileSync(path.join(ADMIN_DIR, p.slice(7))), MIME[path.extname(p)], sec);
      return send(res, 404, 'Not found', 'text/plain', sec);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');

    const c = store.getContent(), base = baseUrl(req, c);
    const page = (html, code) => send(res, code || 200, html, 'text/html; charset=utf-8', { 'Cache-Control': 'no-cache' });

    // ---------- public pages ----------
    if (p === '/') return page(render.home(c, base));
    if (['/rewards', '/gameplay', '/drivers', '/news', '/faq'].includes(p)) return page(render[p.slice(1)](c, base));
    if (p.startsWith('/news/')) {
      const slug = decodeURIComponent(p.slice(6)).replace(/\/$/, '');
      const n = c.news.find(x => x.published && x.slug === slug);
      return n ? page(render.article(c, base, n)) : page(render.notFound(c, base), 404);
    }
    if (p === '/sitemap.xml') return send(res, 200, render.sitemap(c, base), MIME['.xml'], { 'Cache-Control': 'no-cache' });
    if (p === '/robots.txt') return send(res, 200, render.robots(base), MIME['.txt']);

    // ---------- static files ----------
    if (/\.[a-z0-9]+$/i.test(p)) {
      const long = p.startsWith('/img/') || p.startsWith('/uploads/');
      return serveStatic(res, PUBLIC, p, long ? 'public, max-age=86400' : 'no-cache');
    }
    return page(render.notFound(c, base), 404);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, 'Server error', 'text/plain');
  }
});

setInterval(() => { const t = Date.now(); for (const [k, v] of sessions) if (v.exp < t) sessions.delete(k); }, 600e3).unref();

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

// Behind a reverse proxy (Plesk nginx etc.): HTTPS redirect must never loop, and admin login must work over https.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const source = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(process.env.RCM_TEST_TMP || os.tmpdir(), 'rcm-proxy-'));
for (const f of ['server.js', 'lib', 'admin', 'views']) fs.cpSync(path.join(source, f), path.join(tmp, f), { recursive: true });
fs.mkdirSync(path.join(tmp, 'public', 'uploads'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'public', 'img'));
fs.writeFileSync(path.join(tmp, 'public', 'style.css'), 'body{}');
fs.mkdirSync(path.join(tmp, 'data'));
const content = require(path.join(tmp, 'lib/seed'))();
content.site.url = 'https://example.com';
fs.writeFileSync(path.join(tmp, 'data/content.json'), JSON.stringify(content));

const port = 23000 + Math.floor(Math.random() * 15000), base = 'http://127.0.0.1:' + port;
const child = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), ADMIN_PASSWORD: 'Proxy-test-password-12345', TRUST_PROXY: '1', COOKIE_SECURE: '1' } });
let logs = ''; child.stdout.on('data', b => (logs += b)); child.stderr.on('data', b => (logs += b));
after(() => child.kill());
// node's fetch will not let a test set the Host header, plain http.request does
const raw = (method, p, headers = {}, body) => new Promise((resolve, reject) => {
  const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: { Host: 'example.com', ...headers } }, res => { const parts = []; res.on('data', c => parts.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: { get: k => res.headers[k.toLowerCase()] || null }, text: Buffer.concat(parts).toString() })); });
  r.on('error', reject); r.end(body);
});
const get = (p, headers = {}) => raw('GET', p, headers);

test('reverse proxy', async t => {
  for (let i = 0; i < 80; i++) { try { await fetch(base + '/robots.txt'); break; } catch { await new Promise(r => setTimeout(r, 50)); } }
  assert.equal(child.exitCode, null, logs);

  await t.test('proxy says https: served normally', async () => {
    assert.equal((await get('/', { 'X-Forwarded-Proto': 'https' })).status, 200);
    assert.equal((await get('/admin', { 'X-Forwarded-Proto': 'https' })).status, 200);
  });
  await t.test('proxy says http: redirected to the https address', async () => {
    const r = await get('/gameplay?x=1', { 'X-Forwarded-Proto': 'http' });
    assert.equal(r.status, 308);
    assert.equal(r.headers.get('location'), 'https://example.com/gameplay?x=1');
  });
  await t.test('proxy sends no scheme at all: no redirect, so no loop', async () => {
    for (const p of ['/', '/admin', '/faq']) assert.equal((await get(p)).status, 200, p);
  });
  await t.test('admin login works through the proxy (https origin, no forwarded scheme)', async () => {
    const login = (origin, extra = {}) => raw('POST', '/admin/api/login', { 'Content-Type': 'application/json', Origin: origin, ...extra }, JSON.stringify({ user: 'admin', password: 'Proxy-test-password-12345' }));
    assert.equal((await login('https://example.com')).status, 200, 'same site over https');
    assert.equal((await login('https://example.com', { 'X-Forwarded-Proto': 'https' })).status, 200);
    assert.equal((await login('http://example.com', { 'X-Forwarded-Proto': 'https' })).status, 403, 'scheme must match when the proxy told us');
    assert.equal((await login('https://evil.example')).status, 403, 'other site');
    assert.equal((await login('https://example.com', { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  });
});

// Download/social/register button switches and the member portal (login, register, account area) mockup.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

const source = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(process.env.RCM_TEST_TMP || os.tmpdir(), 'rcm-portal-'));
for (const f of ['server.js', 'lib', 'admin', 'views']) { try { fs.cpSync(path.join(source, f), path.join(tmp, f), { recursive: true }); } catch (e) {} }
fs.mkdirSync(path.join(tmp, 'public', 'uploads'), { recursive: true }); fs.mkdirSync(path.join(tmp, 'public', 'img'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'public', 'style.css'), 'body{}');
for (const f of ['consent.js', 'account.js', 'account.css']) fs.copyFileSync(path.join(source, 'public', f), path.join(tmp, 'public', f));
fs.mkdirSync(path.join(tmp, 'data'));
const seed = require(path.join(tmp, 'lib/seed'))(); seed.site.url = '';
fs.writeFileSync(path.join(tmp, 'data/content.json'), JSON.stringify(seed));

const port = 23000 + Math.floor(Math.random() * 15000), base = 'http://127.0.0.1:' + port;
const child = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), ADMIN_PASSWORD: 'Portal-test-password-12', TRUST_PROXY: '1' } });
let logs = ''; child.stdout.on('data', b => (logs += b)); child.stderr.on('data', b => (logs += b));
after(() => child.kill());
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const get = async p => { const r = await fetch(base + p, { redirect: 'manual', headers: { 'User-Agent': UA, Cookie: 'rc_consent=1.0' } }); return { status: r.status, html: await r.text(), csp: r.headers.get('content-security-policy') }; };
const wait = ms => new Promise(r => setTimeout(r, ms));
let cookie, csrf;
const api = async (p, method = 'GET', body) => {
  const r = await fetch(base + '/admin/api/' + p, { method, headers: { Cookie: cookie, ...(method !== 'GET' ? { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const edit = async fn => { const c = (await api('content')).json; fn(c); const r = await api('content', 'PUT', c); assert.equal(r.status, 200, JSON.stringify(r.json)); return r.json; };
const cfgOf = html => JSON.parse(/data-cfg="([^"]*)"/.exec(html)[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));

test('buttons and member portal', async t => {
  for (let i = 0; i < 80; i++) { try { await fetch(base + '/robots.txt'); break; } catch { await wait(50); } }
  assert.equal(child.exitCode, null, logs);
  const r = await fetch(base + '/admin/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'admin', password: 'Portal-test-password-12' }) });
  assert.equal(r.status, 200); cookie = r.headers.get('set-cookie').split(';')[0]; csrf = (await api('me')).json.csrf;

  await t.test('every download, register and social button can be switched off from the admin', async () => {
    const h0 = (await get('/')).html;
    for (const need of ['Windows PC', 'App Store', 'Google Play', 'class="dk-cta"', 'aria-label="Facebook"', 'aria-label="YouTube"']) assert.ok(h0.includes(need), need + ' shown by default');
    await edit(c => { c.links.show.ios = false; c.links.show.facebook = false; c.links.show.register = false; });
    const h1 = (await get('/')).html;
    assert.equal(h1.includes('App Store'), false); assert.ok(h1.includes('Windows PC') && h1.includes('Google Play'));
    assert.equal(h1.includes('aria-label="Facebook"'), false); assert.ok(h1.includes('aria-label="TikTok"'));
    assert.match(h1, /<div class="dk-cta"><\/div>/, 'register button is gone');
    assert.equal((await api('content')).json.links.show.ios, 'false', 'the choice is saved');
    await edit(c => { c.links.show.windows = false; c.links.show.android = false; });
    const h2 = (await get('/')).html;
    assert.equal(/class="plat-h"|class="stores"/.test(h2), false, 'no empty "download on" heading when all three are off');
    await edit(c => { for (const k of Object.keys(c.links.show)) c.links.show[k] = true; });
    const h3 = (await get('/')).html; assert.ok(h3.includes('App Store') && h3.includes('aria-label="Facebook"') && /class="stores"/.test(h3));
    // a site saved before these switches existed shows everything
    const f = path.join(tmp, 'data/content.json'), c = JSON.parse(fs.readFileSync(f, 'utf8')); delete c.links.show; delete c.portal;
    const saved = fs.readFileSync(f, 'utf8'); fs.writeFileSync(f, JSON.stringify(c)); await wait(1200);
    assert.ok((await get('/')).html.includes('App Store'));
    fs.writeFileSync(f, saved); await wait(1200);
  });

  await t.test('portal is off by default: no pages, no menu button', async () => {
    for (const p of ['/login', '/register', '/forgot-password', '/account', '/account/profile']) assert.equal((await get(p)).status, 404, p);
    assert.equal((await get('/')).html.includes('class="acct-link"'), false);
    assert.equal((await fetch(base + '/account.js')).status, 200, 'script file itself is plain static');
  });

  await t.test('switched on (mockup): pages, menu button, demo notice, noindex, eight menu entries', async () => {
    await edit(c => { c.portal.enabled = true; });
    const home = (await get('/')).html; assert.match(home, /<a class="acct-link" href="\/account">เข้าสู่ระบบ<\/a>/);
    for (const [p, form] of [['/login', 'login'], ['/register', 'register'], ['/forgot-password', 'forgot']]) {
      const { status, html } = await get(p); assert.equal(status, 200, p);
      assert.match(html, new RegExp('data-form="' + form + '"')); assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
      assert.match(html, /MOCKUP/); assert.ok(html.includes('/account.js'));
      assert.equal(cfgOf(html).mode, 'mock');
    }
    const reg = (await get('/register')).html; assert.match(reg, /href="\/terms"/); assert.match(reg, /id="agree"/);
    const acc = (await get('/account')).html;
    for (const p of ['/account', '/account/profile', '/account/security', '/account/payment', '/account/history', '/account/coupon', '/account/items', '/account/redeem']) assert.ok(acc.includes(`href="${p}"`), p);
    assert.match(acc, /data-page="overview"/); assert.match(acc, /data-bind="cash"/);
    for (const p of ['/account/profile', '/account/security', '/account/payment', '/account/history', '/account/coupon', '/account/items', '/account/redeem']) assert.equal((await get(p)).status, 200, p);
    const sm = await (await fetch(base + '/sitemap.xml')).text(); assert.equal(/\/login|\/account|\/register/.test(sm), false, 'not in the sitemap');
    await edit(c => { c.portal.registerOpen = false; });
    assert.equal((await get('/register')).status, 404); assert.equal((await get('/login')).html.includes('href="/register"'), false);
    await edit(c => { c.portal.registerOpen = true; });
  });

  await t.test('API mode: only a safe https address is accepted and only that origin is added to the page policy', async () => {
    const plain = (await get('/login')).csp;
    assert.match(plain, /connect-src 'self'(;|$)/);
    await edit(c => { c.portal.mode = 'api'; c.portal.apiBase = 'https://api.example.com/v1/'; });
    const ok = await get('/login'), cfg = cfgOf(ok.html);
    assert.equal(cfg.mode, 'api'); assert.equal(cfg.base, 'https://api.example.com/v1'); assert.equal(ok.html.includes('MOCKUP'), false);
    assert.match(ok.csp, /connect-src 'self' https:\/\/api\.example\.com(;| )/); assert.equal(ok.csp.includes('/v1'), false, 'origin only');
    assert.equal(cfg.ep.login, '/auth/login'); assert.equal(cfg.ep.me, '/me');
    await edit(c => { c.portal.apiBase = 'http://localhost:4000'; });
    assert.equal(cfgOf((await get('/login')).html).base, 'http://localhost:4000');
    for (const bad of ['http://evil.example.com', 'javascript:alert(1)', 'https://user:pw@api.example.com', 'ftp://x.example.com', '//evil.example.com', 'not a url', '']) {
      await edit(c => { c.portal.apiBase = bad; });
      const g = await get('/login'); assert.equal(cfgOf(g.html).mode, 'mock', bad); assert.equal(cfgOf(g.html).base, '', bad); assert.match(g.csp, /connect-src 'self'(;|$)/, bad);
    }
    await edit(c => { c.portal.apiBase = 'https://api.example.com'; c.portal.epLogin = '//evil.example.com/x'; c.portal.epMe = '/../etc'; c.portal.epHistory = '/me/history'; c.portal.epRedeem = 'https://evil.example.com'; });
    const e = cfgOf((await get('/login')).html).ep;
    assert.equal(e.login, '/auth/login'); assert.equal(e.me, '/me'); assert.equal(e.history, '/me/history'); assert.equal(e.redeem, '/me/redeem');
    await edit(c => { c.portal.mode = 'mock'; c.portal.apiBase = ''; c.portal.epLogin = '/auth/login'; c.portal.epMe = '/me'; c.portal.epRedeem = '/me/redeem'; });
  });

  await t.test('script uses no innerHTML and no eval (API data cannot inject markup)', () => {
    const js = fs.readFileSync(path.join(source, 'public/account.js'), 'utf8');
    for (const bad of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']) assert.equal(js.includes(bad), false, bad);
    assert.equal(/localStorage\.setItem\([^)]*pass/i.test(js), false, 'a password is never written to storage');
  });
});

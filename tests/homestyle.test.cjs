// Home page style switch: "classic" (original) or "modern" (own stylesheet), chosen in the admin, home page only
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

const source = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(process.env.RCM_TEST_TMP || os.tmpdir(), 'rcm-homestyle-'));
for (const f of ['server.js', 'lib', 'admin', 'views']) { try { fs.cpSync(path.join(source, f), path.join(tmp, f), { recursive: true }); } catch (e) {} }
fs.mkdirSync(path.join(tmp, 'public', 'uploads'), { recursive: true }); fs.mkdirSync(path.join(tmp, 'public', 'img'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'public', 'style.css'), 'body{}');
for (const f of ['consent.js', 'slider.js', 'slider.css', 'home-modern.css', 'home-console.css', 'home-hud.css', 'home-focus.css']) fs.copyFileSync(path.join(source, 'public', f), path.join(tmp, 'public', f));
fs.mkdirSync(path.join(tmp, 'data'));
const seed = require(path.join(tmp, 'lib/seed'))(); seed.site.url = '';
fs.writeFileSync(path.join(tmp, 'data/content.json'), JSON.stringify(seed));

const port = 23000 + Math.floor(Math.random() * 15000), base = 'http://127.0.0.1:' + port;
const child = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), ADMIN_PASSWORD: 'Home-test-password-12', TRUST_PROXY: '1' } });
let logs = ''; child.stdout.on('data', b => (logs += b)); child.stderr.on('data', b => (logs += b));
after(() => child.kill());
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const get = async p => { const r = await fetch(base + p, { redirect: 'manual', headers: { 'User-Agent': UA, Cookie: 'rc_consent=1.0' } }); return { status: r.status, html: await r.text(), type: r.headers.get('content-type') }; };
const wait = ms => new Promise(r => setTimeout(r, ms));
let cookie, csrf;
const api = async (p, method = 'GET', body) => {
  const r = await fetch(base + '/admin/api/' + p, { method, headers: { Cookie: cookie, ...(method !== 'GET' ? { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const edit = async fn => { const c = (await api('content')).json; fn(c); const r = await api('content', 'PUT', c); assert.equal(r.status, 200, JSON.stringify(r.json)); return r.json; };
const modern = h => /<body class="hs-b"/.test(h) && /home-modern\.css\?v=/.test(h) && !/home-(console|hud|focus)\.css/.test(h);
const hud = h => /<body class="hs-d"/.test(h) && /home-hud\.css\?v=/.test(h) && !/home-(modern|console|focus)\.css/.test(h);
const focus = h => /<body class="hs-e"/.test(h) && /home-focus\.css\?v=/.test(h) && !/home-(modern|console|hud)\.css/.test(h);
const consoleStyle = h => /<body class="hs-c"/.test(h) && /home-console\.css\?v=/.test(h) && !/home-(modern|hud|focus)\.css/.test(h);
const classic = h => !/class="hs-[bcde]"/.test(h) && !/home-(modern|console|hud|focus)\.css/.test(h);

test('home page style', async t => {
  for (let i = 0; i < 80; i++) { try { await fetch(base + '/robots.txt'); break; } catch { await wait(50); } }
  assert.equal(child.exitCode, null, logs);
  const r = await fetch(base + '/admin/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'admin', password: 'Home-test-password-12' }) });
  assert.equal(r.status, 200); cookie = r.headers.get('set-cookie').split(';')[0]; csrf = (await api('me')).json.csrf;

  await t.test('classic is the default and loads no extra stylesheet', async () => {
    assert.equal((await api('content')).json.site.homeStyle, 'classic');
    assert.ok(classic((await get('/')).html)); assert.ok(classic((await get('/en')).html));
  });
  await t.test('modern applies to the Thai and English home page only', async () => {
    await edit(c => { c.site.homeStyle = 'modern'; });
    assert.ok(modern((await get('/')).html)); assert.ok(modern((await get('/en')).html));
    for (const p of ['/rewards', '/gameplay', '/news', '/faq', '/privacy', '/en/rewards']) assert.ok(classic((await get(p)).html), p + ' is unchanged');
    assert.match((await get('/')).html, /<div class="dock[ "]/, 'the same markup, only the stylesheet differs');
  });
  await t.test('console: its own stylesheet and body class, Thai and English home page only', async () => {
    await edit(c => { c.site.homeStyle = 'console'; });
    assert.ok(consoleStyle((await get('/')).html)); assert.ok(consoleStyle((await get('/en')).html));
    for (const p of ['/rewards', '/news', '/faq', '/privacy']) assert.ok(classic((await get(p)).html), p + ' is unchanged');
    assert.ok(modern((await get('/?home=modern')).html), 'preview of another style while console is saved');
    assert.ok(classic((await get('/?home=classic')).html));
    await edit(c => { c.site.homeStyle = 'classic'; });
    assert.ok(consoleStyle((await get('/?home=console')).html), 'console preview without saving');
  });
  await t.test('hud: its own stylesheet and body class, Thai and English home page only; each style is exclusive', async () => {
    await edit(c => { c.site.homeStyle = 'hud'; });
    assert.ok(hud((await get('/')).html)); assert.ok(hud((await get('/en')).html));
    for (const p of ['/rewards', '/news', '/faq', '/privacy']) assert.ok(classic((await get(p)).html), p + ' is unchanged');
    assert.ok(consoleStyle((await get('/?home=console')).html)); assert.ok(modern((await get('/?home=modern')).html)); assert.ok(classic((await get('/?home=classic')).html));
    await edit(c => { c.site.homeStyle = 'classic'; });
    assert.ok(hud((await get('/?home=hud')).html), 'hud preview without saving');
    // the tab bar needs the five menu links in the usual order (one icon each, chosen by position)
    const menu = /<nav class="menu"[\s\S]*?<\/nav>/.exec((await get('/?home=hud')).html)[0];
    assert.equal((menu.match(/<a /g) || []).length, 5);
  });
  await t.test('focus: its own stylesheet and body class, Thai and English home page only', async () => {
    await edit(c => { c.site.homeStyle = 'focus'; });
    assert.ok(focus((await get('/')).html)); assert.ok(focus((await get('/en')).html));
    for (const p of ['/rewards', '/news', '/faq', '/privacy']) assert.ok(classic((await get(p)).html), p + ' is unchanged');
    assert.ok(hud((await get('/?home=hud')).html)); assert.ok(classic((await get('/?home=classic')).html));
    await edit(c => { c.site.homeStyle = 'classic'; });
    assert.ok(focus((await get('/?home=focus')).html), 'focus preview without saving');
    const h = (await get('/?home=focus')).html;
    assert.match(h, /<nav class="menu"/, 'the menu links are real links in the page');
    assert.match(h, /<button class="burger"[^>]*aria-label="[^"]+"/, 'the menu button keeps its accessible name');
  });
  await t.test('preview links work without saving, and cannot be abused', async () => {
    assert.ok(classic((await get('/?home=classic')).html), 'classic preview while modern is saved');
    await edit(c => { c.site.homeStyle = 'classic'; });
    assert.ok(modern((await get('/?home=modern')).html), 'modern preview while classic is saved');
    for (const bad of ['"><script>alert(1)</script>', 'MODERN', 'x', '']) assert.ok(classic((await get('/?home=' + encodeURIComponent(bad))).html), 'ignored: ' + bad);
    assert.equal(/alert\(1\)/.test((await get('/?home=' + encodeURIComponent('"><script>alert(1)</script>'))).html), false);
  });
  await t.test('unknown saved values and older sites fall back to classic', async () => {
    await edit(c => { c.site.homeStyle = '"><b>x'; });
    assert.ok(classic((await get('/')).html));
    const f = path.join(tmp, 'data/content.json'), c = JSON.parse(fs.readFileSync(f, 'utf8')); delete c.site.homeStyle; fs.writeFileSync(f, JSON.stringify(c)); await wait(1200);
    assert.ok(classic((await get('/')).html)); assert.equal((await api('content')).json.site.homeStyle, 'classic');
  });
  await t.test('hero jigsaw: video and picture can each be switched off', async () => {
    const tiles = html => /<div class="tiles"[^>]*>/.exec(html)[0], preload = html => /<link rel="preload" as="image"/.test(html);
    let t0 = tiles((await get('/')).html);
    assert.match(t0, /data-video="[^"]+\.mp4"/); assert.match(t0, /data-video-sm="[^"]+\.mp4"/); assert.match(t0, /data-image="[^"]+"/); assert.match(t0, /style="background-image:url/); assert.equal(/data-off/.test(t0), false);
    assert.ok(preload((await get('/')).html));
    await edit(c => { c.home.heroVideoOn = false; });
    const v = (await get('/')).html; t0 = tiles(v);
    assert.match(t0, /data-video=""/); assert.match(t0, /data-video-sm=""/); assert.match(t0, /data-image="[^"]+"/); assert.equal(/data-off/.test(t0), false, 'the picture still plays the jigsaw');
    assert.equal(/\.mp4/.test(v.replace(/<script[\s\S]*?<\/script>/g, '')), false, 'no video file is referenced');
    await edit(c => { c.home.heroVideoOn = true; c.home.heroImageOn = false; });
    const i = (await get('/')).html; t0 = tiles(i);
    assert.match(t0, /data-image=""/); assert.match(t0, /data-video="[^"]+\.mp4"/); assert.equal(/background-image/.test(t0), false); assert.equal(preload(i), false, 'no picture is preloaded'); assert.equal(/data-off/.test(t0), false);
    await edit(c => { c.home.heroVideoOn = false; c.home.heroImageOn = false; });
    t0 = tiles((await get('/')).html); assert.match(t0, /data-off="1"/); assert.match(t0, /data-video=""/); assert.match(t0, /data-image=""/);
    assert.match(tiles((await get('/en')).html), /data-off="1"/, 'the English home page too');
    assert.equal((await api('content')).json.home.heroVideoOn, 'false', 'the choice is saved');
    // sites saved before the switches existed keep both on
    const f = path.join(tmp, 'data/content.json'), c = JSON.parse(fs.readFileSync(f, 'utf8')); delete c.home.heroVideoOn; delete c.home.heroImageOn; fs.writeFileSync(f, JSON.stringify(c)); await wait(1200);
    t0 = tiles((await get('/')).html); assert.match(t0, /data-video="[^"]+\.mp4"/); assert.match(t0, /data-image="[^"]+"/);
    await edit(c => { c.home.heroVideoOn = true; c.home.heroImageOn = true; });
  });
  await t.test('sound effects can be switched off: no speaker button, the page tells hero.js', async () => {
    let h = (await get('/')).html; assert.match(h, /class="snd"/); assert.equal(/data-sfx="0"/.test(h), false);
    await edit(c => { c.home.soundOn = false; });
    h = (await get('/')).html; assert.equal(/class="snd"/.test(h), false); assert.match(/<div class="tiles"[^>]*>/.exec(h)[0], /data-sfx="0"/);
    assert.equal(/class="snd"/.test((await get('/en')).html), false);
    await edit(c => { c.home.soundOn = true; });
    assert.match((await get('/')).html, /class="snd"/);
  });
  await t.test('hero jigsaw effect can be switched off: grid stays, no flipping, no sound button', async () => {
    const tiles = html => /<div class="tiles"[^>]*>/.exec(html)[0];
    let h = (await get('/')).html; assert.equal(/data-tiles="0"/.test(tiles(h)), false); assert.match(h, /class="snd"/);
    await edit(c => { c.home.heroTilesOn = false; });
    h = (await get('/')).html; assert.match(tiles(h), /data-tiles="0"/); assert.match(tiles(h), /data-video="[^"]+\.mp4"/, 'the video is still the background (the grid lines stay: the script still builds them)'); assert.equal(/class="snd"/.test(h), false, 'no jigsaw, no flip sounds');
    assert.match(tiles((await get('/en')).html), /data-tiles="0"/);
    assert.equal((await api('content')).json.home.heroTilesOn, 'false', 'saved');
    const f = path.join(tmp, 'data/content.json'), c = JSON.parse(fs.readFileSync(f, 'utf8')); delete c.home.heroTilesOn; fs.writeFileSync(f, JSON.stringify(c)); await wait(1200);
    assert.equal(/data-tiles="0"/.test(tiles((await get('/')).html)), false, 'sites saved before the switch keep the jigsaw');
    await edit(c => { c.home.heroTilesOn = true; });
  });
  await t.test('home slider: sits above Gameplay, follows the admin settings, English twins, safe links', async () => {
    const sec = html => /<section class="sec sl" id="slides"[\s\S]*?<\/section>/.exec(html);
    let h = (await get('/')).html, m = sec(h);
    assert.ok(m, 'slider shown by default'); assert.ok(h.indexOf('id="slides"') < h.indexOf('id="gameplay"'), 'above the Gameplay section');
    assert.equal((m[0].match(/class="sl-s[ "]/g) || []).length, 4); assert.equal((m[0].match(/class="sl-d[ "]/g) || []).length, 4);
    assert.match(m[0], /data-auto="1"/); assert.match(m[0], /data-ms="5000"/); assert.match(h, /\/slider\.css/); assert.match(h, /\/slider\.js/);
    assert.equal((await get('/slider.js')).status, 200); assert.equal((await get('/slider.css')).status, 200);
    await edit(c => { c.home.slidesSeconds = '8'; c.home.slidesAuto = false; c.slides[0].link = 'javascript:alert(1)'; c.slides[1].link = '/news'; c.slides[1].titleEn = 'English slide'; });
    h = (await get('/')).html; m = sec(h);
    assert.match(m[0], /data-ms="8000"/); assert.match(m[0], /data-auto="0"/); assert.equal(/javascript:/.test(m[0]), false); assert.match(m[0], /href="\/news"/);
    assert.match(sec((await get('/en')).html)[0], /English slide/); assert.equal(/English slide/.test(m[0]), false);
    await edit(c => { c.slides = c.slides.slice(0, 1); });
    m = sec((await get('/')).html); assert.equal(/sl-nav|sl-d"/.test(m[0]), false, 'one picture: no arrows or dots'); assert.match(m[0], /data-auto="0"/);
    await edit(c => { c.slides = []; });
    assert.equal(sec((await get('/')).html), null, 'no pictures: no section');
    await edit(c => { c.slides = [{ image: '/img/track.jpg', title: 'A' }, { image: '/img/car1.jpg', title: 'B' }]; c.home.slidesOn = false; });
    assert.equal(sec((await get('/')).html), null, 'switched off');
    assert.equal((await api('content')).json.slides.length, 2, 'saved');
  });
  await t.test('layout guards that browsers cannot be asked about here: store names stay visible on small laptops, panels stretch their children', async () => {
    // the classic layout turns store buttons into 48px icon tiles between 901px and 1180px; every other style must undo that
    for (const [file, cls] of [['home-modern.css', 'hs-b'], ['home-console.css', 'hs-c'], ['home-hud.css', 'hs-d'], ['home-focus.css', 'hs-e']]) {
      const css = fs.readFileSync(path.join(source, 'public', file), 'utf8').replace(/\s+/g, ' ');
      assert.ok(css.includes('body.' + cls + ' .hero .dk-plat .store div{position:static;'), file + ' brings the store names back');
      assert.ok(css.includes('body.' + cls + ' .hero .dk-plat .store{width:auto;height:auto;'), file + ' undoes the 48px icon tiles');
    }
    // a column of blocks must stretch to one width (a leftover align-items:center once left them different widths and off-centre)
    const hudCss = fs.readFileSync(path.join(source, 'public/home-hud.css'), 'utf8').replace(/\s+/g, ' ');
    assert.match(hudCss, /body\.hs-d \.hero \.dock \.dk\{display:flex;flex-direction:column;align-items:stretch;/);
    const focusCss = fs.readFileSync(path.join(source, 'public/home-focus.css'), 'utf8').replace(/\s+/g, ' ');
    assert.match(focusCss, /body\.hs-e \.hero \.dock \.dk\{display:flex;flex-direction:column;align-items:stretch;/);
    // the classic phone layout centres the intro text; each style that left-aligns its headline must left-align it too
    for (const [file, cls] of [['home-modern.css', 'hs-b'], ['home-console.css', 'hs-c'], ['home-hud.css', 'hs-d'], ['home-focus.css', 'hs-e']]) {
      const css = fs.readFileSync(path.join(source, 'public', file), 'utf8').replace(/\s+/g, ' ');
      assert.match(css, new RegExp('body\.' + cls + ' \.hero p\.lead\{[^}]*text-align:left'), file + ': intro text is left-aligned like the headline');
    }
    assert.match(focusCss, /body\.hs-e \.dk-soc\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(44px,1fr\)\)/, 'social buttons share the full width');
  });
  await t.test('the stylesheets are served and every rule is scoped to the home body class', async () => {
   for (const [file, cls] of [['home-modern.css', 'hs-b'], ['home-console.css', 'hs-c'], ['home-hud.css', 'hs-d'], ['home-focus.css', 'hs-e']]) {
    const css = await get('/' + file); assert.equal(css.status, 200); assert.match(css.type, /text\/css/);
    const rules = css.html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').replace(/@property[^{]*\{[^}]*\}/g, '').replace(/@media[^{]*\{/g, '').split('{').slice(0, -1).map(x => x.split('}').pop().trim()).filter(Boolean);
    for (const sel of rules) for (const one of sel.split(',')) assert.match(one.trim(), new RegExp('^body\\.' + cls + '\\b'), file + ': every rule starts with body.' + cls + ': ' + one.trim());
   }
  });
});

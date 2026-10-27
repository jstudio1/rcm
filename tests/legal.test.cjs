// Privacy policy, terms of service and support page: content rules from the store requirements, English versions, admin editing.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

const source = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(process.env.RCM_TEST_TMP || os.tmpdir(), 'rcm-legal-'));
for (const f of ['server.js', 'lib', 'admin', 'views']) fs.cpSync(path.join(source, f), path.join(tmp, f), { recursive: true });
fs.mkdirSync(path.join(tmp, 'public', 'uploads'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'public', 'img'));
fs.writeFileSync(path.join(tmp, 'public', 'style.css'), 'body{}');
fs.copyFileSync(path.join(source, 'public', 'consent.js'), path.join(tmp, 'public', 'consent.js'));
fs.mkdirSync(path.join(tmp, 'data'));
const content = require(path.join(tmp, 'lib/seed'))();
content.site.url = '';
fs.writeFileSync(path.join(tmp, 'data/content.json'), JSON.stringify(content));

const port = 23000 + Math.floor(Math.random() * 15000), base = 'http://127.0.0.1:' + port;
const child = spawn(process.execPath, ['server.js'], { cwd: tmp, env: { ...process.env, PORT: String(port), ADMIN_PASSWORD: 'Legal-test-password-12', TRUST_PROXY: '1' } });
let logs = ''; child.stdout.on('data', b => (logs += b)); child.stderr.on('data', b => (logs += b));
after(() => child.kill());

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const get = async p => { const r = await fetch(base + p, { redirect: 'manual', headers: { 'User-Agent': UA, Cookie: 'rc_consent=1.0' } }); return { status: r.status, html: await r.text() }; };
const visible = html => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
const wait = ms => new Promise(r => setTimeout(r, ms));
let cookie, csrf;
const api = async (p, method = 'GET', body) => {
  const r = await fetch(base + '/admin/api/' + p, { method, headers: { Cookie: cookie, ...(method !== 'GET' ? { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const edit = async fn => { const c = (await api('content')).json; fn(c); const r = await api('content', 'PUT', c); assert.equal(r.status, 200, JSON.stringify(r.json)); return r.json; };
const DRAFT = /ร่าง|ตัวอย่าง|draft|ก่อนเผยแพร่|แก้ให้ตรง|lorem|todo|\[ยังไม่ได้ตั้งค่า\]|\{\{\w+\}\}/i;

test('privacy, terms and support', async t => {
  for (let i = 0; i < 80; i++) { try { await fetch(base + '/robots.txt'); break; } catch { await wait(50); } }
  assert.equal(child.exitCode, null, logs);
  const r = await fetch(base + '/admin/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'admin', password: 'Legal-test-password-12' }) });
  assert.equal(r.status, 200); cookie = r.headers.get('set-cookie').split(';')[0]; csrf = (await api('me')).json.csrf;

  await t.test('nothing unfinished is ever shown, even before any contact details are entered', async () => {
    for (const p of ['/privacy', '/en/privacy', '/terms', '/en/terms', '/support']) {
      const { status, html } = await get(p);
      assert.equal(status, 200, p);
      const v = visible(html);
      assert.equal(DRAFT.test(v), false, p + ' shows draft/placeholder text: ' + (v.match(DRAFT) || [])[0]);
      assert.equal(/<!--/.test(html), false, p + ' has an HTML comment');
    }
  });

  await t.test('privacy policy covers every item the stores ask for (Thai)', async () => {
    const v = visible((await get('/privacy')).html);
    for (const need of ['ผู้ควบคุมข้อมูลส่วนบุคคล', 'ชื่อผู้ใช้', 'เข้ารหัส', 'ข้อความแชท', 'ข้อมูลการซื้อ', 'หมายเลข IP', 'รุ่นเครื่อง', 'เวอร์ชันแอป',
      'กันการโกง|ป้องกันการโกง', 'Apple และ Google', 'ไม่มีโฆษณา', 'ไม่ขายข้อมูล', 'อย่างถาวรภายใน 30 วัน', 'PDPA', 'สิทธิ', 'ผู้เยาว์', '13 ปี', 'HTTPS', 'วันที่ 27 ตุลาคม 2569']) {
      assert.match(v, new RegExp(need), 'missing: ' + need);
    }
  });

  await t.test('English privacy + terms: lang, hreflang, English table and banner, language switch', async () => {
    const th = (await get('/privacy')).html, en = (await get('/en/privacy')).html;
    assert.match(th, /<html lang="th">/); assert.match(en, /<html lang="en">/);
    for (const html of [th, en]) {
      assert.match(html, /<link rel="alternate" hreflang="th" href="[^"]+\/privacy">/);
      assert.match(html, /<link rel="alternate" hreflang="en" href="[^"]+\/en\/privacy">/);
      assert.match(html, /<link rel="alternate" hreflang="x-default" href="[^"]+\/privacy">/);
    }
    assert.match(en, /<link rel="canonical" href="[^"]+\/en\/privacy">/);
    assert.match(en, /<h1 class="disp">Privacy Policy<\/h1>/);
    assert.match(en, /Last updated: <time datetime="2026-10-27">27 October 2026<\/time>/);
    assert.match(en, /<th scope="col">Provider<\/th>/);
    assert.match(en, /We use cookies/); assert.match(en, /Decline non-essential/);
    assert.match(en, /<a href="\/privacy" hreflang="th" lang="th">ภาษาไทย<\/a>/); assert.match(th, /<a href="\/en\/privacy" hreflang="en" lang="en">English<\/a>/);
    assert.match(visible(en), /within 30 days/); assert.match(visible(en), /aged 13 and over/);
    const tEn = (await get('/en/terms')).html;
    assert.match(tEn, /<html lang="en">/); assert.match(tEn, /<h1 class="disp">Terms of Service<\/h1>/);
    assert.match(visible(tEn), /Additional terms for the App Store and Google Play/);
  });

  await t.test('terms cover the store checklist', async () => {
    const v = visible((await get('/terms')).html);
    for (const need of ['ไม่มีมูลค่าเป็นเงินจริง', 'แลกคืนเป็นเงินไม่ได้', 'โปรแกรมช่วย', 'RMT', 'บทลงโทษ', 'กฎแชท', 'นโยบายการคืนเงินของ Apple หรือ Google', 'หยุดให้บริการ', 'กฎหมายไทย', 'App Store และ Google Play']) assert.match(v, new RegExp(need), need);
  });

  await t.test('support page: report channel, community rules and the six FAQ topics', async () => {
    await edit(c => { c.contact.email = 'help@example.com'; c.contact.company = 'Acme Games Co., Ltd.'; });
    const { html } = await get('/support');
    const v = visible(html);
    assert.match(html, /<h2 id="report">รายงานผู้เล่นหรือเนื้อหาที่ไม่เหมาะสม<\/h2>/);
    assert.match(v, /กฎชุมชนโดยสรุป/); assert.match(v, /บล็อกผู้เล่น/);
    assert.match(html, /<small class="ck">รายงานผู้เล่น \/ เนื้อหา<\/small><p class="cv"><a href="mailto:help@example\.com">/, 'report card falls back to the support email');
    for (const q of ['ลืมรหัสผ่าน', 'ติดตั้งหรืออัปเดต', 'เน็ตมือถือ', 'พบบั๊ก', 'รายงานผู้เล่น', 'ลบบัญชี']) assert.ok(v.includes(q), q);
    assert.match(v, /ลบข้อมูลของท่านอย่างถาวรภายใน 30 วัน/);
    await edit(c => { c.contact.reportEmail = 'report@example.com'; });
    assert.match((await get('/support')).html, /mailto:report@example\.com/);
  });

  await t.test('a line with an empty token is hidden, and filling the data brings it back', async () => {
    await edit(c => { c.contact.email = ''; c.contact.company = ''; c.contact.reportEmail = ''; });
    let v = visible((await get('/privacy')).html);
    assert.equal(v.includes('ผู้ควบคุมข้อมูลส่วนบุคคลคือ'), false, 'controller sentence needs {{company}}');
    assert.match(v, /อย่างถาวรภายใน 30 วัน/, 'the deletion promise does not depend on the contact data');
    assert.equal(visible((await get('/support')).html).includes('ลืมรหัสผ่านทำอย่างไร'), false, 'FAQ answer needs {{email}}');
    assert.match(visible((await get('/support')).html), /เน็ตมือถือ/, 'FAQ without tokens stays');
    await edit(c => { c.contact.email = 'help@example.com'; c.contact.company = 'Acme Games Co., Ltd.'; c.contact.address = '1 Test Rd.'; });
    v = visible((await get('/privacy')).html);
    assert.match(v, /ผู้ควบคุมข้อมูลส่วนบุคคลคือ Acme Games Co\., Ltd\. \(&quot;เรา&quot;\)/);
    assert.ok(v.includes('help@example.com') && v.includes('1 Test Rd.'));
    assert.match(visible((await get('/support')).html), /ลืมรหัสผ่านทำอย่างไร/);
  });

  await t.test('values from the admin are escaped; settings drive the text', async () => {
    await edit(c => { c.legal.minAge = '16<img src=x onerror=alert(1)>'; c.legal.deleteDays = '45'; c.contact.company = 'A&B <b>Co</b>'; });
    const v = (await get('/privacy')).html;
    assert.equal(v.includes('<img src=x'), false); assert.equal(v.includes('<b>Co</b>'), false);
    assert.ok(v.includes('A&amp;B &lt;b&gt;Co&lt;/b&gt;'));
    assert.match(visible(v), /ภายใน 45 วัน/);
    await edit(c => { c.legal.minAge = '16'; c.legal.deleteDays = '30'; c.contact.company = 'Acme Games Co., Ltd.'; });
    assert.match(visible((await get('/en/privacy')).html), /aged 16 and over/);
  });

  await t.test('footer links on every page, English footer on English pages, sitemap lists them', async () => {
    const home = (await get('/')).html;
    assert.match(home, /<div class="legal-links"><a href="\/privacy">นโยบายความเป็นส่วนตัว<\/a><a href="\/terms">ข้อตกลงการใช้บริการ<\/a><a href="\/support">/);
    const en = (await get('/en/terms')).html;
    assert.match(en, /<a href="\/en\/privacy">Privacy Policy<\/a><a href="\/en\/terms">Terms of Service<\/a><a href="\/en\/support">Support<\/a>/);
    assert.match(en, /Cookie settings<\/button>/);
    const sm = await (await fetch(base + '/sitemap.xml')).text();
    for (const u of ['/privacy', '/en/privacy', '/terms', '/en/terms', '/support']) assert.ok(sm.includes(u + '</loc>'), u);
  });

  await t.test('English page disappears when its text is emptied; trailing slash redirects', async () => {
    await edit(c => { c.pages.terms.bodyEn = ''; });
    assert.equal((await get('/en/terms')).status, 404);
    assert.equal((await get('/terms')).html.includes('hreflang="en"'), false, 'no language switch without an English version');
    assert.equal((await fetch(base + '/privacy/', { redirect: 'manual' })).status, 301);
    assert.equal((await fetch(base + '/en/nothing', { redirect: 'manual' })).status, 404);
  });

  await t.test('heading ids, links and lists in the editable text; unsafe links are dropped', async () => {
    await edit(c => { c.pages.support.body = '## ทดสอบ {#my-id}\nข้อความ [ดู](/terms) และ [bad](javascript:alert(1))\n\n- **หนึ่ง**\n- สอง\n\n## อื่น {#bad id!}'; });
    const html = (await get('/support')).html;
    assert.match(html, /<h2 id="my-id">ทดสอบ<\/h2>/);
    assert.match(html, /<a href="\/terms" rel="noopener">ดู<\/a>/);
    assert.equal(html.includes('javascript:'), false);
    assert.match(html, /<ul><li><strong>หนึ่ง<\/strong><\/li><li>สอง<\/li><\/ul>/);
    assert.equal(/<h2 id="bad/.test(html), false, 'an invalid id is not used');
  });

  await t.test('support FAQ is editable and hides when empty; saved data survives', async () => {
    await edit(c => { c.supportFaq = [{ id: 'x1', q: 'คำถามใหม่จากแอดมิน', a: 'คำตอบ {{deleteDays}} วัน' }]; });
    let v = visible((await get('/support')).html);
    assert.match(v, /คำถามใหม่จากแอดมิน/); assert.match(v, /คำตอบ 30 วัน/);
    await edit(c => { c.supportFaq = []; });
    assert.equal(visible((await get('/support')).html).includes('คำถามที่พบบ่อยเรื่องซัพพอร์ต'), false);
    const c2 = (await api('content')).json;
    assert.deepEqual(c2.supportFaq, []); assert.equal(c2.legal.minAge, '16');
    assert.equal((await api('content', 'PUT', { site: {}, pages: {} })).status, 400, 'partial saves are refused');
  });

  await t.test('English support and FAQ pages, switch + hreflang + sitemap', async () => {
    const th = (await get('/support')).html, en = await get('/en/support');
    assert.equal(en.status, 200);
    assert.match(en.html, /<html lang="en"/);
    assert.match(visible(en.html), /Support and contact/);
    assert.equal(DRAFT.test(visible(en.html)), false, 'no placeholders on the English support page');
    assert.match(en.html, /hreflang="th"/); assert.match(th, /href="\/en\/support"/);
    assert.match(th, /<link rel="alternate" hreflang="en" href="[^"]+\/en\/support">/);
    const fe = await get('/en/faq'); assert.equal(fe.status, 200);
    assert.match(fe.html, /<html lang="en"/); assert.match(visible(fe.html), /What is RAYCITY-M\?/); assert.match(fe.html, /"@type":"FAQPage"/);
    assert.match((await get('/faq')).html, /href="\/en\/faq"/);
    const sm = await (await fetch(base + '/sitemap.xml')).text();
    assert.ok(sm.includes('/en/support</loc>') && sm.includes('/en/faq</loc>'));
    const orig = (await api('content')).json;
    await edit(c => { c.faq.forEach(f => { f.qEn = ''; f.aEn = ''; }); });
    assert.equal((await get('/en/faq')).status, 404, 'no English FAQ items = no English FAQ page');
    await edit(c => { c.faq = orig.faq; c.pages.support.bodyEn = ''; });
    assert.equal((await get('/en/support')).status, 404, 'no English body = no English support page');
    await edit(c => { c.pages.support.bodyEn = orig.pages.support.bodyEn; });
    assert.equal((await get('/en/support')).status, 200);
  });

  await t.test('links to the deletion and odds pages exist only once those pages do', async () => {
    const del = html => /href="\/delete-account"/.test(html), odds = html => /href="\/odds"/.test(html);
    for (const p of ['/', '/privacy', '/terms', '/support', '/faq']) { const h = (await get(p)).html; assert.equal(del(h) || odds(h), false, p + ' links to a page that does not exist'); }
    assert.equal((await (await fetch(base + '/sitemap.xml')).text()).includes('/delete-account'), false);
    await edit(c => {
      Object.assign(c.pages.delete, { h1: 'ลบบัญชีและข้อมูล', body: '## ขั้นตอน\nส่งคำขอ', h1En: 'Delete your account', bodyEn: '' });
      Object.assign(c.pages.odds, { h1: 'อัตรากล่องสุ่ม', body: '## กล่อง A\nรายการ', h1En: 'Loot box odds', bodyEn: '## Box A\nitems' });
    });
    const pages = {};
    for (const p of ['/', '/privacy', '/terms', '/support', '/faq']) pages[p] = (await get(p)).html;
    for (const p of ['/privacy', '/terms', '/support', '/faq']) assert.match(pages[p], /<nav class="legal-rel"/, p + ' related links');
    for (const p of Object.keys(pages)) assert.ok(del(pages[p]) && odds(pages[p]), p + ' links to both new pages');
    assert.equal(/<nav class="legal-rel"[\s\S]*?<\/nav>/.exec(pages['/privacy'])[0].includes('href="/privacy"'), false, 'a page does not link to itself');
    const sm = await (await fetch(base + '/sitemap.xml')).text();
    assert.ok(sm.includes('/delete-account</loc>') && sm.includes('/odds</loc>') && sm.includes('/en/odds</loc>'));
    assert.equal(sm.includes('/en/delete-account'), false, 'no English deletion page, no English URL');
    const dp = await get('/delete-account'), op = await get('/en/odds');
    assert.equal(dp.status, 200); assert.match(visible(dp.html), /ลบบัญชีและข้อมูล/); assert.equal((await get('/en/delete-account')).status, 404);
    assert.equal(op.status, 200); assert.match(op.html, /<html lang="en"/); assert.match(op.html, /<link rel="alternate" hreflang="th" href="[^"]+\/odds">/);
    const en = (await get('/en/privacy')).html;
    assert.match(en, /href="\/delete-account"/, 'English page links to the Thai page when there is no English one');
    assert.match(en, /href="\/en\/odds"/, 'and to the English one when there is');
    await edit(c => { c.pages.delete.noindex = 'true'; });
    assert.equal(del((await get('/privacy')).html), false, 'a page hidden from Google is not linked');
    await edit(c => { for (const k of ['delete', 'odds']) Object.assign(c.pages[k], { noindex: '', h1: '', body: '', bodyEn: '' }); });
    for (const p of ['/', '/privacy', '/terms', '/support']) { const h = (await get(p)).html; assert.equal(del(h) || odds(h), false, p + ' after removing them'); }
    assert.equal((await get('/delete-account')).status, 404); assert.equal((await get('/odds')).status, 404);
  });

  await t.test('store-URL panel: admin only, lists every page, refuses without https, cannot be aimed at internal hosts', async () => {
    assert.equal((await fetch(base + '/admin/api/urls')).status, 401);
    assert.equal((await fetch(base + '/admin/api/urls/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
    const u = (await api('urls')).json;
    assert.deepEqual(u.items.map(i => i.key), ['privacy', 'terms', 'support', 'faq', 'delete', 'odds']);
    assert.equal(u.items.find(i => i.key === 'privacy').exists, true); assert.equal(u.items.find(i => i.key === 'delete').exists, false);
    assert.equal(u.items.find(i => i.key === 'privacy').en, true);
    assert.equal((await api('urls/check', 'POST', {})).status, 400, 'needs an https domain first');
    await edit(c => { c.site.url = 'https://127.0.0.1'; });
    const r = await api('urls/check', 'POST', {});
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.ok(r.json.results.length >= 4);
    assert.equal(r.json.results.every(x => x.error === 'blocked address'), true, JSON.stringify(r.json.results[0]));
    assert.equal((await api('urls/check', 'POST', {})).status, 429, 'cooldown between runs');
    await edit(c => { c.site.url = ''; });
    const lc = require(path.join(tmp, 'lib/linkcheck'));
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '224.0.0.1']) assert.equal(lc.isPrivate(ip), true, ip);
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111']) assert.equal(lc.isPrivate(ip), false, ip);
    for (const bad of ['http://example.com/', 'https://example.com:8443/', 'https://user:pw@example.com/', 'https://localhost/', 'https://foo.localhost/', 'https://[::1]/', 'https://169.254.169.254/latest', 'ftp://example.com', 'javascript:alert(1)', 'not a url']) assert.throws(() => lc.validate(bad), bad);
    assert.doesNotThrow(() => lc.validate('https://example.com/privacy'));
  });

  await t.test('a site saved before these pages existed gets the defaults, not blanks', async () => {
    const f = path.join(tmp, 'data/content.json'), c = JSON.parse(fs.readFileSync(f, 'utf8'));
    delete c.pages.terms; delete c.legal; delete c.supportFaq; delete c.pages.privacy.bodyEn; delete c.cookies.titleEn; delete c.contact.reportEmail;
    c.contact.email = 'help@example.com'; c.contact.company = 'Acme';
    fs.writeFileSync(f, JSON.stringify(c)); await wait(1200);
    const terms = await get('/terms'); assert.equal(terms.status, 200); assert.match(visible(terms.html), /ข้อตกลงการใช้บริการ/);
    assert.equal((await get('/en/privacy')).status, 200, 'English privacy comes from the defaults');
    assert.match(visible((await get('/privacy')).html), /13 ปี/);
    const c2 = (await api('content')).json;
    assert.ok(c2.pages.terms.body.length > 500 && c2.supportFaq.length === 6 && c2.cookies.titleEn === 'We use cookies');
  });
});

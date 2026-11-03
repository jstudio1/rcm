// Member portal (login, register and the account area), built as a mockup that is ready to be wired to a real API.
// The server only produces the page shells; public/account.js does the work, either against built-in demo data
// ("mock" mode) or against the API the admin points it to ("api" mode). No passwords or personal data touch this server.

const PATHS = {
  '/login': 'login', '/register': 'register', '/forgot-password': 'forgot',
  '/account': 'overview', '/account/profile': 'profile', '/account/security': 'security', '/account/topup': 'topup',
  '/account/history': 'history', '/account/coupon': 'coupon', '/account/items': 'items', '/account/redeem': 'redeem'
};
const PATH_OF = Object.fromEntries(Object.entries(PATHS).map(([p, k]) => [k, p]));

// sidebar of the account area (order and icons follow the design)
const ICON = {
  overview: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  profile: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6',
  security: 'M6 11h12v10H6zM8 11V8a4 4 0 018 0v3',
  topup: 'M3 6h18v12H3zM3 10h18M6 15h4',
  history: 'M3 12a9 9 0 109-9 9 9 0 00-7 3.5M3 4v4h4M12 7v5l3 2',
  coupon: 'M3 7h18v4a2 2 0 000 4v4H3v-4a2 2 0 000-4zM10 7v12',
  items: 'M12 3l4 7H8zM3 14h7v7H3zM17.5 21a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
  redeem: 'M3 9h18v4H3zM5 13v8h14v-8M12 9v12M12 9c-3 0-4-4-1-4 2 0 1 4 1 4zm0 0c3 0 4-4 1-4-2 0-1 4-1 4z'
};
const MENU = [
  ['overview', 'ข้อมูลบัญชี'], ['profile', 'ข้อมูลส่วนตัว'], ['security', 'ความปลอดภัย'], ['topup', 'การเติมเงิน'],
  ['history', 'ประวัติกิจกรรม'], ['coupon', 'คูปอง'], ['items', 'ไอเทมพิเศษ'], ['redeem', 'เติมไอเทมโค้ด']
];
// the page heading, and the last step of the "บัญชีผู้ใช้ › …" trail
const TITLES = {
  login: 'เข้าสู่ระบบ', register: 'สมัครสมาชิก', forgot: 'ลืมรหัสผ่าน',
  overview: 'ข้อมูลบัญชี', profile: 'ข้อมูลส่วนตัว', security: 'ความปลอดภัย', topup: 'การเติมเงิน', history: 'ประวัติกิจกรรม', coupon: 'คูปอง', items: 'ไอเทมพิเศษ', redeem: 'เติมไอเทมโค้ด'
};
const CRUMB = { overview: 'ภาพรวม' };

const on = v => v === true || v === 'true' || v === '1';
const enabled = c => on((c.portal || {}).enabled);
// sign-up also closes by itself at the pre-registration closing time set in the admin
const registerOpen = c => enabled(c) && on((c.portal || {}).registerOpen) && !require('./prereg').closed(c);
const forgotOpen = c => enabled(c) && on((c.portal || {}).forgotOpen);
const topupOn = c => enabled(c) && on((c.portal || {}).topupEnabled) && ((c.topup || {}).methods || []).some(m => on(m.enabled));

// API address typed in the admin, accepted only as an https origin (plain http only for a developer's own machine),
// without credentials. Anything else is ignored, so a typo can never point the page (or its security policy) somewhere odd.
function apiBase(c) {
  const p = c.portal || {};
  if (p.mode !== 'api') return '';
  let u; try { u = new URL(String(p.apiBase || '').trim()); } catch (e) { return ''; }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.username || u.password || !(u.protocol === 'https:' || (u.protocol === 'http:' && local))) return '';
  return u.origin + u.pathname.replace(/\/+$/, '');
}
const apiOrigin = c => { const b = apiBase(c); return b ? new URL(b).origin : ''; };

// endpoint paths the front end may call (must start with "/", no scheme: they are appended to the API address)
const EP_DEFAULT = {
  epLogin: '/auth/login', epRegister: '/auth/register', epLogout: '/auth/logout', epForgot: '/auth/forgot-password', epMe: '/me', epPassword: '/me/password',
  epHistory: '/me/history', epCoupons: '/me/coupons', epItems: '/me/items', epRedeem: '/me/redeem',
  epTopup: '/topup/methods', epTopupRedeem: '/topup/redeem', epTopupCheckout: '/topup/checkout'
};
const epPath = (v, d) => (/^\/(?!\/)[\w\-./]{0,120}$/.test(String(v || '')) && !String(v).includes('..') ? v : d);

module.exports = function make(h) {
  const { esc, ctx, shell, asset, safeUrl, pageExists, legalHref } = h;
  const svg = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON[k]}"/></svg>`;
  const field = (id, label, type, extra) => `<label class="af"><span>${esc(label)}</span><input id="${id}" name="${id}" type="${type}" ${extra || ''}></label>`;

  function cfgOf(c) {
    const p = c.portal || {}, api = apiBase(c);
    const ep = {};
    for (const [k, d] of Object.entries(EP_DEFAULT)) ep[k.slice(2).toLowerCase()] = epPath(p[k], d);
    return {
      mode: api ? 'api' : 'mock', base: api, ep, registerOpen: registerOpen(c), forgotOpen: forgotOpen(c),
      names: { cash: p.cashName || 'แคช', rain: p.rainName || 'เรน', point: p.pointName || 'แต้มพ้อย' }, memberLabel: p.memberLabel || 'MEMBER',
      topup: { on: topupOn(c), title: p.topupTitle || TITLES.topup, methods: ((c.topup || {}).methods || []).filter(m => on(m.enabled)).map(m => ({ id: m.id, name: m.name, title: m.title || m.name, logo: safeUrl(m.logo) || '', mode: m.mode, codeLabel: m.codeLabel, codePh: m.codePh, note: m.note, packages: m.packages })) },
      terms: pageExists(c, 'terms') ? legalHref(c, 'terms') : '', privacy: pageExists(c, 'privacy') ? legalHref(c, 'privacy') : '',
      deleteUrl: pageExists(c, 'delete') ? legalHref(c, 'delete') : '', minAge: ((c.legal || {}).minAge) || ''
    };
  }

  function authBody(c, key) {
    const cfg = cfgOf(c), P = c.portal || {};
    if (key === 'login') return `<form class="acct-card" data-form="login" novalidate>
  <h1 class="disp">${esc(P.loginTitle || TITLES.login)}</h1>
  ${P.loginIntro ? `<p class="aintro">${esc(P.loginIntro)}</p>` : ''}
  ${field('username', 'ชื่อผู้ใช้ หรืออีเมล', 'text', 'autocomplete="username" required maxlength="120"')}
  ${field('password', 'รหัสผ่าน', 'password', 'autocomplete="current-password" required maxlength="200"')}
  ${cfg.forgotOpen ? '<div class="arow"><a href="/forgot-password">ลืมรหัสผ่าน?</a></div>' : ''}
  <p class="aerr" role="alert" aria-live="polite"></p>
  <button class="btn" type="submit">เข้าสู่ระบบ</button>
  ${cfg.registerOpen ? '<p class="aalt">ยังไม่มีบัญชี? <a href="/register">สมัครสมาชิก</a></p>' : ''}
</form>`;
    if (key === 'register') return `<form class="acct-card" data-form="register" novalidate>
  <h1 class="disp">${esc(P.registerTitle || TITLES.register)}</h1>
  ${P.registerIntro ? `<p class="aintro">${esc(P.registerIntro)}</p>` : ''}
  ${field('username', 'ชื่อผู้ใช้ (4–20 ตัว: a-z 0-9 _)', 'text', 'autocomplete="username" required maxlength="20"')}
  ${field('email', 'อีเมล', 'email', 'autocomplete="email" required maxlength="120"')}
  ${field('password', 'รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)', 'password', 'autocomplete="new-password" required maxlength="200"')}
  ${field('password2', 'ยืนยันรหัสผ่าน', 'password', 'autocomplete="new-password" required maxlength="200"')}
  <label class="ack"><input id="agree" type="checkbox"> <span>ฉันยอมรับ${cfg.terms ? ` <a href="${esc(cfg.terms)}" target="_blank" rel="noopener">ข้อตกลงการใช้บริการ</a>` : 'ข้อตกลงการใช้บริการ'} และได้อ่าน${cfg.privacy ? ` <a href="${esc(cfg.privacy)}" target="_blank" rel="noopener">นโยบายความเป็นส่วนตัว</a>` : 'นโยบายความเป็นส่วนตัว'}แล้ว</span></label>
  ${cfg.minAge ? `<label class="ack"><input id="age" type="checkbox"> <span>ฉันมีอายุไม่ต่ำกว่า ${esc(cfg.minAge)} ปี (หรือได้รับความยินยอมจากผู้ปกครอง)</span></label>` : ''}
  <p class="aerr" role="alert" aria-live="polite"></p>
  <button class="btn" type="submit">สมัครสมาชิก</button>
  <p class="aalt">มีบัญชีแล้ว? <a href="/login">เข้าสู่ระบบ</a></p>
</form>`;
    return `<form class="acct-card" data-form="forgot" novalidate>
  <h1 class="disp">${TITLES.forgot}</h1>
  <p class="aintro">ใส่อีเมลที่ใช้สมัคร เราจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้</p>
  ${field('email', 'อีเมล', 'email', 'autocomplete="email" required maxlength="120"')}
  <p class="aerr" role="alert" aria-live="polite"></p><p class="aok" role="status" aria-live="polite"></p>
  <button class="btn" type="submit">ส่งลิงก์</button>
  <p class="aalt"><a href="/login">กลับไปหน้าเข้าสู่ระบบ</a></p>
</form>`;
  }

  function areaBody(c, key) {
    const cfg = cfgOf(c);
    const nav = MENU.filter(([k]) => k !== 'topup' || cfg.topup.on).map(([k, label]) => `<a href="${PATH_OF[k]}"${k === key ? ' class="act" aria-current="page"' : ''}>${svg(k)}<span>${esc(k === 'topup' ? cfg.topup.title : label)}</span></a>`).join('');
    const crumb = `<nav class="acrumb" aria-label="breadcrumb"><span>บัญชีผู้ใช้</span><i>›</i><span${key === 'topup' ? '' : ' aria-current="page"'}>${esc(CRUMB[key] || (key === 'topup' ? cfg.topup.title : TITLES[key]))}</span>${key === 'topup' ? '<i>›</i><span data-crumb aria-current="page"></span>' : ''}</nav>`;
    return `<aside class="acct-side">
  <div class="acct-user"><span class="av" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 4a3.2 3.2 0 110 6.4A3.2 3.2 0 0112 6zm0 14.2a8 8 0 01-6-2.7c.1-2 4-3.1 6-3.1s5.9 1.1 6 3.1a8 8 0 01-6 2.7z"/></svg></span>
    <div><b data-bind="hello">สวัสดี</b><div class="bal"><span><b data-bind="cash">–</b> ${esc(cfg.names.cash)}</span><i></i><span><b data-bind="point">–</b> ${esc(cfg.names.point)}</span></div></div></div>
  <nav class="acct-nav" aria-label="เมนูบัญชี">${nav}<button type="button" class="out" data-logout>ออกจากระบบ</button></nav>
</aside>
<div class="acct-main"><h1 class="disp">${esc(key === 'topup' ? cfg.topup.title : TITLES[key])}</h1>${crumb}<div id="view" aria-live="polite"><p class="aintro">กำลังโหลด…</p></div></div>`;
  }

  return function account(c, base, key) {
    const x = ctx(c, base);
    const isAuth = ['login', 'register', 'forgot'].includes(key);
    const cfg = cfgOf(c);
    const demo = cfg.mode === 'mock' ? '<div class="acct-demo" role="note"><b>MOCKUP</b> หน้านี้เป็นตัวอย่าง ยังไม่ได้เชื่อมต่อระบบสมาชิกจริง ข้อมูลที่เห็นเป็นข้อมูลสมมุติ ไม่มีการเก็บรหัสผ่าน</div>' : '';
    const inner = `<main id="top"><section class="sec pg acct-sec"><div class="wrap">
<link rel="stylesheet" href="${asset('/account.css')}">
${demo}
<div id="acct" class="acct ${isAuth ? 'auth' : 'area'}" data-page="${key}" data-cfg="${esc(JSON.stringify(cfg))}">${isAuth ? authBody(c, key) : areaBody(c, key)}</div>
<noscript><p class="aerr">ต้องเปิด JavaScript เพื่อใช้งานหน้านี้</p></noscript>
</div></section></main>
<script src="${asset('/account.js')}" defer></script>`;
    return shell(x, { path: PATH_OF[key], active: 'account', title: `${key === 'topup' ? cfg.topup.title : TITLES[key]} | ${x.name}`, description: '', noindex: true }, inner);
  };
};
module.exports.PATHS = PATHS; module.exports.PATH_OF = PATH_OF;
module.exports.enabled = enabled; module.exports.registerOpen = registerOpen; module.exports.forgotOpen = forgotOpen; module.exports.topupOn = topupOn;
module.exports.apiBase = apiBase; module.exports.apiOrigin = apiOrigin; module.exports.EP_DEFAULT = EP_DEFAULT;

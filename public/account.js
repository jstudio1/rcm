// Member portal front end: login, register and the account area (overview, profile, security, top-up, history, coupons, items, redeem).
// Two modes, chosen in the admin:
//   mock - demo data kept in this browser only (nothing is sent anywhere, no password or card code is ever stored)
//   api  - the same screens talk to the real API (cfg.base + the endpoint paths below), using the API's own cookie session
// Everything is built with DOM nodes and textContent (no HTML strings), so API data can't inject markup.
(function () {
  'use strict';
  var root = document.getElementById('acct');
  if (!root) return;
  var cfg = {}, page = root.getAttribute('data-page');
  try { cfg = JSON.parse(root.getAttribute('data-cfg') || '{}'); } catch (e) {}
  var MOCK = cfg.mode !== 'api';
  var NAMES = cfg.names || { cash: 'แคช', rain: 'เรน', point: 'แต้มพ้อย' };

  // ---------- small helpers ----------
  function el(tag, attrs) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) { if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k]; else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k]); }
    var add = function (kid) {
      if (kid == null || kid === false) return;
      if (Array.isArray(kid)) { kid.forEach(add); return; }
      e.appendChild(typeof kid === 'object' ? kid : document.createTextNode(String(kid)));
    };
    for (var i = 2; i < arguments.length; i++) add(arguments[i]);
    return e;
  }
  var NS = 'http://www.w3.org/2000/svg';
  function icon(d, cls) {
    var s = document.createElementNS(NS, 'svg'), p = document.createElementNS(NS, 'path');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.8'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
    if (cls) s.setAttribute('class', cls);
    p.setAttribute('d', d); s.appendChild(p); return s;
  }
  var I = {
    arrow: 'M5 12h14M13 6l6 6-6 6', copy: 'M9 9h10v11H9zM5 15V4h10', qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h3v3h-3zM20 14v6h-3',
    wallet: 'M3 7h18v12H3zM3 7l3-3h12l3 3M16 13h2', coin: 'M12 21a9 9 0 100-18 9 9 0 000 18zM9 9h4.5a1.5 1.5 0 010 3H9m0 0h5a1.5 1.5 0 010 3H9m0-6v6', star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
    card: 'M3 6h18v12H3zM3 10h18M6 15h4', shield: 'M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6zM8.5 12l2.5 2.5 4.5-5',
    gift: 'M3 9h18v4H3zM5 13v8h14v-8M12 9v12M12 9c-3 0-4-4-1-4 2 0 1 4 1 4zm0 0c3 0 4-4 1-4-2 0-1 4-1 4z'
  };
  var num = function (n) { return Number(n || 0).toLocaleString('th-TH'); };
  var $ = function (s, r) { return (r || root).querySelector(s); };
  var delay = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var dateTh = function (d) { var t = new Date(d); return isNaN(t) ? '' : t.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }); };
  function since(d) {
    var t = new Date(d); if (isNaN(t)) return '';
    var now = new Date(), m = (now.getFullYear() - t.getFullYear()) * 12 + now.getMonth() - t.getMonth(), day = now.getDate() - t.getDate();
    if (day < 0) { m--; day += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
    return (m > 0 ? m + ' เดือน ' : '') + day + ' วัน';
  }
  // a picture address from the API is only used when it is https or on this site
  var safeSrc = function (u) { return /^(https:\/\/|\/(?!\/))/.test(String(u || '')) ? u : ''; };

  // ---------- demo "backend" (mock mode): lives in localStorage, holds no passwords ----------
  var mem = null, KEY = 'rc_demo_user';
  var demo = {
    get: function () { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return mem; } },
    set: function (u) { mem = u; try { localStorage.setItem(KEY, JSON.stringify(u)); } catch (e) {} },
    clear: function () { mem = null; try { localStorage.removeItem(KEY); } catch (e) {} }
  };
  var ago = function (months) { var d = new Date(); d.setMonth(d.getMonth() - months); d.setDate(d.getDate() - 9); return d.toISOString().slice(0, 10); };
  var newDemoUser = function (name, email, fresh) {
    var y = new Date().getFullYear();
    return { username: name, name: name, email: email || '', phone: '', club: fresh ? '' : 'DEMO', level: fresh ? 1 : 46, uid: 'RC' + String(Math.floor(100000 + Math.random() * 899999)), joined: fresh ? new Date().toISOString().slice(0, 10) : ago(7),
      cash: fresh ? 0 : 900, rain: fresh ? 0 : 10780548, point: fresh ? 0 : 608, pointExpire: y + '-11-30' };
  };
  var DEMO = {
    history: [
      { date: '2026-10-26 21:14', type: 'เข้าสู่ระบบ', detail: 'Android', amount: '' },
      { date: '2026-10-25 18:02', type: 'เติมเงิน', detail: 'Truemoney CashCard', amount: '+5,000 ' + NAMES.cash },
      { date: '2026-10-25 18:10', type: 'ซื้อไอเทม', detail: 'ชุดสีแต่งรถ Neon Pack', amount: '-300 ' + NAMES.cash },
      { date: '2026-10-23 09:40', type: 'แลกรหัส', detail: 'โค้ดต้อนรับ', amount: '+50 ' + NAMES.point }
    ],
    coupons: [
      { code: 'WELCOME-RC', title: 'ส่วนลด 20% ร้านค้าในเกม', expires: '2026-12-31', status: 'ใช้ได้' },
      { code: 'NEON-FREE', title: 'ฟรี Neon Pack 1 วัน', expires: '2026-11-15', status: 'ใช้ได้' },
      { code: 'OLD-2025', title: 'คูปองโปรโมชันปีที่แล้ว', expires: '2025-12-31', status: 'หมดอายุ' }
    ],
    items: [
      { name: 'Neon Pack', qty: 1, note: 'ชุดสีแต่งรถ' }, { name: 'Nitro Boost', qty: 5, note: 'ไอเทมใช้ครั้งเดียว' }, { name: 'ตั๋วเข้าแข่งพิเศษ', qty: 3, note: 'หมดอายุ 2026-12-31' }
    ]
  };
  function mockCall(name, body) {
    var u = demo.get();
    var guard = function () { if (!u) throw Object.assign(new Error('ยังไม่ได้เข้าสู่ระบบ'), { status: 401 }); };
    return delay(250).then(function () {
      switch (name) {
        case 'login': { var uname = String(body.username || '').split('@')[0] || 'player'; u = demo.get() || newDemoUser(uname, '', false); u.username = uname; u.name = u.name || uname; demo.set(u); return { user: u }; }
        case 'register': u = newDemoUser(body.username, body.email, true); demo.set(u); return { user: u };
        case 'logout': demo.clear(); return { ok: true };
        case 'forgot': return { ok: true };
        case 'me': guard(); return u;
        case 'profile': guard(); u.name = body.name || u.name; u.email = body.email || u.email; u.phone = body.phone || ''; u.gender = body.gender || ''; if (body.twofa !== undefined) u.twofa = !!body.twofa; demo.set(u); return u;
        case 'password': guard(); if (!body.current) throw new Error('ใส่รหัสผ่านปัจจุบัน'); return { ok: true };
        case 'history': guard(); return DEMO.history;
        case 'coupons': guard(); return DEMO.coupons;
        case 'items': guard(); return DEMO.items;
        case 'topup': guard(); return { methods: (cfg.topup || {}).methods || [] };
        case 'topupRedeem': {
          guard();
          // demo codes: DEMO-<price> gives that package of the chosen method (e.g. DEMO-150); no real card is ever checked
          var m = /^DEMO-(\d+)$/.exec(String(body.code || '').toUpperCase());
          var meth = ((cfg.topup || {}).methods || []).filter(function (x) { return x.id === body.method; })[0];
          var pk = m && meth && meth.packages.filter(function (x) { return String(x.price).replace(/,/g, '') === m[1]; })[0];
          if (!pk) throw new Error('ไม่พบรหัสนี้ (ตัวอย่าง: DEMO-' + ((meth && meth.packages[0] && meth.packages[0].price) || '50') + ')');
          var c = Number(String(pk.cash).replace(/,/g, '')) || 0, p = Number(String(pk.point).replace(/,/g, '')) || 0;
          u.cash = (u.cash || 0) + c; u.point = (u.point || 0) + p; demo.set(u);
          DEMO.history.unshift({ date: new Date().toISOString().slice(0, 16).replace('T', ' '), type: 'เติมเงิน', detail: meth.name, amount: '+' + num(c) + ' ' + NAMES.cash });
          return { message: 'เติมเงินสำเร็จ ได้รับ ' + num(c) + ' ' + NAMES.cash + ' และ ' + num(p) + ' ' + NAMES.point, user: u };
        }
        case 'topupCheckout': guard(); return { message: 'ตัวอย่าง: เมื่อเชื่อมต่อระบบชำระเงินจริง ระบบจะพาไปหน้าชำระเงินของ ' + (body.methodName || 'ผู้ให้บริการ') + ' สำหรับแพ็กเกจ ฿' + body.price };
        case 'redeem': guard(); if (String(body.code).toUpperCase() !== 'RC-DEMO-1234') throw new Error('ไม่พบรหัสนี้ (ตัวอย่าง: RC-DEMO-1234)'); u.point = (u.point || 0) + 100; demo.set(u); return { message: 'แลกรหัสสำเร็จ ได้รับ 100 ' + NAMES.point, user: u };
      }
      throw new Error('unknown call');
    });
  }

  // ---------- the real API (api mode) ----------
  // method + path for each call. The API is expected to answer JSON and to keep the login in its own cookie (HttpOnly, SameSite, Secure).
  var CALL = { login: ['POST', 'login'], register: ['POST', 'register'], logout: ['POST', 'logout'], forgot: ['POST', 'forgot'], me: ['GET', 'me'], profile: ['PUT', 'me'], password: ['POST', 'password'],
    history: ['GET', 'history'], coupons: ['GET', 'coupons'], items: ['GET', 'items'], redeem: ['POST', 'redeem'],
    topup: ['GET', 'topup'], topupRedeem: ['POST', 'topupredeem'], topupCheckout: ['POST', 'topupcheckout'] };
  function apiCall(name, body) {
    var c = CALL[name], path = (cfg.ep || {})[c[1]];
    var opt = { method: c[0], credentials: 'include', headers: { Accept: 'application/json' } };
    if (c[0] !== 'GET') { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body || {}); }
    return fetch(cfg.base + path, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw Object.assign(new Error(d.message || d.error || 'เกิดข้อผิดพลาด (' + r.status + ')'), { status: r.status });
        return d;
      });
    }, function () { throw new Error('เชื่อมต่อระบบสมาชิกไม่ได้ ลองใหม่อีกครั้ง'); });
  }
  var call = function (name, body) { return MOCK ? mockCall(name, body) : apiCall(name, body); };
  var userOf = function (d) { return d && d.user ? d.user : d; };

  // ---------- forms ----------
  function busy(form, on) { var b = $('button[type=submit]', form); if (b) b.disabled = on; }
  function showErr(form, msg) { var p = $('.aerr', form); if (p) p.textContent = msg || ''; }
  function val(form, id) { var i = $('#' + id, form); return i ? i.value : ''; }
  function wire(form, handler) {
    form.addEventListener('submit', function (e) {
      e.preventDefault(); showErr(form, '');
      var msg = handler(form);
      if (typeof msg === 'string') { showErr(form, msg); return; }
      busy(form, true);
      msg.then(null, function (err) { showErr(form, err.message || 'เกิดข้อผิดพลาด'); }).then(function () { busy(form, false); });
    });
  }

  if (page === 'login') wire($('[data-form=login]'), function (f) {
    if (!val(f, 'username').trim() || !val(f, 'password')) return 'กรอกชื่อผู้ใช้และรหัสผ่าน';
    return call('login', { username: val(f, 'username').trim(), password: val(f, 'password') }).then(function () { location.href = '/account'; });
  });
  if (page === 'register') wire($('[data-form=register]'), function (f) {
    var u = val(f, 'username').trim(), em = val(f, 'email').trim(), p = val(f, 'password');
    if (!/^[A-Za-z0-9_]{4,20}$/.test(u)) return 'ชื่อผู้ใช้ต้องยาว 4–20 ตัว ใช้ a-z, 0-9 และ _ เท่านั้น';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return 'อีเมลไม่ถูกต้อง';
    if (p.length < 8) return 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร';
    if (p !== val(f, 'password2')) return 'รหัสผ่านไม่ตรงกัน';
    if (!$('#agree', f).checked) return 'ต้องยอมรับข้อตกลงและนโยบายความเป็นส่วนตัว';
    if ($('#age', f) && !$('#age', f).checked) return 'ต้องยืนยันอายุตามเงื่อนไข';
    return call('register', { username: u, email: em, password: p }).then(function () { location.href = '/account'; });
  });
  if (page === 'forgot') wire($('[data-form=forgot]'), function (f) {
    var em = val(f, 'email').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return 'อีเมลไม่ถูกต้อง';
    return call('forgot', { email: em }).then(function () { $('.aok', f).textContent = 'ถ้าอีเมลนี้มีบัญชี เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ให้แล้ว'; });
  });
  if (['login', 'register', 'forgot'].indexOf(page) >= 0) return;

  // ---------- account area ----------
  var view = $('#view'), me = null;
  function bind(u) {
    var set = function (k, v) { var n = $('[data-bind=' + k + ']'); if (n) n.textContent = v; };
    set('hello', 'สวัสดี, ' + (u.name || u.username || 'ผู้เล่น')); set('cash', num(u.cash)); set('point', num(u.point));
  }
  function out() { call('logout').then(null, function () {}).then(function () { location.href = '/login'; }); }
  var lo = $('[data-logout]'); if (lo) lo.addEventListener('click', out);

  function field(id, label, type, value, attrs) {
    var i = el('input', Object.assign({ id: id, name: id, type: type || 'text' }, attrs || {})); if (value != null) i.value = value;
    return el('label', { class: 'af' }, el('span', { text: label }), i);
  }
  function formWith(title, fields, submitText, onSubmit, okText) {
    var f = el('form', { class: 'acct-card wide', novalidate: '' }, title ? el('h2', { text: title }) : null);
    fields.forEach(function (x) { f.appendChild(x); });
    var err = el('p', { class: 'aerr', role: 'alert' }), ok = el('p', { class: 'aok', role: 'status' });
    f.appendChild(err); f.appendChild(ok); f.appendChild(el('button', { class: 'btn', type: 'submit', text: submitText }));
    f.addEventListener('submit', function (e) {
      e.preventDefault(); err.textContent = ''; ok.textContent = '';
      var r = onSubmit(f);
      if (typeof r === 'string') { err.textContent = r; return; }
      var b = f.querySelector('button'); b.disabled = true;
      r.then(function (d) { ok.textContent = (d && d.message) || okText || 'บันทึกแล้ว'; }, function (x) { err.textContent = x.message; }).then(function () { b.disabled = false; });
    });
    return f;
  }
  var notice = function (t) { return el('p', { class: 'aintro', text: t }); };
  function table(cols, rows, empty) {
    if (!rows || !rows.length) return notice(empty);
    var t = el('table', { class: 'atable' }), tr = el('tr');
    cols.forEach(function (c) { tr.appendChild(el('th', { text: c[0] })); }); t.appendChild(el('thead', null, tr));
    var tb = el('tbody'); rows.forEach(function (r) { var row = el('tr'); cols.forEach(function (c) { row.appendChild(el('td', { 'data-l': c[0], text: r[c[1]] == null ? '' : r[c[1]] })); }); tb.appendChild(row); });
    t.appendChild(tb); return el('div', { class: 'scroll' }, t);
  }

  // member card + the "tap for QR" window. The picture is a sample pattern: a real QR code comes from the game's API.
  function qrWindow(uid) {
    var back = el('div', { class: 'qr-back', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'QR' });
    var seed = 0; for (var i = 0; i < uid.length; i++) seed = (seed * 31 + uid.charCodeAt(i)) >>> 0;
    var grid = el('div', { class: 'qr-grid', 'aria-hidden': 'true' });
    for (var n = 0; n < 169; n++) { seed = (seed * 1664525 + 1013904223) >>> 0; var x = n % 13, y = Math.floor(n / 13), eye = (x < 4 && y < 4) || (x > 8 && y < 4) || (x < 4 && y > 8); grid.appendChild(el('i', { class: eye || seed % 3 === 0 ? 'on' : '' })); }
    var close = el('button', { class: 'btn', type: 'button', text: 'ปิด' });
    var shut = function () { back.remove(); document.removeEventListener('keydown', esc); };
    var esc = function (e) { if (e.key === 'Escape') shut(); };
    close.addEventListener('click', shut); back.addEventListener('click', function (e) { if (e.target === back) shut(); });
    document.addEventListener('keydown', esc);
    back.appendChild(el('div', { class: 'qr-box' }, grid, el('b', { text: uid }), el('small', { text: MOCK ? 'ตัวอย่างลวดลาย (QR จริงจะแสดงเมื่อเชื่อมต่อระบบสมาชิก)' : 'แสดง QR นี้เพื่อยืนยันสมาชิก' }), close));
    document.body.appendChild(back); close.focus();
  }
  function memberCard(u) {
    var uid = u.uid || ('RC' + String(u.id || '000000')), copy = el('button', { class: 'mc-copy', type: 'button', 'aria-label': 'คัดลอก UID' }, icon(I.copy));
    copy.addEventListener('click', function () {
      var done = function () { copy.classList.add('ok'); setTimeout(function () { copy.classList.remove('ok'); }, 1200); };
      if (navigator.clipboard) navigator.clipboard.writeText(uid).then(done, function () {}); else done();
    });
    var qr = el('button', { class: 'mc-qr', type: 'button' }, icon(I.qr), el('span', { text: 'แตะเพื่อดู QR' }));
    qr.addEventListener('click', function () { qrWindow(uid); });
    return el('div', { class: 'mcard' }, el('span', { class: 'mc-r', 'aria-hidden': 'true', text: 'R' }), el('span', { class: 'mc-label', text: cfg.memberLabel || 'MEMBER' }),
      el('img', { class: 'mc-logo', src: '/img/logo.png', alt: '', width: '34', height: '34' }),
      el('div', { class: 'mc-uid' }, el('small', { text: 'MEMBER UID' }), el('div', {}, el('b', { text: uid }), copy)), qr);
  }

  // stacked sections shared by personal data and security: title + short text on the left, fields on the right
  var pf = function (id, label, value, attrs) {
    var inp = el('input', Object.assign({ id: id, name: id, type: 'text', placeholder: ' ' }, attrs || {})); inp.value = value || '';
    return el('label', { class: 'pf-f' }, inp, el('span', { text: label }));
  };
  var section = function (title, desc, fields, onSave, saveText) {
    var form = el('form', { class: 'pf-sec', novalidate: '' }, el('div', { class: 'pf-l' }, el('h2', { text: title }), desc ? el('p', { text: desc }) : null), el('div', { class: 'pf-r' }));
    var right = form.lastChild; fields.forEach(function (f) { right.appendChild(f); });
    if (onSave) {
      var err = el('p', { class: 'aerr', role: 'alert' }), ok = el('p', { class: 'aok', role: 'status' }), b = el('button', { class: 'btn sm', type: 'submit', text: saveText || 'บันทึก' });
      right.appendChild(err); right.appendChild(ok); right.appendChild(b);
      form.addEventListener('submit', function (e) {
        e.preventDefault(); err.textContent = ''; ok.textContent = '';
        var r = onSave(form); if (typeof r === 'string') { err.textContent = r; return; }
        b.disabled = true; r.then(function () { ok.textContent = 'บันทึกแล้ว'; }, function (x) { err.textContent = x.message; }).then(function () { b.disabled = false; });
      });
    }
    return form;
  };

  var VIEWS = {
    overview: function () {
      var box = el('div', { class: 'ov' });
      var tabs = el('div', { class: 'ov-tabs', role: 'tablist' }), panes = el('div');
      var wallet = el('div', { class: 'ov-pane', role: 'tabpanel' }), personal = el('div', { class: 'ov-pane', role: 'tabpanel', hidden: '' });
      var cashBox = el('div', { class: 'wal-main' }, el('div', {},
        el('small', { class: 'wal-l' }, icon(I.wallet), el('span', { text: 'ยอด' + NAMES.cash + 'คงเหลือ' })),
        el('div', { class: 'wal-n' }, el('b', { text: num(me.cash) }), el('span', { text: NAMES.cash })),
        el('p', { text: NAMES.cash + 'สำหรับใช้จ่ายในเกมและไอเทมพิเศษ' })),
        (cfg.topup && cfg.topup.on) ? el('a', { class: 'btn sm', href: '/account/topup' }, 'เติมเงิน ', icon(I.arrow)) : null);
      var pt = me.pointExpire ? num(me.point) + ' ' + NAMES.point + ' หมดอายุ ' + dateTh(me.pointExpire) : 'ใช้ได้ตามเงื่อนไขของแต้ม';
      wallet.appendChild(el('div', { class: 'wal' }, cashBox, el('div', { class: 'wal-two' },
        el('div', {}, el('small', { class: 'wal-l' }, icon(I.coin), el('span', { text: NAMES.rain })), el('b', { text: num(me.rain) }), el('p', { text: 'สกุลเงิน ' + NAMES.rain + ' ของตัวละครคุณ' })),
        el('div', {}, el('small', { class: 'wal-l' }, icon(I.star), el('span', { text: NAMES.point })), el('b', { text: num(me.point) }), el('p', { text: pt })))));
      personal.appendChild(el('div', { class: 'wal' }, el('dl', { class: 'ov-dl' },
        el('div', {}, el('dt', { text: 'ชื่อที่แสดง' }), el('dd', { text: me.name || me.username || '' })),
        el('div', {}, el('dt', { text: 'ชื่อผู้ใช้' }), el('dd', { text: me.username || '' })),
        el('div', {}, el('dt', { text: 'อีเมล' }), el('dd', { text: me.email || '–' })),
        el('div', {}, el('dt', { text: 'เบอร์โทร' }), el('dd', { text: me.phone || '–' }))),
        el('a', { class: 'ghost sm', href: '/account/profile', text: 'แก้ไขข้อมูลส่วนตัว' })));
      [['กระเป๋าเงิน', wallet], ['ข้อมูลส่วนตัว', personal]].forEach(function (x, i) {
        var b = el('button', { type: 'button', role: 'tab', 'aria-selected': i ? 'false' : 'true', class: i ? '' : 'on', text: x[0] });
        b.addEventListener('click', function () { [].forEach.call(tabs.children, function (k) { var on = k === b; k.classList.toggle('on', on); k.setAttribute('aria-selected', on ? 'true' : 'false'); }); wallet.hidden = i !== 0; personal.hidden = i !== 1; });
        tabs.appendChild(b);
      });
      panes.appendChild(wallet); panes.appendChild(personal);
      box.appendChild(el('div', { class: 'ov-band', 'aria-hidden': 'true' }));
      box.appendChild(el('div', { class: 'ov-panel' },
        el('div', { class: 'ov-top' },
          el('div', { class: 'ov-card' }, memberCard(me), el('dl', { class: 'ov-meta' },
            el('div', {}, el('dt', { text: 'เป็นสมาชิกเมื่อ' }), el('dd', { text: dateTh(me.joined) || '–' })),
            el('div', {}, el('dt', { text: 'เป็นสมาชิกมาแล้ว' }), el('dd', { text: since(me.joined) || '–' })))),
          el('div', { class: 'ov-who' }, me.level ? el('span', { class: 'lv', text: 'LV. ' + me.level }) : null, el('h2', { text: me.name || me.username || 'ผู้เล่น' }),
            el('p', { text: 'สวัสดี, ' + (me.username || '') + (me.club ? ' · คลับ ' + me.club : '') }))),
        tabs, panes));
      return box;
    },
    profile: function () {
      // stacked sections: the title and a short explanation on the left, the fields on the right
      var box = el('div', { class: 'pf' });
      var save = function (extra) { return call('profile', Object.assign({ name: me.name, email: me.email, phone: me.phone || '', gender: me.gender || '' }, extra)).then(function (d) { me = userOf(d) || me; bind(me); }); };
      var mask = function (em) { var m = /^([^@]{1,3})([^@]*)(@.+)$/.exec(String(em || '')); return m ? m[1] + new Array(Math.max(m[2].length, 3) + 1).join('*') + m[3] : (em || '–'); };
      box.appendChild(section(cfg.idLabel || 'RAYCITY-M ID', 'ข้อมูล', [pf('pf-name', 'ชื่อตัวละคร', me.name || me.username, { readonly: '' }), pf('pf-user', 'ชื่อผู้ใช้', me.username, { readonly: '' })]));
      var sel = el('select', { id: 'pf-gender' }, el('option', { value: '', text: 'ไม่ระบุ' }), el('option', { value: 'male', text: 'ชาย' }), el('option', { value: 'female', text: 'หญิง' }));
      sel.value = me.gender || '';
      box.appendChild(section('เพศ', 'เพศนี้จะแสดงในเกมในรูปแบบตัวละครของคุณ', [el('label', { class: 'pf-f pf-sel' }, sel, el('span', { text: 'เพศ' })), el('p', { class: 'pf-note', text: 'ภายใน 1 วัน คุณทำรายการได้เพียง 3 ครั้งเท่านั้น' })],
        function () { return save({ gender: sel.value }); }));
      box.appendChild(section('อีเมล', 'อีเมลนี้ใช้สำหรับเข้าสู่ระบบ และการยืนยันตัวตนในธุรกรรมต่าง ๆ โปรดตรวจสอบให้แน่ใจก่อนดำเนินการ', [pf('pf-email', 'อีเมล', mask(me.email), { readonly: '' }), el('p', { class: 'pf-note', text: 'การเปลี่ยนอีเมลต้องยืนยันผ่านอีเมลเดิม (ทำผ่านระบบสมาชิกจริง)' })]));
      box.appendChild(section('เบอร์โทร', 'ใช้ติดต่อกรณีมีปัญหากับบัญชี ไม่บังคับ', [pf('pf-phone', 'เบอร์โทร', me.phone, { type: 'tel', maxlength: '20', inputmode: 'tel', autocomplete: 'tel' })],
        function (f) { var v = f.querySelector('#pf-phone').value.trim(); if (v && !/^[0-9+\-\s]{6,20}$/.test(v)) return 'เบอร์โทรไม่ถูกต้อง'; return save({ phone: v }); }));
      return box;
    },
    security: function () {
      var box = el('div', { class: 'pf' });
      box.appendChild(section('เข้าสู่ระบบด้วย ' + (cfg.idLabel || 'RAYCITY-M ID'), 'รหัสผ่านบัญชี', [
        el('div', { class: 'pf-h' }, el('b', { text: 'เปลี่ยนรหัสผ่าน' }), el('span', { text: 'กำหนดรหัสผ่านใหม่' })),
        pf('sc-cur', 'รหัสผ่านปัจจุบัน', '', { type: 'password', autocomplete: 'current-password', maxlength: '200' }),
        pf('sc-new', 'รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)', '', { type: 'password', autocomplete: 'new-password', maxlength: '200' }),
        pf('sc-new2', 'ยืนยันรหัสผ่าน', '', { type: 'password', autocomplete: 'new-password', maxlength: '200' })],
      function (f) {
        var v = function (id) { return f.querySelector('#' + id).value; };
        if (!v('sc-cur')) return 'ใส่รหัสผ่านปัจจุบัน';
        if (v('sc-new').length < 8) return 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร';
        if (v('sc-new') !== v('sc-new2')) return 'รหัสผ่านใหม่ไม่ตรงกัน';
        return call('password', { current: v('sc-cur'), next: v('sc-new') }).then(function (d) { f.reset(); return d; });
      }, 'ดำเนินการต่อ'));
      // two-step sign-in: switched on and off here in the mockup; the real thing is done by the game's API
      var on = !!me.twofa, tf = el('button', { class: 'btn sm', type: 'button' });
      var note = el('p', { class: 'pf-note', text: MOCK ? '' : 'รอเชื่อมต่อ API' });
      var paint = function () { tf.textContent = on ? 'ปิดใช้งาน' : 'เปิดใช้งาน'; tf.classList.toggle('ghost', on); stateEl.textContent = on ? 'เปิดอยู่' : 'ปิดอยู่'; stateEl.className = 'pf-st' + (on ? ' on' : ''); };
      var stateEl = el('em');
      if (!MOCK) tf.disabled = true;
      tf.addEventListener('click', function () {
        tf.disabled = true;
        call('profile', { name: me.name, email: me.email, phone: me.phone || '', gender: me.gender || '', twofa: !on }).then(function (d) { me = userOf(d) || me; on = !!me.twofa; paint(); }, function (e) { note.textContent = e.message; }).then(function () { tf.disabled = !MOCK; });
      });
      paint();
      box.appendChild(section('2FA', 'การยืนยันตัวตนแบบสองขั้นตอน', [
        el('div', { class: 'pf-2fa' }, el('span', { class: 'ic', 'aria-hidden': 'true' }, icon(I.shield)), el('div', {}, el('b', { text: 'การยืนยันแบบสองขั้นตอนด้วยแอป Authenticator' }), stateEl), tf), note]));
      if (cfg.deleteUrl) box.appendChild(section('ลบบัญชี', 'ลบบัญชีและข้อมูลส่วนบุคคลของคุณ', [el('p', { class: 'pf-note' }, 'อ่านขั้นตอนและผลที่ตามมาก่อนดำเนินการ ', el('a', { href: cfg.deleteUrl, text: 'ดูขั้นตอนการลบบัญชี' }))]));
      return box;
    },
    topup: function () {
      var box = el('div', { class: 'tp' });
      if (!(cfg.topup && cfg.topup.on)) { box.appendChild(notice('ยังไม่เปิดให้เติมเงิน')); return box; }
      var tiles = el('div', { class: 'tp-tiles', role: 'group', 'aria-label': 'ช่องทางเติมเงิน' }), body = el('div', { class: 'tp-body' }), crumb = $('[data-crumb]');
      box.appendChild(tiles); box.appendChild(body);
      var money = function (v) { return Number(String(v).replace(/,/g, '')) || 0; };
      function pick(m, btn) {
        [].forEach.call(tiles.children, function (b) { b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
        if (crumb) crumb.textContent = m.title || m.name;
        var chosen = null, checkout = m.mode === 'checkout';
        var rows = (m.packages || []).map(function (pk, i) {
          var tr = el('tr', checkout ? { tabindex: '0', 'data-i': String(i), 'aria-selected': 'false' } : {},
            el('td', { 'data-l': 'ราคา' }, el('span', { class: 'baht', text: '฿' }), ' ' + num(money(pk.price))),
            el('td', { 'data-l': NAMES.cash, text: num(money(pk.cash)) + ' ' + NAMES.cash }),
            el('td', { 'data-l': NAMES.point }, num(money(pk.point)) + ' ', icon(I.coin, 'cn')));
          if (checkout) {
            var sel = function () { chosen = pk; [].forEach.call(tr.parentNode.children, function (r) { r.setAttribute('aria-selected', r === tr ? 'true' : 'false'); }); sum.textContent = 'แพ็กเกจที่เลือก: ฿' + num(money(pk.price)) + ' · ' + num(money(pk.cash)) + ' ' + NAMES.cash; };
            tr.addEventListener('click', sel); tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sel(); } });
          }
          return tr;
        });
        var sum = el('p', { class: 'tp-sum', text: checkout ? 'เลือกแพ็กเกจจากตารางด้านซ้าย' : '' });
        var left = el('div', { class: 'tp-left' }, el('h2', { text: m.title || m.name }),
          rows.length ? el('div', { class: 'scroll' }, el('table', { class: 'atable tp-table' }, el('thead', null, el('tr', null, el('th', { text: 'ราคา' }), el('th', { text: NAMES.cash }), el('th', { text: NAMES.point }))), el('tbody', null, rows))) : notice('ยังไม่มีแพ็กเกจ'));
        var err = el('p', { class: 'aerr', role: 'alert' }), ok = el('p', { class: 'aok', role: 'status' }), btn, right;
        if (checkout) {
          btn = el('button', { class: 'btn tp-go', type: 'submit' }, 'ชำระเงิน ', icon(I.arrow));
          right = el('form', { class: 'tp-right', novalidate: '' }, el('h2', { text: 'ชำระเงิน' }), m.note ? el('p', { class: 'aintro', text: m.note }) : null, sum, err, ok, btn);
          right.addEventListener('submit', function (e) {
            e.preventDefault(); err.textContent = ''; ok.textContent = '';
            if (!chosen) { err.textContent = 'เลือกแพ็กเกจก่อน'; return; }
            btn.disabled = true;
            call('topupCheckout', { method: m.id, methodName: m.name, price: money(chosen.price) }).then(function (d) {
              if (d && typeof d.url === 'string' && /^https:\/\//.test(d.url)) { location.assign(d.url); return; }
              ok.textContent = (d && d.message) || 'สร้างรายการชำระเงินแล้ว';
            }, function (x) { err.textContent = x.message; }).then(function () { btn.disabled = false; });
          });
        } else {
          var inp = el('input', { id: 'tcode', name: 'tcode', type: 'text', maxlength: '40', autocomplete: 'off', placeholder: m.codePh || 'กรอกรหัส…' });
          btn = el('button', { class: 'btn tp-go', type: 'submit' }, 'ใช้งาน ', icon(I.arrow));
          right = el('form', { class: 'tp-right', novalidate: '' }, el('h2', { text: m.codeLabel || 'กรอกรหัสบัตร' }), inp, MOCK ? el('p', { class: 'aintro', text: 'ตัวอย่าง: พิมพ์ DEMO-' + ((m.packages && m.packages[0] && m.packages[0].price) || '50') + ' เพื่อทดลองเติมแพ็กเกจนั้น (ไม่ใช่บัตรจริง)' }) : (m.note ? el('p', { class: 'aintro', text: m.note }) : null), err, ok, btn);
          right.addEventListener('submit', function (e) {
            e.preventDefault(); err.textContent = ''; ok.textContent = '';
            var code = inp.value.trim();
            if (!/^[A-Za-z0-9-]{4,40}$/.test(code)) { err.textContent = 'รูปแบบรหัสไม่ถูกต้อง'; return; }
            btn.disabled = true;
            call('topupRedeem', { method: m.id, code: code }).then(function (d) { if (d && d.user) { me = d.user; bind(me); } inp.value = ''; ok.textContent = (d && d.message) || 'เติมเงินสำเร็จ'; }, function (x) { err.textContent = x.message; }).then(function () { btn.disabled = false; });
          });
        }
        body.replaceChildren(el('div', { class: 'tp-grid' }, left, right));
      }
      call('topup').then(function (d) {
        var list = (d && d.methods) || d || [];
        if (!list.length) { body.appendChild(notice('ยังไม่มีช่องทางเติมเงิน')); return; }
        list.forEach(function (m, i) {
          var logo = safeSrc(m.logo);
          var b = el('button', { type: 'button', class: 'tp-tile', 'aria-pressed': 'false', 'aria-label': m.name }, logo ? el('img', { src: logo, alt: m.name, loading: 'lazy' }) : el('span', { class: 'tp-ic' }, icon(m.mode === 'checkout' ? I.wallet : I.card), el('b', { text: m.name })));
          b.addEventListener('click', function () { pick(m, b); });
          tiles.appendChild(b);
          if (i === 0) pick(m, b);
        });
      }, function (e) { body.appendChild(notice(e.message)); });
      return box;
    },
    history: function () {
      var box = el('div'); call('history').then(function (d) { box.appendChild(table([['เวลา', 'date'], ['รายการ', 'type'], ['รายละเอียด', 'detail'], ['จำนวน', 'amount']], d.items || d, 'ยังไม่มีประวัติการใช้งาน')); }, function (e) { box.appendChild(notice(e.message)); });
      return box;
    },
    coupon: function () {
      var box = el('div', { class: 'agrid' });
      call('coupons').then(function (d) {
        var l = d.items || d; if (!l.length) box.appendChild(notice('ยังไม่มีคูปอง'));
        l.forEach(function (c) { box.appendChild(el('div', { class: 'acard' + (c.status === 'ใช้ได้' ? '' : ' off') }, el('b', { text: c.title }), el('code', { text: c.code }), el('small', { text: 'หมดอายุ ' + c.expires + ' · ' + c.status }))); });
      }, function (e) { box.appendChild(notice(e.message)); });
      return box;
    },
    items: function () {
      var box = el('div', { class: 'agrid' });
      call('items').then(function (d) {
        var l = d.items || d; if (!l.length) box.appendChild(notice('ยังไม่มีไอเทมพิเศษ'));
        l.forEach(function (c) { box.appendChild(el('div', { class: 'acard' }, el('b', { text: c.name }), el('code', { text: '× ' + c.qty }), el('small', { text: c.note || '' }))); });
      }, function (e) { box.appendChild(notice(e.message)); });
      return box;
    },
    redeem: function () {
      return formWith('', [field('code', 'รหัสแลกไอเทม', 'text', '', { maxlength: 40, autocomplete: 'off', placeholder: 'XXXX-XXXX-XXXX' })], 'แลกรหัส', function (f) {
        var c = val(f, 'code').trim();
        if (!/^[A-Za-z0-9-]{4,40}$/.test(c)) return 'รูปแบบรหัสไม่ถูกต้อง';
        return call('redeem', { code: c }).then(function (d) { if (d && d.user) { me = d.user; bind(me); } f.reset(); return d; });
      }, 'แลกรหัสสำเร็จ');
    }
  };

  call('me').then(function (d) {
    me = userOf(d) || {}; bind(me);
    view.replaceChildren(VIEWS[page]());
  }, function (e) {
    if (e.status === 401) { location.replace('/login'); return; }
    view.replaceChildren(notice(e.message));
  });
})();

// Member portal front end: login, register and the account area.
// Two modes, chosen in the admin:
//   mock - demo data kept in this browser only (nothing is sent anywhere, no password is ever stored)
//   api  - the same screens talk to the real API (cfg.base + the endpoint paths below), using the API's own cookie session
// Everything is built with DOM nodes and textContent (no HTML strings), so API data can't inject markup.
(function () {
  'use strict';
  var root = document.getElementById('acct');
  if (!root) return;
  var cfg = {}, page = root.getAttribute('data-page');
  try { cfg = JSON.parse(root.getAttribute('data-cfg') || '{}'); } catch (e) {}
  var MOCK = cfg.mode !== 'api';

  // ---------- small helpers ----------
  function el(tag, attrs) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) { if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k]; else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k]); }
    for (var i = 2; i < arguments.length; i++) { var kid = arguments[i]; if (kid != null && kid !== false) e.appendChild(typeof kid === 'object' ? kid : document.createTextNode(String(kid))); }
    return e;
  }
  var num = function (n) { return Number(n || 0).toLocaleString('th-TH'); };
  var $ = function (s, r) { return (r || root).querySelector(s); };
  var delay = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  // ---------- demo "backend" (mock mode): lives in localStorage, holds no passwords ----------
  var mem = null, KEY = 'rc_demo_user';
  var demo = {
    get: function () { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return mem; } },
    set: function (u) { mem = u; try { localStorage.setItem(KEY, JSON.stringify(u)); } catch (e) {} },
    clear: function () { mem = null; try { localStorage.removeItem(KEY); } catch (e) {} }
  };
  var DEMO = {
    history: [
      { date: '2026-10-26 21:14', type: 'เข้าสู่ระบบ', detail: 'Windows PC', amount: '' },
      { date: '2026-10-25 18:02', type: 'เติมเงิน', detail: 'เติม Cash ผ่านพร้อมเพย์', amount: '+1,000 Cash' },
      { date: '2026-10-25 18:10', type: 'ซื้อไอเทม', detail: 'ชุดสีแต่งรถ Neon Pack', amount: '-300 Cash' },
      { date: '2026-10-23 09:40', type: 'แลกรหัส', detail: 'โค้ดต้อนรับ', amount: '+50 Point' }
    ],
    coupons: [
      { code: 'WELCOME-RC', title: 'ส่วนลด 20% ร้านค้าในเกม', expires: '2026-12-31', status: 'ใช้ได้' },
      { code: 'NEON-FREE', title: 'ฟรี Neon Pack 1 วัน', expires: '2026-11-15', status: 'ใช้ได้' },
      { code: 'OLD-2025', title: 'คูปองโปรโมชันปีที่แล้ว', expires: '2025-12-31', status: 'หมดอายุ' }
    ],
    items: [
      { name: 'Neon Pack', qty: 1, note: 'ชุดสีแต่งรถ' }, { name: 'Nitro Boost', qty: 5, note: 'ไอเทมใช้ครั้งเดียว' }, { name: 'ตั๋วเข้าแข่งพิเศษ', qty: 3, note: 'หมดอายุ 2026-12-31' }
    ],
    payments: [{ type: 'พร้อมเพย์', label: 'พร้อมเพย์ ••• 4821', note: 'ตัวอย่าง' }, { type: 'บัตรเครดิต', label: 'Visa ••• 4242', note: 'หมดอายุ 08/28 (ตัวอย่าง)' }]
  };
  function mockCall(name, body) {
    var u = demo.get();
    var guard = function () { if (!u) throw Object.assign(new Error('ยังไม่ได้เข้าสู่ระบบ'), { status: 401 }); };
    return delay(250).then(function () {
      switch (name) {
        case 'login': u = demo.get() || { cash: 5800, point: 608, email: '', phone: '' }; u.username = String(body.username || '').split('@')[0] || 'player'; u.name = u.name || u.username; demo.set(u); return { user: u };
        case 'register': u = { username: body.username, name: body.username, email: body.email, phone: '', cash: 0, point: 0 }; demo.set(u); return { user: u };
        case 'logout': demo.clear(); return { ok: true };
        case 'forgot': return { ok: true };
        case 'me': guard(); return u;
        case 'profile': guard(); u.name = body.name || u.name; u.email = body.email || u.email; u.phone = body.phone || ''; demo.set(u); return u;
        case 'password': guard(); if (!body.current) throw new Error('ใส่รหัสผ่านปัจจุบัน'); return { ok: true };
        case 'history': guard(); return DEMO.history;
        case 'coupons': guard(); return DEMO.coupons;
        case 'items': guard(); return DEMO.items;
        case 'payments': guard(); return DEMO.payments;
        case 'redeem': guard(); if (String(body.code).toUpperCase() !== 'RC-DEMO-1234') throw new Error('ไม่พบรหัสนี้ (ตัวอย่าง: RC-DEMO-1234)'); u.point = (u.point || 0) + 100; demo.set(u); return { message: 'แลกรหัสสำเร็จ ได้รับ 100 Point', user: u };
      }
      throw new Error('unknown call');
    });
  }

  // ---------- the real API (api mode) ----------
  // method + path for each call. The API is expected to answer JSON and to keep the login in its own cookie (HttpOnly, SameSite, Secure).
  var CALL = { login: ['POST', 'login'], register: ['POST', 'register'], logout: ['POST', 'logout'], forgot: ['POST', 'forgot'], me: ['GET', 'me'], profile: ['PUT', 'me'], password: ['POST', 'password'],
    history: ['GET', 'history'], coupons: ['GET', 'coupons'], items: ['GET', 'items'], payments: ['GET', 'payments'], redeem: ['POST', 'redeem'] };
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

  var VIEWS = {
    overview: function () {
      var box = el('div');
      box.appendChild(el('div', { class: 'astats' },
        el('div', { class: 'astat' }, el('small', { text: 'Cash' }), el('b', { text: num(me.cash) })),
        el('div', { class: 'astat' }, el('small', { text: 'Point' }), el('b', { text: num(me.point) })),
        el('div', { class: 'astat' }, el('small', { text: 'ชื่อผู้ใช้' }), el('b', { text: me.username || me.name || '' }))));
      var hist = el('div'); box.appendChild(el('h2', { text: 'กิจกรรมล่าสุด' })); box.appendChild(hist);
      call('history').then(function (d) { hist.appendChild(table([['เวลา', 'date'], ['รายการ', 'type'], ['รายละเอียด', 'detail'], ['จำนวน', 'amount']], (d.items || d).slice(0, 5), 'ยังไม่มีกิจกรรม')); }, function () { hist.appendChild(notice('โหลดกิจกรรมไม่ได้')); });
      return box;
    },
    profile: function () {
      return formWith('', [field('name', 'ชื่อที่แสดง', 'text', me.name, { maxlength: 40 }), field('email', 'อีเมล', 'email', me.email, { maxlength: 120 }), field('phone', 'เบอร์โทร (ไม่บังคับ)', 'tel', me.phone, { maxlength: 20 })], 'บันทึกข้อมูล', function (f) {
        var em = val(f, 'email').trim();
        if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return 'อีเมลไม่ถูกต้อง';
        return call('profile', { name: val(f, 'name').trim(), email: em, phone: val(f, 'phone').trim() }).then(function (d) { me = userOf(d) || me; bind(me); });
      });
    },
    security: function () {
      var box = el('div');
      box.appendChild(formWith('เปลี่ยนรหัสผ่าน', [field('current', 'รหัสผ่านปัจจุบัน', 'password', '', { autocomplete: 'current-password', maxlength: 200 }), field('next', 'รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)', 'password', '', { autocomplete: 'new-password', maxlength: 200 }), field('next2', 'ยืนยันรหัสผ่านใหม่', 'password', '', { autocomplete: 'new-password', maxlength: 200 })], 'เปลี่ยนรหัสผ่าน', function (f) {
        if (val(f, 'next').length < 8) return 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร';
        if (val(f, 'next') !== val(f, 'next2')) return 'รหัสผ่านใหม่ไม่ตรงกัน';
        return call('password', { current: val(f, 'current'), next: val(f, 'next') }).then(function (d) { f.reset(); return d; });
      }, 'เปลี่ยนรหัสผ่านแล้ว'));
      box.appendChild(el('div', { class: 'acct-card wide' }, el('h2', { text: 'ยืนยันตัวตน 2 ขั้นตอน' }), el('p', { class: 'aintro', text: 'ส่วนนี้รอเชื่อมต่อ API (ตัวอย่างหน้าจอเท่านั้น)' }), el('button', { class: 'btn ghost', type: 'button', disabled: '', text: 'เปิดใช้งาน (เร็วๆ นี้)' })));
      if (cfg.deleteUrl) box.appendChild(el('p', { class: 'aintro' }, 'ต้องการลบบัญชีและข้อมูล? ', el('a', { href: cfg.deleteUrl, text: 'ดูขั้นตอนการลบบัญชี' })));
      return box;
    },
    payment: function () {
      var box = el('div'); box.appendChild(notice('วิธีชำระเงินที่บันทึกไว้ (ตัวอย่าง) — เว็บไซต์นี้ไม่เก็บและไม่รับเลขบัตร การเพิ่มวิธีชำระเงินต้องทำผ่านหน้าของผู้ให้บริการชำระเงินโดยตรง'));
      var list = el('div'); box.appendChild(list);
      call('payments').then(function (d) { list.appendChild(table([['ประเภท', 'type'], ['วิธีชำระเงิน', 'label'], ['หมายเหตุ', 'note']], d.items || d, 'ยังไม่มีวิธีชำระเงิน')); }, function (e) { list.appendChild(notice(e.message)); });
      box.appendChild(el('button', { class: 'btn ghost', type: 'button', disabled: '', text: '+ เพิ่มวิธีชำระเงิน (เร็วๆ นี้)' }));
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

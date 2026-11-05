// Admin plugin: "ระบบเกม" (game operations) menu: dashboard, player accounts, histories, coupons and reward codes.
// A MOCKUP: it talks to /admin/api/gameops/* which is served by lib/gameops.js with sample data until the game's own admin API
// is connected (ADMIN_API_SPEC_TH.md). Loaded before admin.js, which hands over its helpers and adds the parts and the menu.
// Everything is built with DOM nodes and textContent, never HTML strings.
(window.RC_ADMIN_PLUGINS = window.RC_ADMIN_PLUGINS || []).push(function (A) {
  'use strict';
  var h = A.h, box = A.box, api = A.api, toast = A.toast, nf = A.nf, lineChart = A.lineChart;
  var qs = function (o) { return Object.keys(o).filter(function (k) { return o[k] !== '' && o[k] != null; }).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(o[k]); }).join('&'); };
  var baht = function (n) { return '฿' + nf(n); };
  var G = 'ระบบเกม';

  var mockBar = function () { return h('div', { class: 'gd-mock', role: 'note' }, h('b', {}, 'MOCKUP'), 'ข้อมูลในหน้านี้เป็นข้อมูลตัวอย่าง ยังไม่ได้เชื่อมต่อฐานข้อมูลเกมจริง สิ่งที่ทำที่นี่ (ระงับ แก้ไข เติมเงิน สร้างคูปอง/โค้ด) บันทึกเฉพาะในโหมดตัวอย่างและไม่กระทบผู้เล่นหรือเงินจริง'); };
  var empty = function (t) { return h('div', { class: 'a-empty' }, t); };
  var errBox = function (e) { return h('div', { class: 'a-err', role: 'alert' }, e.message || 'เกิดข้อผิดพลาด'); };
  var input = function (attrs, value) { var i = h('input', attrs); if (value != null) i.value = value; return i; };
  var field = function (label, ctl, help) { return h('label', { class: 'a-f' }, h('span', {}, label), ctl, help ? h('span', { class: 'h' }, help) : null); };
  // a top-up channel: its logo (when it has one) next to the name; payChip is the logo alone, with the name as its tooltip
  var payLogo = function (url, name, big) { return h('span', { class: 'gd-pay' + (big ? ' big' : '') + (url ? ' has-img' : ''), title: name }, url ? h('img', { src: url, alt: '', loading: 'lazy' }) : null, h('span', {}, name)); };
  var payChip = function (url, name) { return url ? h('span', { class: 'gd-pay', title: name }, h('img', { src: url, alt: name, loading: 'lazy' })) : h('span', { class: 'gd-pay' }, h('span', {}, name)); };
  var chip = function (text, cls) { return h('span', { class: 'a-chip ' + (cls || '') }, text); };
  var table = function (cols, rows, o) {
    o = o || {};
    return h('div', { class: 'an-wrap' + (o.scroll ? ' gd-scroll' : '') }, h('table', { class: 'an-tbl gd-tbl' }, h('thead', {}, h('tr', {}, cols.map(function (c) { return h('th', { class: c.n ? 'n' : '' }, c.t); }))),
      h('tbody', {}, rows.length ? rows : [h('tr', {}, h('td', { colspan: cols.length, class: 'gd-none' }, o.none || 'ไม่พบข้อมูล'))])));
  };
  var td = function (v, o) { o = o || {}; return h('td', { class: (o.n ? 'n ' : '') + (o.cls || ''), 'data-l': o.l || '', title: o.title || null }, v); };

  // ---------- dialog (Esc or a click outside closes; focus returns to the button that opened it) ----------
  function dialog(title, sub, content) {
    var opener = document.activeElement, bg, close = function () { document.removeEventListener('keydown', onKey); bg.remove(); if (opener && opener.focus) opener.focus(); };
    var onKey = function (e) { if (e.key === 'Escape') close(); };
    var x = h('button', { type: 'button', class: 'ghost sm', 'aria-label': 'ปิด', onclick: close }, 'ปิด');
    bg = h('div', { class: 'a-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, onclick: function (e) { if (e.target === bg) close(); } },
      h('div', { class: 'a-dlg gd-dlg' }, h('div', { class: 'hd' }, h('b', {}, title), h('small', {}, sub || ''), x), [].concat(content)));
    document.body.append(bg); document.addEventListener('keydown', onKey);
    var first = bg.querySelector('input,select,textarea,button.btn'); if (first) first.focus();
    return { close: close, el: bg };
  }
  // a form inside a dialog or page: shows the server's message under the button instead of closing on errors
  function submitter(form, btn, err, run) {
    form.addEventListener('submit', function (e) {
      e.preventDefault(); err.textContent = ''; btn.disabled = true;
      Promise.resolve().then(run).then(null, function (x) { err.textContent = x.message || 'เกิดข้อผิดพลาด'; }).then(function () { btn.disabled = false; });
    });
  }
  function pager(st, info, load) {
    var prev = h('button', { type: 'button', class: 'ghost sm', onclick: function () { st.page--; load(); } }, '‹ ก่อนหน้า'), next = h('button', { type: 'button', class: 'ghost sm', onclick: function () { st.page++; load(); } }, 'ถัดไป ›');
    var txt = h('span', { class: 'an-rng' });
    return { el: h('div', { class: 'gd-pager' }, prev, txt, next), set: function (r) { txt.textContent = 'หน้า ' + r.page + ' / ' + r.pages + ' · ทั้งหมด ' + nf(r.total) + ' รายการ'; prev.disabled = r.page <= 1; next.disabled = r.page >= r.pages; } };
  }
  var debounce = function (fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; };

  // ---------- dashboard ----------
  function dashView() {
    var host = h('div', { class: 'gd' }, mockBar(), empty('กำลังโหลด…')), onlineEl, timeEl, timer;
    var kpi = function (label, value, sub, red, extra) { return h('div', { class: 'an-kpi' + (red ? ' red' : '') }, h('small', {}, label), h('b', {}, value), h('div', { class: 'sub' }, sub), extra || null); };
    var short = function (d) { return d.slice(5); };
    function draw(D) {
      var T = D.totals, S = D.series;
      onlineEl = h('b', {}, nf(T.online)); timeEl = h('span', {}, '');
      var onlineCard = h('div', { class: 'an-kpi red' }, h('small', {}, 'ผู้เล่นออนไลน์ตอนนี้'), h('div', { class: 'gd-live-row' }, h('span', { class: 'gd-live', 'aria-hidden': 'true' }), onlineEl), h('div', { class: 'sub' }, 'อัปเดตทุก 30 วินาที ', timeEl));
      var rows = S.days.map(function (d, i) { return h('tr', {}, td(d, { l: 'วันที่' }), td(nf(S.signups[i]), { n: true, l: 'สมัครใหม่' }), td(nf(S.topupCount[i]), { n: true, l: 'รายการเติมเงิน' }), td(baht(S.topupBaht[i]), { n: true, l: 'ยอดเติมเงิน' })); }).reverse();
      rows.push(h('tr', { class: 'gd-sum' }, td('รวม 30 วัน'), td(nf(T.signups30), { n: true }), td(nf(S.topupCount.reduce(function (a, b) { return a + b; }, 0)), { n: true }), td(baht(T.topup30), { n: true })));
      var latestS = D.latestSignups.map(function (p) { return h('tr', {}, td(p.username, { l: 'ชื่อผู้ใช้' }), td(p.character, { l: 'ตัวละคร' }), td(p.joined, { l: 'สมัครเมื่อ' })); });
      var latestT = D.latestTopups.map(function (x) { return h('tr', {}, td(x.ts, { l: 'เวลา' }), td(x.username, { l: 'ผู้เล่น' }), td(payLogo(x.logo, x.method), { l: 'ช่องทาง' }), td(baht(x.price), { n: true, l: 'ราคา' })); });
      host.replaceChildren(mockBar(),
        h('div', { class: 'an-kpis' },
          kpi('บัญชีทั้งหมด', nf(T.accounts), T.suspended ? 'ถูกระงับ ' + nf(T.suspended) + ' บัญชี' : 'ไม่มีบัญชีถูกระงับ'),
          onlineCard,
          kpi('สมัครสมาชิก', nf(T.signupsToday), 'วันนี้ · 7 วัน ' + nf(T.signups7) + ' · 30 วัน ' + nf(T.signups30)),
          kpi('ยอดเติมเงินวันนี้', baht(T.topupToday), nf(T.topupTodayCount) + ' รายการ · 7 วัน ' + baht(T.topup7))),
        h('div', { class: 'an-2' },
          box('สมัครสมาชิก 30 วันล่าสุด', lineChart(S.days.map(short), [{ name: 'สมัครใหม่', values: S.signups, color: '#ff2a2a', area: true }], { tipLabels: S.days, partialLast: true }), h('small', { class: 'h' }, 'เส้นประช่วงท้ายคือวันนี้ ซึ่งยังไม่จบวัน')),
          box('ยอดเติมเงิน 30 วันล่าสุด (บาท)', lineChart(S.days.map(short), [{ name: 'ยอดเติมเงิน (฿)', values: S.topupBaht, color: '#4ade80', area: true }], { tipLabels: S.days, partialLast: true }), h('small', { class: 'h' }, 'นับเฉพาะรายการที่ชำระสำเร็จ ไม่รวมแคชที่แอดมินเติมให้ (30 วัน: ' + nf(T.gift30) + ' แคช)'))),
        box('ตารางรายวัน 30 วันล่าสุด', table([{ t: 'วันที่' }, { t: 'สมัครใหม่', n: true }, { t: 'รายการเติมเงิน', n: true }, { t: 'ยอดเติมเงิน', n: true }], rows, { scroll: true })),
        h('div', { class: 'an-2' },
          box('สมัครล่าสุด', table([{ t: 'ชื่อผู้ใช้' }, { t: 'ตัวละคร' }, { t: 'สมัครเมื่อ' }], latestS)),
          box('เติมเงินล่าสุด', table([{ t: 'เวลา' }, { t: 'ผู้เล่น' }, { t: 'ช่องทาง' }, { t: 'ราคา', n: true }], latestT))));
      tick(D);
    }
    function tick(D) { if (onlineEl) { onlineEl.textContent = nf(D.totals.online); timeEl.textContent = '(' + new Date(Date.parse(D.generatedAt) + 7 * 3600e3).toISOString().slice(11, 16) + ' น.)'; } }
    function load() { return api('gameops/dashboard').then(draw, function (e) { host.replaceChildren(mockBar(), errBox(e)); }); }
    load();
    timer = setInterval(function () { if (!host.isConnected) { clearInterval(timer); return; } api('gameops/dashboard').then(function (D) { if (host.isConnected && onlineEl) tick(D); }, function () {}); }, 30000);
    return host;
  }

  // ---------- player accounts ----------
  function playersView() {
    var st = { q: '', status: '', page: 1 };
    var search = h('input', { type: 'search', placeholder: 'ค้นหาชื่อผู้ใช้ อีเมล หรือชื่อตัวละคร…', 'aria-label': 'ค้นหาผู้เล่น', maxlength: 60 });
    var sel = h('select', { 'aria-label': 'กรองสถานะ' }, h('option', { value: '' }, 'ทุกสถานะ'), h('option', { value: 'active' }, 'ปกติ'), h('option', { value: 'suspended' }, 'ถูกระงับ'));
    var tbody = h('tbody'), pg = pager(st, null, load), host = h('div', { class: 'gd' }, mockBar());
    var run = debounce(function () { st.q = search.value.trim(); st.page = 1; load(); }, 250);
    search.addEventListener('input', run); sel.addEventListener('change', function () { st.status = sel.value; st.page = 1; load(); });

    function editDlg(p) {
      var email = input({ type: 'email', maxlength: 120, autocomplete: 'off' }, p.email), ch = input({ type: 'text', maxlength: 24, autocomplete: 'off' }, p.character), nt = h('textarea', { rows: 3, maxlength: 200, placeholder: 'บันทึกภายในสำหรับทีมงาน (ผู้เล่นไม่เห็น)' }); nt.value = p.note || '';
      var err = h('p', { class: 'a-err', role: 'alert' }), btn = h('button', { class: 'btn sm', type: 'submit' }, 'บันทึกข้อมูล'), f = h('form', { class: 'gd-form', novalidate: '' }, field('ชื่อผู้ใช้ (แก้ไม่ได้)', input({ type: 'text', readonly: '' }, p.username)), field('อีเมล', email), field('ชื่อตัวละคร', ch), field('หมายเหตุภายใน', nt), err, h('div', {}, btn));
      var d = dialog('แก้ไขข้อมูลผู้เล่น', p.username, f);
      submitter(f, btn, err, function () { return api('gameops/players/update', 'POST', { id: p.id, email: email.value, character: ch.value, note: nt.value }).then(function () { d.close(); toast('บันทึกข้อมูลของ ' + p.username + ' แล้ว'); load(); }); });
    }
    function topupDlg(p) {
      var cash = input({ type: 'number', min: 1, max: 1000000, step: 1, inputmode: 'numeric', required: '' }), why = input({ type: 'text', maxlength: 200, placeholder: 'เช่น ชดเชยระบบขัดข้อง / รางวัลกิจกรรม' });
      var quick = h('div', { class: 'gd-quick' }, [100, 500, 1000, 5000, 10000].map(function (n) { return h('button', { type: 'button', class: 'ghost sm', onclick: function () { cash.value = n; } }, nf(n)); }));
      var err = h('p', { class: 'a-err', role: 'alert' }), btn = h('button', { class: 'btn sm', type: 'submit' }, 'เติมแคชให้ผู้เล่น');
      var f = h('form', { class: 'gd-form', novalidate: '' }, h('p', { class: 'a-note' }, 'เติมแคชเข้าบัญชีของ ', h('b', {}, p.username), ' (ตัวละคร ' + p.character + ') โดยตรง ไม่ผ่านช่องทางชำระเงิน บันทึกชื่อแอดมินและเหตุผลไว้ในประวัติ'), field('จำนวนแคช', cash), quick, field('เหตุผล / หมายเหตุ (บังคับ)', why), err, h('div', {}, btn));
      var d = dialog('เติมเงินให้ผู้เล่น', p.username, f);
      submitter(f, btn, err, function () { return api('gameops/players/topup', 'POST', { id: p.id, cash: cash.value, note: why.value }).then(function () { d.close(); toast('เติม ' + nf(cash.value) + ' แคชให้ ' + p.username + ' แล้ว'); load(); }); });
    }
    function suspendDlg(p) {
      var on = p.status !== 'suspended', why = h('textarea', { rows: 3, maxlength: 200, placeholder: 'เหตุผลที่ระงับ (จะบันทึกในประวัติการทำงาน)' });
      var err = h('p', { class: 'a-err', role: 'alert' }), btn = h('button', { class: 'btn sm' + (on ? ' gd-danger' : ''), type: 'submit' }, on ? 'ระงับบัญชี ' + p.username : 'ปลดระงับ ' + p.username);
      var f = h('form', { class: 'gd-form', novalidate: '' }, h('p', { class: 'a-note' }, on ? 'ผู้เล่นจะเข้าสู่ระบบและใช้งานบัญชีไม่ได้จนกว่าจะปลดระงับ' : 'เหตุผลที่ถูกระงับไว้: ' + (p.reason || '–')), on ? field('เหตุผล (บังคับ)', why) : null, err, h('div', {}, btn));
      var d = dialog(on ? 'ระงับบัญชีผู้เล่น' : 'ปลดระงับบัญชีผู้เล่น', p.username, f);
      submitter(f, btn, err, function () { return api('gameops/players/suspend', 'POST', { id: p.id, suspended: on, reason: why.value }).then(function () { d.close(); toast((on ? 'ระงับ ' : 'ปลดระงับ ') + p.username + ' แล้ว'); load(); }); });
    }
    function row(p) {
      var sus = p.status === 'suspended';
      return h('tr', { class: sus ? 'gd-off' : '' }, td(h('b', {}, p.username), { l: 'ชื่อผู้ใช้' }), td(p.email, { l: 'อีเมล', cls: 'gd-mail' }), td(p.character, { l: 'ชื่อตัวละคร' }), td(p.joined.slice(0, 10), { l: 'สมัครวันที่', title: p.joined }),
        td(chip(sus ? 'ถูกระงับ' : 'ปกติ', sus ? 'bad' : 'on'), { l: 'สถานะ', title: sus ? p.reason : '' }), td(nf(p.cash), { n: true, l: 'เติมแล้ว (แคช)' }),
        td(h('div', { class: 'gd-acts' },
          h('button', { type: 'button', class: 'ghost sm', onclick: function () { editDlg(p); } }, 'แก้ไขข้อมูล'),
          h('button', { type: 'button', class: 'btn sm', onclick: function () { topupDlg(p); } }, 'เติมเงิน'),
          h('button', { type: 'button', class: 'ghost sm' + (sus ? '' : ' gd-danger-o'), onclick: function () { suspendDlg(p); } }, sus ? 'ปลดระงับ' : 'ระงับบัญชี')), { l: 'จัดการ' }));
    }
    var seq = 0; // a slower, older answer never replaces a newer one
    function load() {
      var mine = ++seq;
      return api('gameops/players?' + qs({ q: st.q, status: st.status, page: st.page })).then(function (r) { if (mine !== seq) return; st.page = r.page; tbody.replaceChildren.apply(tbody, r.items.length ? r.items.map(row) : [h('tr', {}, h('td', { colspan: 7, class: 'gd-none' }, 'ไม่พบผู้เล่นที่ค้นหา'))]); pg.set(r); }, function (e) { tbody.replaceChildren(h('tr', {}, h('td', { colspan: 7 }, errBox(e)))); });
    }
    var cols = ['ชื่อผู้ใช้', 'อีเมล', 'ชื่อตัวละคร', 'สมัครวันที่', 'สถานะ', 'เติมแล้ว (แคช)', 'จัดการ'];
    host.append(box(null, h('div', { class: 'an-bar' }, search, sel), h('div', { class: 'an-wrap' }, h('table', { class: 'an-tbl gd-tbl gd-stack' }, h('thead', {}, h('tr', {}, cols.map(function (c, i) { return h('th', { class: i === 5 ? 'n' : '' }, c); }))), tbody)), pg.el));
    load();
    return host;
  }

  // ---------- histories ----------
  function historyView(kind) {
    var st = { q: '', status: '', from: '', to: '', page: 1 }, tbody = h('tbody'), pg = pager(st, null, load), sum = h('div', { class: 'gd-sum-row' }), host = h('div', { class: 'gd' }, mockBar());
    var cfg = {
      topups: { path: 'gameops/history/topups', ph: 'ค้นหาชื่อผู้ใช้ หรือช่องทางเติมเงิน…', filters: true,
        cols: [['เวลา'], ['ผู้เล่น'], ['ช่องทาง'], ['ราคา', 1], ['ได้รับแคช', 1], ['สถานะ'], ['ทำโดย']],
        row: function (x) { return h('tr', {}, td(x.ts, { l: 'เวลา' }), td(h('b', {}, x.username), { l: 'ผู้เล่น' }), td(payLogo(x.logo, x.method), { l: 'ช่องทาง', title: x.note || '' }), td(x.by ? '–' : baht(x.price), { n: true, l: 'ราคา' }), td('+' + nf(x.cash), { n: true, l: 'ได้รับแคช' }),
          td(x.status === 'success' ? chip('สำเร็จ', 'on') : x.status === 'failed' ? chip('ล้มเหลว', 'bad') : chip('รอดำเนินการ'), { l: 'สถานะ' }), td(x.by ? 'แอดมิน: ' + x.by : 'ผู้เล่น', { l: 'ทำโดย' })); } },
      coupons: { path: 'gameops/history/coupons', ph: 'ค้นหาชื่อผู้ใช้ หรือรหัสคูปอง…', cols: [['เวลา'], ['ผู้เล่น'], ['รหัสคูปอง'], ['ชื่อคูปอง'], ['ผลลัพธ์']],
        row: function (x) { return h('tr', {}, td(x.ts, { l: 'เวลา' }), td(h('b', {}, x.username), { l: 'ผู้เล่น' }), td(h('code', {}, x.code), { l: 'รหัสคูปอง' }), td(x.title || '–', { l: 'ชื่อคูปอง' }), td(x.result === 'ใช้สำเร็จ' ? chip('ใช้สำเร็จ', 'on') : chip(x.result, 'bad'), { l: 'ผลลัพธ์' })); } },
      codes: { path: 'gameops/history/codes', ph: 'ค้นหาชื่อผู้ใช้ รหัสโค้ด หรือชื่อชุด…', cols: [['เวลา'], ['ผู้เล่น'], ['โค้ดรางวัล'], ['ชุดโค้ด'], ['รางวัลที่ได้รับ']],
        row: function (x) { return h('tr', {}, td(x.ts, { l: 'เวลา' }), td(h('b', {}, x.username), { l: 'ผู้เล่น' }), td(h('code', {}, x.code), { l: 'โค้ดรางวัล' }), td(x.batch || '–', { l: 'ชุดโค้ด' }), td(x.rewards || '–', { l: 'รางวัลที่ได้รับ' })); } }
    }[kind];
    var search = h('input', { type: 'search', placeholder: cfg.ph, 'aria-label': 'ค้นหา', maxlength: 60 });
    search.addEventListener('input', debounce(function () { st.q = search.value.trim(); st.page = 1; load(); }, 250));
    var bar = h('div', { class: 'an-bar' }, search);
    if (cfg.filters) {
      var sel = h('select', { 'aria-label': 'กรองสถานะ' }, h('option', { value: '' }, 'ทุกสถานะ'), h('option', { value: 'success' }, 'สำเร็จ'), h('option', { value: 'failed' }, 'ล้มเหลว'), h('option', { value: 'pending' }, 'รอดำเนินการ'));
      var fromI = h('input', { type: 'date', 'aria-label': 'ตั้งแต่วันที่' }), toI = h('input', { type: 'date', 'aria-label': 'ถึงวันที่' });
      var go = function () { st.status = sel.value; st.from = fromI.value; st.to = toI.value; st.page = 1; load(); };
      [sel, fromI, toI].forEach(function (e) { e.addEventListener('change', go); });
      bar.append(sel, h('span', { class: 'an-rng' }, 'วันที่'), fromI, h('span', { class: 'an-rng' }, 'ถึง'), toI);
    }
    var seq = 0;
    function load() {
      var mine = ++seq;
      return api(cfg.path + '?' + qs({ q: st.q, status: st.status, from: st.from, to: st.to, page: st.page })).then(function (r) {
        if (mine !== seq) return; st.page = r.page; tbody.replaceChildren.apply(tbody, r.items.length ? r.items.map(cfg.row) : [h('tr', {}, h('td', { colspan: cfg.cols.length, class: 'gd-none' }, 'ไม่พบข้อมูล'))]); pg.set(r);
        sum.replaceChildren.apply(sum, r.summary ? [chip('ชำระสำเร็จ ' + nf(r.summary.count) + ' รายการ', 'on'), chip('ยอดรวม ' + baht(r.summary.baht)), chip('แคชรวม ' + nf(r.summary.cash))] : []);
      }, function (e) { tbody.replaceChildren(h('tr', {}, h('td', { colspan: cfg.cols.length }, errBox(e)))); });
    }
    host.append(box(null, bar, sum, h('div', { class: 'an-wrap' }, h('table', { class: 'an-tbl gd-tbl gd-stack' }, h('thead', {}, h('tr', {}, cfg.cols.map(function (c) { return h('th', { class: c[1] ? 'n' : '' }, c[0]); }))), tbody)), pg.el));
    load();
    return host;
  }

  // ---------- rewards: coupons ----------
  var KIND = { percent: 'ส่วนลด %', cash: 'แคช', item: 'ไอเทม' };
  var couponValue = function (c) { return c.kind === 'percent' ? c.value + '%' : c.kind === 'cash' ? nf(c.value) + ' แคช' : (c.itemName || 'ไอเทม') + ' ×' + nf(c.value); };
  var STATE = { on: ['ใช้งานอยู่', 'on'], off: ['ปิดอยู่', ''], expired: ['หมดอายุ', 'bad'], soon: ['ยังไม่เริ่ม', ''] };
  function couponView() {
    var host = h('div', { class: 'gd' }, mockBar()), listHost = h('div'), formErr = h('p', { class: 'a-err', role: 'alert' });
    var code = input({ type: 'text', maxlength: 24, placeholder: 'เว้นว่าง = สุ่มให้', autocomplete: 'off', style: 'text-transform:uppercase' }), title = input({ type: 'text', maxlength: 80, placeholder: 'เช่น ส่วนลด 15% ร้านค้า' });
    var kind = h('select', {}, Object.keys(KIND).map(function (k) { return h('option', { value: k }, KIND[k]); })), value = input({ type: 'number', min: 1, step: 1, inputmode: 'numeric' }, 10), itemName = input({ type: 'text', maxlength: 40, placeholder: 'ชื่อไอเทม' });
    var limit = input({ type: 'number', min: 0, step: 1, inputmode: 'numeric' }, 0), perUser = input({ type: 'number', min: 1, step: 1, inputmode: 'numeric' }, 1), start = input({ type: 'date' }), end = input({ type: 'date' });
    var itemField = field('ชื่อไอเทมที่ได้รับ', itemName), valueField = field('มูลค่า', value, 'ส่วนลด: เปอร์เซ็นต์ 1–100 · แคช/ไอเทม: จำนวน');
    var sync = function () { itemField.style.display = kind.value === 'item' ? '' : 'none'; value.max = kind.value === 'percent' ? 100 : 1000000; }; kind.addEventListener('change', sync); sync();
    var btn = h('button', { class: 'btn', type: 'submit' }, 'สร้างคูปอง');
    var form = h('form', { class: 'gd-form gd-grid', novalidate: '' }, field('รหัสคูปอง (ไม่บังคับ)', code), field('ชื่อคูปอง', title), field('ประเภท', kind), valueField, itemField, field('จำนวนสิทธิ์รวม', limit, '0 = ไม่จำกัด'), field('สิทธิ์ต่อผู้เล่น', perUser), field('เริ่มใช้ได้ (ไม่บังคับ)', start), field('ใช้ได้ถึง (ไม่บังคับ)', end), h('div', { class: 'gd-full' }, formErr, btn));
    submitter(form, btn, formErr, function () {
      return api('gameops/coupons/create', 'POST', { code: code.value, title: title.value, kind: kind.value, value: value.value, itemName: itemName.value, limit: limit.value, perUser: perUser.value, start: start.value, end: end.value }).then(function (c) {
        toast('สร้างคูปอง ' + c.code + ' แล้ว'); code.value = ''; title.value = ''; loadList();
      });
    });
    function act(label, cls, fn) { return h('button', { type: 'button', class: 'ghost sm ' + (cls || ''), onclick: fn }, label); }
    function loadList() {
      return api('gameops/coupons').then(function (r) {
        var rows = r.items.map(function (c) {
          var s = STATE[c.state];
          return h('tr', { class: c.state === 'off' || c.state === 'expired' ? 'gd-off' : '' }, td(h('code', {}, c.code), { l: 'รหัส' }), td(c.title, { l: 'ชื่อ' }), td(KIND[c.kind] + ': ' + couponValue(c), { l: 'ประเภท / มูลค่า' }),
            td(nf(c.used) + (c.limit ? ' / ' + nf(c.limit) : ' / ไม่จำกัด'), { n: true, l: 'ใช้แล้ว' }), td((c.start || '…') + ' → ' + (c.end || '…'), { l: 'ช่วงเวลา' }), td(chip(s[0], s[1]), { l: 'สถานะ' }),
            td(h('div', { class: 'gd-acts' }, act(c.active ? 'ปิดคูปอง' : 'เปิดคูปอง', '', function () { api('gameops/coupons/toggle', 'POST', { code: c.code, active: !c.active }).then(function () { toast((c.active ? 'ปิด ' : 'เปิด ') + c.code + ' แล้ว'); loadList(); }, function (e) { toast(e.message); }); }),
              c.own ? act('ลบ', 'gd-danger-o', function () { if (confirm('ลบคูปอง ' + c.code + ' ? การลบย้อนกลับไม่ได้')) api('gameops/coupons/delete', 'POST', { code: c.code }).then(function () { toast('ลบ ' + c.code + ' แล้ว'); loadList(); }, function (e) { toast(e.message); }); }) : null), { l: 'จัดการ' }));
        });
        listHost.replaceChildren(table([{ t: 'รหัส' }, { t: 'ชื่อ' }, { t: 'ประเภท / มูลค่า' }, { t: 'ใช้แล้ว', n: true }, { t: 'ช่วงเวลา' }, { t: 'สถานะ' }, { t: 'จัดการ' }], rows));
      }, function (e) { listHost.replaceChildren(errBox(e)); });
    }
    host.append(box('สร้างคูปองใหม่', form), box('คูปองทั้งหมด', listHost));
    loadList();
    return host;
  }

  // ---------- rewards: reward codes ----------
  var csvOf = function (name, codes) { return '﻿code,batch\r\n' + codes.map(function (c) { return c + ',"' + String(name).replace(/"/g, '""') + '"'; }).join('\r\n') + '\r\n'; };
  function download(file, text) {
    var a = document.createElement('a'); a.download = file; a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    document.body.append(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function codesPanel(name, codes) {
    var ta = h('textarea', { class: 'gd-codes', rows: Math.min(12, codes.length + 1), readonly: '', 'aria-label': 'รายการโค้ด' }); ta.value = codes.join('\n');
    return h('div', { class: 'gd-form' }, ta, h('div', { class: 'gd-acts' },
      h('button', { type: 'button', class: 'btn sm', onclick: function () { (navigator.clipboard ? navigator.clipboard.writeText(codes.join('\n')) : Promise.reject()).then(function () { toast('คัดลอก ' + codes.length + ' โค้ดแล้ว'); }, function () { ta.select(); toast('เลือกข้อความแล้ว กด Ctrl+C เพื่อคัดลอก'); }); } }, 'คัดลอกทั้งหมด'),
      h('button', { type: 'button', class: 'ghost sm', onclick: function () { download('reward-codes-' + String(name).replace(/[^\w.-]+/g, '_').slice(0, 30) + '.csv', csvOf(name, codes)); } }, 'ดาวน์โหลด CSV')));
  }
  function rewardCodeView() {
    var host = h('div', { class: 'gd' }, mockBar()), listHost = h('div'), resultHost = h('div'), formErr = h('p', { class: 'a-err', role: 'alert' });
    var name = input({ type: 'text', maxlength: 60, placeholder: 'เช่น แจกทางไลฟ์ 11.11' }), prefix = input({ type: 'text', maxlength: 12, placeholder: 'เช่น LIVE1111', autocomplete: 'off', style: 'text-transform:uppercase' });
    var count = input({ type: 'number', min: 1, max: 1000, step: 1, inputmode: 'numeric' }, 50), maxUses = input({ type: 'number', min: 1, max: 1000, step: 1, inputmode: 'numeric' }, 1), expires = input({ type: 'date' });
    var rwHost = h('div', { class: 'gd-rws' }), rows = [];
    function addReward(t, nm, qty) {
      var type = h('select', { 'aria-label': 'ประเภทรางวัล' }, h('option', { value: 'cash' }, 'แคช'), h('option', { value: 'point' }, 'แต้มพ้อย'), h('option', { value: 'item' }, 'ไอเทม')); type.value = t || 'cash';
      var n = input({ type: 'text', maxlength: 40, placeholder: 'ชื่อไอเทม', 'aria-label': 'ชื่อไอเทม' }, nm || ''), q = input({ type: 'number', min: 1, step: 1, inputmode: 'numeric', 'aria-label': 'จำนวน' }, qty || 100);
      var rm = h('button', { type: 'button', class: 'ghost sm', 'aria-label': 'ลบรางวัลนี้', onclick: function () { if (rows.length > 1) { rows.splice(rows.indexOf(o), 1); row.remove(); } } }, 'ลบ');
      var row = h('div', { class: 'gd-rw' }, type, n, q, rm), o = { type: type, name: n, qty: q };
      var sync = function () { n.style.visibility = type.value === 'item' ? 'visible' : 'hidden'; }; type.addEventListener('change', sync); sync();
      rows.push(o); rwHost.append(row);
    }
    addReward('cash', '', 1000);
    var addBtn = h('button', { type: 'button', class: 'ghost sm', onclick: function () { if (rows.length < 6) addReward('point', '', 50); else toast('ใส่รางวัลได้สูงสุด 6 รายการต่อโค้ด'); } }, '+ เพิ่มรางวัล');
    var btn = h('button', { class: 'btn', type: 'submit' }, 'สร้างโค้ดรางวัล');
    var form = h('form', { class: 'gd-form gd-grid', novalidate: '' }, field('ชื่อชุดโค้ด', name), field('คำนำหน้าโค้ด', prefix, 'A-Z 0-9 ยาว 2–12 ตัว โค้ดจะเป็น PREFIX-XXXX-XXXX'), field('จำนวนโค้ดที่สร้าง', count, '1–1,000 ต่อครั้ง'), field('ใช้ได้กี่ครั้งต่อโค้ด', maxUses), field('หมดอายุวันที่ (ไม่บังคับ)', expires),
      h('div', { class: 'gd-full' }, h('b', { class: 'gd-sub' }, 'รางวัลที่ผู้เล่นได้รับเมื่อใส่โค้ด'), rwHost, addBtn), h('div', { class: 'gd-full' }, formErr, btn));
    submitter(form, btn, formErr, function () {
      return api('gameops/codes/create', 'POST', { name: name.value, prefix: prefix.value, count: count.value, maxUses: maxUses.value, expires: expires.value, rewards: rows.map(function (r) { return { type: r.type.value, name: r.name.value, qty: r.qty.value }; }) }).then(function (b) {
        toast('สร้าง ' + nf(b.count) + ' โค้ดแล้ว'); resultHost.replaceChildren(box('โค้ดที่เพิ่งสร้าง: ' + b.name, h('p', { class: 'a-note' }, 'เก็บโค้ดเหล่านี้ไว้ แจกให้ผู้เล่นตามช่องทางที่ต้องการ (ดูย้อนหลังได้ที่ตารางชุดโค้ดด้านล่าง)'), codesPanel(b.name, b.codes))); loadList();
      });
    });
    function loadList() {
      return api('gameops/codes').then(function (r) {
        var rowsEl = r.items.slice().reverse().map(function (b) {
          return h('tr', {}, td(h('b', {}, b.name), { l: 'ชุดโค้ด' }), td(h('code', {}, b.prefix), { l: 'คำนำหน้า' }), td(nf(b.count), { n: true, l: 'จำนวน' }), td(nf(b.used) + ' / ' + nf(b.count), { n: true, l: 'ใช้แล้ว' }), td(b.rewards.map(function (x) { return x.name + ' ×' + nf(x.qty); }).join(', '), { l: 'รางวัล' }),
            td(b.expires || 'ไม่หมดอายุ', { l: 'หมดอายุ' }), td(b.created + ' · ' + b.by, { l: 'สร้างเมื่อ / โดย' }),
            td(b.own ? h('button', { type: 'button', class: 'ghost sm', onclick: function () { api('gameops/codes/batch?' + qs({ id: b.id })).then(function (d) { dialog('โค้ดในชุด ' + d.name, nf(d.count) + ' โค้ด', codesPanel(d.name, d.codes)); }, function (e) { toast(e.message); }); } }, 'ดูโค้ด') : '–', { l: 'จัดการ' }));
        });
        listHost.replaceChildren(table([{ t: 'ชุดโค้ด' }, { t: 'คำนำหน้า' }, { t: 'จำนวน', n: true }, { t: 'ใช้แล้ว', n: true }, { t: 'รางวัล' }, { t: 'หมดอายุ' }, { t: 'สร้างเมื่อ / โดย' }, { t: 'จัดการ' }], rowsEl));
      }, function (e) { listHost.replaceChildren(errBox(e)); });
    }
    host.append(box('สร้างโค้ดรางวัลใหม่', form), resultHost, box('ชุดโค้ดทั้งหมด', listHost));
    loadList();
    return host;
  }

  // ---------- revenue overview ----------
  var baht2 = function (n) { return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var ymd = function (d) { return d.toISOString().slice(0, 10); };
  var bkkNow = function () { return new Date(Date.now() + 7 * 3600e3); };
  var shift = function (day, n) { return ymd(new Date(Date.parse(day + 'T00:00:00Z') + n * 86400e3)); };
  var dmy = function (d) { return d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4); };
  var PRESETS = [['today', 'วันนี้'], ['yesterday', 'เมื่อวาน'], ['7', '7 วัน'], ['30', '30 วัน'], ['90', '90 วัน'], ['365', '1 ปี']];
  function revenueView() {
    var today = ymd(bkkNow()), st = { from: today, to: today, preset: 'today' }, host = h('div', { class: 'gd' }, mockBar()), body = h('div', { class: 'gd' }), seq = 0;
    var rangeOf = function (p) { if (p === 'today') return [today, today]; if (p === 'yesterday') { var y = shift(today, -1); return [y, y]; } return [shift(today, -(Number(p) - 1)), today]; };
    var label = h('b', { class: 'rv-range' }), btns = {};
    var pick = function (p) { var r = rangeOf(p); st.from = r[0]; st.to = r[1]; st.preset = p; sel.value = ''; sync(); load(); };
    PRESETS.forEach(function (x) { btns[x[0]] = h('button', { type: 'button', class: 'rv-pre', onclick: function () { pick(x[0]); } }, x[1]); });
    // the last 12 months
    var sel = h('select', { 'aria-label': 'เลือกเดือน' }, h('option', { value: '' }, '— เลือกเดือน —'));
    for (var i = 0; i < 12; i++) { var d = new Date(Date.UTC(bkkNow().getUTCFullYear(), bkkNow().getUTCMonth() - i, 1)); sel.append(h('option', { value: ymd(d).slice(0, 7) }, d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric', timeZone: 'UTC' }))); }
    var fromI = h('input', { type: 'date', max: today, 'aria-label': 'ตั้งแต่วันที่' }), toI = h('input', { type: 'date', max: today, 'aria-label': 'ถึงวันที่' });
    fromI.value = today; toI.value = today;
    var goMonth = h('button', { type: 'button', class: 'rv-go', onclick: function () {
      if (!sel.value) { toast('เลือกเดือนก่อน'); return; }
      var y = Number(sel.value.slice(0, 4)), m = Number(sel.value.slice(5)), last = ymd(new Date(Date.UTC(y, m, 0)));
      st.from = sel.value + '-01'; st.to = last > today ? today : last; st.preset = 'month'; sync(); load();
    } }, 'ดู');
    var goRange = h('button', { type: 'button', class: 'rv-go', onclick: function () {
      if (!fromI.value || !toI.value) { toast('เลือกวันที่ให้ครบ'); return; }
      st.from = fromI.value; st.to = toI.value; st.preset = 'custom'; sel.value = ''; sync(); load();
    } }, 'ดู');
    function sync() {
      Object.keys(btns).forEach(function (k) { btns[k].classList.toggle('on', st.preset === k); btns[k].setAttribute('aria-pressed', st.preset === k ? 'true' : 'false'); });
      fromI.value = st.from; toI.value = st.to;
      label.textContent = dmy(st.from) + (st.from === st.to ? (st.from === today ? ' (วันนี้)' : '') : ' – ' + dmy(st.to));
    }
    var ctl = box(null, h('div', { class: 'rv-ctl' }, h('small', {}, 'ช่วงเวลา'), label),
      h('div', { class: 'rv-pres', role: 'group', 'aria-label': 'ช่วงเวลาที่ตั้งไว้' }, PRESETS.map(function (x) { return btns[x[0]]; })),
      h('div', { class: 'rv-row' }, h('small', {}, 'รายเดือน'), sel, goMonth), h('div', { class: 'rv-row' }, h('small', {}, 'กำหนดเอง'), fromI, h('span', { class: 'an-rng' }, 'ถึง'), toI, goRange));
    host.append(ctl, body); sync();

    var kpi = function (cls, label_, value, unit, sub, chipEl) { return h('div', { class: 'an-kpi rv-kpi ' + cls }, h('small', {}, label_), h('b', {}, value, unit ? h('span', { class: 'u' }, ' ' + unit) : null), h('div', { class: 'sub' }, chipEl || null, sub)); };
    function draw(R) {
      var T = R.totals, one = R.range.days === 1, isToday = R.range.to === R.today;
      var whenWord = one ? (R.range.from === R.today ? 'วันนี้' : 'วันนั้น') : 'ในช่วงนี้';
      var delta = T.delta === null ? null : h('span', { class: 'an-chip ' + (T.delta >= 0 ? 'up' : 'down') }, (T.delta >= 0 ? '▲ +' : '▼ ') + T.delta + '%');
      var cmp = (one ? 'เทียบวันก่อนหน้า' : 'เทียบช่วงก่อนหน้า') + ' (' + baht2(T.prevRevenue) + ' บาท)' + (R.prev.partial ? ' นับถึงเวลาเดียวกัน' : '');
      var kpis = h('div', { class: 'an-kpis' },
        kpi('red', 'รายได้จริง', baht2(T.revenue), 'บาท', T.delta === null ? 'ไม่มีข้อมูลช่วงก่อนหน้าให้เทียบ' : cmp, delta),
        kpi('', 'รายการที่เงินเข้า', nf(T.count), '', 'นับวันที่เงินเข้า · จากผู้เล่น ' + nf(T.players) + ' คน'),
        kpi('', 'เฉลี่ยต่อรายการ', baht2(T.average), 'บาท', 'เฉพาะรายการที่เงินเข้าแล้ว'),
        kpi('', 'อัตราปิดการขาย (ชำระออนไลน์/QR)', (T.closing.created ? T.closing.rate : 0) + '%', '', 'สร้างแล้ว ' + nf(T.closing.created) + ' · จ่ายแล้ว ' + nf(T.closing.paid) + ' · ไม่สำเร็จ ' + nf(T.closing.notPaid)));
      var cards = h('div', { class: 'rv-ch' }, R.channels.map(function (c) {
        return h('div', { class: 'an-kpi rv-kpi rv-card' + (c.revenue ? '' : ' none') }, h('small', {}, payLogo(c.logo, c.name, true), ' ', chip(c.mode === 'code' ? 'รหัสบัตร' : 'ชำระออนไลน์'), c.enabled ? null : chip('ปิดอยู่ในหน้าบ้าน', 'bad')),
          h('b', {}, baht2(c.revenue), h('span', { class: 'u' }, ' บาท')), h('div', { class: 'sub' }, 'นับวันที่เงินเข้า · ' + nf(c.count) + ' รายการ · ' + nf(c.players) + ' คน'),
          h('div', { class: 'sub' }, c.share + '% ของเงินเข้า' + whenWord), c.attempts ? h('div', { class: 'sub' }, (c.mode === 'code' ? 'ใช้รหัสสำเร็จ ' : 'ปิดการขาย ') + c.rate + '% (ทั้งหมด ' + nf(c.attempts) + ' · ไม่สำเร็จ ' + nf(c.failed) + ')') : null);
      }));
      var chart = box('รายได้รายวัน (บาท)', R.series.days.length > 1 ? lineChart(R.series.days.map(function (d) { return d.slice(5); }), [{ name: 'รายได้ (฿)', values: R.series.baht, color: '#4ade80', area: true }], { tipLabels: R.series.days, partialLast: isToday }) : h('p', { class: 'a-note' }, 'เลือกช่วงเวลาหลายวันเพื่อดูกราฟรายวัน'));
      var P = R.payers;
      var payBox = box('ผู้เล่นเติมเงิน' + whenWord,
        h('div', { class: 'rv-pay' }, h('div', {}, h('small', {}, 'ผู้เล่นเติมเงินทั้งหมด'), h('b', {}, nf(P.total)), h('span', {}, 'คน')),
          h('div', {}, h('small', {}, 'เติมครั้งแรก'), h('b', { class: 'f' }, nf(P.first)), h('span', {}, 'คน · ' + P.firstPct + '%')), h('div', {}, h('small', {}, 'เติมซ้ำ'), h('b', { class: 'r' }, nf(P.repeat)), h('span', {}, 'คน · ' + P.repeatPct + '%'))),
        P.total ? h('div', { class: 'rv-split', role: 'img', 'aria-label': 'เติมครั้งแรก ' + P.firstPct + '% เติมซ้ำ ' + P.repeatPct + '%' }, h('i', { class: 'f', style: 'width:' + P.firstPct + '%' }), h('i', { class: 'r', style: 'width:' + P.repeatPct + '%' })) : null,
        h('small', { class: 'h' }, 'เติมครั้งแรก = การเติมเงินสำเร็จครั้งแรกของบัญชีเกิดขึ้นในช่วงนี้ · เติมซ้ำ = เคยเติมสำเร็จมาก่อนช่วงนี้แล้ว'));
      var maxC = Math.max.apply(null, [1].concat(R.prices.map(function (x) { return x.count; })));
      var priceBox = box('จำนวนผู้เติมแยกตามราคา', h('p', { class: 'a-note' }, 'ราคาตามแพ็กเกจเติมเงินในหน้าบ้าน (ตั้งค่า → การเติมเงิน)'),
        h('div', { class: 'an-list' }, R.prices.map(function (x) { return h('div', { class: 'an-row' }, h('div', { class: 't' }, h('span', {}, '฿' + nf(x.price) + ' (' + nf(x.cash) + ' แคช)'), h('span', {}, h('b', {}, nf(x.players) + ' คน'), h('em', {}, nf(x.count) + ' รายการ · ' + baht(x.baht) + ' · ' + x.share + '%'))), h('div', { class: 'tr' }, h('i', { style: 'width:' + Math.max(x.count ? 1.5 : 0, (x.count / maxC) * 100) + '%' }))); })));
      var topRows = R.top.map(function (p) {
        var sus = p.status === 'suspended';
        return h('tr', { class: sus ? 'gd-off' : '' }, td('#' + p.rank, { l: 'อันดับ', cls: 'rv-rank' }), td(h('b', {}, p.username), { l: 'ชื่อผู้ใช้' }), td(p.email, { l: 'อีเมล', cls: 'gd-mail' }), td(p.character, { l: 'ชื่อตัวละคร' }), td(p.joined, { l: 'สมัครวันที่' }),
          td(chip(sus ? 'ถูกระงับ' : 'ปกติ', sus ? 'bad' : 'on'), { l: 'สถานะ' }), td(h('b', {}, baht2(p.lifetimeBaht)), { n: true, l: 'ยอดเติมสะสมทั้งหมด (฿)' }), td(nf(p.lifetimeCount), { n: true, l: 'เติมทั้งหมด (ครั้ง)' }), td(baht2(p.periodBaht), { n: true, l: 'เติมในช่วงที่เลือก (฿)' }), td(h('span', { class: 'gd-pays' }, p.channels.map(function (n, i) { return payChip((p.channelLogos || [])[i], n); })), { l: 'ช่องทางที่เคยใช้' }), td(p.last.slice(0, 16), { l: 'เติมล่าสุด' }));
      });
      var topBox = box('10 อันดับผู้เล่นเติมเงินสูงสุด (ยอดสะสมทั้งหมด)', h('p', { class: 'a-note' }, 'จัดอันดับตามยอดเติมเงินสะสมตลอดอายุบัญชี ไม่ขึ้นกับช่วงเวลาที่เลือก ส่วนคอลัมน์ "เติมในช่วงที่เลือก" แสดงว่าในช่วงนี้แต่ละคนเติมเท่าไร'), h('div', { class: 'an-wrap' }, h('table', { class: 'an-tbl gd-tbl gd-stack' }, h('thead', {}, h('tr', {}, ['อันดับ', 'ชื่อผู้ใช้', 'อีเมล', 'ชื่อตัวละคร', 'สมัครวันที่', 'สถานะ', 'ยอดเติมสะสม (฿)', 'เติมทั้งหมด (ครั้ง)', 'เติมในช่วงที่เลือก (฿)', 'ช่องทางที่เคยใช้', 'เติมล่าสุด'].map(function (c, i) { return h('th', { class: i === 6 || i === 7 || i === 8 ? 'n' : '' }, c); }))),
        h('tbody', {}, topRows.length ? topRows : [h('tr', {}, h('td', { colspan: 11, class: 'gd-none' }, 'ยังไม่มีผู้เติมเงิน'))]))));
      var matrix = box('ราคา × ช่องทาง (จำนวนรายการที่เงินเข้า)', table([{ t: 'ราคา' }].concat(R.channels.map(function (c) { return { t: payLogo(c.logo, c.name), n: true }; })).concat([{ t: 'รวม', n: true }]),
        R.prices.map(function (x) { return h('tr', {}, td('฿' + nf(x.price)), R.channels.map(function (c) { return td(nf(x.byChannel[c.id] || 0), { n: true, l: c.name }); }), td(nf(x.count), { n: true, l: 'รวม' })); })));
      body.replaceChildren(kpis, h('h2', { class: 'a-sub rv-h' }, 'ยอดเติมเงินแยกตามช่องทาง'), cards, chart, h('div', { class: 'an-2' }, payBox, priceBox), topBox, matrix);
    }
    function load() {
      var mine = ++seq; body.classList.add('rv-busy');
      return api('gameops/revenue?' + qs({ from: st.from, to: st.to })).then(function (R) { if (mine !== seq) return; body.classList.remove('rv-busy'); draw(R); }, function (e) { if (mine !== seq) return; body.classList.remove('rv-busy'); body.replaceChildren(errBox(e)); });
    }
    load();
    return host;
  }

  var part = function (id, label, desc, view) { return { id: id, g: G, label: label, desc: desc, paths: [], view: view }; };
  return {
    parts: [
      part('gd-dash', 'แดชบอร์ด', 'ภาพรวมเกมวันนี้: จำนวนบัญชีทั้งหมด ผู้เล่นออนไลน์ สมัครใหม่ ยอดเติมเงินวันนี้ พร้อมกราฟและตารางรายวัน 30 วันล่าสุด (ข้อมูลตัวอย่าง)', dashView),
      part('gd-revenue', 'ภาพรวมรายได้', 'รายได้จริง รายการที่เงินเข้า เฉลี่ยต่อรายการ อัตราปิดการขาย แยกตามช่องทางเติมเงินของหน้าบ้าน ผู้เติมครั้งแรก/เติมซ้ำ 10 อันดับผู้เติมสูงสุด และจำนวนผู้เติมแยกตามราคา เลือกช่วงเวลาได้', revenueView),
      part('gd-players', 'บัญชีผู้เล่น', 'ค้นหาและจัดการบัญชีผู้เล่น: แก้ไขข้อมูล ระงับ/ปลดระงับ และเติมเงินให้ผู้เล่นโดยตรง (ข้อมูลตัวอย่าง)', playersView),
      part('gd-h-topup', 'ประวัติเติมเงิน', 'รายการเติมเงินทั้งหมด ทั้งที่ผู้เล่นจ่ายเองและที่แอดมินเติมให้ กรองตามสถานะและวันที่ได้', function () { return historyView('topups'); }),
      part('gd-h-coupon', 'ประวัติการใช้งานคูปอง', 'ใครใช้คูปองอะไร เมื่อไหร่ และสำเร็จหรือไม่', function () { return historyView('coupons'); }),
      part('gd-h-code', 'ประวัติโค้ดรางวัล', 'ใครใส่โค้ดรางวัลอะไร เมื่อไหร่ และได้รางวัลอะไร', function () { return historyView('codes'); }),
      part('gd-r-coupon', 'สร้างคูปอง', 'สร้างคูปองส่วนลด/แคช/ไอเทม กำหนดสิทธิ์และช่วงเวลา เปิด/ปิดหรือลบภายหลัง', couponView),
      part('gd-r-code', 'สร้างโค้ดรางวัล', 'สร้างโค้ดรางวัลทีละหลายร้อยโค้ด กำหนดรางวัลและวันหมดอายุ คัดลอกหรือดาวน์โหลดเป็น CSV', rewardCodeView)
    ],
    menu: { id: 'game', label: 'ระบบเกม', hint: 'แดชบอร์ด รายได้ ผู้เล่น ประวัติ รางวัล (Mockup)', before: 'store', groups: [
      { id: 'gd', label: 'แดชบอร์ด', tabs: [['gd-dash', 'แดชบอร์ด']] },
      { id: 'gv', label: 'ภาพรวมรายได้', tabs: [['gd-revenue', 'ภาพรวมรายได้']] },
      { id: 'gp', label: 'บัญชีผู้เล่น', tabs: [['gd-players', 'บัญชีผู้เล่น']] },
      { id: 'gh', label: 'ประวัติ', tabs: [['gd-h-topup', 'เติมเงิน'], ['gd-h-coupon', 'การใช้งานคูปอง'], ['gd-h-code', 'โค้ดรางวัล']] },
      { id: 'gr', label: 'รางวัล', tabs: [['gd-r-coupon', 'สร้างคูปอง'], ['gd-r-code', 'สร้างโค้ดรางวัล']] }
    ] }
  };
});

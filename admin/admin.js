(function () {
  const app = document.getElementById('app');
  let csrf = '', C = null, saved = null, cur = 'home';
  const dirty = new Set();
  let navBtns = {}, menuBtns = {}, subBtns = {}, barEls = {}, subOpen = true, drawerOpen = false;

  // ---------- tiny helpers ----------
  const safeLink = value => { const u = String(value || '').trim(); return !/[\\\x00-\x20\x7f]/.test(u) && /^(https?:\/\/[^/]|\/(?!\/)|#|mailto:)/i.test(u) ? u : '#'; };
  const h = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, k === 'href' ? safeLink(v) : v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(kid));
    return e;
  };
  // when the session has expired mid-work: ask for the password in a popup, then retry the same request
  const api = async (path, method, body) => {
    const r = await fetch('/admin/api/' + path, { method: method || 'GET', credentials: 'same-origin', headers: Object.assign({ 'Content-Type': 'application/json' }, csrf ? { 'X-CSRF-Token': csrf } : {}), body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401 && C && path !== 'login' && path !== 'me') { await relogin(); return api(path, method, body); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error || 'error'), { status: r.status });
    return d;
  };
  let reloginP = null;
  const relogin = () => reloginP || (reloginP = new Promise(done => {
    const u = h('input', { type: 'text', autocomplete: 'username', required: true }), p = h('input', { type: 'password', autocomplete: 'current-password', required: true });
    const o = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 7, placeholder: '000000' });
    const m = h('div', { class: 'a-err' });
    const f = h('form', { class: 'a-dlg a-relog' }, h('div', { class: 'hd' }, h('b', {}, 'เซสชันหมดอายุ')),
      h('p', { class: 'a-note' }, 'กรุณาเข้าสู่ระบบอีกครั้ง งานที่ยังไม่บันทึกจะไม่หาย'),
      h('label', { class: 'a-f' }, 'ชื่อผู้ใช้', u), h('label', { class: 'a-f' }, 'รหัสผ่าน', p), h('label', { class: 'a-f' }, 'รหัส 6 หลักจากแอป Authenticator (ถ้าเปิดใช้)', o), m, h('button', { class: 'btn', type: 'submit' }, 'เข้าสู่ระบบ'));
    const bg = h('div', { class: 'a-modal' }, f);
    f.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        const r = await fetch('/admin/api/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: u.value, password: p.value, code: o.value }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { m.textContent = d.error || 'เข้าสู่ระบบไม่สำเร็จ'; return; }
        csrf = (await api('me')).csrf;
        bg.remove(); done();
      } catch (x) { m.textContent = x.message; }
    });
    document.body.append(bg); u.focus();
  }).finally(() => { reloginP = null; }));
  const clone = o => JSON.parse(JSON.stringify(o, (k, v) => (k === '_open' ? undefined : v)));
  const getPath = (o, p) => p.split('.').reduce((a, k) => a && a[k], o);
  const setPath = (o, p, v) => { const ks = p.split('.'), last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };
  const uid = () => Math.random().toString(36).slice(2, 10);
  let tt;
  const toast = msg => { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2400); };

  function setStatus(t, k) { const m = barEls.st; if (m) { m.textContent = t; m.className = 'st ' + (k || ''); } }
  function refreshChrome() {
    for (const s of SECTIONS) if (navBtns[s.id]) navBtns[s.id].classList.toggle('dirty', dirty.has(s.id));
    for (const m of MENUS) if (menuBtns[m.id]) menuBtns[m.id].classList.toggle('dirty', m.tabs.some(t => dirty.has(t.id)));
    for (const m of MENUS) for (const g of m.groups || []) if (subBtns[g.id]) subBtns[g.id].classList.toggle('dirty', g.tabs.some(t => dirty.has(t.id)));
    if (barEls.one) barEls.one.disabled = !dirty.has(cur);
    if (barEls.all) { barEls.all.style.display = dirty.size > 1 || (dirty.size === 1 && !dirty.has(cur)) ? '' : 'none'; barEls.all.textContent = 'บันทึกทั้งหมด (' + dirty.size + ')'; }
  }
  function mark() { dirty.add(cur); setStatus('มีการแก้ไขที่ยังไม่บันทึก', 'warn'); refreshChrome(); }

  // ---------- media: upload + library picker ----------
  const ACCEPT = { image: 'image/jpeg,image/png,image/webp,image/gif', video: 'video/mp4,video/webm' };
  const LIMIT = { image: 10e6, video: 60e6 };
  const isVideo = u => /\.(mp4|webm)(\?|#|$)/i.test(u || '');
  const fmtSize = n => n >= 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB';

  async function uploadFile(file) {
    if (!file) return null;
    const kind = file.type.startsWith('video/') ? 'video' : 'image';
    if (file.size > LIMIT[kind]) { alert('ไฟล์ใหญ่เกิน ' + LIMIT[kind] / 1e6 + 'MB'); return null; }
    try {
      const send = () => fetch('/admin/api/upload', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': file.type, 'X-CSRF-Token': csrf }, body: file });
      let r = await send();
      if (r.status === 401) { await relogin(); r = await send(); }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || (r.status === 413 ? 'ไฟล์ใหญ่เกินที่เซิร์ฟเวอร์รับได้' : 'อัปโหลดไม่สำเร็จ'));
      return d.url;
    } catch (e) { alert(e.message); return null; }
  }
  const chooseFile = accept => new Promise(res => {
    const f = h('input', { type: 'file', accept, style: 'display:none' });
    f.addEventListener('change', () => res(f.files[0] || null));
    document.body.append(f); f.click(); setTimeout(() => f.remove(), 60000);
  });

  const thumb = it => it.kind === 'video'
    ? h('video', { src: it.url + '#t=0.5', muted: true, preload: 'metadata', playsinline: true })
    : h('img', { src: it.url, alt: '', loading: 'lazy', onerror: e => { const n = h('div', { class: 'a-imgerr' }, 'โหลดรูปไม่ได้ ไฟล์อยู่บนเซิร์ฟเวอร์แต่เปิดไม่ได้ (ตรวจสิทธิ์ไฟล์ 644 หรือการตั้งค่า proxy)'); e.target.replaceWith(n); } });

  // Grid of every image/video on the site (built-in /img and admin uploads).
  // kind: 'image' | 'video' | 'all'. onPick(url) makes each tile selectable; without it the grid is a manager.
  function mediaLibrary(o) {
    let items = [], tab = o.kind || 'all', shownN = 36;
    const grid = h('div', { class: 'a-media' }, h('div', { class: 'a-empty' }, 'กำลังโหลด…'));
    const q = h('input', { type: 'search', placeholder: 'ค้นหาชื่อไฟล์…' });
    const tabs = {};
    const draw = () => {
      for (const k in tabs) tabs[k].classList.toggle('on', k === tab);
      const s = q.value.trim().toLowerCase();
      const list = items.filter(it => (tab === 'all' || it.kind === tab) && (!s || it.name.toLowerCase().includes(s)));
      if (!list.length) return grid.replaceChildren(h('div', { class: 'a-empty' }, items.length ? 'ไม่พบไฟล์ที่ตรงกับเงื่อนไข' : 'ยังไม่มีไฟล์'));
      grid.replaceChildren(...list.slice(0, shownN).map(it => {
        const acts = h('div', { class: 'acts' },
          h('a', { class: 'ghost sm', href: it.url, target: '_blank', rel: 'noopener', onclick: e => e.stopPropagation() }, 'เปิด'),
          !o.onPick ? h('button', { type: 'button', class: 'ghost sm', onclick: async () => { try { await navigator.clipboard.writeText(it.url); toast('คัดลอก ' + it.url); } catch (e) { prompt('คัดลอกลิงก์', it.url); } } }, 'คัดลอกลิงก์') : null,
          it.deletable && !o.onPick ? h('button', { type: 'button', class: 'ghost sm', onclick: async () => {
            if (!confirm('ลบไฟล์ ' + it.name + ' ถาวร?\nถ้าไฟล์นี้ยังถูกใช้อยู่บนเว็บ รูป/วิดีโอนั้นจะหายไป')) return;
            try { await api('media?name=' + encodeURIComponent(it.name), 'DELETE'); items = items.filter(x => x !== it); draw(); toast('ลบแล้ว'); } catch (e) { alert(e.message); }
          } }, 'ลบ') : null);
        const card = h('div', { class: 'a-mi' + (o.current === it.url ? ' cur' : '') + (o.onPick ? ' pick' : ''), title: it.url },
          h('div', { class: 'pv' }, thumb(it), it.kind === 'video' ? h('span', { class: 'kd' }, 'VIDEO') : null),
          h('div', { class: 'nm' }, it.name), h('div', { class: 'mt' }, (it.deletable ? 'อัปโหลด' : 'ไฟล์ระบบ') + ' · ' + fmtSize(it.size)), acts);
        if (o.onPick) card.addEventListener('click', () => o.onPick(it.url));
        return card;
      }), ...(list.length > shownN ? [h('button', { type: 'button', class: 'ghost a-more', onclick: () => { shownN += 36; draw(); } }, 'แสดงเพิ่ม (เหลืออีก ' + (list.length - shownN) + ' ไฟล์)')] : []));
    };
    const load = () => api('media').then(d => { items = d.items; draw(); }).catch(e => { grid.replaceChildren(h('div', { class: 'a-empty' }, 'โหลดไม่สำเร็จ: ' + e.message)); });
    const up = h('button', { type: 'button', class: 'btn sm', onclick: async () => {
      const f = await chooseFile(o.kind === 'image' || o.kind === 'video' ? ACCEPT[o.kind] : ACCEPT.image + ',' + ACCEPT.video);
      if (!f) return;
      up.disabled = true; up.textContent = 'กำลังอัปโหลด…';
      const u = await uploadFile(f);
      up.disabled = false; up.textContent = '+ อัปโหลดไฟล์ใหม่';
      if (!u) return;
      toast('อัปโหลดแล้ว');
      if (o.onPick) return o.onPick(u);
      tab = 'all'; q.value = ''; load();
    } }, '+ อัปโหลดไฟล์ใหม่');
    q.addEventListener('input', () => { shownN = 36; draw(); });
    const tabBar = h('div', { class: 'a-seg' }, ...(o.kind && o.kind !== 'all' ? [] : [['all', 'ทั้งหมด'], ['image', 'รูปภาพ'], ['video', 'วิดีโอ']].map(([k, l]) => (tabs[k] = h('button', { type: 'button', onclick: () => { tab = k; draw(); } }, l)))));
    load();
    return [h('div', { class: 'a-tools' }, tabBar, q, up), grid];
  }

  // modal picker; resolves to the chosen url, or null when closed
  const pickMedia = (kind, current) => new Promise(res => {
    const done = u => { removeEventListener('keydown', esc); bg.remove(); res(u); };
    const esc = e => { if (e.key === 'Escape') done(null); };
    const bg = h('div', { class: 'a-modal', onclick: e => { if (e.target === bg) done(null); } },
      h('div', { class: 'a-dlg', role: 'dialog', 'aria-modal': 'true' },
        h('div', { class: 'hd' }, h('b', {}, kind === 'video' ? 'เลือกวิดีโอ' : 'เลือกรูปภาพ'), h('small', {}, 'คลิกไฟล์เพื่อเลือก หรืออัปโหลดไฟล์ใหม่'), h('button', { type: 'button', class: 'ghost sm', onclick: () => done(null) }, 'ปิด ✕')),
        ...mediaLibrary({ kind, current, onPick: done })));
    addEventListener('keydown', esc);
    document.body.append(bg);
  });
  const pickImage = current => pickMedia('image', current);

  // ---------- form fields ----------
  // o: type, help, big, max/min (character counter), ph (placeholder), onchange
  function field(obj, key, label, o) {
    o = o || {};
    if (o.type === 'image' || o.type === 'video') return imageField(obj, key, label, o);
    if (o.type === 'select') {
      const opts = o.options.map(v => (Array.isArray(v) ? v : [v, v]));
      const sel = h('select', {}, ...opts.map(([v, l]) => h('option', { value: v }, l)));
      sel.value = opts.some(([v]) => v === obj[key]) ? obj[key] : opts[opts.length - 1][0];
      obj[key] = sel.value;
      sel.addEventListener('change', () => { obj[key] = sel.value; mark(); if (o.onchange) o.onchange(); });
      return h('label', { class: 'a-f' }, h('span', { class: 'top' }, h('span', {}, label)), sel, o.help ? h('span', { class: 'h' }, o.help) : null);
    }
    const input = o.type === 'textarea' ? h('textarea', { class: o.big ? 'big' : '' }) : h('input', { type: o.type || 'text' });
    if (o.ph) input.placeholder = typeof o.ph === 'function' ? o.ph() : o.ph;
    input.value = obj[key] || '';
    const cnt = o.max ? h('span', { class: 'a-cnt' }) : null;
    const count = () => { if (!cnt) return; const n = input.value.length; cnt.textContent = n + '/' + o.max; cnt.className = 'a-cnt ' + (n > o.max ? 'bad' : n >= (o.min || 1) ? 'ok' : ''); };
    input.addEventListener('input', () => { obj[key] = input.value; count(); mark(); if (o.onchange) o.onchange(); });
    count();
    return h('label', { class: 'a-f' }, h('span', { class: 'top' }, h('span', {}, label), cnt), input, o.help ? h('span', { class: 'h' }, o.help) : null);
  }
  function check(obj, key, label) {
    // stored values may be booleans or the strings "true"/"false" (text fields on the server)
    const i = h('input', { type: 'checkbox' }); i.checked = obj[key] === true || obj[key] === 'true' || obj[key] === '1';
    i.addEventListener('change', () => { obj[key] = i.checked; mark(); });
    return h('label', { class: 'a-chk' }, i, label);
  }
  // image or video path with preview, "choose from library" and "upload" buttons
  function imageField(obj, key, label, o) {
    if (typeof o.ph === 'function') o = Object.assign({}, o, { ph: o.ph() });
    const kind = o.type === 'video' ? 'video' : 'image';
    const inp = h('input', { type: 'text', placeholder: o.ph || '/img/... หรือ https://...' }); inp.value = obj[key] || '';
    const pv = h('div', { class: 'pv' });
    const upd = () => {
      const u = inp.value || o.ph || '';
      pv.replaceChildren(u ? (isVideo(u) ? h('video', { src: u, muted: true, loop: true, autoplay: true, playsinline: true }) : h('img', { src: u, alt: '' })) : h('span', {}, 'ไม่มี'));
      pv.classList.toggle('def', !inp.value && !!o.ph);
    };
    const set = u => { inp.value = obj[key] = u; upd(); mark(); };
    inp.addEventListener('input', () => { obj[key] = inp.value; upd(); mark(); });
    upd();
    return h('div', { class: 'a-f' }, h('span', {}, label),
      h('div', { class: 'a-imgf' + (kind === 'video' ? ' a-isvid' : '') }, pv,
        h('div', { class: 'in' }, inp, h('div', { class: 'bt' },
          h('button', { type: 'button', class: 'btn sm', onclick: async () => { const u = await pickMedia(kind, inp.value); if (u) set(u); } }, 'เลือกจากคลัง'),
          h('button', { type: 'button', class: 'ghost sm', onclick: async () => { const f = await chooseFile(ACCEPT[kind]); const u = f && await uploadFile(f); if (u) { set(u); toast('อัปโหลดแล้ว'); } } }, 'อัปโหลดใหม่'),
          inp.value || o.ph ? h('button', { type: 'button', class: 'ghost sm', onclick: () => set('') }, o.ph ? 'ใช้ค่าเริ่มต้น' : 'ล้าง') : null))),
      o.help ? h('span', { class: 'h' }, o.help) : null);
  }
  const box = (title, ...kids) => h('div', { class: 'a-box' }, title ? h('h3', {}, title) : null, ...kids);
  const two = (...k) => h('div', { class: 'a-grid2' }, ...k);
  const note = t => h('div', { class: 'a-note' }, t);
  // English twins of Thai fields: an empty one means the English page shows the Thai text
  const NEWS_TAGS = ['PATCH NOTE', 'EVENT', 'TOURNAMENT', 'UPDATE', 'PROMOTION', 'NEWS'];
  const enField = (obj, key, label, o) => field(obj, key + 'En', label + ' (EN)', Object.assign({ ph: () => obj[key] || '' }, o));
  const enBox = (...kids) => h('details', { class: 'a-seo' }, h('summary', {}, 'English version (EN) · เว้นว่าง = แสดงภาษาไทยในหน้า /en'), h('div', { class: 'a-in' }, ...kids));

  // SEO block: collapsible, character counters, live Google preview
  function seoBox(obj, tk, dk, o) {
    const origin = () => (C.site.url || location.origin).replace(/\/+$/, '');
    const g = { u: h('div', { class: 'u' }), t: h('div', { class: 't' }), d: h('div', { class: 'd' }) };
    const upd = () => {
      const url = typeof o.url === 'function' ? o.url() : o.url;
      g.u.textContent = origin() + url;
      g.t.textContent = obj[tk] || (o.fbT ? o.fbT() : '') || '(ไม่มี title)';
      g.d.textContent = obj[dk] || (o.fbD ? o.fbD() : '') || '(ไม่มี description)';
    };
    upd();
    return h('details', { class: 'a-seo', open: !!o.open },
      h('summary', {}, o.label || 'SEO (การแสดงผลบน Google)'),
      h('div', { class: 'a-in' },
        field(obj, tk, 'Title (แท็บเบราว์เซอร์ / หัวข้อบน Google)', { max: 60, min: 30, onchange: upd, ph: o.fbT, help: o.fbT ? 'เว้นว่าง = ใช้ค่าอัตโนมัติ (ตัวอย่างสีเทาในช่อง)' : 'แนะนำ 30–60 ตัวอักษร' }),
        field(obj, dk, 'Meta description (คำอธิบายใต้หัวข้อบน Google)', { type: 'textarea', max: 160, min: 70, onchange: upd, ph: o.fbD, help: 'แนะนำ 70–160 ตัวอักษร' }),
        h('div', { class: 'a-g' }, h('small', {}, 'ตัวอย่างบน Google'), g.u, g.t, g.d)));
  }

  // ---------- settings pages: an index of the sections on the left, one section after another on the right ----------
  // Each section is a numbered card with a title and one sentence saying what it changes on the site,
  // so a page reads as "1 พื้นหลัง · 2 หัวข้อใหญ่ · 3 ปุ่มลงทะเบียน …" and is easy to find again next time.
  const SET_TABS = ['home', 'links', 'prereg', 'en', 'p-privacy', 'p-terms', 'p-support', 'p-delete', 'p-odds', 'cookies', 'general', 'lr-login', 'lr-register', 'lr-api', 'lr-member', 'account'];
  const SECTION_DESC = {
    'พื้นหลังหน้าแรก (Hero)': 'วิดีโอและรูปด้านหลังหัวข้อใหญ่ ส่วนแรกที่ผู้เข้าชมเห็น',
    'หัวข้อใหญ่': 'ข้อความตัวใหญ่ H1–H3 และคำอธิบายใต้หัวข้อบนหน้าแรก',
    'ปุ่มลงทะเบียน': 'ปุ่มสีแดงบนหน้าแรก: ข้อความ ลิงก์ และข้อความเมื่อยังไม่เปิด',
    'ป้ายข้อความอื่นๆ': 'ข้อความเล็กรอบปุ่มดาวน์โหลด โซเชียล และหัวข้อส่วนข่าวบนหน้าแรก',
    'SEO (การแสดงผลบน Google)': 'ชื่อและคำอธิบายที่ Google แสดงสำหรับหน้านี้',
    'ฉบับภาษาอังกฤษ': 'หน้าเดียวกันภาษาอังกฤษที่ /en/… เว้นว่าง = ไม่มีหน้าอังกฤษ',
    'ลิงก์ดาวน์โหลด': 'ปุ่ม App Store / Google Play บนหน้าแรก ใส่ลิงก์แล้วป้าย SOON จะหายไป',
    'ลิงก์โซเชียล': 'ไอคอน Facebook TikTok Discord YouTube ใต้ปุ่มดาวน์โหลด',
    'เปิด/ปิดส่วนนี้': 'เลือกว่าจะแสดงส่วนลงทะเบียนล่วงหน้าที่หน้าไหนบ้าง',
    'จำนวนผู้ลงทะเบียน': 'ตัวเลขบนตัวนับ ใส่เองหรือดึงจากระบบเกมผ่าน API',
    'ข้อความบนหน้า': 'หัวข้อ คำอธิบาย และป้ายสถานะรอบตัวนับและการ์ดรางวัล',
    'หัวข้อหน้า': 'ชื่อในเมนู หัวข้อ H1/H2 และย่อหน้าแนะนำของหน้านี้',
    'การแชร์ & การค้นหา': 'รูปเมื่อแชร์ลิงก์ และการซ่อนหน้านี้จาก Google',
    'ทั้งเว็บ': 'ชื่อแท็บ คำอธิบายบน Google และข้อความท้ายเว็บของหน้าภาษาอังกฤษ',
    'หน้าแรก': 'ข้อความภาษาอังกฤษของหน้า /en (เว้นว่าง = แสดงภาษาไทย)',
    'หน้า News': 'ข้อความภาษาอังกฤษของหน้า /en/news',
    'หน้า Gameplay': 'ข้อความภาษาอังกฤษของหน้า /en/gameplay',
    'หน้า Drivers': 'ข้อความภาษาอังกฤษของหน้า /en/drivers',
    'หน้า Rewards': 'ข้อความภาษาอังกฤษของหน้า /en/rewards',
    'ตัวนับลงทะเบียนล่วงหน้า': 'ข้อความภาษาอังกฤษรอบตัวนับและการ์ดรางวัล',
    'ข้อมูลเว็บไซต์': 'ชื่อเว็บ โดเมนหลัก และข้อความท้ายเว็บ',
    'โลโก้ ไอคอน และรูปแชร์': 'รูปบนเมนู แท็บเบราว์เซอร์ และเมื่อแชร์ลิงก์',
    'SEO เริ่มต้น (หน้าแรก)': 'ชื่อและคำอธิบายที่ Google แสดง เมื่อหน้าไหนไม่ได้ตั้งเอง',
    'เครื่องมือ SEO & สถิติ': 'รหัสยืนยัน Google / Bing และ Google Analytics',
    'หน้า Loading (ก่อนเข้าเว็บ)': 'หน้าจอโหลดก่อนเข้าเว็บ: เปิด/ปิด รูปแบบ และหน้าที่แสดง',
    'การเชื่อมต่อ': 'เลือกโหมด Mockup หรือ API จริง และที่อยู่ของ API',
    'เส้นทาง API การเติมเงิน': 'เส้นทางที่หน้าเติมเงินเรียก เมื่อต่อ API จริง',
    'เส้นทาง API บัญชีผู้เล่น': 'เส้นทางของระบบบัญชีผู้เล่น ต่อท้ายที่อยู่ API',
    'เนื้อหานโยบาย (ภาษาไทย)': 'ข้อความนโยบายฉบับภาษาไทย ที่หน้า /privacy',
    'เนื้อหาข้อตกลง (ภาษาไทย)': 'ข้อความข้อตกลงฉบับภาษาไทย ที่หน้า /terms',
    'เนื้อหา (ภาษาไทย)': 'ข้อความหน้านี้ภาษาไทย ถ้าเว้นหัวข้อและเนื้อหาว่าง = ยังไม่มีหน้านี้',
    'เนื้อหาหน้าซัพพอร์ต': 'ข้อความในหน้า /support',
    'ค่าที่ใช้ในนโยบาย / ข้อตกลง': 'ค่าที่แทรกในข้อความอัตโนมัติ เช่น อายุขั้นต่ำ จำนวนวันลบข้อมูล',
    'ช่องทางติดต่อ': 'อีเมล โทรศัพท์ และ LINE ที่แสดงท้ายเว็บและหน้าซัพพอร์ต',
    'คำถามที่พบบ่อยเรื่องซัพพอร์ต': 'คำถาม-คำตอบท้ายหน้าซัพพอร์ต',
    'แบนเนอร์คุกกี้ภาษาอังกฤษ': 'ข้อความแบนเนอร์และหน้าต่างตั้งค่าคุกกี้ ที่ผู้เข้าชมหน้า /en เห็น',
    'การทำงาน': 'เปิด/ปิดแบนเนอร์ขอความยินยอม และการนับสถิติ',
    'ข้อความในแบนเนอร์': 'ข้อความและปุ่มบนแถบขอความยินยอมด้านล่างจอ',
    'หน้าต่างตั้งค่าคุกกี้': 'ข้อความในหน้าต่างเลือกประเภทคุกกี้',
    'คุกกี้ที่ระบบใช้': 'รายการคุกกี้จริงของเว็บ อัปเดตเองตามการตั้งค่า',
    'เปิด/ปิดระบบสมาชิก': 'เปิดหน้าสมาชิกและปุ่มเข้าสู่ระบบบนเมนู',
    'หน้าเข้าสู่ระบบ': 'หัวข้อ ข้อความ และลิงก์ลืมรหัสผ่านในหน้า /login',
    'หน้าสมัครสมาชิก': 'เปิด/ปิดการสมัคร และข้อความในหน้า /register',
    'ลงทะเบียนล่วงหน้า': 'สิ่งที่ผู้เข้าชมเห็นช่วงก่อนเปิดเกม',
    'การ์ดสมาชิกและชื่อสกุลเงิน': 'ข้อความบนการ์ดสมาชิก และชื่อเงิน/แต้มในหน้าบัญชี',
    'ระบบเติมเงิน': 'เปิด/ปิดหน้าเติมเงิน และชื่อเมนู',
    'เปลี่ยนรหัสผ่าน': 'รหัสผ่านสำหรับเข้าหลังบ้านนี้'
  };
  const descOf = t => SECTION_DESC[t] || (t.startsWith('English version') ? 'ฉบับภาษาอังกฤษของหน้านี้ เว้นว่าง = ไม่มีหน้าอังกฤษ' : '');
  let spy = null;
  function settingsLayout(items) {
    const isSec = e => e && e.classList && (e.classList.contains('a-box') || e.classList.contains('a-seo') || e.classList.contains('a-host'));
    const intro = [], secs = [];
    let group = '', groupUsed = false, free = null;
    for (const e of items) {
      if (!e) continue;
      // a sub-heading ("ตั้งค่าหน้า: Rewards") starts a group in the index
      if (e.classList && e.classList.contains('a-sub')) { group = e.textContent.replace(/\s+·\s+.*$/, '').replace(/^ตั้งค่าหน้า: หน้า /, 'ตั้งค่าหน้า ').replace(/^ตั้งค่าหน้า: /, 'ตั้งค่าหน้า '); groupUsed = false; free = null; continue; }
      if (isSec(e)) { secs.push({ el: e, group: groupUsed ? '' : group }); groupUsed = true; free = null; continue; }
      if (free) { free.append(e); continue; }
      // a list or note right under a sub-heading becomes its own section, named after the heading
      if (group && !groupUsed) { free = h('div', { class: 'a-box a-free' }, h('h3', {}, group)); free.append(e); secs.push({ el: free, group: '' }); groupUsed = true; continue; }
      if (secs.length) secs[secs.length - 1].el.append(e); else intro.push(e);
    }
    const titleOf = el => {
      if (el.classList.contains('a-seo')) return (el.querySelector(':scope > summary') || {}).textContent || 'SEO';
      const t = el.querySelector(':scope > h3') || el.querySelector(':scope > .a-box > h3');
      return t ? t.textContent : '';
    };
    const nav = h('nav', { class: 'a-toc', 'aria-label': 'ส่วนในหน้านี้' }, h('div', { class: 'a-toc-t' }, 'ส่วนในหน้านี้'));
    const sel = h('select', { class: 'a-toc-sel', 'aria-label': 'ไปที่ส่วน' });
    const body = h('div', { class: 'a-secs' }, ...intro);
    const links = [];
    const go = el => { el.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
    let og = null;
    secs.forEach(({ el, group: g }, i) => {
      const id = 'sec-' + (i + 1), title = titleOf(el);
      el.id = id; el.classList.add('a-sec');
      if (el.classList.contains('a-seo')) { el.open = true; const sm = el.querySelector(':scope > summary'); if (sm) sm.addEventListener('click', ev => ev.preventDefault()); }
      const d = descOf(title), h3 = el.querySelector(':scope > h3');
      if (d && h3 && !el.querySelector(':scope > .a-desc')) h3.after(h('p', { class: 'a-desc' }, d));
      if (d && el.classList.contains('a-seo')) { const sm = el.querySelector(':scope > summary'); if (sm && !el.querySelector(':scope > .a-desc')) sm.after(h('p', { class: 'a-desc' }, d)); }
      if (g) { nav.append(h('div', { class: 'a-toc-g' }, g)); body.append(h('h2', { class: 'a-gh' }, g)); og = h('optgroup', { label: g }); sel.append(og); }
      const short = title.split(/\s+·\s+/)[0];
      const a = h('a', { href: '#' + id, onclick: ev => { ev.preventDefault(); go(el); } }, h('span', { class: 'n' }, String(i + 1)), h('span', {}, short));
      links.push([el, a]); nav.append(a);
      (og || sel).append(h('option', { value: id }, (i + 1) + '. ' + short));
      body.append(el);
    });
    sel.addEventListener('change', () => { const el = document.getElementById(sel.value); if (el) go(el); });
    // the index follows the reader: the section at the top of the screen is lit
    requestAnimationFrame(() => {
      if (spy) spy.disconnect();
      if (!('IntersectionObserver' in window) || !links.length) return;
      spy = new IntersectionObserver(es => {
        const hit = es.filter(x => x.isIntersecting).sort((p, q) => p.boundingClientRect.top - q.boundingClientRect.top)[0];
        if (!hit) return;
        links.forEach(([el, a]) => a.classList.toggle('on', el === hit.target));
        sel.value = hit.target.id;
      }, { rootMargin: '-15% 0px -70% 0px' });
      links.forEach(([el]) => spy.observe(el));
      links[0][1].classList.add('on');
    });
    return secs.length > 1 ? h('div', { class: 'a-set' }, nav, h('div', { class: 'a-setc' }, sel, body)) : h('div', { class: 'a-set solo' }, h('div', { class: 'a-setc' }, body));
  }

  // ---------- card list + side editor (news, gameplay, drivers, rewards) ----------
  // Cards with a picture, filters on top; the chosen card opens in a panel beside the list (a full-screen sheet on small screens)
  // spec: title, thumb, meta, badge, quick, en (all take the item), filters [[id, label, [[value, label]...], (item, value) => bool]], stats(list) -> text
  function cardEditor(arr, spec) {
    const grid = h('div', { class: 'a-cards' });
    const panel = h('aside', { class: 'a-panel', 'aria-label': 'แก้ไขรายการ' });
    const wrap = h('div', { class: 'a-split' }, h('div', { class: 'a-cl' }, grid), panel);
    const q = h('input', { type: 'search', placeholder: 'ค้นหา…', 'aria-label': 'ค้นหา' });
    const fvals = {}, fsel = (spec.filters || []).map(([id, label, opts]) => {
      fvals[id] = '';
      const s = h('select', { 'aria-label': label }, h('option', { value: '' }, label + ': ทั้งหมด'), ...opts.map(([v, l]) => h('option', { value: v }, l)));
      s.addEventListener('change', () => { fvals[id] = s.value; draw(); });
      return s;
    });
    const stat = h('div', { class: 'a-stat' });
    let selIt = null, dragFrom = -1;
    const shown = () => {
      const s = q.value.trim().toLowerCase();
      return arr.filter(it => (!s || JSON.stringify(it).toLowerCase().includes(s)) && (spec.filters || []).every(([id, , , test]) => !fvals[id] || test(it, fvals[id])));
    };
    const filtered = () => !!q.value.trim() || Object.values(fvals).some(Boolean);
    function select(it) {
      selIt = it; wrap.classList.toggle('has-sel', !!it);
      document.body.classList.toggle('a-sheet', !!it);
      if (!it) { panel.replaceChildren(); [...grid.children].forEach(c => c.classList.remove('on')); return; }
      const i = arr.indexOf(it);
      const ttl = h('b', {}, spec.title(it) || '(ยังไม่ตั้งชื่อ)');
      const upd = () => { ttl.textContent = spec.title(it) || '(ยังไม่ตั้งชื่อ)'; const c = grid.querySelector('.a-card.on .t'); if (c) c.textContent = ttl.textContent; };
      const move = d => () => { const j = arr.indexOf(it) + d; if (j < 0 || j >= arr.length) return; const k = arr.indexOf(it); [arr[k], arr[j]] = [arr[j], arr[k]]; mark(); draw(); };
      panel.replaceChildren(
        h('div', { class: 'a-ph' }, h('span', { class: 'no' }, String(i + 1).padStart(2, '0')), ttl,
          h('button', { type: 'button', class: 'ghost sm', title: 'เลื่อนขึ้น', 'aria-label': 'เลื่อนขึ้น', onclick: move(-1) }, '↑'),
          h('button', { type: 'button', class: 'ghost sm', title: 'เลื่อนลง', 'aria-label': 'เลื่อนลง', onclick: move(1) }, '↓'),
          h('button', { type: 'button', class: 'ghost sm', onclick: () => { if (confirm('ลบรายการนี้?')) { arr.splice(arr.indexOf(it), 1); mark(); select(null); draw(); } } }, 'ลบ'),
          h('button', { type: 'button', class: 'btn sm', onclick: () => select(null) }, 'เสร็จ')),
        h('div', { class: 'a-pb' }, ...spec.form(it, upd)));
      [...grid.children].forEach(c => c.classList.toggle('on', c._it === it));
    }
    function draw() {
      const list = shown();
      grid.replaceChildren();
      if (!arr.length) grid.append(h('div', { class: 'a-empty' }, 'ยังไม่มีรายการ กด "+ เพิ่มรายการ" เพื่อเริ่ม'));
      else if (!list.length) grid.append(h('div', { class: 'a-empty' }, 'ไม่พบรายการตามตัวกรอง'));
      list.forEach(it => {
        const url = spec.thumb(it), th = h('div', { class: 'th' });
        if (url) { const img = h('img', { src: url, alt: '', loading: 'lazy' }); img.addEventListener('error', () => img.remove()); th.append(img); } else th.append(h('span', {}, 'ไม่มีรูป'));
        if (spec.badge) th.append(h('div', { class: 'bd' }, spec.badge(it)));
        const hasEn = spec.en ? spec.en(it) : null;
        const card = h('div', { class: 'a-card' + (it === selIt ? ' on' : ''), tabindex: '0', role: 'button', 'aria-label': 'แก้ไข ' + (spec.title(it) || ''), draggable: filtered() ? null : 'true' },
          th, h('div', { class: 'cb' }, h('b', { class: 't' }, spec.title(it) || '(ยังไม่ตั้งชื่อ)'),
            h('small', {}, spec.meta ? spec.meta(it) : ''),
            h('div', { class: 'cf' }, hasEn === null ? null : h('span', { class: 'en' + (hasEn ? ' ok' : '') }, hasEn ? 'EN' : 'ไม่มี EN'), spec.quick ? spec.quick(it) : null)));
        card._it = it;
        card.addEventListener('click', e => { if (e.target.closest('label,input,button')) return; select(it); });
        card.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); select(it); } });
        card.addEventListener('dragstart', e => { dragFrom = arr.indexOf(it); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); setTimeout(() => card.classList.add('drag'), 0); });
        card.addEventListener('dragend', () => { card.classList.remove('drag'); dragFrom = -1; });
        card.addEventListener('dragover', e => { if (dragFrom < 0) return; e.preventDefault(); card.classList.add('over'); });
        card.addEventListener('dragleave', () => card.classList.remove('over'));
        card.addEventListener('drop', e => { e.preventDefault(); const to = arr.indexOf(it); if (dragFrom < 0 || dragFrom === to) return; const [m] = arr.splice(dragFrom, 1); arr.splice(to, 0, m); dragFrom = -1; mark(); draw(); });
        grid.append(card);
      });
      stat.textContent = (spec.stats ? spec.stats(arr) : arr.length + ' รายการ') + (filtered() ? ' · แสดง ' + list.length : '');
    }
    q.addEventListener('input', draw);
    const add = () => { const n = Object.assign({ id: uid() }, spec.blank()); spec.addTop ? arr.unshift(n) : arr.push(n); q.value = ''; for (const k in fvals) fvals[k] = ''; fsel.forEach(s => { s.value = ''; }); mark(); draw(); select(n); };
    document.addEventListener('keydown', function esc(e) { if (!document.body.contains(wrap)) { document.removeEventListener('keydown', esc); return; } if (e.key === 'Escape' && selIt) select(null); });
    const tools = h('div', { class: 'a-tools' }, q, ...fsel, h('button', { type: 'button', class: 'btn sm', onclick: add }, '+ เพิ่มรายการ'));
    draw();
    return [stat, tools, wrap];
  }

  // ---------- list editor: drag to reorder, search, collapse all ----------
  function listEditor(arr, spec) {
    if (spec.thumb) return cardEditor(arr, spec);
    const list = h('div', { class: 'a-list' });
    const items = [];
    let dragFrom = -1;
    const q = h('input', { type: 'search', placeholder: 'ค้นหา…' });
    const draw = () => {
      list.replaceChildren(); items.length = 0;
      if (!arr.length) list.append(h('div', { class: 'a-empty' }, 'ยังไม่มีรายการ กด "+ เพิ่มรายการ" เพื่อเริ่ม'));
      arr.forEach((it, i) => {
        const title = h('b', {}, spec.title(it) || '(ยังไม่ตั้งชื่อ)');
        const upd = () => { title.textContent = spec.title(it) || '(ยังไม่ตั้งชื่อ)'; };
        const move = d => e => { e.preventDefault(); const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; mark(); draw(); };
        const grab = h('span', { class: 'a-grab', title: 'ลากเพื่อเรียงลำดับ' }, '⋮⋮');
        const det = h('details', { class: 'a-item' },
          h('summary', {}, grab, h('span', { class: 'no' }, String(i + 1).padStart(2, '0')), title, spec.badge ? spec.badge(it) : null,
            h('span', { class: 'tl' },
              h('button', { type: 'button', class: 'ghost sm', title: 'เลื่อนขึ้น', onclick: move(-1) }, '↑'),
              h('button', { type: 'button', class: 'ghost sm', title: 'เลื่อนลง', onclick: move(1) }, '↓'),
              h('button', { type: 'button', class: 'ghost sm', onclick: e => { e.preventDefault(); if (confirm('ลบรายการนี้?')) { arr.splice(i, 1); mark(); draw(); } } }, 'ลบ'))),
          h('div', { class: 'a-in' }, spec.form(it, upd)));
        if (it._open) det.open = true;
        det.addEventListener('toggle', () => { it._open = det.open; });
        grab.addEventListener('mousedown', () => { det.draggable = true; });
        grab.addEventListener('mouseup', () => { det.draggable = false; });
        det.addEventListener('dragstart', e => { dragFrom = i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); setTimeout(() => det.classList.add('drag'), 0); });
        det.addEventListener('dragend', () => { det.draggable = false; det.classList.remove('drag'); dragFrom = -1; });
        det.addEventListener('dragover', e => { if (dragFrom < 0) return; e.preventDefault(); det.classList.add('over'); });
        det.addEventListener('dragleave', () => det.classList.remove('over'));
        det.addEventListener('drop', e => { e.preventDefault(); if (dragFrom < 0 || dragFrom === i) return; const [m] = arr.splice(dragFrom, 1); arr.splice(i, 0, m); dragFrom = -1; mark(); draw(); });
        items.push({ det, it });
        list.append(det);
      });
      filter();
    };
    const filter = () => { const s = q.value.trim().toLowerCase(); items.forEach(({ det, it }) => { det.style.display = !s || JSON.stringify(it).toLowerCase().includes(s) ? '' : 'none'; }); };
    q.addEventListener('input', filter);
    const add = () => { const n = Object.assign({ id: uid(), _open: true }, spec.blank()); spec.addTop ? arr.unshift(n) : arr.push(n); q.value = ''; mark(); draw(); if (!spec.addTop) list.lastElementChild.scrollIntoView({ block: 'center' }); };
    const tools = h('div', { class: 'a-tools' }, q,
      h('button', { type: 'button', class: 'ghost sm', onclick: () => items.forEach(({ det }) => { det.open = false; }) }, 'พับทั้งหมด'),
      h('button', { type: 'button', class: 'ghost sm', onclick: () => items.forEach(({ det }) => { det.open = true; }) }, 'ขยายทั้งหมด'),
      h('button', { type: 'button', class: 'btn sm', onclick: add }, '+ เพิ่มรายการ'));
    draw();
    return [tools, list];
  }

  // ---------- news body editor with toolbar ----------
  function bodyEditor(n, key) {
    key = key || 'body';
    const ta = h('textarea', { class: 'big' }); ta.value = n[key] || '';
    const sync = () => { n[key] = ta.value; mark(); };
    ta.addEventListener('input', sync);
    const wrap = (a, b, ph) => { const s = ta.selectionStart, e = ta.selectionEnd, sel = ta.value.slice(s, e) || ph; ta.setRangeText(a + sel + b, s, e, 'select'); ta.focus(); sync(); };
    const prefix = p => { const s = ta.selectionStart; const ls = ta.value.lastIndexOf('\n', s - 1) + 1; ta.setRangeText(p, ls, ls, 'end'); ta.focus(); sync(); };
    const btn = (t, fn, title) => h('button', { type: 'button', title, onclick: fn }, t);
    const tb = h('div', { class: 'a-tb' },
      btn('H2', () => prefix('## '), 'หัวข้อใหญ่ (H2)'), btn('H3', () => prefix('### '), 'หัวข้อรอง (H3)'),
      btn('ตัวหนา', () => wrap('**', '**', 'ข้อความ'), 'ตัวหนา'),
      btn('ลิงก์', () => { const u = prompt('ใส่ลิงก์ (https://...)'); if (u) wrap('[', '](' + u + ')', 'ข้อความลิงก์'); }, 'แทรกลิงก์'),
      btn('รายการ', () => prefix('- '), 'รายการหัวข้อย่อย'),
      btn('รูปภาพ', async () => { const u = await pickImage(); if (u) wrap('\n\n![คำอธิบายรูป](' + u + ')\n\n', '', ''); }, 'อัปโหลดและแทรกรูป'));
    return h('div', { class: 'a-f' }, h('span', {}, 'เนื้อหา'), tb, ta,
      h('span', { class: 'h' }, 'เว้นบรรทัดว่าง = ย่อหน้าใหม่ · ## = H2 · ### = H3 · **ตัวหนา** · [ข้อความ](ลิงก์) · - รายการ · ![alt](รูป)'));
  }

  // ---------- link cards ----------
  function linkCard(obj, key, name, mark2, hint, showObj) {
    const chip = h('span', { class: 'a-chip' });
    const open = h('a', { target: '_blank', rel: 'noopener noreferrer', href: '#' }, 'ทดสอบเปิดลิงก์ ↗');
    const inp = h('input', { type: 'url', placeholder: 'https://...' }); inp.value = obj[key] || '';
    const upd = () => { const on = !!inp.value.trim(); chip.textContent = on ? 'ใส่ลิงก์แล้ว' : 'ยังว่าง · ' + hint; chip.className = 'a-chip' + (on ? ' on' : ''); open.style.display = on ? '' : 'none'; open.href = safeLink(inp.value); };
    inp.addEventListener('input', () => { obj[key] = inp.value; upd(); mark(); });
    upd();
    return h('div', { class: 'a-lc' }, h('div', { class: 'ic' }, mark2), h('div', {}, h('div', { class: 'row' }, h('b', {}, name), chip), inp, h('div', { style: 'margin-top:8px' }, open), showObj ? check(showObj, key, 'แสดงปุ่มนี้บนหน้าแรก (ปิด = ซ่อนปุ่มทั้งปุ่ม)') : null));
  }

  // ---------- PageSpeed Insights ----------
  // Runs Google's test on the live site from the server, shows the scores, Core Web Vitals,
  // real-user data and top fixes, and charts the performance score over time.
  let psiTimer = null;
  const sv = (tag, attrs, ...kids) => {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
    return e;
  };
  // Google's own bands: score 90+ good, 50–89 needs work, below 50 poor; metric limits per Core Web Vitals
  const band = v => (v == null ? 'na' : v >= 90 ? 'good' : v >= 50 ? 'mid' : 'bad');
  const BAND_TXT = { good: 'ดี', mid: 'ควรปรับปรุง', bad: 'ต้องแก้', na: 'ไม่มีข้อมูล' };
  const LIM = { fcp: [1800, 3000], lcp: [2500, 4000], tbt: [200, 600], cls: [0.1, 0.25], si: [3400, 5800], inp: [200, 500] };
  const mBand = (k, v) => (v == null ? 'na' : v <= LIM[k][0] ? 'good' : v <= LIM[k][1] ? 'mid' : 'bad');
  const FIELD_BAND = { FAST: 'good', AVERAGE: 'mid', SLOW: 'bad' };
  const fmtV = (k, v) => (v == null ? '—' : k === 'cls' ? v.toFixed(3) : v >= 1000 ? (v / 1000).toFixed(1) + ' s' : Math.round(v) + ' ms');
  const when2 = iso => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  const DEV = { mobile: 'มือถือ', desktop: 'คอม' };
  const MLABEL = {
    fcp: ['FCP', 'เวลาที่เห็นเนื้อหาแรก'], lcp: ['LCP', 'เวลาที่เห็นเนื้อหาหลัก'], tbt: ['TBT', 'เวลาที่หน้าค้าง'],
    cls: ['CLS', 'หน้ากระตุกขณะโหลด'], si: ['Speed Index', 'ความเร็วการแสดงผลรวม'], inp: ['INP', 'ความไวเมื่อกด/แตะ']
  };
  const status = b => h('span', { class: 'ps-b ' + b }, h('i'), BAND_TXT[b]); // colour + dot + word, never colour alone

  function gauge(v, label) {
    const b = band(v), r = 34, C = 2 * Math.PI * r;
    const svg = sv('svg', { viewBox: '0 0 80 80', class: 'ps-ring ' + b, role: 'img', 'aria-label': label + ' ' + (v == null ? '-' : v) },
      sv('circle', { cx: 40, cy: 40, r, class: 'tr' }),
      v == null ? null : sv('circle', { cx: 40, cy: 40, r, class: 'ar', 'stroke-dasharray': C, 'stroke-dashoffset': C * (1 - v / 100), transform: 'rotate(-90 40 40)' }),
      sv('text', { x: 40, y: 47, 'text-anchor': 'middle' }, v == null ? '–' : String(v)));
    return h('div', { class: 'ps-g' }, svg, h('b', {}, label), status(b));
  }
  const tile = (k, v, b) => h('div', { class: 'ps-m' }, h('div', { class: 'lb' }, h('b', {}, MLABEL[k][0]), h('small', {}, MLABEL[k][1])), h('div', { class: 'v' }, fmtV(k, v)), status(b));

  function result(r) {
    if (!r) return h('div', { class: 'a-empty' }, 'ยังไม่เคยตรวจอุปกรณ์นี้ กดปุ่มด้านบนเพื่อเริ่ม');
    const fullUrl = 'https://pagespeed.web.dev/analysis?url=' + encodeURIComponent(r.url) + '&form_factor=' + r.strategy;
    const f = r.field;
    return h('div', { class: 'ps-res' },
      h('div', { class: 'ps-meta' }, h('span', {}, 'ตรวจ ', h('b', {}, r.url), ' · ', when2(r.at), r.source === 'auto' ? ' · ตรวจอัตโนมัติ' : ''),
        h('a', { class: 'ghost sm', href: fullUrl, target: '_blank', rel: 'noopener noreferrer' }, 'เปิดรายงานเต็มบน Google ↗')),
      r.drop ? h('div', { class: 'a-note' }, '⚠ คะแนนประสิทธิภาพลดลง ' + r.drop + ' คะแนนจากการตรวจครั้งก่อนของหน้านี้') : null,
      h('div', { class: 'ps-gs' }, gauge(r.scores.perf, 'ประสิทธิภาพ'), gauge(r.scores.a11y, 'การช่วยเหลือพิเศษ'), gauge(r.scores.bp, 'แนวทางปฏิบัติ'), gauge(r.scores.seo, 'SEO')),
      h('div', { class: 'ps-two' },
        h('div', {},
          h('h4', {}, 'ผลทดสอบ (ห้องทดลองของ Google)'),
          h('div', { class: 'ps-ms' }, ...['fcp', 'lcp', 'tbt', 'cls', 'si'].map(k => tile(k, r.metrics[k] && r.metrics[k].v, mBand(k, r.metrics[k] && r.metrics[k].v))))),
        r.screenshot ? h('figure', { class: 'ps-shot' }, h('img', { src: r.screenshot, alt: 'ภาพหน้าจอตอนโหลดเสร็จ' }), h('figcaption', {}, 'หน้าจอที่ Google เห็น')) : null),
      h('h4', {}, 'ข้อมูลผู้ใช้จริง (Chrome, ย้อนหลัง 28 วัน)'),
      f ? h('div', { class: 'ps-ms' }, ...['lcp', 'inp', 'cls', 'fcp'].filter(k => f[k]).map(k => tile(k, f[k].v, FIELD_BAND[f[k].c] || mBand(k, f[k].v))))
        : h('div', { class: 'a-note' }, 'ยังไม่มีข้อมูลจากผู้ใช้จริง Google จะแสดงเมื่อมีผู้เข้าชมผ่าน Chrome มากพอ (ปกติสำหรับเว็บใหม่) ระหว่างนี้ใช้ผลทดสอบด้านบนแทน'),
      f && f.origin ? h('small', { class: 'h' }, 'หน้านี้ยังมีข้อมูลไม่พอ จึงแสดงค่าเฉลี่ยของทั้งเว็บแทน') : null,
      h('h4', {}, 'สิ่งที่ควรแก้ (เรียงตามผลกระทบ)'),
      r.opps && r.opps.length ? h('ol', { class: 'ps-opps' }, ...r.opps.map(o => h('li', {}, h('span', {}, o.title, o.display ? h('small', {}, o.display) : null),
        o.ms >= 50 ? h('em', {}, 'ประหยัด ~' + (o.ms >= 1000 ? (o.ms / 1000).toFixed(1) + ' วิ' : o.ms + ' ms')) : null)))
        : h('div', { class: 'a-note ok' }, 'ไม่มีรายการที่ต้องแก้ เยี่ยมมาก'));
  }

  // performance score over time: one line per device, crosshair tooltip on hover, table below
  function chart(hist) {
    const W = 720, H = 230, L = 40, R = 86, T = 16, B = 30;
    const wrap = h('div', { class: 'ps-chart' });
    const pts = hist.filter(x => x.scores.perf != null).map(x => ({ x, t: Date.parse(x.at), v: x.scores.perf }));
    if (pts.length < 2) { wrap.append(h('div', { class: 'a-empty' }, 'ตรวจอย่างน้อย 2 ครั้งเพื่อดูกราฟแนวโน้ม')); return wrap; }
    const t0 = Math.min(...pts.map(p => p.t)), t1 = Math.max(...pts.map(p => p.t)), span = Math.max(1, t1 - t0);
    const X = t => L + (W - L - R) * (t - t0) / span, Y = v => T + (H - T - B) * (1 - v / 100);
    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ps-svg', role: 'img', 'aria-label': 'กราฟคะแนนประสิทธิภาพตามเวลา' });
    for (const g of [0, 50, 90, 100]) svg.append(sv('line', { x1: L, x2: W - R, y1: Y(g), y2: Y(g), class: g === 50 || g === 90 ? 'th' : 'gr' }), sv('text', { x: L - 8, y: Y(g) + 4, 'text-anchor': 'end', class: 'ax' }, String(g)));
    const fmtD = t => new Date(t).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
    svg.append(sv('text', { x: L, y: H - 8, class: 'ax' }, fmtD(t0)), sv('text', { x: W - R, y: H - 8, 'text-anchor': 'end', class: 'ax' }, fmtD(t1)));
    const legend = h('div', { class: 'ps-leg' });
    for (const dev of ['mobile', 'desktop']) {
      const s = pts.filter(p => p.x.strategy === dev);
      legend.append(h('span', { class: 'k ' + dev }, h('i'), DEV[dev]));
      if (!s.length) continue;
      if (s.length > 1) svg.append(sv('path', { class: 'ln ' + dev, d: s.map((p, i) => (i ? 'L' : 'M') + X(p.t).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join(' ') }));
      for (const p of s) svg.append(p.el = sv('circle', { class: 'dt ' + dev, cx: X(p.t), cy: Y(p.v), r: 4 }));
      const last = s[s.length - 1];
      svg.append(sv('text', { x: X(last.t) + 10, y: Y(last.v) + 4, class: 'dl' }, DEV[dev] + ' ' + last.v)); // direct label at the latest point
    }
    // hover: snap to the nearest test, draw a crosshair and show its numbers
    const cross = sv('line', { class: 'cx', y1: T, y2: H - B, x1: -10, x2: -10 });
    const hit = sv('rect', { x: L, y: 0, width: W - L - R, height: H, fill: 'transparent' });
    svg.append(cross, hit);
    const tip = h('div', { class: 'ps-tip', hidden: true });
    let on = null;
    hit.addEventListener('pointermove', e => {
      const box = svg.getBoundingClientRect(), mx = (e.clientX - box.left) * W / box.width;
      const p = pts.reduce((a, q) => (Math.abs(X(q.t) - mx) < Math.abs(X(a.t) - mx) ? q : a));
      if (on) on.el.classList.remove('on');
      on = p; p.el.classList.add('on');
      cross.setAttribute('x1', X(p.t)); cross.setAttribute('x2', X(p.t));
      const s = p.x.scores;
      tip.replaceChildren(h('b', {}, when2(p.x.at)), h('div', {}, h('span', { class: 'k ' + p.x.strategy }, h('i'), DEV[p.x.strategy]), ' · ', p.x.path),
        h('div', {}, 'ประสิทธิภาพ ', h('strong', {}, String(s.perf))), h('div', { class: 'mu' }, `ช่วยเหลือพิเศษ ${s.a11y ?? '–'} · แนวทาง ${s.bp ?? '–'} · SEO ${s.seo ?? '–'}`));
      tip.hidden = false;
      const left = X(p.t) / W * box.width;
      tip.style.left = Math.min(box.width - 190, Math.max(0, left + 12)) + 'px';
      tip.style.top = Math.max(0, Y(p.v) / H * box.height - 30) + 'px';
    });
    hit.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('x1', -10); cross.setAttribute('x2', -10); if (on) on.el.classList.remove('on'); });
    wrap.append(legend, h('div', { class: 'ps-plot' }, svg, tip));
    return wrap;
  }
  const histTable = hist => h('div', { class: 'ps-tbl' }, h('table', {},
    h('thead', {}, h('tr', {}, ...['เวลา', 'อุปกรณ์', 'หน้า', 'ประสิทธิภาพ', 'ช่วยเหลือ', 'แนวทาง', 'SEO', 'LCP', 'CLS', 'แบบ'].map(t => h('th', {}, t)))),
    h('tbody', {}, ...hist.slice().reverse().slice(0, 25).map(x => h('tr', {},
      h('td', {}, when2(x.at)), h('td', {}, DEV[x.strategy]), h('td', {}, x.path),
      ...['perf', 'a11y', 'bp', 'seo'].map(k => h('td', { class: 'n ' + band(x.scores[k]) }, x.scores[k] == null ? '–' : String(x.scores[k]))),
      h('td', {}, fmtV('lcp', x.metrics.lcp && x.metrics.lcp.v)), h('td', {}, fmtV('cls', x.metrics.cls && x.metrics.cls.v)),
      h('td', {}, x.source === 'auto' ? 'อัตโนมัติ' : 'กดเอง'))))));

  function pagespeedView() {
    const host = h('div', {}, h('div', { class: 'a-empty' }, 'กำลังโหลด…'));
    let S = null, dev = 'mobile', page = '/';
    const draw = () => {
      if (cur !== 'pagespeed') return;
      const run = S.running;
      const pageSel = h('select', { onchange: e => { page = e.target.value; draw(); } }, ...S.pages.map(([p, l]) => { const o = h('option', { value: p }, l + ' (' + p + ')'); if (p === page) o.selected = true; return o; }));
      const go = d => async () => {
        try { await api('pagespeed/run', 'POST', { strategy: d, path: page }); dev = d; await load(); } catch (e) { alert(e.message); }
      };
      const btns = ['mobile', 'desktop'].map(d => h('button', { type: 'button', class: d === 'mobile' ? 'btn sm' : 'ghost sm', disabled: !!run || !S.siteUrl, onclick: go(d) }, (d === 'mobile' ? '📱 ' : '💻 ') + 'ตรวจ' + DEV[d]));
      const top = box('ตรวจความเร็วเว็บ (Google PageSpeed Insights)',
        !S.siteUrl ? h('div', { class: 'a-note' }, 'ตั้ง "โดเมนหลัก" ในตั้งค่า → เว็บไซต์ & SEO ก่อน Google ตรวจได้เฉพาะเว็บที่ออนไลน์จริง') : null,
        h('div', { class: 'ps-run' }, h('label', { class: 'a-f' }, h('span', {}, 'หน้าที่จะตรวจ'), pageSel), h('div', { class: 'bt' }, ...btns)),
        run ? h('div', { class: 'ps-wait' }, h('i', { class: 'sp' }), `กำลังตรวจ${DEV[run.strategy]} หน้า ${run.path} … ${run.elapsed} วินาที (ปกติ 15–40 วินาที)`) : null,
        S.error ? h('div', { class: 'a-err', style: 'text-align:left' }, S.error.msg) : null,
        !S.hasKey ? h('small', { class: 'h' }, 'ต้องใส่ Google API key ก่อน (ฟรี): การตรวจแบบไม่มี key ใช้โควตารวมของทุกคนทั่วโลกซึ่งมักเต็ม ใส่ key ได้ที่ "การตั้งค่า" ด้านล่าง') : null);
      const tabs = {};
      const seg = h('div', { class: 'a-seg' }, ...['mobile', 'desktop'].map(d => (tabs[d] = h('button', { type: 'button', class: d === dev ? 'on' : '', onclick: () => { dev = d; draw(); } }, DEV[d]))));
      const latest = S.latest[dev];
      const hist = S.history.filter(x => x.path === page);
      const autoChk = h('input', { type: 'checkbox' }); autoChk.checked = !!S.auto.on;
      const hourSel = h('select', {}, ...Array.from({ length: 24 }, (_, i) => { const o = h('option', { value: i }, String(i).padStart(2, '0') + ':00 น.'); if (i === S.auto.hour) o.selected = true; return o; }));
      const keyInp = h('input', { type: 'password', autocomplete: 'off', placeholder: S.hasKey ? 'ใส่ key ใหม่เพื่อเปลี่ยน (ตอนนี้: ' + S.keyHint + ')' : 'วาง API key ที่นี่' });
      const saveSet = async body => { try { const r = await api('pagespeed/settings', 'POST', body); Object.assign(S, r); toast('บันทึกแล้ว ✓'); draw(); } catch (e) { alert(e.message); } };
      host.replaceChildren(top,
        box('ผลล่าสุด', seg, latest && latest.path !== page ? h('small', { class: 'h' }, 'ผลล่าสุดของ' + DEV[dev] + 'เป็นของหน้า ' + latest.path) : null, result(latest)),
        box('แนวโน้มคะแนนประสิทธิภาพ: ' + (S.pages.find(p => p[0] === page) || [page, page])[1], chart(hist), hist.length ? histTable(hist) : null),
        box('การตั้งค่า',
          h('div', { class: 'a-f' }, h('span', {}, 'Google API key ' + (S.hasKey ? '(ตั้งค่าแล้ว ' + S.keyHint + ')' : '(ยังไม่ได้ตั้ง)')),
            h('div', { class: 'ps-key' }, keyInp, h('button', { type: 'button', class: 'btn sm', onclick: () => saveSet({ key: keyInp.value }) }, 'บันทึก key'),
              S.hasKey ? h('button', { type: 'button', class: 'ghost sm', onclick: () => { if (confirm('ลบ API key?')) saveSet({ key: '' }); } }, 'ลบ key') : null),
            h('span', { class: 'h' }, 'วิธีขอ key (ฟรี): console.cloud.google.com > APIs & Services > Library > ค้นหา "PageSpeed Insights API" > Enable > Credentials > Create credentials > API key (แนะนำจำกัดให้ใช้ได้เฉพาะ PageSpeed Insights API) · key เก็บบนเซิร์ฟเวอร์เท่านั้น ไม่แสดงในหน้าเว็บ')),
          h('div', { class: 'a-f' }, h('span', {}, 'ตรวจอัตโนมัติทุกวัน (หน้าแรก มือถือ + คอม)'),
            h('div', { class: 'ps-key' }, h('label', { class: 'a-chk' }, autoChk, 'เปิด'), h('span', {}, 'หลังเวลา'), hourSel,
              h('button', { type: 'button', class: 'btn sm', onclick: () => saveSet({ auto: { on: autoChk.checked, hour: hourSel.value } }) }, 'บันทึก')),
            h('span', { class: 'h' }, 'ผลเก็บในกราฟและตารางด้านบน ถ้าคะแนนลดลง 10 คะแนนขึ้นไปจะมีป้ายเตือน' + (S.lastAuto ? ' · ตรวจอัตโนมัติล่าสุด ' + S.lastAuto : '')))));
      clearTimeout(psiTimer);
      if (run) psiTimer = setTimeout(load, 3000);
    };
    const load = async () => {
      try {
        const prevRun = S && S.running;
        S = await api('pagespeed');
        if (prevRun && !S.running) toast(S.error ? 'ตรวจไม่สำเร็จ' : 'ตรวจเสร็จแล้ว ✓');
        draw();
      } catch (e) { host.replaceChildren(h('div', { class: 'a-empty' }, 'โหลดไม่สำเร็จ: ' + e.message)); }
    };
    load();
    return host;
  }

  // ---------- visitor statistics ----------
  const TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const fmtDay = (d, short) => { const [y, m, dd] = d.split('-').map(Number); return dd + ' ' + TH_M[m - 1] + (short ? '' : ' ' + (y + 543)); };
  const fmtTime = t => new Date(t).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const nf = n => Number(n || 0).toLocaleString('en-US');
  const bkkToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
  const DEV_NAME = { android: 'Android', ios: 'iOS (iPhone/iPad)', desktop: 'คอมพิวเตอร์', other: 'อื่นๆ' };
  const DEV_SHORT = { android: 'Android', ios: 'iOS', desktop: 'คอม', other: 'อื่นๆ' };
  const svgEl = (tag, attrs, ...kids) => {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    for (const kid of kids) if (kid != null) e.append(kid.nodeType ? kid : document.createTextNode(kid));
    return e;
  };
  const niceMax = v => { if (v <= 4) return 4; const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };

  // multi-series line/area chart with a hover tooltip
  function lineChart(labels, series, o) {
    o = o || {};
    const W = 900, H = 290, L = 52, R = 14, T = 14, B = 30, iw = W - L - R, ih = H - T - B;
    const max = niceMax(Math.max(1, ...series.flatMap(s => s.values)));
    const n = labels.length, X = i => L + (n === 1 ? iw / 2 : (iw * i) / (n - 1)), Y = v => T + ih - (ih * v) / max;
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });
    for (let k = 0; k <= 4; k++) {
      const v = (max * k) / 4, y = Y(v);
      svg.append(svgEl('line', { class: 'grid', x1: L, x2: W - R, y1: y, y2: y }), svgEl('text', { x: L - 8, y: y + 4, 'text-anchor': 'end' }, nf(Math.round(v * 10) / 10)));
    }
    const step = Math.max(1, Math.ceil(n / 8));
    labels.forEach((lb, i) => { if ((i % step === 0 && (n - 1 - i >= Math.ceil(step * 0.6) || i === n - 1)) || i === n - 1) svg.append(svgEl('text', { x: X(i), y: H - 8, 'text-anchor': i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle' }, lb)); });
    series.forEach((s, si) => {
      const pts = s.values.map((v, i) => X(i) + ',' + Y(v)).join(' ');
      if (s.area && n > 1) svg.append(svgEl('polygon', { points: `${X(0)},${T + ih} ${pts} ${X(n - 1)},${T + ih}`, fill: s.color, 'fill-opacity': '.14' }));
      const part = o.partialLast && n > 2 && !s.dash;
      const solid = part ? s.values.slice(0, n - 1).map((v, i) => X(i) + ',' + Y(v)).join(' ') : pts;
      svg.append(svgEl('polyline', { points: solid, fill: 'none', stroke: s.color, 'stroke-width': s.dash ? 1.6 : 2.4, 'stroke-linejoin': 'round', 'stroke-dasharray': s.dash ? '5 4' : '' }));
      if (part) svg.append(svgEl('polyline', { points: X(n - 2) + ',' + Y(s.values[n - 2]) + ' ' + X(n - 1) + ',' + Y(s.values[n - 1]), fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-dasharray': '4 4', opacity: '.7' }));
      if (n <= 45) s.values.forEach((v, i) => svg.append(svgEl('circle', { cx: X(i), cy: Y(v), r: s.dash ? 0 : 3, fill: s.color })));
    });
    const hl = svgEl('line', { x1: 0, x2: 0, y1: T, y2: T + ih, stroke: 'rgba(255,255,255,.35)', 'stroke-width': 1, style: 'display:none' });
    const cap = svgEl('rect', { x: L, y: T, width: iw, height: ih, fill: 'transparent' });
    svg.append(hl, cap);
    const tip = h('div', { class: 'an-tip', style: 'display:none' });
    const box2 = h('div', { class: 'an-chart' }, svg, tip);
    const move = e => {
      const r = svg.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(n - 1, Math.round(n === 1 ? 0 : ((x - L) / iw) * (n - 1))));
      hl.setAttribute('x1', X(i)); hl.setAttribute('x2', X(i)); hl.style.display = '';
      tip.replaceChildren(h('b', {}, (o.tipLabels || labels)[i]), ...series.flatMap(s => [h('br'), h('i', { style: 'background:' + s.color }), s.name + ': ', h('b', {}, nf(s.values[i]))]));
      tip.style.display = ''; tip.style.left = Math.max(70, Math.min(r.width - 70, (X(i) / W) * r.width)) + 'px'; tip.style.top = (Math.min(...series.map(s => Y(s.values[i]))) / H) * r.height + 'px';
    };
    cap.addEventListener('mousemove', move); cap.addEventListener('touchstart', e => move(e.touches[0]), { passive: true }); cap.addEventListener('touchmove', e => move(e.touches[0]), { passive: true });
    cap.addEventListener('mouseleave', () => { hl.style.display = 'none'; tip.style.display = 'none'; });
    return box2;
  }

  function barRows(items, total, o) {
    o = o || {};
    if (!items.length) return h('div', { class: 'a-empty' }, 'ยังไม่มีข้อมูล');
    const max = Math.max(1, ...items.map(i => i.value));
    return h('div', { class: 'an-list' }, ...items.map(it => h('div', { class: 'an-row' + (o.alt ? ' alt' : '') },
      h('div', { class: 't' }, h('span', { title: it.label }, it.label), h('span', {}, h('b', {}, nf(it.value)), h('em', {}, it.sub || (total ? Math.round((it.value / total) * 1000) / 10 + '%' : '')))),
      h('div', { class: 'tr' }, h('i', { style: 'width:' + Math.max(1.5, (it.value / max) * 100) + '%' })))));
  }

  function analyticsView() {
    const host = h('div', {}, h('div', { class: 'a-empty' }, 'กำลังโหลด…'));
    const today0 = bkkToday();
    let preset = 'today', from = today0, to = today0, mode = 'daily', R = null, ipQ = '', ipOnly = '', showBots = false, ipShow = 20;
    let rows = [], rowsTotal = 0, rowsLoading = false;
    const range = p => {
      const t = bkkToday();
      if (p === 'today') return [t, t];
      if (p === 'yesterday') { const y = addDays(t, -1); return [y, y]; }
      const n = Number(p); return [addDays(t, -(n - 1)), t];
    };
    const growth = (a, b) => {
      if (!b && !a) return h('span', { class: 'an-chip' }, '–');
      if (!b) return h('span', { class: 'an-chip up' }, '▲ ใหม่');
      const p = Math.round(((a - b) / b) * 1000) / 10;
      return h('span', { class: 'an-chip ' + (p > 0 ? 'up' : p < 0 ? 'down' : '') }, (p > 0 ? '▲ ' : p < 0 ? '▼ ' : '') + Math.abs(p) + '%');
    };
    const load = async () => {
      try { R = await api('analytics?from=' + from + '&to=' + to); rows = []; rowsTotal = 0; await loadRows(true); draw(); }
      catch (e) { host.replaceChildren(h('div', { class: 'a-empty' }, 'โหลดไม่สำเร็จ: ' + e.message)); }
    };
    const loadRows = async reset => {
      if (rowsLoading) return; rowsLoading = true;
      try {
        const off = reset ? 0 : rows.length;
        const d = await api('analytics/visits?from=' + from + '&to=' + to + '&limit=25&offset=' + off + (ipOnly ? '&ip=' + encodeURIComponent(ipOnly) : '') + (showBots ? '&bots=1' : ''));
        rows = reset ? d.rows : rows.concat(d.rows); rowsTotal = d.total;
      } finally { rowsLoading = false; }
    };
    const pick = async (p, f, t) => { preset = p; from = f; to = t; ipOnly = ''; ipShow = 20; await load(); };
    const draw = () => {
      if (cur !== 'stats' || !R) return;
      const T = R.totals, P = R.prev, single = R.days === 1;
      const label = single ? fmtDay(R.from) : fmtDay(R.from) + ' – ' + fmtDay(R.to) + ' (' + R.days + ' วัน)';
      const prevLabel = P.from === P.to ? fmtDay(P.from) : fmtDay(P.from, true) + ' – ' + fmtDay(P.to, true);
      // ---- range picker
      const presets = [['today', 'วันนี้'], ['yesterday', 'เมื่อวาน'], ['7', '7 วัน'], ['15', '15 วัน'], ['30', '30 วัน']];
      const seg = h('div', { class: 'a-seg' }, ...presets.map(([k, l]) => h('button', { type: 'button', class: preset === k ? 'on' : '', onclick: () => { const [f, t] = range(k); pick(k, f, t); } }, l)));
      const fi = h('input', { type: 'date', value: from, max: R.today }), ti = h('input', { type: 'date', value: to, max: R.today });
      const go = h('button', { type: 'button', class: 'btn sm', onclick: () => { if (!fi.value || !ti.value) return; let f = fi.value, t = ti.value; if (f > t) [f, t] = [t, f]; if (Date.parse(t) - Date.parse(f) > 365 * 86400e3) return alert('เลือกช่วงได้ไม่เกิน 366 วัน'); pick('custom', f, t); } }, 'ดูข้อมูล');
      const picker = box(null, h('div', { class: 'an-bar' }, seg, h('span', { class: 'an-rng' }, 'หรือเลือกเอง'), fi, h('span', { class: 'an-rng' }, 'ถึง'), ti, go,
        h('button', { type: 'button', class: 'ghost sm', onclick: load }, '↻ รีเฟรช')),
        h('div', { class: 'an-rng' }, 'กำลังดู: ', h('b', { style: 'color:#fff;font-weight:500' }, label), ' · เวลาประเทศไทย (UTC+7) · เทียบกับ ' + prevLabel));
      // ---- KPIs
      const kpi = (title, val, sub, cls) => h('div', { class: 'an-kpi ' + (cls || '') }, h('small', {}, title), h('b', {}, nf(val)), sub);
      const kpis = h('div', { class: 'an-kpis' },
        kpi('เข้าชมจริง (Page views)', T.views, h('div', { class: 'sub' }, growth(T.views, P.views), ' หน้าที่คนจริงเปิดดู'), 'red'),
        kpi('ผู้เข้าชมไม่ซ้ำ (Unique)', T.visitors, h('div', { class: 'sub' }, growth(T.visitors, P.visitors), ' นับ 1 คนต่ออุปกรณ์/เบราว์เซอร์'), 'red'),
        kpi('Traffic ทั้งหมด', T.traffic, h('div', { class: 'sub' }, growth(T.traffic, P.traffic), ' รวมบอท/ระบบ ' + nf(T.bots))),
        kpi('IP ไม่ซ้ำ', T.ips, h('div', { class: 'sub' }, growth(T.ips, P.ips), ' เฉพาะผู้เข้าชมจริง')));
      const kpis2 = h('div', { class: 'an-kpis' },
        kpi('ผู้เข้าชมใหม่', T.newVisitors, h('div', { class: 'sub' }, 'ครั้งแรกที่เปิดเว็บ')),
        kpi('ผู้เข้าชมกลับมา', T.returningVisitors, h('div', { class: 'sub' }, 'เคยเข้ามาก่อนแล้ว')),
        kpi('เฉลี่ยต่อคน', T.visitors ? Math.round((T.views / T.visitors) * 10) / 10 : 0, h('div', { class: 'sub' }, 'หน้า / ผู้เข้าชม 1 คน')),
        kpi('บอท / ระบบ', T.bots, h('div', { class: 'sub' }, 'ไม่นับเป็นผู้เข้าชมจริง')));
      // ---- growth chart
      let chart;
      if (single) {
        const labs = R.hourly.map(x => String(x.hour).padStart(2, '0') + ':00');
        chart = lineChart(labs, [{ name: 'เข้าชมจริง', color: '#ff2a2a', area: true, values: R.hourly.map(x => x.views) }, { name: 'ผู้เข้าชมไม่ซ้ำ', color: '#ffffff', values: R.hourly.map(x => x.visitors) }], { tipLabels: labs.map(l => fmtDay(R.from, true) + ' ' + l) });
      } else {
        const cum = mode === 'cum', S = R.series;
        const labs = S.map(x => fmtDay(x.day, true));
        chart = lineChart(labs, cum
          ? [{ name: 'เข้าชมจริง (สะสม)', color: '#ff2a2a', area: true, values: S.map(x => x.cumViews) }, { name: 'ผู้เข้าชมไม่ซ้ำ (สะสม)', color: '#ffffff', values: S.map(x => x.cumVisitors) }]
          : [{ name: 'เข้าชมจริง', color: '#ff2a2a', area: true, values: S.map(x => x.views) }, { name: 'ผู้เข้าชมไม่ซ้ำ', color: '#ffffff', values: S.map(x => x.visitors) }, { name: 'Traffic รวมบอท', color: '#7d8590', dash: true, values: S.map(x => x.traffic) }],
          { partialLast: R.to === R.today, tipLabels: S.map(x => fmtDay(x.day) + (x.day === R.today ? ' (วันนี้ ยังไม่จบวัน)' : '')) });
      }
      const modeSeg = single ? null : h('div', { class: 'a-seg' }, ...[['daily', 'รายวัน'], ['cum', 'สะสม (การเติบโต)']].map(([k, l]) => h('button', { type: 'button', class: mode === k ? 'on' : '', onclick: () => { mode = k; draw(); } }, l)));
      const legend = h('div', { class: 'an-leg' }, h('span', { style: '--c:#ff2a2a' }, 'เข้าชมจริง'), h('span', { style: '--c:#fff' }, 'ผู้เข้าชมไม่ซ้ำ'), !single && mode === 'daily' ? h('span', { style: '--c:#7d8590' }, 'Traffic รวมบอท') : null);
      const growthBox = box(single ? 'ผู้เข้าชมรายชั่วโมง' : 'กราฟการเติบโต', h('div', { class: 'an-bar', style: 'justify-content:space-between' }, legend, modeSeg), chart);
      // ---- devices, os, browser
      const devTotal = R.devices.reduce((n, d) => n + d.visitors, 0);
      const devBox = box('อุปกรณ์ที่ใช้เข้าชม (นับตามผู้เข้าชมไม่ซ้ำ)',
        barRows(R.devices.map(d => ({ label: DEV_NAME[d.key], value: d.visitors, sub: Math.round(devTotal ? (d.visitors / devTotal) * 1000 : 0) / 10 + '% · ' + nf(d.views) + ' views' })), devTotal),
        h('small', { class: 'h' }, 'iPad ที่เปิดโหมด "ดูเว็บแบบคอม" อาจถูกนับเป็นคอมพิวเตอร์ (เบราว์เซอร์ไม่บอกว่าเป็น iPad)'));
      const osTotal = R.os.reduce((n, x) => n + x[1], 0), brTotal = R.browsers.reduce((n, x) => n + x[1], 0);
      const two = h('div', { class: 'an-2' }, box('ระบบปฏิบัติการ', barRows(R.os.map(([k, v]) => ({ label: k, value: v })), osTotal, { alt: true })), box('เบราว์เซอร์ / แอปที่เปิด', barRows(R.browsers.map(([k, v]) => ({ label: k, value: v })), brTotal, { alt: true })));
      const srcTotal = R.sources.reduce((n, x) => n + x[1], 0);
      const two2 = h('div', { class: 'an-2' }, box('มาจากไหน (แหล่งที่มา)', barRows(R.sources.map(([k, v]) => ({ label: k, value: v })), srcTotal)), box('หน้ายอดนิยม', barRows(R.pages.map(([k, v]) => ({ label: k, value: v })), T.views, { alt: true })));
      const hoursMax = Math.max(...R.hours), peak = R.hours.indexOf(hoursMax);
      const hourBox = box('ช่วงเวลาที่คนเข้ามากที่สุด' + (hoursMax ? ' (พีค ' + String(peak).padStart(2, '0') + ':00 น.)' : ''), lineChart(R.hours.map((_, i) => String(i).padStart(2, '0')), [{ name: 'เข้าชมจริง', color: '#ff2a2a', area: true, values: R.hours }], { tipLabels: R.hours.map((_, i) => 'เวลา ' + String(i).padStart(2, '0') + ':00 น.') }));
      // ---- IP table
      const q = h('input', { type: 'search', placeholder: 'ค้นหา IP…', value: ipQ });
      const tb = h('tbody');
      const moreIp = h('div', { style: 'text-align:center' });
      const fillIps = () => {
        const list = R.ips.filter(x => !ipQ || x.ip.includes(ipQ));
        moreIp.replaceChildren(...(list.length > ipShow ? [h('button', { type: 'button', class: 'ghost sm', onclick: () => { ipShow += 20; fillIps(); } }, 'แสดงเพิ่ม (' + ipShow + ' / ' + list.length + ')')] : []));
        tb.replaceChildren(...list.slice(0, ipShow).map(x => h('tr', {},
          h('td', { class: 'ip' }, x.ip), h('td', {}, h('span', { class: 'an-dev ' + x.device }, DEV_SHORT[x.device] || x.device)),
          h('td', { class: 'n' }, nf(x.views)), h('td', { class: 'n' }, nf(x.visitors)), h('td', {}, fmtTime(x.first)), h('td', {}, fmtTime(x.last)), h('td', { class: 'p', title: x.last_page }, x.last_page),
          h('td', {}, h('button', { type: 'button', class: 'ghost sm', onclick: async () => { ipOnly = x.ip; await loadRows(true); draw(); document.getElementById('an-visits').scrollIntoView({ behavior: 'smooth' }); } }, 'ดูประวัติ')))));
        if (!tb.children.length) tb.append(h('tr', {}, h('td', { colspan: 8, style: 'text-align:center;color:var(--mu);padding:24px' }, 'ไม่พบข้อมูล')));
      };
      q.addEventListener('input', () => { ipQ = q.value.trim(); fillIps(); });
      fillIps();
      const bad = R.ips.length && R.ips.filter(x => ['127.0.0.1', '::1', 'unknown'].includes(x.ip)).reduce((n, x) => n + x.views, 0) > T.views * 0.5;
      const ipBox = box('ผู้เข้าชมแยกตาม IP (สูงสุด 200 อันดับแรก)',
        bad ? note('IP ส่วนใหญ่เป็น 127.0.0.1 / unknown แปลว่าระบบยังอ่าน IP จริงของผู้เข้าชมไม่ได้เพราะอยู่หลัง proxy ของโฮสต์ (เช่น Plesk) ให้เพิ่มตัวแปร TRUST_PROXY = 1 ใน Custom environment variables แล้ว Restart App') : null,
        h('div', { class: 'an-filter' }, q, h('small', { class: 'h' }, 'ผู้เข้าชม = จำนวนอุปกรณ์/เบราว์เซอร์ที่ต่างกันจาก IP นั้น (หลายคนอาจใช้ Wi-Fi เดียวกัน)')),
        h('div', { class: 'an-wrap' }, h('table', { class: 'an-tbl' }, h('thead', {}, h('tr', {}, ...['IP', 'อุปกรณ์', 'เข้าชม', 'ผู้เข้าชม', 'ครั้งแรก', 'ล่าสุด', 'หน้าล่าสุด', ''].map((t, i) => h('th', { class: i === 2 || i === 3 ? 'n' : '' }, t)))), tb)), moreIp);
      // ---- visit log
      const botChk = h('input', { type: 'checkbox' }); botChk.checked = showBots;
      botChk.addEventListener('change', async () => { showBots = botChk.checked; await loadRows(true); draw(); });
      const vrows = rows.map(r => h('tr', {},
        h('td', {}, fmtTime(r.t)), h('td', { class: 'ip' }, r.ip), h('td', {}, r.bot ? h('span', { class: 'an-chip' }, 'บอท: ' + r.bot_name) : h('span', { class: 'an-dev ' + r.device }, DEV_SHORT[r.device] || r.device)),
        h('td', {}, r.os + ' · ' + r.browser), h('td', { class: 'p', title: r.path }, r.path), h('td', {}, r.source), h('td', {}, r.isNew ? h('span', { class: 'an-chip up' }, 'ใหม่') : '', r.anon ? h('span', { class: 'an-chip', title: 'ผู้เข้าชมที่ไม่ได้ยินยอมคุกกี้: IP ถูกตัดท่อนท้าย ไม่มีคุกกี้' }, 'ไม่ระบุตัวตน') : '')));
      const more = rows.length < rowsTotal ? h('div', { style: 'text-align:center' }, h('button', { type: 'button', class: 'ghost sm', onclick: async () => { await loadRows(false); draw(); } }, 'โหลดเพิ่ม (' + nf(rows.length) + ' / ' + nf(rowsTotal) + ')')) : null;
      const logBox = box('รายการเข้าชมล่าสุด', h('div', { id: 'an-visits', class: 'an-filter' },
        ipOnly ? h('span', { class: 'an-chip up' }, 'IP: ' + ipOnly) : null,
        ipOnly ? h('button', { type: 'button', class: 'ghost sm', onclick: async () => { ipOnly = ''; await loadRows(true); draw(); } }, 'ล้างตัวกรอง') : null,
        h('label', { class: 'a-chk' }, botChk, 'แสดงบอท/ระบบด้วย')),
        h('div', { class: 'an-wrap' }, h('table', { class: 'an-tbl' }, h('thead', {}, h('tr', {}, ...['เวลา', 'IP', 'อุปกรณ์', 'ระบบ · เบราว์เซอร์', 'หน้า', 'มาจาก', ''].map(t => h('th', {}, t)))),
          h('tbody', {}, ...(vrows.length ? vrows : [h('tr', {}, h('td', { colspan: 7, style: 'text-align:center;color:var(--mu);padding:24px' }, 'ยังไม่มีการเข้าชมในช่วงนี้'))])))), more);
      const bots = R.botNames.length ? box('บอท / ระบบที่เข้ามา (ไม่นับเป็นผู้เข้าชมจริง)', barRows(R.botNames.map(([k, v]) => ({ label: k, value: v })), T.bots, { alt: true })) : null;
      host.replaceChildren(...[picker, kpis, h('div', { style: 'height:12px' }), kpis2, (T.anonViews ? h('small', { class: 'h', style: 'display:block;margin-top:10px' }, 'ในช่วงนี้มี ' + nf(T.anonViews) + ' การเข้าชม (' + Math.round((T.anonViews / Math.max(1, T.views)) * 100) + '%) จากผู้ที่ไม่ได้ยินยอมคุกกี้: นับแบบไม่ระบุตัวตน (IP ถูกตัดท่อนท้าย ไม่มีคุกกี้ และนับ "ไม่ซ้ำ" ได้เฉพาะภายในวันเดียวกัน)') : null), h('div', { style: 'height:18px' }), growthBox, devBox, two, two2, hourBox, ipBox, logBox, bots,
        (R.to === R.today && !single ? h('small', { class: 'h' }, 'เส้นประช่วงท้ายของกราฟคือ "วันนี้" ซึ่งยังไม่จบวัน ตัวเลขจึงต่ำกว่าวันอื่นเป็นเรื่องปกติ') : null), h('small', { class: 'h' }, 'ข้อมูลเก็บ ' + R.keepDays + ' วันล่าสุด · เข้าชมจริง = คนที่เปิดหน้าเว็บ (ตัดบอทและตัวตรวจระบบออก) · ไม่ซ้ำ = นับด้วยคุกกี้ที่ไม่ระบุตัวตน (vid)')].filter(Boolean));
    };
    load();
    return host;
  }

  // ---------- legal pages (privacy, terms, support) ----------
  const LEGAL_TOKENS = '{{app}} {{company}} {{email}} {{reportEmail}} {{phone}} {{line}} {{address}} {{hours}} {{response}} {{site}} {{updated}} {{retention}} {{minAge}} {{deleteDays}} · ลิงก์ไปหน้าอื่น (ว่างจนกว่าหน้านั้นจะมี): {{privacyUrl}} {{termsUrl}} {{supportUrl}} {{faqUrl}} {{deleteUrl}} {{oddsUrl}} ใช้แบบ [ข้อความ]({{deleteUrl}})';
  const legalHead = k => box('หัวข้อหน้า',
    two(field(C.pages[k], 'navLabel', 'ชื่อลิงก์ท้ายเว็บ'), field(C.pages[k], 'eyebrow', 'ข้อความเล็กเหนือหัวข้อ')),
    field(C.pages[k], 'h1', 'H1'), field(C.pages[k], 'h2', 'H2 (หัวข้อรอง, ไม่บังคับ)'), field(C.pages[k], 'intro', 'ย่อหน้าแนะนำ', { type: 'textarea' }),
    k === 'support' ? null : field(C.pages[k], 'updated', 'วันที่อัปเดตล่าสุด / วันที่มีผล (แสดงบนหน้า และใช้แทนตัวแปร {{updated}})', { type: 'date', help: 'แก้สาระสำคัญแล้วอย่าลืมเปลี่ยนวันที่ และพิจารณาเปลี่ยน "เลขเวอร์ชันความยินยอม" ในเมนูคุกกี้' }));
  function legalBody(page, key) {
    return [bodyEditor(page, key || 'body'), h('div', { class: 'a-note' }, 'ตัวแปรที่ใช้ในข้อความได้ (ระบบแทนค่าให้อัตโนมัติ): ' + LEGAL_TOKENS + ' — บรรทัดที่มีตัวแปรที่ยังว่างจะไม่แสดงบนหน้าเว็บ ส่วน {{company}} {{email}} {{reportEmail}} {{phone}} {{address}} {{hours}} {{response}} กรอกที่เมนู "ซัพพอร์ต / ติดต่อเรา" และ {{minAge}} {{deleteDays}} กรอกในกล่อง "ค่าที่ใช้ในนโยบาย/ข้อตกลง" ด้านล่าง')];
  }
  const legalEn = k => [
    note('สโตร์ตรวจโดยผู้ตรวจที่อ่านภาษาอังกฤษ จึงควรมีฉบับอังกฤษ หน้า /en/' + k + ' จะแสดงเมื่อมีเนื้อหาด้านล่าง เว้นว่างเนื้อหา = ไม่มีหน้า English'),
    two(field(C.pages[k], 'navLabelEn', 'Footer link label'), field(C.pages[k], 'h1En', 'H1')),
    field(C.pages[k], 'introEn', 'Intro', { type: 'textarea' }),
    bodyEditor(C.pages[k], 'bodyEn'),
    field(C.pages[k], 'seoTitleEn', 'SEO title', { max: 60, min: 20 }), field(C.pages[k], 'seoDescriptionEn', 'SEO description', { type: 'textarea', max: 160, min: 60 })];
  const legalSettings = () => box('ค่าที่ใช้ในนโยบาย / ข้อตกลง',
    two(field(C.legal, 'minAge', 'อายุขั้นต่ำของผู้เล่น (ปี)', { help: 'ต้องตรงกับ age rating ที่ตั้งในสโตร์ ใช้แทนตัวแปร {{minAge}}' }),
      field(C.legal, 'deleteDays', 'ลบข้อมูลถาวรภายในกี่วันหลังยืนยันคำขอ', { help: 'ต้องตรงกับระบบลบบัญชีจริง ใช้แทนตัวแปร {{deleteDays}}' })));
  const legalWarn = () => {
    const miss = [];
    if (!(C.contact.company || '').trim()) miss.push('ชื่อบริษัท');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((C.contact.email || '').trim())) miss.push('อีเมลซัพพอร์ต');
    return miss.length ? note('ยังไม่ได้กรอก: ' + miss.join(', ') + ' (ไปที่ สโตร์ & กฎหมาย → Support & ติดต่อ) บรรทัดในนโยบาย/ข้อตกลงที่ใช้ข้อมูลนี้จะถูกซ่อนจนกว่าจะกรอก และสโตร์จะไม่ผ่านถ้าไม่มีช่องทางติดต่อ') : null;
  };
  const pageShare = k => box('การแชร์ & การค้นหา',
    field(C.pages[k], 'ogImage', 'รูปแชร์ของหน้านี้', { type: 'image', ph: () => C.site.ogImage, help: 'เว้นว่าง = ใช้รูปแชร์หลักของเว็บ' }),
    check(C.pages[k], 'noindex', 'ซ่อนหน้านี้จาก Google (noindex) — ไม่แนะนำ เพราะสโตร์ต้องเปิดหน้านี้ได้'));

  // ---------- the final URLs to type into App Store Connect / Play Console, with a "does it open" check ----------
  function urlsView() {
    const host = h('div', {}, h('div', { class: 'a-empty' }, 'กำลังโหลด…'));
    let D = null, R = {}, busy = false, err = '';
    const copy = async t => {
      try { await navigator.clipboard.writeText(t); }
      catch (e) { const ta = h('textarea', { style: 'position:fixed;opacity:0' }); ta.value = t; document.body.append(ta); ta.select(); try { document.execCommand('copy'); } catch (x) {} ta.remove(); }
      toast('คัดลอกแล้ว ✓');
    };
    const chip = (t, k) => h('span', { class: 'a-chip' + (k === 'ok' ? ' on' : k === 'bad' ? ' bad' : '') }, t);
    const status = (it, lang) => {
      if (!it.exists) return chip('ยังไม่มีหน้านี้', '');
      const r = R[it.key + '|' + lang];
      if (!r) return chip(busy ? 'กำลังตรวจ…' : 'ยังไม่ได้ตรวจ', '');
      if (r.error) return chip('✕ ' + r.error, 'bad');
      const extra = (r.hops && r.hops.length > 1 ? ' · redirect ' + (r.hops.length - 1) + ' ครั้ง' : '') + (r.noindex ? ' · noindex!' : '');
      return chip((r.status === 200 && !r.noindex ? '✓ ' : '✕ ') + r.status + ' · ' + r.ms + 'ms' + extra, r.status === 200 && !r.noindex ? 'ok' : 'bad');
    };
    const draw = () => {
      if (cur !== 'urls' || !D) return;
      const rows = [];
      for (const it of D.items) for (const lang of ['th', 'en']) {
        if (lang === 'en' && !it.en) continue;
        const path = (lang === 'en' ? '/en' : '') + it.path, full = (D.base || '') + path;
        rows.push(h('tr', {}, h('td', {}, it.label + (lang === 'en' ? ' (English)' : '')), h('td', { class: 'ip' }, it.exists ? full : '—'), h('td', {}, status(it, lang)),
          h('td', {}, it.exists ? h('span', { style: 'display:flex;gap:6px' }, h('button', { type: 'button', class: 'ghost sm', onclick: () => copy(full) }, 'คัดลอก'), h('a', { class: 'ghost sm', href: path, target: '_blank', rel: 'noopener' }, 'เปิด ↗')) : null)));
      }
      const canCheck = /^https:\/\//i.test(D.base);
      host.replaceChildren(
        box('URL สำหรับกรอกในสโตร์',
          !D.base ? note('ยังไม่ได้ตั้ง "โดเมนหลัก" (ตั้งค่า → เว็บไซต์ & SEO) ตอนนี้แสดงเป็นเส้นทางสั้นๆ ต้องตั้งโดเมน https:// ก่อนจึงจะได้ URL เต็มและตรวจลิงก์ได้') : null,
          note('ใส่ URL เหล่านี้ในหน้าส่งแอปของ App Store Connect / Play Console และในแอป ห้ามเปลี่ยนที่อยู่หน้าหลังส่งสโตร์แล้ว เพราะสโตร์ตรวจลิงก์ ถ้าเสียอาจถูกถอดแอป'),
          h('div', { class: 'an-wrap' }, h('table', { class: 'an-tbl an-stack' }, h('thead', {}, h('tr', {}, ...['หน้า', 'URL', 'สถานะ', ''].map(t => h('th', {}, t)))), h('tbody', {}, ...rows))),
          h('div', { class: 'an-filter' },
            h('button', { type: 'button', class: 'btn sm', disabled: !canCheck || busy, onclick: async () => {
              busy = true; err = ''; R = {}; draw();
              try { const d = await api('urls/check', 'POST', {}); for (const r of d.results) R[r.key + '|' + r.lang] = r; } catch (e) { err = e.message; }
              busy = false; draw();
            } }, busy ? 'กำลังตรวจ…' : 'ตรวจทุกลิงก์ (เปิดจากอินเทอร์เน็ตจริง)'),
            h('small', { class: 'h' }, 'เซิร์ฟเวอร์จะเปิดแต่ละ URL ผ่าน HTTPS และดูว่าตอบ 200 ไม่ถูกซ่อนจาก Google และไม่ redirect วน'),
            err ? h('div', { class: 'a-err', style: 'text-align:left' }, err) : null)));
    };
    api('urls').then(d => { D = d; draw(); }).catch(e => host.replaceChildren(h('div', { class: 'a-empty' }, 'โหลดไม่สำเร็จ: ' + e.message)));
    return host;
  }

  // ---------- store readiness checklist (computed live from the unsaved form) ----------
  function readinessView() {
    const ct = C.contact, lg = C.legal, P = C.pages, T = s => String(s || '').trim();
    const vals = { company: ct.company, email: ct.email, reportEmail: T(ct.reportEmail) || ct.email, phone: ct.phone, line: ct.line, address: ct.address, hours: ct.hours, response: ct.response, minAge: lg.minAge, deleteDays: lg.deleteDays };
    const missing = txt => [...new Set((String(txt || '').match(/\{\{(\w+)\}\}/g) || []).map(t => t.slice(2, -2)))].filter(k => k in vals && !T(vals[k]));
    const lineMiss = txt => String(txt || '').split('\n').filter(l => (l.match(/\{\{(\w+)\}\}/g) || []).some(t => { const k = t.slice(2, -2); return k in vals && !T(vals[k]); })).length;
    const draft = /ร่าง|ตัวอย่าง|draft|ก่อนเผยแพร่|แก้ให้ตรง|lorem|todo/i;
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(T(ct.email));
    const pageOk = (k, en) => { const b = T(P[k][en ? 'bodyEn' : 'body']); return b.length > 400 && !lineMiss(b); };
    const texts = [['privacy', 'body'], ['privacy', 'bodyEn'], ['terms', 'body'], ['terms', 'bodyEn'], ['support', 'body']].map(([k, f]) => P[k][f]).concat(C.supportFaq.map(f => f.a), Object.values(C.cookies));
    const num = v => /^\d{1,3}$/.test(T(v));
    const has = k => !!(T(P[k].h1) && T(P[k].body));
    const rows = [
      ['ข้อมูลติดต่อ', [
        [!!T(ct.company), 'ใส่ชื่อบริษัท / ผู้ให้บริการ', 'p-support'],
        [emailOk, 'ใส่อีเมลซัพพอร์ตที่ถูกต้อง (สโตร์ตรวจว่าตอบจริง)', 'p-support'],
        [!!T(ct.reportEmail) || emailOk, 'มีช่องทางรายงานผู้เล่น/เนื้อหา (ใช้อีเมลซัพพอร์ตได้)', 'p-support']]],
      ['หน้าที่สโตร์ต้องมี', [
        [pageOk('privacy', false), 'นโยบายความเป็นส่วนตัว (ไทย) ครบ ไม่มีบรรทัดที่ถูกซ่อนเพราะข้อมูลว่าง' + (lineMiss(P.privacy.body) ? ' — ซ่อนอยู่ ' + lineMiss(P.privacy.body) + ' บรรทัด (ขาด: ' + missing(P.privacy.body).join(', ') + ')' : ''), 'p-privacy'],
        [pageOk('privacy', true), 'นโยบายความเป็นส่วนตัว (English) ครบ', 'p-privacy'],
        [pageOk('terms', false), 'ข้อตกลงการใช้บริการ (ไทย) ครบ' + (lineMiss(P.terms.body) ? ' — ขาด: ' + missing(P.terms.body).join(', ') : ''), 'p-terms'],
        [pageOk('terms', true), 'ข้อตกลงการใช้บริการ (English) ครบ', 'p-terms'],
        [T(P.support.body).length > 200 && C.supportFaq.length >= 5, 'หน้าซัพพอร์ตมีเนื้อหา ช่องทางรายงานผู้เล่น และ FAQ อย่างน้อย 5 ข้อ', 'p-support'],
        [has('delete'), 'หน้าลบบัญชีและข้อมูล (/delete-account) มีหัวข้อและเนื้อหา (Google Play บังคับ)', 'p-delete'],
        ]],
      ['ค่าที่ต้องตรงกับสโตร์', [
        [num(lg.minAge), 'อายุขั้นต่ำของผู้เล่นกรอกแล้ว (' + (T(lg.minAge) || '-') + ') — ต้องตรงกับ age rating', 'p-privacy'],
        [num(lg.deleteDays), 'จำนวนวันที่ลบข้อมูลถาวรกรอกแล้ว (' + (T(lg.deleteDays) || '-') + ') — ต้องตรงกับระบบลบบัญชีจริง', 'p-privacy']]],
      ['ความปลอดภัยของเนื้อหา', [
        [!texts.some(t => draft.test(String(t || ''))), 'ไม่มีข้อความร่าง/ตัวอย่างในหน้ากฎหมาย ซัพพอร์ต และแบนเนอร์', null],
        [!/COMING SOON/i.test(C.home.badge || ''), 'ป้ายหน้าแรกไม่ใช่ "COMING SOON" (สโตร์ไม่ชอบฟีเจอร์ที่ยังไม่เปิด)', 'home']]],
      ['เว็บไซต์', [
        [/^https:\/\//i.test(T(C.site.url)), 'ตั้ง "โดเมนหลัก" เป็น https:// แล้ว (ตั้งค่า → เว็บไซต์ & SEO)', 'general'],
        [on(C.cookies.enabled), 'เปิดแบนเนอร์ขอความยินยอมคุกกี้', 'cookies']]]
    ];
    const flat = rows.flatMap(r => r[1]), pass = flat.filter(x => x[0]).length;
    const todo = ['ป้าย/ปุ่มดาวน์โหลดทางการของ App Store และ Google Play พร้อมเช็กโดเมนลิงก์', 'ไฟล์ app-ads.txt / .well-known (ถ้าใช้โฆษณาหรือ Universal Links)']
      .concat(has('odds') ? [] : ['หน้าอัตราการได้ของจากกล่องสุ่ม (ต้องมีถ้าขายกล่องสุ่มด้วยเงินจริงหรือ Cash) — เขียนได้ที่ สโตร์ & กฎหมาย → อัตรากล่องสุ่ม']);
    return [box(null, h('div', { class: 'an-kpis' }, h('div', { class: 'an-kpi red' }, h('small', {}, 'ผ่านแล้ว'), h('b', {}, pass + ' / ' + flat.length), h('div', { class: 'sub' }, pass === flat.length ? 'พร้อมส่งสโตร์ (เท่าที่เว็บตรวจได้)' : 'ยังมีรายการที่ต้องแก้'))),
      h('small', { class: 'h' }, 'หมายเหตุ: ระบบตรวจได้เฉพาะสิ่งที่อยู่ในเว็บนี้ เรื่องสิทธิ์ใช้ชื่อ/โลโก้ ภาพหน้าจอจากเกมจริง บัญชีทดสอบ age rating และฟอร์ม Data safety / App Privacy ทีมต้องตรวจเอง')),
    box('ยังไม่มีในระบบนี้ (ต้องทำเพิ่มก่อนส่งสโตร์ ไม่นับในคะแนน)', ...todo.map(t => h('div', { class: 'rd-row' }, h('span', { class: 'rd-i no' }, '!'), h('span', { class: 'rd-t' }, t)))),
    ...rows.map(([title, items]) => box(title, ...items.map(([ok, text, go]) => h('div', { class: 'rd-row' },
      h('span', { class: 'rd-i ' + (ok ? 'ok' : 'no') }, ok ? '✓' : '✕'), h('span', { class: 'rd-t' }, text),
      go && !ok ? h('button', { type: 'button', class: 'ghost sm', onclick: () => open(go) }, 'ไปแก้') : null))))];
  }
  const on = v => v === true || v === 'true' || v === '1';

  // ---------- sections ----------
  const PN = { rewards: 'Rewards', gameplay: 'Gameplay', drivers: 'Drivers', news: 'News', faq: 'FAQ' };
  const PARTS = [
    { id: 'news', g: 'เนื้อหา', label: 'ข่าวสาร', desc: 'เพิ่ม/แก้ไขข่าว กดติ๊ก "เผยแพร่" เมื่อพร้อมขึ้นเว็บ ลากที่ ⋮⋮ เพื่อเรียงลำดับ', paths: ['news'], url: '/news', count: () => C.news.length,
      view: () => listEditor(C.news, {
        addTop: true, title: n => n.title, thumb: n => n.image, meta: n => (n.tag || '') + ' · ' + (n.date || ''), en: n => !!String(n.titleEn || '').trim(),
        badge: n => h('span', { class: 'a-bd' + (n.published ? ' on' : '') }, n.published ? 'เผยแพร่' : 'ฉบับร่าง'),
        quick: n => check(n, 'published', 'เผยแพร่'),
        stats: l => l.length + ' ข่าว · เผยแพร่ ' + l.filter(n => n.published === true || n.published === 'true').length + ' · ฉบับร่าง ' + l.filter(n => !(n.published === true || n.published === 'true')).length + ' · แปลอังกฤษแล้ว ' + l.filter(n => String(n.titleEn || '').trim()).length,
        filters: [['tag', 'หมวด', NEWS_TAGS.map(t => [t, t]), (n, v) => n.tag === v], ['st', 'สถานะ', [['pub', 'เผยแพร่'], ['draft', 'ฉบับร่าง']], (n, v) => (n.published === true || n.published === 'true') === (v === 'pub')], ['en', 'English', [['no', 'ยังไม่มี EN'], ['yes', 'มี EN แล้ว']], (n, v) => !!String(n.titleEn || '').trim() === (v === 'yes')]],
        blank: () => ({ title: '', slug: '', date: new Date().toISOString().slice(0, 10), tag: 'NEWS', published: false, image: '', excerpt: '', body: '', seoTitle: '', seoDescription: '', titleEn: '', excerptEn: '', bodyEn: '' }),
        form: (n, u) => [
          field(n, 'title', 'หัวข้อข่าว (H1)', { onchange: u }),
          two(check(n, 'published', 'เผยแพร่ (ติ๊ก = แสดงบนเว็บและ sitemap)'), field(n, 'date', 'วันที่', { type: 'date' })),
          two(field(n, 'tag', 'หมวดหมู่', { type: 'select', options: NEWS_TAGS, help: 'แสดงเป็นป้ายบนการ์ดข่าว (PATCH NOTE และ UPDATE เป็นป้ายสีแดง)' }), field(n, 'slug', 'URL (slug)', { help: 'เว้นว่าง = สร้างจากหัวข้อ → /news/…' })),
          field(n, 'image', 'รูปหน้าปก', { type: 'image', help: 'แนะนำกว้าง 1200px ขึ้นไป (Google ใช้แสดงในผลค้นหาข่าว)' }),
          field(n, 'imageAlt', 'คำอธิบายรูปหน้าปก (alt)', { ph: () => n.title, help: 'อธิบายว่าในรูปมีอะไร ช่วย SEO และผู้ใช้ที่มองไม่เห็น · เว้นว่าง = ใช้หัวข้อข่าว' }),
          field(n, 'excerpt', 'สรุปสั้น (แสดงในการ์ด)', { type: 'textarea' }),
          bodyEditor(n),
          enBox(enField(n, 'title', 'หัวข้อข่าว'), enField(n, 'excerpt', 'สรุปสั้น', { type: 'textarea' }), enField(n, 'body', 'เนื้อหา', { type: 'textarea', big: true, help: 'ใช้รูปแบบเดียวกับเนื้อหาภาษาไทย (## หัวข้อ, ### หัวข้อย่อย, - รายการ)' })),
          seoBox(n, 'seoTitle', 'seoDescription', { url: () => '/news/' + (n.slug || '…'), fbT: () => (n.title || '') + ' | ' + C.site.name, fbD: () => n.excerpt })]
      }) },
    { id: 'gameplay', g: 'เนื้อหา', label: 'Gameplay', desc: 'การ์ดอธิบายระบบเกม แต่ละใบมีรูปและข้อความ', paths: ['gameplay'], url: '/gameplay', count: () => C.gameplay.length,
      view: () => listEditor(C.gameplay, { title: g => g.title, thumb: g => g.image, meta: g => g.desc, en: g => !!String(g.titleEn || '').trim(), stats: l => l.length + ' การ์ด · แปลอังกฤษแล้ว ' + l.filter(g => String(g.titleEn || '').trim()).length, filters: [['en', 'English', [['no', 'ยังไม่มี EN'], ['yes', 'มี EN แล้ว']], (g, v) => !!String(g.titleEn || '').trim() === (v === 'yes')]], blank: () => ({ title: '', desc: '', image: '', alt: '', titleEn: '', descEn: '', altEn: '' }),
        form: (g, u) => [field(g, 'title', 'หัวข้อ (H3)', { onchange: u }), field(g, 'desc', 'รายละเอียด', { type: 'textarea' }), field(g, 'image', 'รูปภาพ', { type: 'image', help: 'แนะนำ 1200×900 (4:3) JPG/WebP ไม่เกิน ~300KB · รูปถูกครอบให้เต็มการ์ด วางจุดเด่นไว้ครึ่งบน' }), field(g, 'alt', 'ข้อความอธิบายรูป (alt)', { help: 'ช่วย SEO และผู้ใช้ที่มองไม่เห็น' }), enBox(enField(g, 'title', 'หัวข้อ'), enField(g, 'desc', 'รายละเอียด', { type: 'textarea' }), enField(g, 'alt', 'alt'))] }) },
    { id: 'prereg', g: 'เนื้อหา', label: 'ลงทะเบียนล่วงหน้า & รางวัล', desc: 'ตัวนับผู้ลงทะเบียนล่วงหน้าและรางวัลตามเป้าหมาย แสดงที่หน้าแรกและหน้า /rewards เตรียมไว้เชื่อมกับระบบเกม', paths: ['prereg'], url: '/rewards', count: () => C.rewards.length,
      view: () => {
        const P = C.prereg, modeSel = h('select', { onchange: e => { P.mode = e.target.value; mark(); } }, h('option', { value: 'mock' }, 'Mockup (ใช้ตัวเลขที่กรอกเอง)'), h('option', { value: 'api' }, 'API จริง (ดึงตัวเลขจากระบบเกม)'));
        modeSel.value = P.mode === 'api' ? 'api' : 'mock';
        return [
          box('เปิด/ปิดส่วนนี้',
            check(P, 'enabled', 'แสดงส่วนลงทะเบียนล่วงหน้าและรางวัล (หน้า /rewards)'),
            check(P, 'onHome', 'แสดงบนหน้าแรกด้วย (ใต้ส่วนหัวของหน้า)'),
            note('ปุ่ม "ลงทะเบียนล่วงหน้า" ด้านล่างใช้ข้อความ/ลิงก์/สวิตช์เดียวกับปุ่มลงทะเบียนในแท็บ หน้าแรก')),
          box('จำนวนผู้ลงทะเบียน',
            h('label', { class: 'a-f' }, h('span', {}, 'แหล่งตัวเลข'), modeSel, h('span', { class: 'h' }, 'Mockup = ตัวเลขที่กรอกด้านล่าง · API จริง = หน้าเว็บถามตัวเลขจากที่อยู่ API ทุก 60 วินาที')),
            field(P, 'mockCount', 'จำนวนตัวอย่าง / ตัวเลขสำรอง', { ph: '13002', help: 'โหมด Mockup ใช้ตัวเลขนี้ · โหมด API ใช้แสดงระหว่างรอ API หรือถ้า API ล่ม' }),
            field(P, 'apiUrl', 'ที่อยู่ API (เฉพาะ https://...)', { ph: 'https://api.example.com/prereg/count', help: 'ต้องตอบ JSON เช่น {"count": 13002} · ตั้ง CORS ให้โดเมนเว็บนี้ · ไม่ส่งคุกกี้ · http ใช้ได้เฉพาะ localhost' })),
          box('ข้อความบนหน้า',
            two(field(P, 'eyebrow', 'ข้อความเล็กเหนือหัวข้อ'), field(P, 'statusLabel', 'ป้ายสถานะเหนือตัวเลข')),
            two(field(P, 'title', 'หัวข้อ (ส่วนแรก)'), field(P, 'titleAccent', 'หัวข้อ (ส่วนสีเน้น)')),
            field(P, 'intro', 'ข้อความแนะนำ', { type: 'textarea' }),
            two(field(P, 'counterLabel', 'ป้ายตัวนับ'), field(P, 'unit', 'หน่วย', { ph: 'คน' })),
            field(P, 'nextText', 'ข้อความเป้าหมายถัดไป', { help: 'ใช้ {n} แทนจำนวนที่ขาด เช่น อีกเพียง {n} คน เพื่อถึงเป้าหมายขั้นถัดไป' }),
            field(P, 'allDoneText', 'ข้อความเมื่อถึงทุกเป้าหมายแล้ว'),
            two(field(P, 'goalsLabel', 'หัวข้อแถวรางวัล'), field(P, 'reachedCount', 'คำว่า "ถึงเป้าหมายแล้ว" (ตัวนับ 4 / 6)')),
            two(field(P, 'reachedLabel', 'ป้ายการ์ด: ถึงแล้ว'), field(P, 'nextLabel', 'ป้ายการ์ด: เป้าหมายถัดไป')),
            two(field(P, 'lockedLabel', 'ป้ายการ์ด: ยังไม่ถึง'), field(P, 'viewLabel', 'ข้อความ "ดูรางวัล"')),
            two(field(P, 'detailReached', 'รายละเอียดรางวัล: ถึงแล้ว'), field(P, 'detailLocked', 'รายละเอียดรางวัล: ยังไม่ถึง')))
        ];
      } },
    { id: 'rewards', g: 'เนื้อหา', label: 'รายการรางวัล (เป้าหมาย)', desc: 'รางวัลที่ปลดล็อกเมื่อยอดลงทะเบียนถึงเป้าหมาย เรียงตามเป้าหมายให้อัตโนมัติ', paths: ['rewards'], url: '/rewards', count: () => C.rewards.length,
      view: () => [note('ใส่ "เป้าหมาย (ตัวเลข)" เช่น 5000 ระบบเทียบกับจำนวนผู้ลงทะเบียนเพื่อบอกว่าถึงเป้าหรือยัง ถ้าเว้นว่างจะอ่านจากป้ายเป้าหมาย เช่น 50K = 50,000 · รายการที่ไม่มีตัวเลขเป้าหมายจะไม่แสดงในแถบรางวัล'),
        listEditor(C.rewards, { title: r => (r.milestone || r.target ? (r.milestone || r.target) + ' · ' : '') + r.title, thumb: r => r.image, meta: r => r.desc, en: r => !!String(r.titleEn || '').trim(), blank: () => ({ milestone: '', target: '', title: '', desc: '', image: '', alt: '', status: '', titleEn: '', descEn: '', altEn: '' }),
        form: (r, u) => [two(field(r, 'target', 'เป้าหมาย (ตัวเลขผู้ลงทะเบียน)', { ph: '5000', onchange: u }), field(r, 'milestone', 'ป้ายเป้าหมาย (ไม่บังคับ)', { ph: '5,000', help: 'ใช้แสดงในการ์ดรายการ/หน้าเก่า' })), field(r, 'title', 'ชื่อรางวัล', { onchange: u }), field(r, 'desc', 'รายละเอียดรางวัล', { type: 'textarea' }), field(r, 'image', 'รูปรางวัล (ไม่บังคับ)', { type: 'image', ph: '/img/...' }), field(r, 'alt', 'คำอธิบายรูป (alt)'), enBox(enField(r, 'title', 'ชื่อรางวัล'), enField(r, 'desc', 'รายละเอียดรางวัล', { type: 'textarea' }), enField(r, 'alt', 'alt'))] })] },
    { id: 'drivers', g: 'เนื้อหา', label: 'Drivers', desc: 'การ์ดนักซิ่ง/รถ แต่ละใบมีรูป ป้ายมุม และชื่อ', paths: ['drivers'], url: '/drivers', count: () => C.drivers.length,
      view: () => listEditor(C.drivers, { title: d => d.title, thumb: d => d.image, meta: d => [d.badge, d.desc].filter(Boolean).join(' · '), en: d => !!String(d.titleEn || '').trim(), stats: l => l.length + ' นักซิ่ง · แปลอังกฤษแล้ว ' + l.filter(d => String(d.titleEn || '').trim()).length, filters: [['en', 'English', [['no', 'ยังไม่มี EN'], ['yes', 'มี EN แล้ว']], (d, v) => !!String(d.titleEn || '').trim() === (v === 'yes')]], blank: () => ({ title: '', desc: '', image: '', pos: 'center', badge: '', titleEn: '', descEn: '', altEn: '', badgeEn: '' }),
        form: (d, u) => [field(d, 'title', 'ชื่อ (H3)', { onchange: u }), field(d, 'desc', 'คำอธิบาย', { type: 'textarea' }), field(d, 'image', 'รูปภาพ', { type: 'image', help: 'แนะนำ 1000×1250 (4:5) หรือ 1000×1000 JPG/WebP ไม่เกิน ~300KB · ถ้าหน้าคนโดนตัด ตั้ง "ตำแหน่งรูป" เป็น center top' }), field(d, 'alt', 'ข้อความอธิบายรูป (alt)', { ph: () => d.title, help: 'ช่วย SEO และผู้ใช้ที่มองไม่เห็น · เว้นว่าง = ใช้ชื่อ' }), enBox(enField(d, 'title', 'ชื่อ'), enField(d, 'desc', 'คำอธิบาย', { type: 'textarea' }), enField(d, 'badge', 'ป้ายมุมการ์ด'), enField(d, 'alt', 'alt')),
          two(field(d, 'pos', 'ตำแหน่งรูป (CSS)', { help: 'เช่น center, 30% center' }), field(d, 'badge', 'ป้ายมุมการ์ด', { help: 'เช่น COMING SOON' }))] }) },
    { id: 'faq', g: 'เนื้อหา', label: 'FAQ', desc: 'คำถามที่พบบ่อย ระบบส่งข้อมูลให้ Google แสดงเป็นคำถาม-คำตอบอัตโนมัติ', paths: ['faq'], url: '/faq', count: () => C.faq.length,
      view: () => [note('ช่อง English เว้นว่าง = รายการนั้นไม่แสดงในหน้า /en/faq (หน้า English จะแสดงเมื่อมีอย่างน้อย 1 รายการที่กรอกครบทั้งคำถามและคำตอบ และตั้ง H1 ภาษาอังกฤษที่เมนู หน้า FAQ)'),
        ...listEditor(C.faq, { title: f => f.q, blank: () => ({ q: '', a: '', qEn: '', aEn: '' }), form: (f, u) => [field(f, 'q', 'คำถาม (H3)', { onchange: u }), field(f, 'a', 'คำตอบ', { type: 'textarea' }), field(f, 'qEn', 'Question (English)'), field(f, 'aEn', 'Answer (English)', { type: 'textarea' })] })] },

    { id: 'en', g: 'เนื้อหา', label: 'ภาษาอังกฤษ (EN)', desc: 'ข้อความภาษาอังกฤษของหน้า /en (หน้าแรก, News, Gameplay, Drivers, Rewards) ช่องที่เว้นว่างจะแสดงข้อความภาษาไทยแทน · ข่าว Gameplay Drivers และรางวัลแต่ละรายการมีช่อง English อยู่ในแท็บของตัวเอง', paths: ['site', 'home', 'prereg', 'pages.rewards', 'pages.gameplay', 'pages.drivers', 'pages.news'], url: '/en',
      view: () => {
        const group = (title, obj, rows) => box(title, ...rows.map(([k, label, big]) => enField(obj, k, label, big ? { type: 'textarea' } : {})));
        return [
          note('ปุ่มสลับภาษา TH | EN อยู่บนเมนูของทุกหน้า หน้าภาษาอังกฤษอยู่ที่ /en ข้อความที่ยังไม่ได้แปลจะแสดงเป็นภาษาไทยจนกว่าจะกรอก'),
          group('ทั้งเว็บ', C.site, [['defaultTitle', 'Title หลัก'], ['description', 'Description หลัก', true], ['footer', 'ข้อความท้ายเว็บ']]),
          group('หน้าแรก', C.home, [['badge', 'ป้ายเล็กด้านบน'], ['h1', 'H1'], ['h2', 'H2'], ['h3', 'H3'], ['lead', 'ข้อความอธิบาย', true], ['registerText', 'ข้อความบนปุ่มลงทะเบียน'], ['registerMsg', 'ข้อความเมื่อกดปุ่มที่ยังไม่เปิด', true], ['storesLabel', 'หัวข้อปุ่มดาวน์โหลด'], ['followLabel', 'หัวข้อโซเชียล'], ['soonLabel', 'ข้อความเหนือปุ่มสโตร์ (ยังไม่เปิด)'], ['downloadLabel', 'ข้อความเหนือปุ่มสโตร์ (เปิดแล้ว)'], ['gameplayMore', 'ปุ่มดูทั้งหมด (Gameplay)'], ['latestNewsTitle', 'หัวข้อข่าวล่าสุด'], ['seoTitle', 'SEO Title'], ['seoDescription', 'SEO Description', true]]),
          ...['news', 'gameplay', 'drivers', 'rewards'].map(k => group('หน้า ' + PN[k], C.pages[k], [['navLabel', 'ชื่อในเมนู'], ['eyebrow', 'ข้อความเล็กเหนือหัวข้อ'], ['h1', 'H1'], ['h2', 'H2'], ['intro', 'ย่อหน้าแนะนำ', true]].concat(k === 'news' ? [['empty', 'ข้อความเมื่อยังไม่มีข่าว']] : [], [['seoTitle', 'SEO Title'], ['seoDescription', 'SEO Description', true]]))),
          group('ตัวนับลงทะเบียนล่วงหน้า', C.prereg, [['eyebrow', 'ข้อความเล็กเหนือหัวข้อ'], ['title', 'หัวข้อ'], ['titleAccent', 'หัวข้อ (ส่วนสีแดง)'], ['intro', 'ข้อความแนะนำ', true], ['statusLabel', 'ป้ายสถานะ'], ['counterLabel', 'ป้ายตัวนับ'], ['unit', 'หน่วย'], ['nextText', 'ข้อความเป้าหมายถัดไป ({n} = จำนวนที่เหลือ)'], ['allDoneText', 'ข้อความเมื่อถึงทุกเป้า'], ['goalsLabel', 'หัวข้อรายการรางวัล'], ['reachedCount', 'ข้อความ "ถึงเป้าหมายแล้ว" (ตัวนับ)'], ['reachedLabel', 'ป้ายถึงเป้าหมายแล้ว'], ['nextLabel', 'ป้ายเป้าหมายถัดไป'], ['lockedLabel', 'ป้ายยังไม่ถึงเป้า'], ['viewLabel', 'ปุ่มดูรางวัล'], ['detailReached', 'สถานะรางวัล (ถึงเป้า)'], ['detailLocked', 'สถานะรางวัล (ยังไม่ถึง)']])];
      } },
    { id: 'home', g: 'หน้าเว็บ', label: 'หน้าแรก', desc: 'หัวข้อ H1 H2 H3 ข้อความอธิบาย ปุ่มลงทะเบียน และ SEO ของหน้าแรก', paths: ['home'], url: '/',
      view: () => [
        box('พื้นหลังหน้าแรก (Hero)', note('วิดีโอเล่นวนเป็นพื้นหลัง รูปใช้แสดงระหว่างรอวิดีโอโหลดและเมื่อวิดีโอเล่นไม่ได้ · เว้นว่าง = ใช้ไฟล์เริ่มต้น'),
          field(C.home, 'heroVideo', 'วิดีโอพื้นหลัง (คอม)', { type: 'video', ph: '/img/rc_burn_v2_hd.mp4', help: 'MP4 (H.264) แนะนำ 1920×1080 ไม่เกิน ~15MB ไม่มีเสียง' }),
          field(C.home, 'heroVideoMobile', 'วิดีโอพื้นหลัง (มือถือ)', { type: 'video', ph: '/img/rc_burn_v2_m.mp4', help: 'ไฟล์เล็กสำหรับมือถือ แนะนำ 720p ไม่เกิน ~3MB · เว้นว่างและตั้งวิดีโอคอมไว้ = ใช้วิดีโอเดียวกับคอม' }),
          field(C.home, 'heroImage', 'รูปพื้นหลัง / รูปสำรอง', { type: 'image', ph: '/img/keyart_rc_v1_web.jpg', help: 'แนะนำ 1920×1080 ขึ้นไป ควรเป็นภาพเดียวกับเฟรมแรกของวิดีโอ' })),
        box('หัวข้อใหญ่', field(C.home, 'badge', 'ป้ายเล็กด้านบน'), field(C.home, 'h1', 'H1'), two(field(C.home, 'h2', 'H2'), field(C.home, 'h3', 'H3 (ตัวสีแดง)')), field(C.home, 'lead', 'ข้อความอธิบาย', { type: 'textarea' })),
        box('ปุ่มลงทะเบียน', two(field(C.home, 'registerText', 'ข้อความบนปุ่ม'), field(C.home, 'registerLink', 'ลิงก์ปุ่ม', { help: 'เว้นว่าง = แสดงข้อความ "เร็วๆ นี้"' })), field(C.home, 'registerMsg', 'ข้อความเมื่อกดปุ่ม (ตอนยังไม่มีลิงก์)'), check(C.links.show, 'register', 'แสดงปุ่มลงทะเบียนบนหน้าแรก (ปิด = ซ่อนปุ่ม)')),
        box('ป้ายข้อความอื่นๆ', two(field(C.home, 'storesLabel', 'หัวข้อปุ่มดาวน์โหลด'), field(C.home, 'followLabel', 'หัวข้อโซเชียล')), two(field(C.home, 'soonLabel', 'คำว่า "เร็วๆ นี้บน"'), field(C.home, 'downloadLabel', 'คำว่า "ดาวน์โหลดบน"')), two(field(C.home, 'gameplayMore', 'ปุ่มใต้ส่วน Gameplay (หน้าแรก)', { help: 'หัวข้อและรายการของส่วนนี้แก้ที่เมนู Gameplay / หน้า Gameplay' }), field(C.home, 'latestNewsTitle', 'หัวข้อส่วนข่าวใต้หน้าแรก'))),
        seoBox(C.home, 'seoTitle', 'seoDescription', { url: '/', fbT: () => C.site.defaultTitle, fbD: () => C.site.description })] },
    ...Object.keys(PN).map(k => ({
      id: 'p-' + k, g: 'หน้าเว็บ', label: 'หน้า ' + PN[k], desc: 'ชื่อในเมนู หัวข้อ H1/H2 ย่อหน้าแนะนำ และ SEO ของหน้า /' + k, paths: ['pages.' + k], url: '/' + k,
      view: () => [
        box('หัวข้อหน้า', two(field(C.pages[k], 'navLabel', 'ชื่อในเมนู'), field(C.pages[k], 'eyebrow', 'ข้อความเล็กเหนือหัวข้อ')), field(C.pages[k], 'h1', 'H1'), field(C.pages[k], 'h2', 'H2 (หัวข้อรอง)'), field(C.pages[k], 'intro', 'ย่อหน้าแนะนำ', { type: 'textarea' }),
          k === 'news' ? field(C.pages[k], 'empty', 'ข้อความเมื่อยังไม่มีข่าว') : null),
        k === 'faq' ? box('ฉบับภาษาอังกฤษ', h('a', { href: '/en/faq', target: '_blank', rel: 'noopener', class: 'ghost sm', style: 'justify-self:start' }, 'ดูหน้า English ↗'),
          note('หน้า /en/faq จะแสดงเมื่อใส่ H1 ภาษาอังกฤษด้านล่าง และมีรายการ FAQ ที่กรอกภาษาอังกฤษครบอย่างน้อย 1 รายการ (เมนู FAQ)'),
          two(field(C.pages[k], 'navLabelEn', 'Footer link label'), field(C.pages[k], 'h1En', 'H1')), field(C.pages[k], 'introEn', 'Intro', { type: 'textarea' }),
          field(C.pages[k], 'seoTitleEn', 'SEO title', { max: 60, min: 20 }), field(C.pages[k], 'seoDescriptionEn', 'SEO description', { type: 'textarea', max: 160, min: 60 })) : null,
        seoBox(C.pages[k], 'seoTitle', 'seoDescription', { url: '/' + k, fbT: () => C.pages[k].h1 + ' | ' + C.site.name, fbD: () => C.site.description }),
        box('การแชร์ & การค้นหา',
          field(C.pages[k], 'ogImage', 'รูปแชร์ของหน้านี้ (Facebook / LINE / X)', { type: 'image', ph: () => C.site.ogImage, help: 'แนะนำ 1200×630 · เว้นว่าง = ใช้รูปแชร์หลักของเว็บ' }),
          check(C.pages[k], 'noindex', 'ซ่อนหน้านี้จาก Google (noindex) — หน้ายังเปิดได้ แต่จะไม่ขึ้นในผลค้นหาและไม่อยู่ใน sitemap'))]
    })),

    // ---- legal pages + contact + cookie banner (all texts editable) ----
    { id: 'p-privacy', g: 'หน้าเว็บ', label: 'นโยบายความเป็นส่วนตัว', desc: 'หน้า /privacy และ /en/privacy (Apple และ Google บังคับให้มี URL นี้) ข้อความแก้ได้ทั้งหมด ส่วนตารางคุกกี้ท้ายหน้าอัปเดตตามการตั้งค่าจริงอัตโนมัติ', paths: ['pages.privacy', 'legal'], url: '/privacy',
      view: () => [
        legalWarn(),
        note('ข้อความเริ่มต้นเขียนตามรายการที่สโตร์ต้องการและแนว PDPA ต้องให้ผู้รู้กฎหมายตรวจ และเทียบกับสิ่งที่เกมเก็บจริง (แชท การซื้อ ข้อมูลเครื่อง) ก่อนส่งสโตร์ บรรทัดที่ใช้ตัวแปรที่ยังว่างจะถูกซ่อนจากหน้าสาธารณะอัตโนมัติ'),
        legalHead('privacy'),
        box('เนื้อหานโยบาย (ภาษาไทย)', legalBody(C.pages.privacy, 'body')),
        legalSettings(),
        box('ฉบับภาษาอังกฤษ', h('a', { href: '/en/privacy', target: '_blank', rel: 'noopener', class: 'ghost sm', style: 'justify-self:start' }, 'ดูหน้า English ↗'), ...legalEn('privacy')),
        seoBox(C.pages.privacy, 'seoTitle', 'seoDescription', { url: '/privacy', fbT: () => C.pages.privacy.h1 + ' | ' + C.site.name, fbD: () => C.site.description }),
        pageShare('privacy')].filter(Boolean) },
    { id: 'p-terms', g: 'หน้าเว็บ', label: 'ข้อตกลงการใช้บริการ', desc: 'หน้า /terms และ /en/terms กติกาเกม เงินและไอเทมในเกม ข้อห้าม กฎแชท การคืนเงิน และข้อกำหนดเพิ่มเติมสำหรับ App Store / Google Play', paths: ['pages.terms', 'legal'], url: '/terms',
      view: () => [
        legalWarn(),
        note('ข้อความเริ่มต้นครอบคลุมหัวข้อที่สโตร์แนะนำ (เงินและไอเทมไม่มีมูลค่าจริง, ห้ามโกง/ซื้อขายด้วยเงินจริง, กฎแชท, การคืนเงินผ่านสโตร์, การหยุดให้บริการ) ควรให้ผู้รู้กฎหมายตรวจก่อนใช้งานจริง'),
        legalHead('terms'),
        box('เนื้อหาข้อตกลง (ภาษาไทย)', legalBody(C.pages.terms, 'body')),
        legalSettings(),
        box('ฉบับภาษาอังกฤษ', h('a', { href: '/en/terms', target: '_blank', rel: 'noopener', class: 'ghost sm', style: 'justify-self:start' }, 'ดูหน้า English ↗'), ...legalEn('terms')),
        seoBox(C.pages.terms, 'seoTitle', 'seoDescription', { url: '/terms', fbT: () => C.pages.terms.h1 + ' | ' + C.site.name, fbD: () => C.site.description }),
        pageShare('terms')].filter(Boolean) },
    ...[['delete', 'ลบบัญชี', '/delete-account', 'หน้าอธิบายวิธีขอลบบัญชีและข้อมูล (Google Play บังคับให้มี URL นี้สำหรับแอปที่สร้างบัญชีได้)'],
        ['odds', 'อัตรากล่องสุ่ม', '/odds', 'หน้าแสดงอัตราการได้ไอเทมจากกล่องสุ่ม (Apple/Google บังคับถ้าเกมมีกล่องสุ่มที่ใช้เงินจริง)']].map(([k, label, url, desc]) => ({
      id: 'p-' + k, g: 'หน้าเว็บ', label, desc: desc + ' เว้นหัวข้อและเนื้อหาว่างไว้ = ยังไม่มีหน้า ลิงก์ในเว็บจะถูกซ่อนจนกว่าจะกรอก', paths: ['pages.' + k], url,
      view: () => [
        legalHead(k),
        box('เนื้อหา (ภาษาไทย)', legalBody(C.pages[k], 'body')),
        box('ฉบับภาษาอังกฤษ', ...legalEn(k)),
        seoBox(C.pages[k], 'seoTitle', 'seoDescription', { url, fbT: () => C.pages[k].h1 + ' | ' + C.site.name, fbD: () => C.site.description }),
        pageShare(k)].filter(Boolean) })),
    { id: 'p-support', g: 'หน้าเว็บ', label: 'ซัพพอร์ต / ติดต่อเรา', desc: 'หน้า /support: ช่องทางติดต่อ ช่องทางรายงานผู้เล่น กฎชุมชน และคำถามที่พบบ่อย ข้อมูลติดต่อแสดงท้ายเว็บและถูกใช้ในนโยบาย/ข้อตกลงด้วย', paths: ['pages.support', 'contact', 'supportFaq', 'legal'], url: '/support',
      view: () => [
        legalWarn(),
        box('ช่องทางติดต่อ',
          field(C.contact, 'company', 'ชื่อบริษัท / ผู้ให้บริการ', { help: 'แสดงท้ายเว็บ หน้าซัพพอร์ต และในนโยบายความเป็นส่วนตัว / ข้อตกลง' }),
          two(field(C.contact, 'email', 'อีเมลซัพพอร์ต', { help: 'แสดงเป็นลิงก์ mailto · Apple/Google ต้องมีช่องทางติดต่อที่ตอบจริง' }), field(C.contact, 'reportEmail', 'อีเมลรับรายงานผู้เล่น/เนื้อหา', { help: 'เว้นว่าง = ใช้อีเมลซัพพอร์ต' })),
          two(field(C.contact, 'phone', 'โทรศัพท์ (ไม่บังคับ)'), field(C.contact, 'line', 'LINE (ไอดี เช่น @raycitym หรือลิงก์ https://...)')),
          two(field(C.contact, 'hours', 'เวลาทำการ'), field(C.contact, 'response', 'เวลาตอบกลับโดยประมาณ')),
          two(field(C.contact, 'hoursEn', 'Opening hours (English)'), field(C.contact, 'responseEn', 'Reply time (English)')),
          field(C.contact, 'address', 'ที่อยู่ (ไม่บังคับ แต่ Google ต้องการที่อยู่ผู้พัฒนาในบางกรณี)', { type: 'textarea' }),
          h('small', { class: 'h' }, 'Facebook ใช้ลิงก์จาก หน้าแรก → ปุ่มดาวน์โหลด & โซเชียล โดยอัตโนมัติ')),
        legalHead('support'),
        box('เนื้อหาหน้าซัพพอร์ต', legalBody(C.pages.support, 'body')),
        box('คำถามที่พบบ่อยเรื่องซัพพอร์ต', note('ค่าเริ่มต้นครอบคลุม: ลืมรหัสผ่าน, ติดตั้ง/อัปเดต, เน็ตมือถือ, รายงานบั๊ก, รายงานผู้เล่น และลบบัญชี แก้คำตอบให้ตรงกับวิธีที่ระบบของท่านใช้จริง (ใช้ตัวแปร {{email}} {{reportEmail}} {{deleteDays}} ได้)'),
          ...listEditor(C.supportFaq, { title: f => f.q, blank: () => ({ q: '', a: '', qEn: '', aEn: '' }), form: (f, u) => [field(f, 'q', 'คำถาม', { onchange: u }), field(f, 'a', 'คำตอบ', { type: 'textarea', help: 'ขึ้นบรรทัดว่างเพื่อแยกย่อหน้า ใส่ลิงก์ได้แบบ [ข้อความ](/terms) หรือใช้ตัวแปร {{deleteUrl}} {{oddsUrl}} {{termsUrl}} {{privacyUrl}}' }), field(f, 'qEn', 'Question (English)'), field(f, 'aEn', 'Answer (English)', { type: 'textarea' })] })),
        box('ฉบับภาษาอังกฤษ', h('a', { href: '/en/support', target: '_blank', rel: 'noopener', class: 'ghost sm', style: 'justify-self:start' }, 'ดูหน้า English ↗'),
          note('หน้า /en/support จะแสดงเมื่อมีเนื้อหาในช่อง Body ด้านล่าง คำถามที่พบบ่อยจะแสดงเฉพาะรายการที่กรอกภาษาอังกฤษแล้ว'),
          two(field(C.pages.support, 'navLabelEn', 'Footer link label'), field(C.pages.support, 'h1En', 'H1')),
          field(C.pages.support, 'introEn', 'Intro', { type: 'textarea' }), bodyEditor(C.pages.support, 'bodyEn'),
          field(C.pages.support, 'seoTitleEn', 'SEO title', { max: 60, min: 20 }), field(C.pages.support, 'seoDescriptionEn', 'SEO description', { type: 'textarea', max: 160, min: 60 })),
        legalSettings(),
        seoBox(C.pages.support, 'seoTitle', 'seoDescription', { url: '/support', fbT: () => C.pages.support.h1 + ' | ' + C.site.name, fbD: () => C.site.description }),
        pageShare('support')].filter(Boolean) },
    { id: 'stats', g: 'รายงาน', label: 'สถิติผู้เข้าชม', desc: 'ดูจำนวนผู้เข้าชมจริง ผู้เข้าชมไม่ซ้ำ IP อุปกรณ์ Android / iOS / คอม และกราฟการเติบโต เลือกดูย้อนหลังได้ทุกช่วงวัน', paths: [],
      view: () => analyticsView() },
    { id: 'cookies', g: 'ตั้งค่าเว็บ', label: 'คุกกี้ & ความยินยอม', desc: 'แบนเนอร์ขอความยินยอมคุกกี้ (ยอมรับทั้งหมด / ปฏิเสธ / ตั้งค่า) ทุกข้อความแก้ได้ กดปุ่ม "ดูหน้านี้" เพื่อดูแบนเนอร์จริง', paths: ['cookies'], url: '/?cc=open',
      view: () => [
        box('การทำงาน',
          check(C.cookies, 'enabled', 'เปิดแบนเนอร์ขอความยินยอมคุกกี้ (แนะนำให้เปิด)'),
          check(C.cookies, 'anonymousCount', 'ผู้ที่ยังไม่ยินยอม/ปฏิเสธ ให้นับสถิติแบบไม่ระบุตัวตน (ตัดเลข IP ท่อนท้าย ไม่ตั้งคุกกี้) ถ้าไม่ติ๊ก จะไม่นับคนเหล่านี้เลย'),
          field(C.cookies, 'version', 'เลขเวอร์ชันความยินยอม', { help: 'เมื่อแก้นโยบายสำคัญ ให้เปลี่ยนเลข (เช่น 1 → 2) ทุกคนจะเห็นแบนเนอร์และต้องเลือกใหม่ · ใช้ตัวอักษร/ตัวเลขได้ไม่เกิน 12 ตัว' }),
          note('ถ้าปิดแบนเนอร์ เว็บจะตั้งคุกกี้สถิติและโหลด Google Analytics (ถ้าตั้งไว้) โดยไม่ขอความยินยอม ซึ่งไม่แนะนำตาม PDPA')),
        box('ข้อความในแบนเนอร์',
          field(C.cookies, 'title', 'หัวข้อ'), field(C.cookies, 'text', 'ข้อความ', { type: 'textarea' }),
          two(field(C.cookies, 'acceptAll', 'ปุ่ม: ยอมรับทั้งหมด'), field(C.cookies, 'rejectAll', 'ปุ่ม: ปฏิเสธที่ไม่จำเป็น')),
          two(field(C.cookies, 'customize', 'ปุ่ม: ตั้งค่า'), field(C.cookies, 'policyLabel', 'ลิงก์ไปนโยบายความเป็นส่วนตัว'))),
        box('หน้าต่างตั้งค่าคุกกี้',
          two(field(C.cookies, 'settingsTitle', 'หัวข้อ'), field(C.cookies, 'save', 'ปุ่ม: บันทึกการตั้งค่า')),
          two(field(C.cookies, 'necessaryTitle', 'ชื่อกลุ่ม: จำเป็น'), field(C.cookies, 'analyticsTitle', 'ชื่อกลุ่ม: สถิติ')),
          field(C.cookies, 'necessaryDesc', 'คำอธิบายกลุ่มที่จำเป็น', { type: 'textarea' }),
          field(C.cookies, 'analyticsDesc', 'คำอธิบายกลุ่มสถิติ', { type: 'textarea' }),
          field(C.cookies, 'settingsLink', 'ข้อความลิงก์ท้ายเว็บสำหรับเปิดตั้งค่าอีกครั้ง', { help: 'ผู้ใช้ถอนความยินยอมได้ทุกเมื่อจากลิงก์นี้' })),
        box('แบนเนอร์คุกกี้ภาษาอังกฤษ',
          field(C.cookies, 'titleEn', 'Title'), field(C.cookies, 'textEn', 'Text', { type: 'textarea' }),
          two(field(C.cookies, 'acceptAllEn', 'Button: Accept all'), field(C.cookies, 'rejectAllEn', 'Button: Decline non-essential')),
          two(field(C.cookies, 'customizeEn', 'Button: Settings'), field(C.cookies, 'policyLabelEn', 'Privacy policy link')),
          two(field(C.cookies, 'settingsTitleEn', 'Settings title'), field(C.cookies, 'saveEn', 'Button: Save settings')),
          two(field(C.cookies, 'necessaryTitleEn', 'Necessary: title'), field(C.cookies, 'analyticsTitleEn', 'Analytics: title')),
          field(C.cookies, 'necessaryDescEn', 'Necessary: description', { type: 'textarea' }), field(C.cookies, 'analyticsDescEn', 'Analytics: description', { type: 'textarea' }),
          field(C.cookies, 'settingsLinkEn', 'Footer link text')),
        box('คุกกี้ที่ระบบใช้',
          h('div', { class: 'a-empty', style: 'text-align:left;line-height:1.9' },
            'rc_consent — จำเป็น: จำการเลือกในแบนเนอร์ (6 เดือน)', h('br'),
            'vid — สถิติ: รหัสสุ่มไม่ระบุตัวตน ตั้งเมื่อกด "ยอมรับ" เท่านั้น (1 ปี)', h('br'),
            '_ga / _ga_* — สถิติ: เฉพาะเมื่อใส่ Google Analytics ในตั้งค่า → เว็บไซต์ & SEO และผู้ใช้ยินยอม', h('br'),
            'rc-sfx / rc-ldr-seen — จำเป็น: จำเสียงและหน้าโหลด (เก็บในเบราว์เซอร์)'))] },
    { id: 'urls', g: 'ตั้งค่าเว็บ', label: 'URL สำหรับสโตร์', desc: 'ที่อยู่หน้านโยบาย ข้อตกลง ซัพพอร์ต (และหน้าลบบัญชี/อัตรากล่องสุ่มเมื่อมี) ให้คัดลอกไปกรอกในสโตร์ พร้อมตรวจว่าทุกลิงก์เปิดได้จริง', paths: [],
      view: () => urlsView() },
    { id: 'ready', g: 'ตั้งค่าเว็บ', label: 'ความพร้อมส่งสโตร์', desc: 'เช็กลิสต์ว่าหน้าเว็บที่ Apple / Google ต้องการครบและไม่มีข้อความร่างหลุดหรือไม่ อัปเดตตามที่แก้ในหลังบ้านทันที (ยังไม่ต้องกดบันทึก)', paths: [],
      view: () => readinessView() },
    { id: 'general', g: 'ตั้งค่าเว็บ', label: 'ข้อมูลเว็บ & SEO หลัก', desc: 'ชื่อเว็บ โดเมน รูปแชร์ และค่า SEO เริ่มต้นของทั้งเว็บ', paths: ['site'], url: '/',
      view: () => [
        box('ข้อมูลเว็บไซต์', field(C.site, 'name', 'ชื่อเว็บไซต์', { help: 'แสดงที่โลโก้ ฟุตเตอร์ และต่อท้าย title' }),
          field(C.site, 'url', 'โดเมนหลัก (Canonical)', { help: 'เช่น https://raycitym.com — ใช้ใน canonical, sitemap, og:url ถ้าเว้นว่างจะใช้โดเมนที่เปิดอยู่' }),
          field(C.site, 'footer', 'ข้อความท้ายเว็บ (Copyright)')),
        box('โลโก้ ไอคอน และรูปแชร์',
          field(C.site, 'logo', 'โลโก้เว็บ', { type: 'image', ph: '/img/logo.png', help: 'แสดงที่เมนูบน ฟุตเตอร์ และหลังบ้าน แนะนำรูปจัตุรัส PNG พื้นหลังโปร่ง อย่างน้อย 256×256 · เว้นว่าง = ใช้โลโก้เริ่มต้น' }),
          field(C.site, 'favicon', 'ไอคอนเว็บ (Favicon)', { type: 'image', ph: '/img/favicon.png', help: 'ไอคอนที่แท็บเบราว์เซอร์/ผลค้นหา Google/หน้าจอมือถือ แนะนำ PNG จัตุรัส 192×192 ขึ้นไป · เว้นว่าง = ใช้ไอคอนเริ่มต้น' }),
          field(C.site, 'ogImage', 'รูปแชร์ (Open Graph)', { type: 'image', help: 'แนะนำ 1200×630' })),
        seoBox(C.site, 'defaultTitle', 'description', { open: true, label: 'SEO เริ่มต้น (หน้าแรก)', url: '/' }),
        box('เครื่องมือ SEO & สถิติ',
          note('ใส่แล้วกดบันทึก ระบบใส่โค้ดให้ทุกหน้าอัตโนมัติ ไม่ต้องแก้ไฟล์'),
          field(C.site, 'googleVerify', 'Google Search Console: รหัสยืนยันเว็บไซต์', { ph: 'เช่น AbCdEf123...', help: 'Search Console > เพิ่มพร็อพเพอร์ตี้ > วิธี "แท็ก HTML" > คัดลอกเฉพาะค่าใน content="..."' }),
          field(C.site, 'bingVerify', 'Bing Webmaster: รหัสยืนยัน (msvalidate.01)', { ph: 'ไม่บังคับ' }),
          two(field(C.site, 'ga4', 'Google Analytics 4: Measurement ID', { ph: 'G-XXXXXXXXXX', help: 'ขึ้นต้นด้วย G- · เว้นว่าง = ไม่ติดตามสถิติ' }),
            field(C.site, 'twitter', 'บัญชี X / Twitter ของเกม', { ph: '@raycitym', help: 'ใช้ในการ์ดแชร์บน X' }))),
        box('หน้า Loading (ก่อนเข้าเว็บ)',
          check(C.site, 'loader', 'เปิดใช้หน้า Loading'),
          // design picker: one card per design, each with its own preview (works even before saving / while switched off)
          h('div', { class: 'a-f' }, h('span', {}, 'รูปแบบ'), (() => {
            const DESIGNS = [
              ['launcher', 'Launcher ในเกม', 'ภาพหลักแบบเบลอ + แถบล่างแบบ launcher: LOADING พร้อมคำแนะนำ → READY → ปุ่ม START GAME แล้วภาพชัดขึ้นเข้าเว็บ'],
              ['tacho', 'เกจวัดรอบ', 'แผงหน้าปัดคาร์บอน เข็มวัดรอบไต่ไปโซนแดง ไฟ shift light 10 ดวง เกียร์ N→6 แล้วเกจพุ่งเข้าหาจอ'],
              ['headlights', 'Cinematic ไฟหน้ารถ', 'จอดำ ไฟหน้ากะพริบ แสงไฟท้ายลากยาว โลโก้ค่อยๆ สว่างพร้อมแสงกวาด แล้วแฟลชเข้าเว็บ'],
              ['neon', 'ถนนนีออน', 'พระอาทิตย์ตกแบบ synthwave ตึกเมือง ถนนตารางนีออนพุ่งเข้าหา โลโก้เรืองแสง แล้วพุ่งเข้าเส้นขอบฟ้า'],
              ['tuktuk', 'ตุ๊กๆ แต่งซิ่ง', 'ภาพตุ๊กๆ แต่งซิ่งในฉากมืด สปอตไลท์ส่องให้เห็นรางๆ ป้ายหลังคาติดก่อน ไฟหน้ากะพริบแบบกำลังสตาร์ท แล้วตัดเข้าเว็บด้วยม่านดำแบบภาพยนตร์ พร้อมเส้นทอง'],
              ['tukglow', 'ตุ๊กๆ ไฟสาดมืด', 'เริ่มจากจอมืดสนิท มีแค่ไฟหน้ารถติดขึ้นก่อน แสงค่อยๆ สาดออกจากไฟหน้าจนเห็นทั้งคัน ไฟหน้าสว่างจ้า แล้วดับมืดเข้าเว็บแบบนุ่มๆ'],
              ['tuklong', 'ตุ๊กๆ ไฟสาดช้า', 'แบบไฟสาดมืดเวอร์ชันยาว: มืดสนิทนานขึ้น ไฟหน้าติดค้างในความมืดก่อน แล้วแสงค่อยๆ สาดจนเห็นทั้งคัน จบแบบสว่าง เฟดจากรถเข้าหน้าเว็บโดยไม่มืด (โหลดนานขึ้นประมาณ 3 วินาที)'],
              ['tukxl', 'ตุ๊กๆ ไฟสาดช้าพิเศษ', 'แบบไฟสาดช้าที่ยาวขึ้นอีก: มืดสนิทนานขึ้น ไฟหน้าติดค้างในความมืดราว 4 วินาที แล้วแสงค่อยๆ สาดจนเห็นทั้งคัน จบแบบสว่าง เฟดจากรถเข้าหน้าเว็บโดยไม่มืด (รวมประมาณ 7 วินาที)'],
              ['tukmid', 'ตุ๊กๆ ไฟสาดกลาง', 'มืดสั้นกว่าแบบช้าพิเศษ: มืดสนิทไม่ถึงวินาที ไฟหน้าติดในความมืดราว 1.5 วินาที แล้วแสงค่อยๆ สาดช้าๆ จนเห็นทั้งคัน จบแบบสว่าง เฟดจากรถเข้าหน้าเว็บโดยไม่มืด (รวมประมาณ 6 วินาที)'],
              ['tukfast', 'ตุ๊กๆ ไฟสาดเร็ว', 'มืดสั้นกว่าแบบไฟสาดกลาง: มืดสนิทแวบเดียว ไฟหน้าติดในความมืดราว 1 วินาที แล้วแสงค่อยๆ สาดช้าๆ จนเห็นทั้งคัน จบแบบสว่าง เฟดจากรถเข้าหน้าเว็บโดยไม่มืด (รวมประมาณ 5 วินาที)']
            ];
            const cur = () => (DESIGNS.some(d => d[0] === C.site.loaderStyle) ? C.site.loaderStyle : 'launcher');
            const wrap = h('div', { class: 'ldr-pick', role: 'radiogroup' });
            const draw = () => wrap.replaceChildren(...DESIGNS.map(([id, name, desc]) => h('div', { class: 'card' + (cur() === id ? ' on' : ''), role: 'radio', 'aria-checked': cur() === id ? 'true' : 'false', tabindex: 0,
              onclick: e => { if (e.target.closest('a')) return; C.site.loaderStyle = id; mark(); draw(); },
              onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); C.site.loaderStyle = id; mark(); draw(); } } },
              h('b', {}, name, cur() === id ? h('em', {}, 'ใช้อยู่') : null), h('p', {}, desc),
              h('a', { class: 'ghost sm', href: '/?loader=preview&style=' + id, target: '_blank', rel: 'noopener' }, 'ดูตัวอย่าง ↗'))));
            draw();
            return wrap;
          })(), h('span', { class: 'h' }, 'คลิกการ์ดเพื่อเลือก แล้วกด "บันทึกส่วนนี้" · ปุ่มดูตัวอย่างเปิดได้ทันทีโดยไม่ต้องบันทึก')),
          check(C.site, 'loaderOnce', 'แสดงเฉพาะหน้าแรกที่เปิดในการเข้าชมแต่ละครั้ง (แนะนำ: เปิดหน้าอื่นต่อจะไม่ขึ้นซ้ำ)'),
          h('label', { class: 'a-f' }, h('span', {}, 'แสดงที่หน้าไหน'), (() => {
            const sel = h('select', { onchange: e => { C.site.loaderScope = e.target.value; mark(); } },
              h('option', { value: 'home' }, 'เฉพาะหน้าแรก'), h('option', { value: 'all' }, 'ทุกหน้า'));
            sel.value = C.site.loaderScope === 'all' ? 'all' : 'home';
            return sel;
          })(), h('span', { class: 'h' }, 'หมายเหตุ: หน้า Loading ทำให้คะแนน PageSpeed ลดลงเล็กน้อย เพราะเนื้อหาจริงแสดงช้าลง ~1 วินาที')),
          note('แสดงอย่างน้อยราว 2 วินาที และไม่เกิน 4 วินาที แม้เน็ตช้า · ผู้ใช้ที่ตั้งค่าลดการเคลื่อนไหวจะเห็นแบบสั้นและเรียบ'))] },
    { id: 'links', g: 'ตั้งค่าเว็บ', label: 'ลิงก์โซเชียล & ดาวน์โหลด', desc: 'ใส่ลิงก์แล้วปุ่มบนหน้าแรกกดไปลิงก์นั้นทันที เว้นว่าง = แสดง "เร็วๆ นี้"', paths: ['links'], url: '/',
      view: () => [
        box('ลิงก์ดาวน์โหลด', note('ใส่ลิงก์แล้วป้าย SOON จะหายไปจากปุ่มนั้น'),
          linkCard(C.links.download, 'windows', 'Windows PC', 'WIN', 'แสดง SOON', C.links.show), linkCard(C.links.download, 'ios', 'App Store', 'iOS', 'แสดง SOON', C.links.show), linkCard(C.links.download, 'android', 'Google Play', 'AND', 'แสดง SOON', C.links.show)),
        box('ลิงก์โซเชียล',
          linkCard(C.links.social, 'facebook', 'Facebook', 'FB', 'ปุ่มกด = เร็วๆ นี้', C.links.show), linkCard(C.links.social, 'tiktok', 'TikTok', 'TT', 'ปุ่มกด = เร็วๆ นี้', C.links.show),
          linkCard(C.links.social, 'discord', 'Discord', 'DC', 'ปุ่มกด = เร็วๆ นี้', C.links.show), linkCard(C.links.social, 'youtube', 'YouTube', 'YT', 'ปุ่มกด = เร็วๆ นี้', C.links.show))] },
    { id: 'media', g: 'ตั้งค่าเว็บ', label: 'คลังรูป & วิดีโอ', desc: 'ไฟล์รูปและวิดีโอทั้งหมดบนเว็บ อัปโหลด ดูตัวอย่าง คัดลอกลิงก์ หรือลบไฟล์ที่อัปโหลดเอง (ไฟล์ระบบใน /img ลบจากที่นี่ไม่ได้)', paths: [],
      view: () => mediaLibrary({ kind: 'all' }) },
    { id: 'pagespeed', g: 'ตั้งค่าเว็บ', label: 'PageSpeed', desc: 'ตรวจความเร็วและคะแนน SEO ของเว็บจริงด้วย Google PageSpeed Insights ดูแนวโน้มย้อนหลัง และตั้งให้ตรวจอัตโนมัติทุกวัน', paths: [],
      view: () => pagespeedView() },
    { id: 'history', g: 'ตั้งค่าเว็บ', label: 'ประวัติการแก้ไข', desc: 'ทุกครั้งที่บันทึก ระบบเก็บสำเนาก่อนหน้าไว้ 40 ครั้งล่าสุด โหลดกลับมาแล้วกดบันทึกเพื่อย้อนเวอร์ชัน', paths: [],
      view: () => {
        const host = h('div', { class: 'a-list' }, h('div', { class: 'a-empty' }, 'กำลังโหลด…'));
        api('history').then(({ items }) => {
          host.replaceChildren(...(items.length ? items.map(it => h('div', { class: 'a-hist' }, h('span', {}, new Date(it.time).toLocaleString('th-TH')),
            h('button', { class: 'ghost sm', type: 'button', onclick: async () => {
              if (!confirm('โหลดเวอร์ชันนี้เข้าตัวแก้ไข? (ยังไม่มีผลกับเว็บจนกว่าจะกดบันทึก)')) return;
              try { C = Object.assign(clone(C), await api('history/' + encodeURIComponent(it.id))); SECTIONS.forEach(s => s.paths.length && dirty.add(s.id)); toast('โหลดแล้ว — กด "บันทึกทั้งหมด" เพื่อใช้เวอร์ชันนี้'); render(); refreshChrome(); setStatus('โหลดเวอร์ชันเก่าแล้ว ยังไม่ได้บันทึก', 'warn'); } catch (e) { alert(e.message); }
            } }, 'โหลดเข้าตัวแก้ไข'))) : [h('div', { class: 'a-empty' }, 'ยังไม่มีประวัติ (จะเริ่มเก็บเมื่อบันทึกครั้งแรก)')]));
        }).catch(() => { host.textContent = 'โหลดไม่สำเร็จ'; });
        return host;
      } },
    { id: 'lr-login', g: 'ตั้งค่าเว็บ', label: 'ระบบล็อกอิน', desc: 'เปิด/ปิดระบบสมาชิกทั้งหมด ปุ่มบนเมนู และข้อความในหน้าเข้าสู่ระบบ /login', paths: ['portal'], url: '/login',
      view: () => {
        const P = C.portal;
        return [
          box('เปิด/ปิดระบบสมาชิก',
            note('ปิดอยู่ = ไม่มีหน้า /login /register /account และไม่มีปุ่มเข้าสู่ระบบบนเมนู · เว็บไซต์นี้ไม่เก็บรหัสผ่านหรือข้อมูลส่วนตัวของผู้เล่นเอง ทุกอย่างทำผ่าน API ของระบบเกม (หรือเป็น Mockup ข้อมูลสมมุติ)'),
            check(P, 'enabled', 'เปิดระบบสมาชิก (แสดงปุ่มเข้าสู่ระบบบนเมนูและเปิดหน้าสมาชิก)'),
            field(P, 'navLabel', 'ข้อความปุ่มบนเมนู', { ph: 'เข้าสู่ระบบ' }),
            h('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' }, h('a', { class: 'ghost sm', href: '/login', target: '_blank', rel: 'noopener' }, 'ดูหน้า Login ↗'), h('a', { class: 'ghost sm', href: '/account', target: '_blank', rel: 'noopener' }, 'ดูหน้าบัญชี ↗'))),
          box('หน้าเข้าสู่ระบบ',
            field(P, 'loginTitle', 'หัวข้อหน้า', { ph: 'เข้าสู่ระบบ' }),
            field(P, 'loginIntro', 'ข้อความใต้หัวข้อ (ไม่บังคับ)', { type: 'textarea' }),
            check(P, 'forgotOpen', 'แสดงลิงก์ "ลืมรหัสผ่าน?" และเปิดหน้า /forgot-password (ปิด = ไม่มีหน้านี้)'))
        ];
      } },
    { id: 'lr-register', g: 'ตั้งค่าเว็บ', label: 'ระบบสมัครสมาชิก', desc: 'เปิด/ปิดการสมัคร ข้อความในหน้าสมัคร /register และสวิตช์ลงทะเบียนล่วงหน้า', paths: ['portal', 'links', 'prereg'], url: '/register',
      view: () => {
        const P = C.portal;
        return [
          box('หน้าสมัครสมาชิก',
            check(P, 'registerOpen', 'เปิดรับสมัครสมาชิกใหม่ (ปิด = ไม่มีหน้า /register และไม่มีลิงก์สมัครในหน้าเข้าสู่ระบบ)'),
            field(P, 'registerTitle', 'หัวข้อหน้า', { ph: 'สมัครสมาชิก' }),
            field(P, 'registerIntro', 'ข้อความใต้หัวข้อ (ไม่บังคับ)', { type: 'textarea' }),
            note('ช่องยอมรับข้อตกลง/นโยบายความเป็นส่วนตัวขึ้นเองเมื่อมีหน้าเหล่านั้น และช่องยืนยันอายุขึ้นเมื่อกรอก "อายุขั้นต่ำ" ที่ สโตร์ & กฎหมาย › Support & ติดต่อ')),
          box('ลงทะเบียนล่วงหน้า',
            note('สวิตช์เหล่านี้ควบคุมสิ่งที่ผู้เข้าชมเห็นในช่วงก่อนเปิดเกม ข้อความ ตัวเลข และรายการรางวัลแก้ที่ เนื้อหาเว็บ › ลงทะเบียนล่วงหน้า & รางวัล'),
            check(C.links.show, 'register', 'แสดงปุ่ม "ลงทะเบียนล่วงหน้า" บนหน้าแรกและหน้า Rewards'),
            check(C.prereg, 'enabled', 'เปิดส่วนตัวนับผู้ลงทะเบียนและรางวัลตามเป้าหมาย (ปิด = แสดงการ์ดรางวัลธรรมดาที่หน้า /rewards)'),
            check(C.prereg, 'onHome', 'แสดงส่วนลงทะเบียนล่วงหน้าบนหน้าแรกด้วย'),
            h('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' }, h('a', { class: 'ghost sm', href: '/register', target: '_blank', rel: 'noopener' }, 'ดูหน้าสมัคร ↗'), h('a', { class: 'ghost sm', href: '/rewards', target: '_blank', rel: 'noopener' }, 'ดูหน้า Rewards ↗')))
        ];
      } },
    { id: 'lr-api', g: 'ตั้งค่าเว็บ', label: 'API (เชื่อมระบบเกม)', desc: 'เลือกโหมด Mockup หรือ API จริง และกำหนดที่อยู่/เส้นทางที่หน้าสมาชิกจะเรียก', paths: ['portal'], url: '/login',
      view: () => {
        const P = C.portal, modeSel = h('select', { onchange: e => { P.mode = e.target.value; mark(); } }, h('option', { value: 'mock' }, 'Mockup (ข้อมูลตัวอย่าง ยังไม่ต่อ API)'), h('option', { value: 'api' }, 'API จริง (ใช้ที่อยู่ด้านล่าง)'));
        modeSel.value = P.mode === 'api' ? 'api' : 'mock';
        return [
          box('การเชื่อมต่อ',
            h('label', { class: 'a-f' }, h('span', {}, 'โหมด'), modeSel, h('span', { class: 'h' }, 'Mockup = ใช้ข้อมูลสมมุติในเบราว์เซอร์ของผู้เยี่ยมชมเอง (ไม่ส่งข้อมูลไปที่ใด) · API จริง = หน้าเว็บเรียก API ของคุณโดยตรง ถ้าที่อยู่ไม่ถูกต้องจะกลับไปใช้ Mockup เอง')),
            field(P, 'apiBase', 'ที่อยู่ API (เฉพาะ https://...)', { ph: 'https://api.example.com/v1', help: 'ใช้เมื่อเลือกโหมด API จริง · ระบบอนุญาตให้หน้าเว็บเชื่อมต่อเฉพาะโดเมนนี้เท่านั้น (ต้องเปิด CORS + credentials ที่ฝั่ง API)' }),
            note('API ควรเก็บการล็อกอินเป็นคุกกี้ HttpOnly + Secure + SameSite และป้องกัน CSRF/จำกัดจำนวนครั้งที่ฝั่งของตัวเอง รายละเอียดข้อมูลที่ส่ง/รับอยู่ในไฟล์ API_SPEC_TH.md')),
          box('เส้นทาง API การเติมเงิน',
            two(field(P, 'epTopup', 'GET ช่องทางเติมเงิน', { help: 'คืน {methods:[{id,name,title,logo,mode,packages:[{price,cash,point}]}]}' }), field(P, 'epTopupRedeem', 'POST เติมด้วยรหัสบัตร', { help: 'ส่ง {method, code} → {message, user}  (เซิร์ฟเวอร์เกมต้องตรวจรหัสเอง)' })),
            field(P, 'epTopupCheckout', 'POST เริ่มชำระเงิน (PromptPay / Alipay / Wallet)', { help: 'ส่ง {method, methodName, price} → {url} (https เท่านั้น หน้าเว็บจะพาไปที่ url นั้น)' })),
          box('เส้นทาง API บัญชีผู้เล่น',
            two(field(P, 'epLogin', 'POST เข้าสู่ระบบ', { help: 'ส่ง {username, password} → {user}' }), field(P, 'epRegister', 'POST สมัคร', { help: 'ส่ง {username, email, password}' })),
            two(field(P, 'epLogout', 'POST ออกจากระบบ'), field(P, 'epForgot', 'POST ลืมรหัสผ่าน', { help: 'ส่ง {email}' })),
            two(field(P, 'epMe', 'GET โปรไฟล์ / PUT แก้ไขโปรไฟล์', { help: 'คืน {uid, name, username, email, phone, level, club, joined, cash, rain, point, pointExpire}' }), field(P, 'epPassword', 'POST เปลี่ยนรหัสผ่าน', { help: 'ส่ง {current, next}' })),
            two(field(P, 'epHistory', 'GET ประวัติ', { help: 'คืน [{date,type,detail,amount}]' }), field(P, 'epCoupons', 'GET คูปอง', { help: 'คืน [{code,title,expires,status}]' })),
            two(field(P, 'epItems', 'GET ไอเทมพิเศษ', { help: 'คืน [{name,qty,note}]' }), field(P, 'epRedeem', 'POST แลกรหัสไอเทม', { help: 'ส่ง {code} → {message, user?}  ถ้าผิดพลาดตอบ 4xx พร้อม {message}' })))
        ];
      } },
    { id: 'lr-member', g: 'ตั้งค่าเว็บ', label: 'บัญชีผู้เล่น & เติมเงิน', desc: 'ข้อความการ์ดสมาชิก ชื่อสกุลเงิน และช่องทาง/ราคาของหน้าเติมเงิน /account/topup', paths: ['portal', 'topup'], url: '/account/topup',
      view: () => {
        const P = C.portal;
        const packagesEditor = m => {
          const host = h('div', { class: 'a-pk' });
          const draw = () => host.replaceChildren(
            h('div', { class: 'a-pk-h' }, h('span', {}, 'ราคา (฿)'), h('span', {}, P.cashName || 'แคช'), h('span', {}, P.pointName || 'แต้มพ้อย'), h('span')),
            ...m.packages.map((pk, i) => h('div', { class: 'a-pk-r' },
              ...['price', 'cash', 'point'].map(k => { const inp = h('input', { type: 'text', inputmode: 'numeric', maxlength: 12 }); inp.value = pk[k] || ''; inp.addEventListener('input', () => { pk[k] = inp.value; mark(); }); return inp; }),
              h('button', { type: 'button', class: 'ghost sm', 'aria-label': 'ลบแถว', onclick: () => { m.packages.splice(i, 1); draw(); mark(); } }, '✕'))),
            h('button', { type: 'button', class: 'ghost sm', onclick: () => { m.packages.push({ price: '', cash: '', point: '' }); draw(); mark(); } }, '+ เพิ่มแพ็กเกจ'));
          draw();
          return h('div', { class: 'a-f' }, h('span', {}, 'ตารางราคา'), host, h('span', { class: 'h' }, 'แถวที่ไม่ใส่ราคาจะถูกลบตอนบันทึก · ตัวเลขล้วน เช่น 5000'));
        };
        return [
          box('การ์ดสมาชิกและชื่อสกุลเงิน',
            field(P, 'memberLabel', 'ข้อความบนการ์ดสมาชิก', { ph: 'RAYCITY-M MEMBER' }),
            two(field(P, 'cashName', 'ชื่อสกุลเงินหลัก (เติมเงินได้)', { ph: 'แคช' }), field(P, 'rainName', 'ชื่อสกุลเงินในเกม', { ph: 'เรน' })),
            field(P, 'pointName', 'ชื่อแต้มสะสม', { ph: 'แต้มพ้อย' })),
          box('ระบบเติมเงิน',
            note('เป็น Mockup: ไม่มีการตัดเงินหรือตรวจบัตรจริง ผู้ทดลองพิมพ์ DEMO-<ราคา> เช่น DEMO-150 เพื่อดูการเติมยอด เมื่อเชื่อม API จริง ช่องทางและราคาจะมาจาก API'),
            check(P, 'topupEnabled', 'เปิดหน้าเติมเงิน (ปิด = ไม่มีเมนูและหน้า /account/topup)'),
            field(P, 'topupTitle', 'ชื่อเมนู/หัวข้อหน้า', { ph: 'การเติมเงิน' })),
          h('h2', { class: 'a-sub' }, 'ช่องทางเติมเงิน'),
          note('โลโก้ของผู้ให้บริการ (TrueMoney, Razer, PromptPay ฯลฯ) เป็นเครื่องหมายการค้าของเจ้าของ ใช้เมื่อได้รับอนุญาตเท่านั้น ถ้าไม่ใส่รูป ระบบแสดงไอคอนทั่วไปพร้อมชื่อ'),
          ...[].concat(listEditor(C.topup.methods, { title: m => m.name, blank: () => ({ id: '', name: '', title: '', logo: '', enabled: 'true', mode: 'code', codeLabel: 'กรอกรหัสบัตร', codePh: 'กรอกรหัส…', note: '', packages: [{ price: '50', cash: '5000', point: '38' }] }),
            badge: m => h('span', { class: 'a-bd' + (m.enabled === 'true' || m.enabled === true ? ' on' : '') }, m.mode === 'checkout' ? 'ชำระเงิน' : 'รหัสบัตร'),
            form: (m, u) => [
              two(field(m, 'name', 'ชื่อช่องทาง (แสดงบนแผ่น)', { onchange: u }), check(m, 'enabled', 'แสดงช่องทางนี้')),
              field(m, 'title', 'หัวข้อในหน้า (ชื่อเต็ม)', { ph: () => m.name }),
              field(m, 'mode', 'รูปแบบการเติม', { type: 'select', options: [['code', 'กรอกรหัสบัตร (CashCard / Razer Gold)'], ['checkout', 'เลือกแพ็กเกจแล้วชำระเงิน (PromptPay / Alipay / Wallet)']] }),
              field(m, 'logo', 'โลโก้ (ไม่บังคับ)', { type: 'image', help: 'แนะนำ PNG/WebP พื้นหลังโปร่ง กว้างราว 300px' }),
              two(field(m, 'codeLabel', 'หัวข้อช่องกรอกรหัส (โหมดรหัสบัตร)'), field(m, 'codePh', 'ข้อความในช่องกรอก')),
              field(m, 'note', 'หมายเหตุใต้ช่อง', { type: 'textarea' }),
              packagesEditor(m)] }))
        ];
      } },
    { id: 'account', g: 'ตั้งค่าเว็บ', label: 'บัญชีแอดมิน', desc: 'เปลี่ยนรหัสผ่านผู้ดูแลระบบ', paths: [],
      view: () => {
        const cur0 = h('input', { type: 'password', autocomplete: 'current-password' }), n1 = h('input', { type: 'password', autocomplete: 'new-password' }), n2 = h('input', { type: 'password', autocomplete: 'new-password' });
        const msg = h('div', { class: 'a-err' });
        const pwBox = box('เปลี่ยนรหัสผ่าน', h('label', { class: 'a-f' }, 'รหัสผ่านปัจจุบัน', cur0), h('label', { class: 'a-f' }, 'รหัสผ่านใหม่ (อย่างน้อย 10 ตัวอักษร)', n1), h('label', { class: 'a-f' }, 'ยืนยันรหัสผ่านใหม่', n2), msg,
          h('div', {}, h('button', { class: 'btn sm', type: 'button', onclick: async () => {
            if (n1.value !== n2.value) { msg.textContent = 'รหัสผ่านใหม่ไม่ตรงกัน'; return; }
            try { await api('password', 'POST', { current: cur0.value, next: n1.value }); msg.textContent = ''; cur0.value = n1.value = n2.value = ''; toast('เปลี่ยนรหัสผ่านแล้ว'); } catch (e) { msg.textContent = e.message; }
          } }, 'บันทึกรหัสผ่าน')));
        // two-step login with an authenticator app
        const host = h('div', { class: 'a-host' });
        const paint = async () => {
          let on = false; try { on = (await api('2fa')).enabled; } catch (e) {}
          const m2 = h('div', { class: 'a-err' }), cur = h('input', { type: 'password', autocomplete: 'current-password' });
          const code = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 7, placeholder: '000000' });
          if (on) {
            host.replaceChildren(box('ยืนยันตัวตน 2 ขั้นตอน: เปิดใช้อยู่',
              note('การเข้าสู่ระบบต้องใช้รหัส 6 หลักจากแอป Authenticator ด้วย ถึงรหัสผ่านรั่วก็เข้าไม่ได้ ถ้าจะปิดต้องใส่รหัสผ่านและรหัสปัจจุบัน'),
              h('label', { class: 'a-f' }, 'รหัสผ่านปัจจุบัน', cur), h('label', { class: 'a-f' }, 'รหัส 6 หลักในแอป', code), m2,
              h('div', {}, h('button', { class: 'ghost sm', type: 'button', onclick: async () => {
                try { await api('2fa/disable', 'POST', { current: cur.value, code: code.value }); toast('ปิด 2 ขั้นตอนแล้ว'); paint(); } catch (e) { m2.textContent = e.message; }
              } }, 'ปิด 2 ขั้นตอน'))));
            return;
          }
          host.replaceChildren(box('ยืนยันตัวตน 2 ขั้นตอน: ยังไม่เปิด (แนะนำ)',
            note('ใช้แอป Google Authenticator, Microsoft Authenticator หรือ Authy สร้างรหัส 6 หลักทุก 30 วินาที ใช้ร่วมกับรหัสผ่านตอนเข้าสู่ระบบ ป้องกันคนที่รู้รหัสผ่านแต่ไม่มีมือถือของคุณ'),
            h('label', { class: 'a-f' }, 'รหัสผ่านปัจจุบัน', cur), m2,
            h('div', {}, h('button', { class: 'btn sm', type: 'button', onclick: async () => {
              try {
                const r = await api('2fa/begin', 'POST', { current: cur.value });
                const key = r.secret.match(/.{1,4}/g).join(' ');
                host.replaceChildren(box('ตั้งค่า 2 ขั้นตอน',
                  note('1) เปิดแอป Authenticator แล้วเลือก "เพิ่มบัญชี" > "ใส่คีย์ตั้งค่า" (Enter a setup key)  2) ใส่ชื่อบัญชีอะไรก็ได้ และคีย์ด้านล่าง ชนิด "ตามเวลา" (Time based)  3) ใส่รหัส 6 หลักที่แอปแสดง แล้วกดยืนยัน'),
                  h('div', { class: 'a-note', style: 'font-size:20px;letter-spacing:.12em;user-select:all;font-family:monospace' }, key),
                  h('label', { class: 'a-f' }, 'รหัส 6 หลักในแอป', code), m2,
                  h('div', {}, h('button', { class: 'btn sm', type: 'button', onclick: async () => {
                    try { await api('2fa/enable', 'POST', { code: code.value }); toast('เปิด 2 ขั้นตอนแล้ว'); paint(); } catch (e) { m2.textContent = e.message; }
                  } }, 'ยืนยันและเปิดใช้'))));
              } catch (e) { m2.textContent = e.message; }
            } }, 'เริ่มตั้งค่า'))));
        };
        paint();
        return [pwBox, host];
      } }
  ];

  // ---------- menu structure ----------
  // A few menus, each with tabs. A tab can bring several of the parts above together (a list + its page settings),
  // and it keeps the id of its first part, so saving, unsaved-change marks and "go fix it" buttons keep working.
  const part = id => PARTS.find(x => x.id === id);
  function tab(id, label, extra) {
    const ids = [id].concat(extra || []), ps = ids.map(part), main = ps[0];
    return { id, label, title: main.label, desc: main.desc, url: main.url, count: main.count, parts: ids,
      paths: [...new Set(ps.flatMap(x => x.paths))],
      view: () => ps.flatMap((x, i) => (i ? [h('h2', { class: 'a-sub' }, (x.id.startsWith('p-') ? 'ตั้งค่าหน้า: ' : '') + x.label + (x.url && x.id.startsWith('p-') ? '  ·  ' + x.url : ''))] : []).concat(x.view())) };
  }
  const MENUS = [
    { id: 'home', label: 'หน้าแรก', hint: 'ข้อความ รูปพื้นหลัง ปุ่มดาวน์โหลด โซเชียล', tabs: [tab('home', 'ข้อความ & พื้นหลัง'), tab('links', 'ปุ่มดาวน์โหลด & โซเชียล')] },
    { id: 'content', label: 'เนื้อหาเว็บ', hint: 'ข่าว Gameplay Rewards Drivers FAQ ภาษาอังกฤษ', tabs: [tab('news', 'ข่าวสาร', ['p-news']), tab('gameplay', 'Gameplay', ['p-gameplay']), tab('prereg', 'ลงทะเบียนล่วงหน้า & รางวัล', ['rewards', 'p-rewards']), tab('drivers', 'Drivers', ['p-drivers']), tab('faq', 'FAQ', ['p-faq']), tab('en', 'ภาษาอังกฤษ (EN)')] },
    { id: 'store', label: 'สโตร์ & กฎหมาย', hint: 'Privacy Terms Support คุกกี้ URL สโตร์', tabs: [tab('ready', 'ความพร้อมส่งสโตร์'), tab('urls', 'URL สำหรับสโตร์'), tab('p-privacy', 'Privacy'), tab('p-terms', 'Terms'), tab('p-support', 'Support & ติดต่อ'), tab('p-delete', 'ลบบัญชี'), tab('p-odds', 'อัตรากล่องสุ่ม'), tab('cookies', 'คุกกี้')] },
    { id: 'report', label: 'รายงาน & ความเร็ว', hint: 'ผู้เข้าชม PageSpeed', tabs: [tab('stats', 'สถิติผู้เข้าชม'), tab('pagespeed', 'PageSpeed')] },
    { id: 'media', label: 'คลังรูป & วิดีโอ', hint: 'ไฟล์ที่อัปโหลด', tabs: [tab('media', 'คลังรูป & วิดีโอ')] },
    { id: 'settings', label: 'ตั้งค่า', hint: 'SEO Login & Register รหัสผ่าน 2FA ประวัติ', groups: [
      { id: 'site', label: 'เว็บไซต์ & SEO', tabs: [tab('general', 'เว็บไซต์ & SEO')] },
      { id: 'lr', label: 'Login & Register', tabs: [tab('lr-login', 'ระบบล็อกอิน'), tab('lr-register', 'ระบบสมัครสมาชิก'), tab('lr-api', 'API'), tab('lr-member', 'บัญชีผู้เล่น & เติมเงิน')] },
      { id: 'acct', label: 'บัญชี & ความปลอดภัย', tabs: [tab('account', 'บัญชี & ความปลอดภัย')] },
      { id: 'hist', label: 'ประวัติการแก้ไข', tabs: [tab('history', 'ประวัติการแก้ไข')] }] }
  ];
  // a menu with sub-menus (a dropdown) lists all of its tabs too, so saving and the "go fix it" buttons treat it like any other
  for (const m of MENUS) if (m.groups) m.tabs = m.groups.flatMap(g => g.tabs);
  const SECTIONS = MENUS.flatMap(m => m.tabs.map(t => Object.assign(t, { g: m.label, menu: m.id })));
  const sec = id => SECTIONS.find(s => s.id === id);
  // Esc closes the slide-in menu
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && drawerOpen) { drawerOpen = false; for (const [q, c] of [['.a-side', 'open'], ['.a-back', 'on']]) { const n = document.querySelector(q); if (n) n.classList.remove(c); } document.body.classList.remove('a-lock'); } });
  const tabOf = id => SECTIONS.find(s => s.parts.includes(id));
  const menuOf = id => MENUS.find(m => m.tabs.some(t => t.id === id));
  const groupOf = (m, id) => (m.groups || []).find(g => g.tabs.some(t => t.id === id));
  const lastTab = {};
  const open = id => { const t = tabOf(id) || SECTIONS[0]; cur = t.id; render(); window.scrollTo(0, 0); };
  for (const x of PARTS) if (!tabOf(x.id)) console.error('admin: part not in any menu: ' + x.id);

  // ---------- screens ----------
  function loginScreen(err) {
    const u = h('input', { type: 'text', autocomplete: 'username', required: true }), p = h('input', { type: 'password', autocomplete: 'current-password', required: true });
    const o = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 7, placeholder: '000000' });
    const m = h('div', { class: 'a-err' }, err || '');
    const f = h('form', {}, h('img', { src: '/img/logo.png', alt: '' }), h('h1', { class: 'disp' }, 'Admin Login'),
      h('label', { class: 'a-f' }, 'ชื่อผู้ใช้', u), h('label', { class: 'a-f' }, 'รหัสผ่าน', p), h('label', { class: 'a-f' }, 'รหัส 6 หลักจากแอป Authenticator (ใส่เมื่อเปิดใช้ 2 ขั้นตอนเท่านั้น)', o), m, h('button', { class: 'btn', type: 'submit' }, 'เข้าสู่ระบบ'));
    f.addEventListener('submit', async e => { e.preventDefault(); try { await api('login', 'POST', { user: u.value, password: p.value, code: o.value }); start(); } catch (x) { m.textContent = x.message; } });
    app.replaceChildren(h('div', { class: 'a-login' }, f)); u.focus();
  }

  function render() {
    document.body.classList.remove('a-sheet');
    const s = sec(cur), menu = menuOf(cur), group = groupOf(menu, cur);
    lastTab[menu.id] = cur; if (group) lastTab[group.id] = cur;
    navBtns = {}; menuBtns = {}; subBtns = {};
    const closeDrawer = () => { drawerOpen = false; applyDrawer(); };
    const side = h('aside', { class: 'a-side' + (drawerOpen ? ' open' : ''), id: 'a-side' },
      h('div', { class: 'a-brand' }, h('img', { src: C.site.logo || '/img/logo.png', alt: '' }), h('div', {}, h('b', {}, C.site.name || 'Admin'), h('small', {}, 'ADMIN')), h('button', { type: 'button', class: 'a-close', 'aria-label': 'ปิดเมนู', onclick: closeDrawer }, '✕')),
      h('nav', { 'aria-label': 'เมนูหลังบ้าน', class: 'a-menus' }, ...MENUS.flatMap(m => {
        const here = m.id === menu.id;
        const b = h('button', { class: 'a-nav' + (here ? ' on' : '') + (m.tabs.some(t => dirty.has(t.id)) ? ' dirty' : ''), 'aria-current': here ? 'page' : null, 'aria-expanded': m.groups ? String(here && subOpen) : null,
          onclick: () => {
            // a dropdown menu: a second click on the open one folds it, a click on another one opens it
            if (m.groups && here) { subOpen = !subOpen; render(); return; }
            subOpen = true; drawerOpen = !!m.groups && innerWidth <= 900; cur = lastTab[m.id] || m.tabs[0].id; render(); window.scrollTo(0, 0);
          } },
          h('span', {}, m.label, h('small', {}, m.hint)), h('i'), m.groups ? h('b', { class: 'a-chev', 'aria-hidden': 'true' }, here && subOpen ? '▾' : '▸') : null);
        menuBtns[m.id] = b;
        const subs = m.groups && here && subOpen ? [h('div', { class: 'a-subnav', role: 'group', 'aria-label': m.label }, ...m.groups.map(g => {
          const sb = h('button', { class: 'a-sn' + (group && g.id === group.id ? ' on' : '') + (g.tabs.some(t => dirty.has(t.id)) ? ' dirty' : ''), 'aria-current': group && g.id === group.id ? 'page' : null,
            onclick: () => { drawerOpen = false; cur = lastTab[g.id] || g.tabs[0].id; render(); window.scrollTo(0, 0); } }, h('span', {}, g.label), h('i'));
          subBtns[g.id] = sb; return sb;
        }))] : [];
        return [b].concat(subs);
      })),
      h('div', { class: 'a-grow' }),
      h('div', { class: 'a-foot-nav' },
        h('button', { class: 'a-nav', onclick: () => window.open('/', '_blank') }, h('span', {}, 'ดูเว็บไซต์ ↗')),
        h('button', { class: 'a-nav', onclick: async () => { if (dirty.size && !confirm('มีการแก้ไขที่ยังไม่บันทึก ออกจากระบบ?')) return; try { await api('logout', 'POST'); } catch (e) {} csrf = ''; dirty.clear(); loginScreen(); } }, h('span', {}, 'ออกจากระบบ'))));

    const head = h('div', { class: 'a-head' },
      h('div', {}, h('span', { class: 'eyebrow' }, menu.label + (group && menu.groups.length > 1 ? ' › ' + group.label : '')), h('h1', { class: 'disp' }, s.title), h('p', {}, s.desc)),
      s.url ? h('div', { class: 'acts' }, h('a', { class: 'ghost sm', href: s.url, target: '_blank', rel: 'noopener' }, 'ดูหน้านี้ ↗')) : null);
    const tabSet = group ? group.tabs : menu.tabs;
    const tabs = tabSet.length > 1 ? h('div', { class: 'a-tabs', role: 'tablist', 'aria-label': group ? group.label : menu.label }, ...tabSet.map(t => {
      const b = h('button', { type: 'button', role: 'tab', 'aria-selected': t.id === cur ? 'true' : 'false', class: 'a-tab' + (t.id === cur ? ' on' : '') + (dirty.has(t.id) ? ' dirty' : ''),
        onclick: () => open(t.id) }, h('span', {}, t.label), t.count ? h('em', { class: 'n' }, String(t.count())) : null, h('i'));
      navBtns[t.id] = b; return b;
    })) : null;
    // on wide screens neighbouring settings boxes sit side by side instead of leaving the right half of the page empty
    if (tabs) requestAnimationFrame(() => { const on = tabs.querySelector('.on'); if (on) tabs.scrollLeft = Math.max(0, on.offsetLeft - (tabs.clientWidth - on.offsetWidth) / 2); });
    const isSet = SET_TABS.includes(s.id);
    if (spy) { spy.disconnect(); spy = null; }
    const view = isSet ? [settingsLayout([].concat(s.view()).flat(Infinity))] : [].concat(s.view()).flat(Infinity).reduce((out, e) => {
      if (e && e.classList && (e.classList.contains('a-box') || e.classList.contains('a-seo') || e.classList.contains('a-host')) && !['stats', 'pagespeed', 'media', 'history', 'ready', 'urls'].includes(s.id)) { const last = out[out.length - 1]; if (last && last.classList && last.classList.contains('a-cols')) last.append(e); else out.push(h('div', { class: 'a-cols' }, e)); } else out.push(e);
      return out;
    }, []);
    const main = h('main', { class: 'a-main' + (isSet ? ' is-set' : '') }, head, tabs, ...view);

    barEls = { st: h('span', { class: 'st' }) };
    const bar = s.paths.length ? h('div', { class: 'a-bar' }, barEls.st,
      (barEls.all = h('button', { class: 'ghost sm', type: 'button', style: 'display:none', onclick: () => save([...dirty]) }, '')),
      (barEls.one = h('button', { class: 'btn sm', type: 'button', onclick: () => save([cur]) }, 'บันทึก (Ctrl+S)'))) : null;
    // small screens: a top bar with the menu button; the side menu slides in over the page
    const burger = h('button', { type: 'button', class: 'a-burger', 'aria-label': 'เปิดเมนู', 'aria-controls': 'a-side', 'aria-expanded': String(drawerOpen), onclick: () => { drawerOpen = !drawerOpen; applyDrawer(); } }, h('span'), h('span'), h('span'));
    const back = h('div', { class: 'a-back' + (drawerOpen ? ' on' : ''), onclick: closeDrawer });
    const top = h('div', { class: 'a-top' }, burger, h('img', { src: C.site.logo || '/img/logo.png', alt: '' }),
      h('div', { class: 'ttl' }, h('b', {}, menu.label + (group && menu.groups.length > 1 ? ' › ' + group.label : '')), h('small', {}, s.title)), h('i', { class: 'dot' + (dirty.size ? ' on' : '') }));
    function applyDrawer() { side.classList.toggle('open', drawerOpen); back.classList.toggle('on', drawerOpen); burger.setAttribute('aria-expanded', String(drawerOpen)); document.body.classList.toggle('a-lock', drawerOpen); }
    app.replaceChildren(h('div', { class: 'a-shell' }, top, back, side, main, bar));
    document.body.classList.toggle('a-lock', drawerOpen);
    if (bar) { setStatus(dirty.has(cur) ? 'มีการแก้ไขที่ยังไม่บันทึก' : 'ไม่มีการเปลี่ยนแปลง', dirty.has(cur) ? 'warn' : ''); refreshChrome(); }
  }

  let saving = false;
  async function save(ids) {
    if (saving) return;
    ids = ids.filter(id => sec(id).paths.length);
    if (!ids.length) return;
    saving = true;
    try {
      const body = clone(saved);
      const submitted = clone(C);
      for (const id of ids) for (const p of sec(id).paths) setPath(body, p, clone(getPath(C, p)));
      const res = await api('content', 'PUT', body);
      saved = res;
      for (const id of ids) {
        if (sec(id).paths.every(p => JSON.stringify(getPath(C, p)) === JSON.stringify(getPath(submitted, p)))) {
          for (const p of sec(id).paths) setPath(C, p, clone(getPath(res, p))); dirty.delete(id);
        }
      }
      toast('บันทึกแล้ว ✓');
      render(); setStatus('บันทึกแล้ว ✓ ' + new Date().toLocaleTimeString('th-TH'), 'ok');
    } catch (e) {
      if (e.status === 401) return loginScreen('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
      setStatus('บันทึกไม่สำเร็จ: ' + e.message, 'err');
    } finally { saving = false; }
  }
  addEventListener('beforeunload', e => { if (dirty.size) { e.preventDefault(); e.returnValue = ''; } });
  addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 's' && C) { e.preventDefault(); save([cur]); } });

  async function start() {
    try { csrf = (await api('me')).csrf; saved = await api('content'); C = clone(saved); dirty.clear(); render(); } catch (e) { loginScreen(); }
  }
  start();
})();

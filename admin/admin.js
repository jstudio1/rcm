(function () {
  const app = document.getElementById('app');
  let csrf = '', C = null, saved = null, cur = 'news';
  const dirty = new Set();
  let navBtns = {}, barEls = {};

  // ---------- tiny helpers ----------
  const h = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
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
    const m = h('div', { class: 'a-err' });
    const f = h('form', { class: 'a-dlg a-relog' }, h('div', { class: 'hd' }, h('b', {}, 'เซสชันหมดอายุ')),
      h('p', { class: 'a-note' }, 'กรุณาเข้าสู่ระบบอีกครั้ง งานที่ยังไม่บันทึกจะไม่หาย'),
      h('label', { class: 'a-f' }, 'ชื่อผู้ใช้', u), h('label', { class: 'a-f' }, 'รหัสผ่าน', p), m, h('button', { class: 'btn', type: 'submit' }, 'เข้าสู่ระบบ'));
    const bg = h('div', { class: 'a-modal' }, f);
    f.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        const r = await fetch('/admin/api/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: u.value, password: p.value }) });
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
    : h('img', { src: it.url, alt: '', loading: 'lazy' });

  // Grid of every image/video on the site (built-in /img and admin uploads).
  // kind: 'image' | 'video' | 'all'. onPick(url) makes each tile selectable; without it the grid is a manager.
  function mediaLibrary(o) {
    let items = [], tab = o.kind || 'all';
    const grid = h('div', { class: 'a-media' }, h('div', { class: 'a-empty' }, 'กำลังโหลด…'));
    const q = h('input', { type: 'search', placeholder: 'ค้นหาชื่อไฟล์…' });
    const tabs = {};
    const draw = () => {
      for (const k in tabs) tabs[k].classList.toggle('on', k === tab);
      const s = q.value.trim().toLowerCase();
      const list = items.filter(it => (tab === 'all' || it.kind === tab) && (!s || it.name.toLowerCase().includes(s)));
      if (!list.length) return grid.replaceChildren(h('div', { class: 'a-empty' }, items.length ? 'ไม่พบไฟล์ที่ตรงกับเงื่อนไข' : 'ยังไม่มีไฟล์'));
      grid.replaceChildren(...list.map(it => {
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
      }));
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
    q.addEventListener('input', draw);
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
    const i = h('input', { type: 'checkbox' }); i.checked = !!obj[key];
    i.addEventListener('change', () => { obj[key] = i.checked; mark(); });
    return h('label', { class: 'a-chk' }, i, label);
  }
  // image or video path with preview, "choose from library" and "upload" buttons
  function imageField(obj, key, label, o) {
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
      h('summary', {}, o.label || 'ตั้งค่า SEO'),
      h('div', { class: 'a-in' },
        field(obj, tk, 'Title (แท็บเบราว์เซอร์ / หัวข้อบน Google)', { max: 60, min: 30, onchange: upd, ph: o.fbT, help: o.fbT ? 'เว้นว่าง = ใช้ค่าอัตโนมัติ (ตัวอย่างสีเทาในช่อง)' : 'แนะนำ 30–60 ตัวอักษร' }),
        field(obj, dk, 'Meta description (คำอธิบายใต้หัวข้อบน Google)', { type: 'textarea', max: 160, min: 70, onchange: upd, ph: o.fbD, help: 'แนะนำ 70–160 ตัวอักษร' }),
        h('div', { class: 'a-g' }, h('small', {}, 'ตัวอย่างบน Google'), g.u, g.t, g.d)));
  }

  // ---------- list editor: drag to reorder, search, collapse all ----------
  function listEditor(arr, spec) {
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
  function bodyEditor(n) {
    const ta = h('textarea', { class: 'big' }); ta.value = n.body || '';
    const sync = () => { n.body = ta.value; mark(); };
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
  function linkCard(obj, key, name, mark2, hint) {
    const chip = h('span', { class: 'a-chip' });
    const open = h('a', { target: '_blank', rel: 'noopener noreferrer', href: '#' }, 'ทดสอบเปิดลิงก์ ↗');
    const inp = h('input', { type: 'url', placeholder: 'https://...' }); inp.value = obj[key] || '';
    const upd = () => { const on = !!inp.value.trim(); chip.textContent = on ? 'ใส่ลิงก์แล้ว' : 'ยังว่าง · ' + hint; chip.className = 'a-chip' + (on ? ' on' : ''); open.style.display = on ? '' : 'none'; open.href = inp.value || '#'; };
    inp.addEventListener('input', () => { obj[key] = inp.value; upd(); mark(); });
    upd();
    return h('div', { class: 'a-lc' }, h('div', { class: 'ic' }, mark2), h('div', {}, h('div', { class: 'row' }, h('b', {}, name), chip), inp, h('div', { style: 'margin-top:8px' }, open)));
  }

  // ---------- sections ----------
  const PN = { rewards: 'Rewards', gameplay: 'Gameplay', drivers: 'Drivers', news: 'News', faq: 'FAQ' };
  const SECTIONS = [
    { id: 'news', g: 'เนื้อหา', label: 'ข่าวสาร', desc: 'เพิ่ม/แก้ไขข่าว กดติ๊ก "เผยแพร่" เมื่อพร้อมขึ้นเว็บ ลากที่ ⋮⋮ เพื่อเรียงลำดับ', paths: ['news'], url: '/news', count: () => C.news.length,
      view: () => listEditor(C.news, {
        addTop: true, title: n => n.title, badge: n => h('span', { class: 'a-bd' + (n.published ? ' on' : '') }, n.published ? 'เผยแพร่' : 'ฉบับร่าง'),
        blank: () => ({ title: '', slug: '', date: new Date().toISOString().slice(0, 10), tag: '', published: false, image: '', excerpt: '', body: '', seoTitle: '', seoDescription: '' }),
        form: (n, u) => [
          field(n, 'title', 'หัวข้อข่าว (H1)', { onchange: u }),
          two(check(n, 'published', 'เผยแพร่ (ติ๊ก = แสดงบนเว็บและ sitemap)'), field(n, 'date', 'วันที่', { type: 'date' })),
          two(field(n, 'tag', 'ป้ายหมวด', { help: 'เช่น ANNOUNCEMENT, EVENT' }), field(n, 'slug', 'URL (slug)', { help: 'เว้นว่าง = สร้างจากหัวข้อ → /news/…' })),
          field(n, 'image', 'รูปหน้าปก', { type: 'image' }),
          field(n, 'excerpt', 'สรุปสั้น (แสดงในการ์ด)', { type: 'textarea' }),
          bodyEditor(n),
          seoBox(n, 'seoTitle', 'seoDescription', { url: () => '/news/' + (n.slug || '…'), fbT: () => (n.title || '') + ' | ' + C.site.name, fbD: () => n.excerpt })]
      }) },
    { id: 'gameplay', g: 'เนื้อหา', label: 'Gameplay', desc: 'การ์ดอธิบายระบบเกม แต่ละใบมีรูปและข้อความ', paths: ['gameplay'], url: '/gameplay', count: () => C.gameplay.length,
      view: () => listEditor(C.gameplay, { title: g => g.title, blank: () => ({ title: '', desc: '', image: '', alt: '' }),
        form: (g, u) => [field(g, 'title', 'หัวข้อ (H3)', { onchange: u }), field(g, 'desc', 'รายละเอียด', { type: 'textarea' }), field(g, 'image', 'รูปภาพ', { type: 'image' }), field(g, 'alt', 'ข้อความอธิบายรูป (alt)', { help: 'ช่วย SEO และผู้ใช้ที่มองไม่เห็น' })] }) },
    { id: 'rewards', g: 'เนื้อหา', label: 'Rewards', desc: 'ของรางวัลตามเป้าหมายการลงทะเบียน ใบสุดท้ายแสดงตัวใหญ่', paths: ['rewards'], url: '/rewards', count: () => C.rewards.length,
      view: () => listEditor(C.rewards, { title: r => (r.milestone ? r.milestone + ' · ' : '') + r.title, blank: () => ({ milestone: '', title: '', desc: '', status: 'LOCKED' }),
        form: (r, u) => [two(field(r, 'milestone', 'เป้าหมาย (เช่น 100K)', { onchange: u }), field(r, 'status', 'สถานะ', { help: 'เช่น LOCKED / UNLOCKED' })), field(r, 'title', 'ชื่อรางวัล (H3)', { onchange: u }), field(r, 'desc', 'รายละเอียด', { type: 'textarea' })] }) },
    { id: 'drivers', g: 'เนื้อหา', label: 'Drivers', desc: 'การ์ดนักซิ่ง/รถ แต่ละใบมีรูป ป้ายมุม และชื่อ', paths: ['drivers'], url: '/drivers', count: () => C.drivers.length,
      view: () => listEditor(C.drivers, { title: d => d.title, blank: () => ({ title: '', desc: '', image: '', pos: 'center', badge: '' }),
        form: (d, u) => [field(d, 'title', 'ชื่อ (H3)', { onchange: u }), field(d, 'desc', 'คำอธิบาย', { type: 'textarea' }), field(d, 'image', 'รูปภาพ', { type: 'image' }),
          two(field(d, 'pos', 'ตำแหน่งรูป (CSS)', { help: 'เช่น center, 30% center' }), field(d, 'badge', 'ป้ายมุมการ์ด', { help: 'เช่น COMING SOON' }))] }) },
    { id: 'faq', g: 'เนื้อหา', label: 'FAQ', desc: 'คำถามที่พบบ่อย ระบบส่งข้อมูลให้ Google แสดงเป็นคำถาม-คำตอบอัตโนมัติ', paths: ['faq'], url: '/faq', count: () => C.faq.length,
      view: () => listEditor(C.faq, { title: f => f.q, blank: () => ({ q: '', a: '' }), form: (f, u) => [field(f, 'q', 'คำถาม (H3)', { onchange: u }), field(f, 'a', 'คำตอบ', { type: 'textarea' })] }) },

    { id: 'home', g: 'หน้าเว็บ', label: 'หน้าแรก', desc: 'หัวข้อ H1 H2 H3 ข้อความอธิบาย ปุ่มลงทะเบียน และ SEO ของหน้าแรก', paths: ['home'], url: '/',
      view: () => [
        box('พื้นหลังหน้าแรก (Hero)', note('วิดีโอเล่นวนเป็นพื้นหลัง รูปใช้แสดงระหว่างรอวิดีโอโหลดและเมื่อวิดีโอเล่นไม่ได้ · เว้นว่าง = ใช้ไฟล์เริ่มต้น'),
          field(C.home, 'heroVideo', 'วิดีโอพื้นหลัง (คอม)', { type: 'video', ph: '/img/rc_burn_v2.mp4', help: 'MP4 (H.264) แนะนำ 1920×1080 ไม่เกิน ~15MB ไม่มีเสียง' }),
          field(C.home, 'heroVideoMobile', 'วิดีโอพื้นหลัง (มือถือ)', { type: 'video', ph: '/img/rc_burn_v2_m.mp4', help: 'ไฟล์เล็กสำหรับมือถือ แนะนำ 720p ไม่เกิน ~3MB · เว้นว่างและตั้งวิดีโอคอมไว้ = ใช้วิดีโอเดียวกับคอม' }),
          field(C.home, 'heroImage', 'รูปพื้นหลัง / รูปสำรอง', { type: 'image', ph: '/img/keyart_rc_v1_web.jpg', help: 'แนะนำ 1920×1080 ขึ้นไป ควรเป็นภาพเดียวกับเฟรมแรกของวิดีโอ' })),
        box('หัวข้อใหญ่', field(C.home, 'badge', 'ป้ายเล็กด้านบน'), field(C.home, 'h1', 'H1'), two(field(C.home, 'h2', 'H2'), field(C.home, 'h3', 'H3 (ตัวสีแดง)')), field(C.home, 'lead', 'ข้อความอธิบาย', { type: 'textarea' })),
        box('ปุ่มลงทะเบียน', two(field(C.home, 'registerText', 'ข้อความบนปุ่ม'), field(C.home, 'registerLink', 'ลิงก์ปุ่ม', { help: 'เว้นว่าง = แสดงข้อความ "เร็วๆ นี้"' })), field(C.home, 'registerMsg', 'ข้อความเมื่อกดปุ่ม (ตอนยังไม่มีลิงก์)')),
        box('ป้ายข้อความอื่นๆ', two(field(C.home, 'storesLabel', 'หัวข้อปุ่มดาวน์โหลด'), field(C.home, 'followLabel', 'หัวข้อโซเชียล')), two(field(C.home, 'soonLabel', 'คำว่า "เร็วๆ นี้บน"'), field(C.home, 'downloadLabel', 'คำว่า "ดาวน์โหลดบน"')), two(field(C.home, 'gameplayMore', 'ปุ่มใต้ส่วน Gameplay (หน้าแรก)', { help: 'หัวข้อและรายการของส่วนนี้แก้ที่เมนู Gameplay / หน้า Gameplay' }), field(C.home, 'latestNewsTitle', 'หัวข้อส่วนข่าวใต้หน้าแรก'))),
        seoBox(C.home, 'seoTitle', 'seoDescription', { url: '/', fbT: () => C.site.defaultTitle, fbD: () => C.site.description })] },
    ...Object.keys(PN).map(k => ({
      id: 'p-' + k, g: 'หน้าเว็บ', label: 'หน้า ' + PN[k], desc: 'ชื่อในเมนู หัวข้อ H1/H2 ย่อหน้าแนะนำ และ SEO ของหน้า /' + k, paths: ['pages.' + k], url: '/' + k,
      view: () => [
        box('หัวข้อหน้า', two(field(C.pages[k], 'navLabel', 'ชื่อในเมนู'), field(C.pages[k], 'eyebrow', 'ข้อความเล็กเหนือหัวข้อ')), field(C.pages[k], 'h1', 'H1'), field(C.pages[k], 'h2', 'H2 (หัวข้อรอง)'), field(C.pages[k], 'intro', 'ย่อหน้าแนะนำ', { type: 'textarea' }),
          k === 'news' ? field(C.pages[k], 'empty', 'ข้อความเมื่อยังไม่มีข่าว') : null),
        seoBox(C.pages[k], 'seoTitle', 'seoDescription', { url: '/' + k, fbT: () => C.pages[k].h1 + ' | ' + C.site.name, fbD: () => C.site.description })]
    })),

    { id: 'general', g: 'ตั้งค่าเว็บ', label: 'ข้อมูลเว็บ & SEO หลัก', desc: 'ชื่อเว็บ โดเมน รูปแชร์ และค่า SEO เริ่มต้นของทั้งเว็บ', paths: ['site'], url: '/',
      view: () => [
        box('ข้อมูลเว็บไซต์', field(C.site, 'name', 'ชื่อเว็บไซต์', { help: 'แสดงที่โลโก้ ฟุตเตอร์ และต่อท้าย title' }),
          field(C.site, 'url', 'โดเมนหลัก (Canonical)', { help: 'เช่น https://raycitym.com — ใช้ใน canonical, sitemap, og:url ถ้าเว้นว่างจะใช้โดเมนที่เปิดอยู่' }),
          field(C.site, 'logo', 'โลโก้เว็บ', { type: 'image', ph: '/img/logo.png', help: 'แสดงที่เมนูบน ฟุตเตอร์ และหลังบ้าน แนะนำรูปจัตุรัส PNG พื้นหลังโปร่ง อย่างน้อย 256×256 · เว้นว่าง = ใช้โลโก้เริ่มต้น' }),
          field(C.site, 'favicon', 'ไอคอนเว็บ (Favicon)', { type: 'image', ph: '/img/favicon.png', help: 'ไอคอนที่แท็บเบราว์เซอร์/ผลค้นหา Google/หน้าจอมือถือ แนะนำ PNG จัตุรัส 192×192 ขึ้นไป · เว้นว่าง = ใช้ไอคอนเริ่มต้น' }),
          field(C.site, 'ogImage', 'รูปแชร์ (Open Graph)', { type: 'image', help: 'แนะนำ 1200×630' }), field(C.site, 'footer', 'ข้อความท้ายเว็บ (Copyright)')),
        seoBox(C.site, 'defaultTitle', 'description', { open: true, label: 'SEO เริ่มต้น (หน้าแรก)', url: '/' }),
        box('Keywords', field(C.site, 'keywords', 'คำค้น (คั่นด้วยจุลภาค)'))] },
    { id: 'links', g: 'ตั้งค่าเว็บ', label: 'ลิงก์โซเชียล & ดาวน์โหลด', desc: 'ใส่ลิงก์แล้วปุ่มบนหน้าแรกกดไปลิงก์นั้นทันที เว้นว่าง = แสดง "เร็วๆ นี้"', paths: ['links'], url: '/',
      view: () => [
        box('ลิงก์ดาวน์โหลด', note('ใส่ลิงก์แล้วป้าย SOON จะหายไปจากปุ่มนั้น'),
          linkCard(C.links.download, 'windows', 'Windows PC', 'WIN', 'แสดง SOON'), linkCard(C.links.download, 'ios', 'App Store', 'iOS', 'แสดง SOON'), linkCard(C.links.download, 'android', 'Google Play', 'AND', 'แสดง SOON')),
        box('ลิงก์โซเชียล',
          linkCard(C.links.social, 'facebook', 'Facebook', 'FB', 'ปุ่มกด = เร็วๆ นี้'), linkCard(C.links.social, 'tiktok', 'TikTok', 'TT', 'ปุ่มกด = เร็วๆ นี้'),
          linkCard(C.links.social, 'discord', 'Discord', 'DC', 'ปุ่มกด = เร็วๆ นี้'), linkCard(C.links.social, 'youtube', 'YouTube', 'YT', 'ปุ่มกด = เร็วๆ นี้'))] },
    { id: 'media', g: 'ตั้งค่าเว็บ', label: 'คลังรูป & วิดีโอ', desc: 'ไฟล์รูปและวิดีโอทั้งหมดบนเว็บ อัปโหลด ดูตัวอย่าง คัดลอกลิงก์ หรือลบไฟล์ที่อัปโหลดเอง (ไฟล์ระบบใน /img ลบจากที่นี่ไม่ได้)', paths: [],
      view: () => mediaLibrary({ kind: 'all' }) },
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
    { id: 'account', g: 'ตั้งค่าเว็บ', label: 'บัญชีแอดมิน', desc: 'เปลี่ยนรหัสผ่านผู้ดูแลระบบ', paths: [],
      view: () => {
        const cur0 = h('input', { type: 'password', autocomplete: 'current-password' }), n1 = h('input', { type: 'password', autocomplete: 'new-password' }), n2 = h('input', { type: 'password', autocomplete: 'new-password' });
        const msg = h('div', { class: 'a-err' });
        return box('เปลี่ยนรหัสผ่าน', h('label', { class: 'a-f' }, 'รหัสผ่านปัจจุบัน', cur0), h('label', { class: 'a-f' }, 'รหัสผ่านใหม่ (อย่างน้อย 10 ตัวอักษร)', n1), h('label', { class: 'a-f' }, 'ยืนยันรหัสผ่านใหม่', n2), msg,
          h('div', {}, h('button', { class: 'btn sm', type: 'button', onclick: async () => {
            if (n1.value !== n2.value) { msg.textContent = 'รหัสผ่านใหม่ไม่ตรงกัน'; return; }
            try { await api('password', 'POST', { current: cur0.value, next: n1.value }); msg.textContent = ''; cur0.value = n1.value = n2.value = ''; toast('เปลี่ยนรหัสผ่านแล้ว'); } catch (e) { msg.textContent = e.message; }
          } }, 'บันทึกรหัสผ่าน')));
      } }
  ];
  const sec = id => SECTIONS.find(s => s.id === id);

  // ---------- screens ----------
  function loginScreen(err) {
    const u = h('input', { type: 'text', autocomplete: 'username', required: true }), p = h('input', { type: 'password', autocomplete: 'current-password', required: true });
    const m = h('div', { class: 'a-err' }, err || '');
    const f = h('form', {}, h('img', { src: '/img/logo.png', alt: '' }), h('h1', { class: 'disp' }, 'Admin Login'),
      h('label', { class: 'a-f' }, 'ชื่อผู้ใช้', u), h('label', { class: 'a-f' }, 'รหัสผ่าน', p), m, h('button', { class: 'btn', type: 'submit' }, 'เข้าสู่ระบบ'));
    f.addEventListener('submit', async e => { e.preventDefault(); try { await api('login', 'POST', { user: u.value, password: p.value }); start(); } catch (x) { m.textContent = x.message; } });
    app.replaceChildren(h('div', { class: 'a-login' }, f)); u.focus();
  }

  function render() {
    const s = sec(cur);
    navBtns = {};
    const groups = [];
    for (const x of SECTIONS) { if (!groups.includes(x.g)) groups.push(x.g); }
    const side = h('aside', { class: 'a-side' },
      h('div', { class: 'a-brand' }, h('img', { src: C.site.logo || '/img/logo.png', alt: '' }), h('div', {}, h('b', {}, C.site.name || 'Admin'), h('small', {}, 'ADMIN'))),
      ...groups.flatMap(g => [h('div', { class: 'a-grp' }, g), ...SECTIONS.filter(x => x.g === g).map(x => {
        const b = h('button', { class: 'a-nav' + (x.id === cur ? ' on' : '') + (dirty.has(x.id) ? ' dirty' : ''), onclick: () => { cur = x.id; render(); if (innerWidth <= 900) document.querySelector('.a-main').scrollIntoView(); else window.scrollTo(0, 0); } },
          h('span', {}, x.label), x.count ? h('em', { class: 'n', style: 'font-style:normal' }, String(x.count())) : null, h('i'));
        navBtns[x.id] = b; return b;
      })]),
      h('div', { class: 'a-grow' }),
      h('div', { class: 'a-foot-nav' },
        h('button', { class: 'a-nav', onclick: () => window.open('/', '_blank') }, h('span', {}, 'ดูเว็บไซต์ ↗')),
        h('button', { class: 'a-nav', onclick: async () => { if (dirty.size && !confirm('มีการแก้ไขที่ยังไม่บันทึก ออกจากระบบ?')) return; try { await api('logout', 'POST'); } catch (e) {} csrf = ''; dirty.clear(); loginScreen(); } }, h('span', {}, 'ออกจากระบบ'))));

    const head = h('div', { class: 'a-head' },
      h('div', {}, h('span', { class: 'eyebrow' }, s.g), h('h1', { class: 'disp' }, s.label), h('p', {}, s.desc)),
      s.url ? h('div', { class: 'acts' }, h('a', { class: 'ghost sm', href: s.url, target: '_blank', rel: 'noopener' }, 'ดูหน้านี้ ↗')) : null);
    const view = [].concat(s.view());
    const main = h('main', { class: 'a-main' }, head, ...view);

    barEls = { st: h('span', { class: 'st' }) };
    const bar = s.paths.length ? h('div', { class: 'a-bar' }, barEls.st,
      (barEls.all = h('button', { class: 'ghost sm', type: 'button', style: 'display:none', onclick: () => save([...dirty]) }, '')),
      (barEls.one = h('button', { class: 'btn sm', type: 'button', onclick: () => save([cur]) }, 'บันทึกส่วนนี้'))) : null;
    app.replaceChildren(h('div', { class: 'a-shell' }, side, main, bar));
    if (bar) { setStatus(dirty.has(cur) ? 'มีการแก้ไขที่ยังไม่บันทึก' : 'ไม่มีการเปลี่ยนแปลง', dirty.has(cur) ? 'warn' : ''); refreshChrome(); }
  }

  async function save(ids) {
    ids = ids.filter(id => sec(id).paths.length);
    if (!ids.length) return;
    try {
      const body = clone(saved);
      for (const id of ids) for (const p of sec(id).paths) setPath(body, p, clone(getPath(C, p)));
      const res = await api('content', 'PUT', body);
      saved = res;
      for (const id of ids) { for (const p of sec(id).paths) setPath(C, p, clone(getPath(res, p))); dirty.delete(id); }
      toast('บันทึกแล้ว ✓');
      render(); setStatus('บันทึกแล้ว ✓ ' + new Date().toLocaleTimeString('th-TH'), 'ok');
    } catch (e) {
      if (e.status === 401) return loginScreen('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
      setStatus('บันทึกไม่สำเร็จ: ' + e.message, 'err');
    }
  }
  addEventListener('beforeunload', e => { if (dirty.size) { e.preventDefault(); e.returnValue = ''; } });
  addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 's' && C) { e.preventDefault(); save([cur]); } });

  async function start() {
    try { csrf = (await api('me')).csrf; saved = await api('content'); C = clone(saved); dirty.clear(); render(); } catch (e) { loginScreen(); }
  }
  start();
})();

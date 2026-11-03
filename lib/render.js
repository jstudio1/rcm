// Server-side rendering: every public page is plain HTML (good for SEO), built from data/content.json.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const icons = require('../views/icons.json');
const PUB = path.join(__dirname, '..', 'public');

// ---- small file helpers (results cached until the file changes) ----
const fcache = new Map();
function fileInfo(rel, make) {
  const file = path.join(PUB, rel);
  if (!file.startsWith(PUB + path.sep)) return null;
  let st; try { st = fs.statSync(file); } catch (e) { return null; }
  const k = make.name + '|' + rel, hit = fcache.get(k);
  if (hit && hit.m === st.mtimeMs) return hit.v;
  let v = null; try { v = make(file); } catch (e) {}
  if (fcache.size > 500) fcache.clear();
  fcache.set(k, { m: st.mtimeMs, v });
  return v;
}
// "/style.css" -> "/style.css?v=3f9a1c2b7d": the browser may cache it for a year, a new version gets a new URL
const asset = rel => { const v = fileInfo(rel, function hash(f) { return crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 10); }); return v ? rel + '?v=' + v : rel; };
// pixel size of a local PNG/JPEG/WebP/GIF, read from its header (for width/height attributes and og:image)
function dims(f) {
  const fd = fs.openSync(f, 'r'), b = Buffer.alloc(65536); const n = fs.readSync(fd, b, 0, b.length, 0); fs.closeSync(fd);
  if (b.slice(0, 4).toString('hex') === '89504e47') return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.slice(0, 3).toString() === 'GIF') return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
  if (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') {
    const t = b.slice(12, 16).toString();
    if (t === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (t === 'VP8L') { const v = b.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
    if (t === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i < n - 9;) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1], len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  }
  return null;
}
// (a malformed %-escape typed in the admin must not break the page, so decoding failures just mean "size unknown")
const sizeOf = u => { if (!/^\/(img|uploads)\/[^?#]+$/.test(u || '')) return null; try { return fileInfo(decodeURIComponent(u), dims); } catch (e) { return null; } };
// self-hosted font faces, inlined into <head> so text can start rendering without an extra request
const fontCss = () => fileInfo('/fonts.css', function read(f) { return fs.readFileSync(f, 'utf8').replace(/\/\*[^*]*\*\//g, '').replace(/\s+/g, ' '); }) || '';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Allowed: http(s) links, site paths, #anchors, mailto. Backslashes and control/space characters are refused
// because browsers turn "/\evil.com" or "/<tab>/evil.com" into a link to another site.
const safeUrl = u => {
  u = String(u || '').trim();
  if (/[\\\u0000- \u007f]/.test(u)) return '';
  if (/(^|\/)(\.|%2e){2}(\/|%2f|$)/i.test(u)) return ''; // no "../" tricks to point outside the image folders
  return /^(https?:\/\/[^/]|\/(?!\/)|#|mailto:)/i.test(u) ? u : '';
};
// for url('...') inside a style attribute: CSS-escape the risky characters, then HTML-escape the result
const cssUrl = u => esc(safeUrl(u).replace(/[()'"\s\\&<>]/g, ch => encodeURIComponent(ch)));
const j = o => JSON.stringify(o).replace(/</g, '\\u003c');
const PAGES = ['rewards', 'gameplay', 'drivers', 'news', 'faq'];
const fmtDate = d => { const t = new Date(d); return isNaN(t) ? '' : t.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }); };
// speaker icons for the sound-effects toggle (Material Icons, Apache 2.0)
const SPK_ON = 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z';
const SPK_OFF = 'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z';
const svg = k =>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[k]}"/></svg>`;

// news body: blank line = paragraph, "## " = h2, "### " = h3
// inline: **bold**, [text](link). Everything is escaped first, links must pass safeUrl.
const inline = t => esc(t)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, url) => { const u = safeUrl(url.replace(/&amp;/g, '&')); return u ? `<a href="${esc(u)}" rel="noopener">${txt}</a>` : txt; });
function body(text) {
  return String(text || '').replace(/\r/g, '').split(/\n{2,}/).map(block => {
    const lines = block.split('\n').filter(l => l.trim());
    let out = '', para = [], ul = [];
    const flush = () => {
      if (para.length) { out += '<p>' + para.map(inline).join('<br>') + '</p>'; para = []; }
      if (ul.length) { out += '<ul>' + ul.map(i => '<li>' + inline(i) + '</li>').join('') + '</ul>'; ul = []; }
    };
    for (const l of lines) {
      let m;
      if (/^###\s+/.test(l)) { flush(); out += '<h3>' + inline(l.replace(/^###\s+/, '')) + '</h3>'; }
      else if (/^##\s+/.test(l)) { flush(); const t = l.replace(/^##\s+/, ''), hid = /\s*\{#([\w-]{1,40})\}\s*$/.exec(t); out += `<h2${hid ? ` id="${hid[1]}"` : ''}>` + inline(hid ? t.slice(0, hid.index) : t) + '</h2>'; }
      else if ((m = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(l)) && safeUrl(m[2])) { flush(); out += `<img class="hero-img" src="${esc(safeUrl(m[2]))}" alt="${esc(m[1])}" loading="lazy">`; }
      else if (/^[-*]\s+/.test(l)) { if (para.length) flush(); ul.push(l.replace(/^[-*]\s+/, '')); }
      else { if (ul.length) flush(); para.push(l); }
    }
    flush();
    return out;
  }).join('\n');
}

// logo / favicon come from the admin (Site settings); fall back to the bundled files
const logoOf = c => safeUrl(c.site.logo) || '/img/logo.png';
const iconOf = c => safeUrl(c.site.favicon) || '/img/favicon.png';
// home hero background; empty fields fall back to the built-in files
const HERO_DEFAULTS = { heroVideo: '/img/rc_burn_v2_hd.mp4', heroVideoMobile: '/img/rc_burn_v2_m.mp4', heroImage: '/img/keyart_rc_v1_web.jpg' };
const heroMedia = (h, k) => safeUrl(h[k]) || (h[k] ? '' : HERO_DEFAULTS[k]);

function ctx(c, base, lang) {
  const name = c.site.name || 'Website';
  const abs = u => { u = safeUrl(u); return !u ? '' : u.startsWith('/') ? base + u : u; };
  return { c, base, name, abs, lang: (lang || c.__lang) === 'en' ? 'en' : 'th' };
}

// ---------- English version of the whole site (/en/...) ----------
// Every Thai text field may have an "...En" twin saved next to it; the English pages use the twin when it is filled in
// and the Thai text when it is not, so a half-translated site never shows an empty hole.
const withEn = o => {
  const r = Object.assign({}, o);
  for (const k of Object.keys(o)) if (k.length > 2 && k.endsWith('En') && typeof o[k] === 'string' && o[k].trim() && k.slice(0, -2) in o) r[k.slice(0, -2)] = o[k];
  return r;
};
const localized = new WeakMap();
function localize(c) {
  if (localized.has(c)) return localized.get(c);
  const pages = {};
  for (const k of Object.keys(c.pages)) pages[k] = ['rewards', 'gameplay', 'drivers', 'news'].includes(k) ? withEn(c.pages[k]) : Object.assign({}, c.pages[k], { navLabel: String(c.pages[k].navLabelEn || '').trim() || c.pages[k].navLabel });
  const lc = Object.assign({}, c, { __lang: 'en', site: withEn(c.site), home: withEn(c.home), prereg: withEn(c.prereg || {}), pages });
  for (const k of ['news', 'gameplay', 'drivers', 'rewards']) lc[k] = c[k].map(withEn);
  localized.set(c, lc);
  return lc;
}
// the pages that exist in both languages, and where the other-language twin of a path lives
const TWIN = /^\/(news(\/[^/]+)?|gameplay|drivers|rewards)?$/;
const plain = p => p.replace(/^\/en(?=\/|$)/, '') || '/';
const enHref = p => '/en' + (p === '/' ? '' : p);
function enTwin(c, p) {
  p = plain(p);
  if (TWIN.test(p)) return enHref(p);
  const k = Object.keys(LEGAL_PATH).find(x => LEGAL_PATH[x] === p);
  return k && hasEnglish(c, k) ? enHref(p) : '/en';
}
// links inside an English page stay inside the English site
const enLinks = (html, c) => html.replace(new RegExp('(?<!<p class="lang-switch"><a )href="/(news(?:/[^"]*)?|gameplay|drivers|rewards' + (hasEnglish(c, 'faq') ? '|faq' : '') + ')?"', 'g'), (m, p) => `href="/en${p ? '/' + p : ''}"`);

// values typed into the admin's SEO tools, accepted only in their expected shape
const GA_RE = /^G-[A-Z0-9]{4,15}$/, VERIFY_RE = /^[\w-]{8,120}$/, HANDLE_RE = /^@?\w{1,15}$/;
const on = v => v === true || v === 'true' || v === '1';

function head(x, o) {
  const { c, base, abs, name } = x;
  const s = c.site;
  const title = o.title || s.defaultTitle || name;
  const desc = o.description || s.description || '';
  const imgPath = safeUrl(o.image) || safeUrl(s.ogImage);
  const img = abs(imgPath), size = sizeOf(imgPath);
  const url = base + (x.lang === 'en' && !/^\/en(\/|$)/.test(o.path) ? enHref(o.path) : o.path);
  const sameAs = Object.values(c.links.social).map(safeUrl).filter(Boolean);
  const ld = [{ '@context': 'https://schema.org', '@type': 'Organization', name, url: base + '/', logo: abs(logoOf(c)), sameAs }]
    .concat(o.path === '/' ? [{ '@context': 'https://schema.org', '@type': 'WebSite', name, url: base + '/', inLanguage: x.lang }] : [])
    .concat(o.jsonld || []);
  const tw = HANDLE_RE.test(s.twitter || '') ? '@' + s.twitter.replace(/^@/, '') : '';
  const ga = GA_RE.test(s.ga4 || '') && !bannerOn(c) ? s.ga4 : '';
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="${o.noindex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'}">
<link rel="canonical" href="${esc(url)}">
${(o.alternates || []).map(([l, u]) => `<link rel="alternate" hreflang="${l}" href="${esc(base + u)}">`).join('\n')}
${VERIFY_RE.test(s.googleVerify || '') ? `<meta name="google-site-verification" content="${esc(s.googleVerify)}">` : ''}
${VERIFY_RE.test(s.bingVerify || '') ? `<meta name="msvalidate.01" content="${esc(s.bingVerify)}">` : ''}
<meta property="og:locale" content="${x.lang === 'en' ? 'en_US' : 'th_TH'}">
<meta property="og:site_name" content="${esc(name)}">
<meta property="og:type" content="${o.ogType || 'website'}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
${img ? `<meta property="og:image" content="${esc(img)}">${size ? `\n<meta property="og:image:width" content="${size.w}">\n<meta property="og:image:height" content="${size.h}">` : ''}\n<meta property="og:image:alt" content="${esc(o.imageAlt || title)}">` : ''}
${(o.meta || []).map(([k, v]) => v ? `<meta property="${k}" content="${esc(v)}">` : '').join('\n')}
<meta name="twitter:card" content="summary_large_image">
${tw ? `<meta name="twitter:site" content="${esc(tw)}">` : ''}
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
${img ? `<meta name="twitter:image" content="${esc(img)}">` : ''}
<meta name="theme-color" content="#0b0c10">
<link rel="icon" href="${esc(iconOf(c))}">
<link rel="shortcut icon" href="/favicon.ico">
<link rel="apple-touch-icon" href="${esc(safeUrl(s.favicon) || '/img/apple-touch-icon.png')}">
<link rel="preload" href="/fonts/barlow-condensed-800-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/kanit-300-thai.woff2" as="font" type="font/woff2" crossorigin>
${o.preload ? `<link rel="preload" as="image" href="${esc(o.preload)}" fetchpriority="high">` : ''}
<style>${fontCss()}</style>
<link rel="stylesheet" href="${asset('/style.css')}">
${ga ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${ga}"></script>\n<script src="${asset('/ga.js')}" data-ga="${ga}"></script>` : ''}
${ld.map(o2 => `<script type="application/ld+json">${j(o2)}</script>`).join('\n')}`.replace(/\n{2,}/g, '\n');
}
// "Home > Page" trail for Google results
const crumbs = (x, trail) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [[x.lang === 'en' ? 'Home' : 'หน้าแรก', '/']].concat(trail).map(([n, u], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: x.base + (x.lang === 'en' && !/^\/en(\/|$)/.test(u) ? enHref(u) : u) })) });
// shared settings for the simple pages (rewards, gameplay, drivers, news, faq)
const pageOpts = (x, k, extra) => {
  const p = x.c.pages[k];
  return Object.assign({ path: '/' + k, active: k, title: pageTitle(x, p), description: p.seoDescription, image: p.ogImage, noindex: on(p.noindex), jsonld: [crumbs(x, [[p.navLabel || p.h1, '/' + k]])] }, extra || {});
};
// <img> with lazy loading and its real size (so the page doesn't jump while images arrive)
function imgTag(u, alt, cls, more) {
  u = safeUrl(u);
  if (!u) return `<div class="${cls}"></div>`;
  const sz = sizeOf(u);
  return `<img class="${cls}" src="${esc(u)}" alt="${esc(alt)}"${sz ? ` width="${sz.w}" height="${sz.h}"` : ''} loading="lazy" decoding="async"${more || ''}>`;
}

const portalMod = require('./portal');
// TH | EN switch; the real targets are filled in by shell() once the page path is known
const LANG_MARK = '<!--LANG-->';
function langSwitch2(x, path) {
  const en = x.lang === 'en', t = plain(path) === '/404' ? '/' : plain(path);
  return `<div class="lang" role="group" aria-label="Language"><a href="${esc(t)}" lang="th" hreflang="th"${en ? '' : ' class="on" aria-current="true"'}>TH</a><a href="${esc(enTwin(x.c, t))}" lang="en" hreflang="en"${en ? ' class="on" aria-current="true"' : ''}>EN</a></div>`;
}
function header(x, active) {
  const { c, name } = x, en = x.lang === 'en';
  const home = en ? '/en' : '/', signIn = en ? 'Sign in' : (c.portal || {}).navLabel || 'เข้าสู่ระบบ';
  const acct = portalMod.enabled(c) ? `<a class="acct-link" href="/account">${esc(signIn)}</a>` : '';
  const links = PAGES.map(k => `<a href="/${k}"${active === k ? ' class="act"' : ''}>${esc(c.pages[k].navLabel || k.toUpperCase())}</a>`).join('');
  const drawer = PAGES.map(k => `<a href="/${k}">${esc(c.pages[k].navLabel || k)}</a>`).join('') + (portalMod.enabled(c) ? `<a href="/account">${esc(signIn)}</a>` : '');
  return `<header class="nav${active === 'home' ? '' : ' solid'}" id="nav"><div class="wrap">
  <a class="logo" href="${home}" aria-label="${esc(name)}"><img class="lg" src="${esc(logoOf(c))}" width="54" height="54" alt=""><b>${esc(name)}</b></a>
  <nav class="menu" aria-label="${en ? 'Main menu' : 'เมนูหลัก'}">${links}</nav>
  <div class="right">${acct}${LANG_MARK}<a class="ob" href="/rewards">${esc(c.home.badge ? 'COMING SOON' : 'MENU')}</a><button class="burger" id="burger" aria-label="${en ? 'Open menu' : 'เปิดเมนู'}" aria-expanded="false"><span></span><span></span><span></span></button></div>
</div></header>
<div class="drawer" id="drawer">${drawer}${LANG_MARK}</div>`;
}

// ---------- the store-related pages and how they link to each other ----------
const LEGAL_PATH = { privacy: '/privacy', terms: '/terms', support: '/support', faq: '/faq', delete: '/delete-account', odds: '/odds' };
const LEGAL_EN_NAME = { privacy: 'Privacy Policy', terms: 'Terms of Service', support: 'Support', faq: 'FAQ', delete: 'Delete account', odds: 'Loot box odds' };
const LEGAL_ORDER = ['privacy', 'terms', 'support', 'faq', 'delete', 'odds'];
// a page "exists" (is linked, listed in the sitemap, offered as a token) once it has a title and text;
// the account-deletion and loot-box pages stay out of every link until someone writes them
function pageExists(c, k) {
  const p = c.pages[k];
  if (!p || on(p.noindex) || !LEGAL_PATH[k]) return false;
  if (k === 'faq') return !!(p.h1 && (c.faq || []).length);
  return !!(p.h1 && String(p.body || '').trim());
}
function hasEnglish(c, k) {
  const p = c.pages[k];
  if (!p || !pageExists(c, k)) return false;
  if (k === 'faq') return !!(p.h1En && (c.faq || []).some(f => f.qEn && f.aEn));
  return !!String(p.bodyEn || '').trim();
}
const legalHref = (c, k, en) => (en && hasEnglish(c, k) ? '/en' : '') + LEGAL_PATH[k];
const legalLabel = (c, k, en) => (en ? c.pages[k].navLabelEn || LEGAL_EN_NAME[k] : c.pages[k].navLabel || c.pages[k].h1);
// a row of links to the other store-related pages, shown at the bottom of privacy / terms / support / FAQ
function relatedPages(x, current) {
  const c = x.c, en = x.lang === 'en';
  const items = LEGAL_ORDER.filter(k => k !== current && pageExists(c, k)).map(k => `<a href="${legalHref(c, k, en)}">${esc(legalLabel(c, k, en))}</a>`);
  const t = en ? 'Related pages' : 'หน้าที่เกี่ยวข้อง';
  return items.length ? `<nav class="legal-rel" aria-label="${t}"><b>${t}</b>${items.join('')}</nav>` : '';
}

function footer(x) {
  const { c, name } = x, ct = c.contact || {}, ck = c.cookies || {}, en = x.lang === 'en';
  const lk = k => (pageExists(c, k) ? `<a href="${legalHref(c, k, en)}">${esc(legalLabel(c, k, en))}</a>` : '');
  const legal = [
    lk('privacy'), lk('terms'), lk('support'), lk('delete'), lk('odds'),
    bannerOn(c) ? `<button type="button" class="cc-open" data-cc-open>${esc((en && ck.settingsLinkEn) || ck.settingsLink || 'ตั้งค่าคุกกี้')}</button>` : ''
  ].filter(Boolean).join('');
  const who = [esc(ct.company || ''), EMAIL_RE.test(ct.email || '') ? `<a href="mailto:${esc(ct.email)}">${esc(ct.email)}</a>` : ''].filter(Boolean).join(' · ');
  return `<footer class="foot"><div class="wrap">
  <a class="fl" href="/"><img src="${esc(logoOf(c))}" width="44" height="44" alt="" loading="lazy" decoding="async">${esc(name)}</a>
  <nav aria-label="footer">${PAGES.map(k => `<a href="/${k}">${esc(c.pages[k].navLabel || k)}</a>`).join('')}</nav>
  ${legal ? `<div class="legal-links">${legal}</div>` : ''}
  <small>${esc(c.site.footer)}${who ? ` · ${who}` : ''}</small>
</div></footer>`;
}

// Loading screen (admin: Site settings > loading screen), styled like the in-game launcher:
// blurred key art, logo, and the launcher's bottom bar (LOADING -> READY, progress bar, rotating tips,
// WAITING + START GAME). When ready, the art sharpens and fades into the home page's identical hero art.
// Hidden unless loader.js runs, so visitors without JavaScript (and plain crawlers) see the page directly.
// rev gauge for the "tacho" design: 0-9 (x1000 rpm) over 240 degrees, red zone from 7
function tachoSvg() {
  const C = 150, R = 118, pt = (deg, r) => [C + r * Math.sin(deg * Math.PI / 180), C - r * Math.cos(deg * Math.PI / 180)].map(n => n.toFixed(1));
  const ang = v => -120 + v / 9 * 240;
  let ticks = '';
  for (let v = 0; v <= 9; v += 0.5) {
    const major = v % 1 === 0, [x1, y1] = pt(ang(v), R), [x2, y2] = pt(ang(v), R - (major ? 16 : 8));
    ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${major ? 'mj' : 'mn'}${v >= 7 ? ' rz' : ''}"/>`;
    if (major) { const [tx, ty] = pt(ang(v), R - 32); ticks += `<text x="${tx}" y="${(+ty + 6).toFixed(1)}" class="${v >= 7 ? 'rz' : ''}">${v}</text>`; }
  }
  const [ax, ay] = pt(ang(7), R + 6), [bx, by] = pt(ang(9), R + 6);
  return `<svg class="ldr-gauge" viewBox="0 0 300 300" aria-hidden="true">
    <circle cx="150" cy="150" r="140" class="face"/><path d="M${ax} ${ay} A${R + 6} ${R + 6} 0 0 1 ${bx} ${by}" class="redarc"/>${ticks}
    <g class="ldr-needle"><path d="M147 154 L150 44 L153 154 Z"/><circle cx="150" cy="150" r="13"/></g>
  </svg>`;
}
// city skyline silhouette for the "neon" design
const SKYLINE = 'M0 100V62h18V40h14v22h10V30h20v32h8V48h16v52zM90 100V56h12V22h18v34h10V44h22v56zM160 100V40h16V12h6v28h14v60zM210 100V58h20V34h16v24h12V50h22v50zM290 100V26h22v36h10V46h18v54zM350 100V60h16V36h20v24h10V18h14v82zM420 100V50h18v-8h16v58zM466 100V30h20v32h14v38z';
const LOADER_STYLES = ['launcher', 'tacho', 'headlights', 'neon', 'tuktuk', 'tukglow', 'tuklong', 'tukxl', 'tukmid', 'tukfast'];
// one inner layout per design; all of them talk to the shared loader.js through the same hooks
const loaderBody = {
  launcher: x => `<div class="ldr-bg" style="background-image:url('${cssUrl(heroMedia(x.c.home, 'heroImage'))}')"></div>
  <div class="ldr-shade"></div>
  <img class="ldr-logo" src="${esc(logoOf(x.c))}" width="128" height="128" alt="">
  <div class="ldr-dock"><div class="ldr-dk">
    <div class="ldr-l"><b class="ldr-st" data-ready="READY">LOADING</b><div class="ldr-track" aria-hidden="true"><i class="ldr-fill"></i></div><span class="ldr-tip">${x.lang === 'en' ? 'Preparing the track…' : 'กำลังเตรียมสนามแข่ง…'}</span></div>
    <div class="ldr-r"><span class="ldr-wait" data-ready="PRESS START">WAITING</span><button class="ldr-go" type="button" disabled>START GAME</button>
      <div class="ldr-meta"><span class="ldr-pct">0%</span><span>${esc(x.name)}</span><span>TH</span></div></div>
  </div></div>`,
  tacho: x => `<div class="tc-wrap">
    <div class="tc-leds" data-lit aria-hidden="true">${'<i></i>'.repeat(10)}</div>
    <div class="tc-dial">${tachoSvg()}
      <div class="tc-read"><span class="tc-gear" data-steps="N,1,2,3,4,5,6">N</span><b class="ldr-pct">0%</b><small>x1000 RPM</small></div>
    </div>
    <img class="tc-logo" src="${esc(logoOf(x.c))}" width="64" height="64" alt="">
    <b class="ldr-st tc-st" data-ready="READY TO RACE">IGNITION</b>
  </div>`,
  headlights: x => `<div class="hl-beam" aria-hidden="true"><i class="lamp l"></i><i class="lamp r"></i></div>
  <div class="hl-trails" aria-hidden="true">${'<i></i>'.repeat(9)}</div>
  <div class="hl-center"><span class="hl-logo"><img src="${esc(logoOf(x.c))}" width="150" height="150" alt=""></span>
    <div class="hl-line" aria-hidden="true"><i class="ldr-fill"></i></div>
    <div class="hl-txt"><b class="ldr-st" data-ready="READY">LOADING</b><span class="ldr-pct">0%</span></div></div>
  <i class="hl-flash" aria-hidden="true"></i>`,
  // racing tuk-tuk photo (public/img/loader_tuktuk_v2.jpg, 900x1600). The same picture is stacked in layers:
  // a very dark base, a spotlit top, the lamps only (masked), and the whole car lit up; light glows sit
  // on the lamps' measured positions (% of the photo) so they line up at any screen size.
  tuktuk: () => `<img class="tt-pre" src="/img/loader_tuktuk_v2.jpg" alt="" fetchpriority="high" decoding="async">
  <i class="tt-amb" aria-hidden="true"></i>
  <div class="tt-photo" aria-hidden="true">
    <i class="tt-layer tt-base"></i><i class="tt-layer tt-spot"></i><i class="tt-layer tt-lamps"></i><i class="tt-layer tt-full"></i>
    <i class="tt-glow gd"></i><i class="tt-glow sg"></i>
    <div class="tt-crank"><i class="tt-layer tt-heads"></i><i class="tt-glow hl l"></i><i class="tt-glow hl r"></i></div>
    <i class="tt-flare"></i>
  </div>
  <div class="tt-haze" aria-hidden="true"></div>
  <div class="tt-hud"><b class="ldr-st tt-st" data-steps="IGNITION,FUEL PUMP ON,CRANKING…,CRANKING…" data-ready="ENGINE START">IGNITION</b>
    <div class="tt-bar" aria-hidden="true"><i class="ldr-fill"></i></div><span class="ldr-pct tt-pct">0%</span></div>
  <i class="tt-cut t" aria-hidden="true"></i><i class="tt-cut b" aria-hidden="true"></i><i class="tt-seam" aria-hidden="true"></i>`,
  // same tuk-tuk photo, but the scene starts pitch black: only the headlights ignite, and the light spreads
  // outward from them (a growing radial mask driven by --p) until the whole car is lit. Leaves by going dark.
  tukglow: () => `<img class="tt-pre" src="/img/loader_tuktuk_v2.jpg" alt="" fetchpriority="high" decoding="async">
  <i class="tg-amb" aria-hidden="true"></i>
  <div class="tg-photo" aria-hidden="true">
    <i class="tg-lit"></i>
    <div class="tg-lamps"><i class="tg-bloom l"></i><i class="tg-bloom r"></i><i class="tg-core l"></i><i class="tg-core r"></i><i class="tg-streak"></i></div>
  </div>
  <div class="tg-hud"><b class="ldr-st tg-st" data-steps="IGNITION,LIGHTS ON,CRANKING…,CRANKING…" data-ready="ENGINE START">IGNITION</b>
    <div class="tg-bar" aria-hidden="true"><i class="ldr-fill"></i></div><span class="ldr-pct tg-pct">0%</span></div>`,
  // slow version of tukglow: about a second of pure black, then the headlights burn alone in the dark for a
  // while before their light spreads over the car (longer loading via data-min). Ends bright: the lit car
  // cross-fades straight into the site, no fade to black.
  tuklong: () => `<img class="tt-pre" src="/img/loader_tuktuk_v2.jpg" alt="" fetchpriority="high" decoding="async">
  <i class="tl-amb" aria-hidden="true"></i>
  <div class="tl-photo" aria-hidden="true">
    <i class="tl-lit"></i>
    <div class="tl-lamps"><i class="tl-bloom l"></i><i class="tl-bloom r"></i><i class="tl-core l"></i><i class="tl-core r"></i><i class="tl-streak"></i></div>
  </div>
  <div class="tl-hud"><b class="ldr-st tl-st" data-steps="IGNITION,IGNITION,LIGHTS ON,LIGHTS ON,CRANKING…,CRANKING…" data-ready="ENGINE START">IGNITION</b>
    <div class="tl-bar" aria-hidden="true"><i class="ldr-fill"></i></div><span class="ldr-pct tl-pct">0%</span></div>`,
  // extra-slow version: ~1.5s of pure black, the headlights burn alone in the dark until ~4s, then the light
  // spreads over the car (data-min 6000). Ends bright, cross-fading straight into the site.
  tukxl: () => `<img class="tt-pre" src="/img/loader_tuktuk_v2.jpg" alt="" fetchpriority="high" decoding="async">
  <i class="tx-amb" aria-hidden="true"></i>
  <div class="tx-photo" aria-hidden="true">
    <i class="tx-lit"></i>
    <div class="tx-lamps"><i class="tx-bloom l"></i><i class="tx-bloom r"></i><i class="tx-core l"></i><i class="tx-core r"></i><i class="tx-streak"></i></div>
  </div>
  <div class="tx-hud"><b class="ldr-st tx-st" data-steps="IGNITION,IGNITION,LIGHTS ON,LIGHTS ON,LIGHTS ON,CRANKING…,CRANKING…" data-ready="ENGINE START">IGNITION</b>
    <div class="tx-bar" aria-hidden="true"><i class="ldr-fill"></i></div><span class="ldr-pct tx-pct">0%</span></div>`,
  // medium version: under a second of pure black, the headlights burn alone until ~2.3s, then the light
  // spreads slowly over the car (data-min 5000). Ends bright, cross-fading straight into the site.
  tukmid: () => `<img class="tt-pre" src="/img/loader_tuktuk_v2.jpg" alt="" fetchpriority="high" decoding="async">
  <i class="ty-amb" aria-hidden="true"></i>
  <div class="ty-photo" aria-hidden="true">
    <i class="ty-lit"></i>
    <div class="ty-lamps"><i class="ty-bloom l"></i><i class="ty-bloom r"></i><i class="ty-core l"></i><i class="ty-core r"></i><i class="ty-streak"></i></div>
  </div>
  <div class="ty-hud"><b class="ldr-st ty-st" data-steps="IGNITION,IGNITION,LIGHTS ON,LIGHTS ON,CRANKING…,CRANKING…" data-ready="ENGINE START">IGNITION</b>
    <div class="ty-bar" aria-hidden="true"><i class="ldr-fill"></i></div><span class="ldr-pct ty-pct">0%</span></div>`,
  // short-dark version: a brief moment of black, the headlights burn alone until ~1.3s, then the light
  // spreads slowly over the car (data-min 4000). Ends bright, cross-fading straight into the site.
  tukfast: () => `<img class="tt-pre" src="/img/loader_tuktuk_v2.jpg" alt="" fetchpriority="high" decoding="async">
  <i class="tz-amb" aria-hidden="true"></i>
  <div class="tz-photo" aria-hidden="true">
    <i class="tz-lit"></i>
    <div class="tz-lamps"><i class="tz-bloom l"></i><i class="tz-bloom r"></i><i class="tz-core l"></i><i class="tz-core r"></i><i class="tz-streak"></i></div>
  </div>
  <div class="tz-hud"><b class="ldr-st tz-st" data-steps="IGNITION,LIGHTS ON,LIGHTS ON,CRANKING…,CRANKING…" data-ready="ENGINE START">IGNITION</b>
    <div class="tz-bar" aria-hidden="true"><i class="ldr-fill"></i></div><span class="ldr-pct tz-pct">0%</span></div>`,
  neon: x => `<div class="nn-sky" aria-hidden="true"><i class="nn-sun"></i><svg class="nn-city" viewBox="0 0 500 100" preserveAspectRatio="none"><path d="${SKYLINE}"/></svg></div>
  <div class="nn-floor" aria-hidden="true"><i class="nn-grid"></i></div>
  <div class="nn-center"><img class="nn-logo" src="${esc(logoOf(x.c))}" width="140" height="140" alt=""></div>
  <div class="nn-hud"><b class="ldr-st nn-st" data-ready="GO!">LOADING</b>
    <div class="nn-bar" aria-hidden="true"><i class="ldr-fill"></i></div><span class="ldr-pct nn-pct">0%</span></div>`
};
function loader(x, active, force) {
  const s = x.c.site;
  if (!force && (!on(s.loader) || (s.loaderScope !== 'all' && active !== 'home'))) return '';
  const style = LOADER_STYLES.includes(force || s.loaderStyle) ? (force || s.loaderStyle) : 'launcher';
  return `<div class="ldr s-${style}" id="ldr" data-once="${on(s.loaderOnce) ? 1 : 0}"${style === "tuklong" ? ' data-min="4500" data-max="6500"' : ""}${style === "tukxl" ? ' data-min="6000" data-max="8500"' : ""}${style === "tukmid" ? ' data-min="5000" data-max="7000"' : ""}${style === "tukfast" ? ' data-min="4000" data-max="6000"' : ""}${({ tuktuk: 430, tukglow: 560 })[style] ? ` data-unlock="${({ tuktuk: 430, tukglow: 560 })[style]}"` : ""} role="progressbar" aria-label="${x.lang === 'en' ? 'Loading' : 'กำลังโหลด'}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
  ${loaderBody[style](x)}
</div>
<script src="${asset('/loader.js')}"></script>`;
}

function shell(x, o, inner, script) {
  const en = x.lang === 'en', tp = plain(o.path);
  // pages that exist in both languages point at each other for Google
  if (!o.alternates && TWIN.test(tp)) o =Object.assign({}, o, { alternates: [['th', tp], ['en', enHref(tp)], ['x-default', tp]] });
  const html = `<!doctype html>
<html lang="${en ? 'en' : 'th'}">
<head>
${head(x, o)}
</head>
<body style="--art:url('${cssUrl(heroMedia(x.c.home, 'heroImage'))}')">
${loader(x, o.active, o.loaderPreview)}
${header(x, o.active)}
${inner}
<div class="toast" id="toast" role="status" aria-live="polite"></div>
${consentBanner(x)}
<script src="${asset(script || '/site.js')}" defer></script>
</body>
</html>`;
  const sw = langSwitch2(x, o.path);
  return (en ? enLinks(html, x.c) : html).split(LANG_MARK).join(sw);
}

function pageHead(p) {
  return `<span class="eyebrow">${esc(p.eyebrow)}</span><h1 class="disp">${esc(p.h1)}</h1>${p.h2 ? `<h2 class="sub">${esc(p.h2)}</h2>` : ''}${p.intro ? `<p class="intro">${esc(p.intro)}</p>` : ''}`;
}
const pageTitle = (x, p) => p.seoTitle || `${p.h1} | ${x.name}`;

// ---- launcher-style news blocks (like the in-game "What's New" screen) ----
const DAY = 864e5;
// "today / yesterday / N days ago" for the last month, a full date after that
const ago = (d, en) => {
  const t = Date.parse(d); if (isNaN(t)) return '';
  const n = Math.floor((Date.now() - t) / DAY);
  if (n < 0 || n > 30) return en ? fmtDateEn(d) : fmtDate(d);
  return en ? (n === 0 ? 'Today' : n === 1 ? 'Yesterday' : n + ' days ago') : n === 0 ? 'วันนี้' : n === 1 ? 'เมื่อวาน' : n + ' วันที่แล้ว';
};
// tags read as yellow labels; patch / update / maintenance ones are red
const hot = t => /patch|update|maint|fix/i.test(t || '');
const pill = t => t ? `<span class="pill${hot(t) ? ' red' : ''}">${esc(t)}</span>` : '';
const newsHref = n => '/news/' + encodeURIComponent(n.slug);
const when = (n, en) => `<time datetime="${esc(n.date)}">${esc(ago(n.date, en))}</time>`;
// featured story + up to 3 side items, then the rest (up to `more`) as image cards
function whatsNew(list, more, en) {
  if (!list.length) return '';
  const [top, ...rest] = list, side = rest.slice(0, 3), extra = rest.slice(3, 3 + more);
  const alt = n => n.imageAlt || n.title;
  const feat = `<a class="wn-feat" href="${newsHref(top)}">${imgTag(top.image, alt(top), 'im')}${pill(top.tag)}<div class="c"><h3>${esc(top.title)}</h3>${top.excerpt ? `<p>${esc(top.excerpt)}</p>` : ''}${when(top, en)}</div></a>`;
  const items = side.map(n => `<a class="wn-item" href="${newsHref(n)}">${imgTag(n.image, alt(n), 'th')}<div class="c">${n.tag ? `<span class="cat${hot(n.tag) ? ' red' : ''}">${esc(n.tag)}</span>` : ''}<h4>${esc(n.title)}</h4>${n.excerpt ? `<p>${esc(n.excerpt)}</p>` : ''}</div></a>`).join('');
  const cards = extra.map(n => `<a class="mcard" href="${newsHref(n)}">${imgTag(n.image, alt(n), 'im')}${pill(n.tag)}<div class="c"><h3>${esc(n.title)}</h3>${when(n, en)}</div></a>`).join('');
  return `<div class="wn${side.length ? '' : ' solo'}">${feat}${side.length ? `<div class="wn-list">${items}</div>` : ''}</div>`
    + (cards ? `<h3 class="lx-sub">${en ? 'More news' : 'ข่าวสารเพิ่มเติม'}</h3><div class="wn-more">${cards}</div>` : '');
}
const gameplayCards = list => list.map(g => `<article class="feat">${imgTag(g.image, g.alt || g.title, 'im')}<div class="c"><h3>${esc(g.title)}</h3><p>${esc(g.desc)}</p></div></article>`).join('');
const published = c => c.news.filter(n => n.published).sort((a, b) => String(b.date).localeCompare(String(a.date)));


// ---------- legal pages (privacy, terms, support) and the cookie banner ----------
const EMAIL_RE = /^[^\s@<>"']{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
const retentionDays = () => { try { return require('./analytics').KEEP_DAYS; } catch (e) { return 400; } };
const fmtDateEn = d => { const t = new Date(d); return isNaN(t) ? '' : t.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }); };
function tokenValues(x, base, key) {
  const ct = x.c.contact || {}, lg = x.c.legal || {}, up = (x.c.pages[key] || x.c.pages.privacy || {}).updated;
  const en = x.lang === 'en', link = k => (pageExists(x.c, k) ? legalHref(x.c, k, en) : '');
  return { app: x.name, company: ct.company, email: ct.email, reportEmail: ct.reportEmail || ct.email, phone: ct.phone, line: ct.line, address: ct.address,
    hours: en ? ct.hoursEn || ct.hours : ct.hours, response: en ? ct.responseEn || ct.response : ct.response,
    site: String(base || '').replace(/^https?:\/\//, ''), updated: up ? (en ? fmtDateEn(up) : fmtDate(up)) : '', retention: String(retentionDays()), minAge: lg.minAge, deleteDays: lg.deleteDays,
    // links to the other store pages: empty (so the line is hidden) until that page exists
    privacyUrl: link('privacy'), termsUrl: link('terms'), supportUrl: link('support'), faqUrl: link('faq'), deleteUrl: link('delete'), oddsUrl: link('odds') };
}
// {{tokens}} in the editable texts come from the admin. A line that still has an empty token is left out of the public page,
// so visitors never see "[not set]" or a half-written sentence (the admin's readiness check lists what is missing)
function fillTokens(text, x, base, key) {
  const vals = tokenValues(x, base, key);
  const known = t => t.slice(2, -2) in vals;
  return String(text || '').split('\n')
    .filter(l => (l.match(/\{\{\w+\}\}/g) || []).every(t => !known(t) || String(vals[t.slice(2, -2)] || '').trim()))
    .join('\n').replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vals ? String(vals[k]) : m));
}
const bannerOn = c => on((c.cookies || {}).enabled);
// every cookie / browser-storage item the site uses, so the policy table always matches the real behaviour
function cookieRows(c, en) {
  const ga = GA_RE.test(c.site.ga4 || ''), banner = bannerOn(c);
  const T = (th, e) => (en ? e : th);
  const rows = [
    ['rc_consent', T('จำเป็น', 'Necessary'), T('จำว่าท่านเลือกคุกกี้แบบใดในแบนเนอร์', 'Remembers your choice in the cookie banner'), T('6 เดือน', '6 months'), T('เว็บไซต์นี้', 'This website')],
    ['vid', T('สถิติ', 'Analytics'), T('รหัสสุ่มไม่ระบุตัวตน ใช้นับผู้เข้าชมไม่ซ้ำ ', 'Anonymous random ID that counts unique visitors. ') + (banner ? T('ตั้งเมื่อท่านกดยอมรับสถิติเท่านั้น', 'Set only after you accept analytics') : ''), T('1 ปี', '1 year'), T('เว็บไซต์นี้', 'This website')]
  ];
  if (ga) rows.push(['_ga, _ga_*', T('สถิติ', 'Analytics'), T('Google Analytics 4 วัดการใช้งานเว็บไซต์ ', 'Google Analytics 4 measures website usage. ') + (banner ? T('โหลดเมื่อท่านยอมรับสถิติเท่านั้น', 'Loaded only after you accept analytics') : ''), T('สูงสุด 2 ปี', 'Up to 2 years'), 'Google']);
  rows.push(['rc-sfx (localStorage)', T('จำเป็น', 'Necessary'), T('จำการเปิด/ปิดเสียงที่ท่านเลือกบนหน้าแรก', 'Remembers your sound on/off choice on the home page'), T('จนกว่าท่านจะลบ', 'Until you clear it'), T('เว็บไซต์นี้', 'This website')]);
  rows.push(['rc-ldr-seen (sessionStorage)', T('จำเป็น', 'Necessary'), T('ไม่แสดงหน้าโหลดซ้ำในแท็บเดียวกัน', 'Does not show the loading screen again in the same tab'), T('จนปิดแท็บ', 'Until the tab is closed'), T('เว็บไซต์นี้', 'This website')]);
  return rows;
}
const cookieTable = (c, en) => `<div class="scroll"><table class="legal-table"><thead><tr>${(en ? ['Name', 'Type', 'Purpose', 'Lifetime', 'Provider'] : ['ชื่อ', 'ประเภท', 'ใช้ทำอะไร', 'อายุ', 'ผู้ให้บริการ']).map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${cookieRows(c, en).map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

// consent banner: hidden until /consent.js shows it (so crawlers and no-JS visitors just see the page)
function consentBanner(x) {
  const c = x.c, k = c.cookies || {}, en = x.lang === 'en';
  if (!bannerOn(c)) return '';
  const t = n => (en && k[n + 'En']) || k[n] || '';
  const ga = GA_RE.test(c.site.ga4 || '') ? c.site.ga4 : '';
  const policy = c.pages.privacy && c.pages.privacy.h1 ? (en && c.pages.privacy.bodyEn && c.pages.privacy.bodyEn.trim() ? '/en/privacy' : '/privacy') : '';
  return `<div class="cc" id="cc" role="dialog" aria-modal="false" aria-labelledby="cc-t" hidden data-ver="${esc(String(k.version || '1').replace(/[^\w-]/g, '').slice(0, 12) || '1')}"${ga ? ` data-ga="${ga}" data-ga-src="${esc(asset('/ga.js'))}"` : ''}>
  <div class="cc-main">
    <h2 id="cc-t">${esc(t('title'))}</h2>
    <p>${esc(t('text'))}${policy ? ` <a href="${policy}">${esc(t('policyLabel'))}</a>` : ''}</p>
    <div class="cc-btns"><button type="button" class="cc-b" data-cc="reject">${esc(t('rejectAll'))}</button><button type="button" class="cc-b" data-cc="custom">${esc(t('customize'))}</button><button type="button" class="cc-b pri" data-cc="accept">${esc(t('acceptAll'))}</button></div>
  </div>
  <div class="cc-set" hidden>
    <h2>${esc(t('settingsTitle'))}</h2>
    <label class="cc-row"><span><b>${esc(t('necessaryTitle'))}</b><small>${esc(t('necessaryDesc'))}</small></span><input type="checkbox" checked disabled></label>
    <label class="cc-row"><span><b>${esc(t('analyticsTitle'))}</b><small>${esc(t('analyticsDesc'))}</small></span><input type="checkbox" data-cc-an></label>
    <div class="cc-btns"><button type="button" class="cc-b" data-cc="save">${esc(t('save'))}</button><button type="button" class="cc-b pri" data-cc="accept">${esc(t('acceptAll'))}</button></div>
  </div>
</div>
<script src="${asset('/consent.js')}" defer></script>`;
}

// privacy policy and terms: Thai page plus an English page (same URL under /en), linked with hreflang
function legalPage(c, base, key, lang) {
  const x = ctx(c, base, lang), p = c.pages[key], en = x.lang === 'en';
  const f = n => (en ? p[n + 'En'] : p[n]) || '';
  const hasEn = !!(p.bodyEn && p.bodyEn.trim());
  const lp = LEGAL_PATH[key] || '/' + key, path = (en ? '/en' : '') + lp;
  const head = { eyebrow: p.eyebrow, h1: f('h1') || p.h1, h2: en ? '' : p.h2, intro: f('intro') };
  const sw = hasEn ? `<p class="lang-switch"><a href="${en ? lp : '/en' + lp}" hreflang="${en ? 'th' : 'en'}" lang="${en ? 'th' : 'en'}">${en ? 'ภาษาไทย' : 'English'}</a></p>` : '';
  const upd = p.updated ? `<p class="updated">${en ? 'Last updated' : 'อัปเดตล่าสุด'}: <time datetime="${esc(String(p.updated).slice(0, 10))}">${esc(en ? fmtDateEn(p.updated) : fmtDate(p.updated))}</time></p>` : '';
  const k = c.cookies || {};
  const cookieBlock = key === 'privacy' ? `<h2 class="legal-h" id="cookies">${en ? 'Cookies and data stored on your device' : 'คุกกี้และข้อมูลที่เก็บในอุปกรณ์ของท่าน'}</h2>
${cookieTable(c, en)}
${bannerOn(c) ? `<p><button type="button" class="btn sm" data-cc-open>${esc((en && k.settingsLinkEn) || k.settingsLink || 'ตั้งค่าคุกกี้')}</button></p>` : ''}` : '';
  const inner = `<main id="top"><section class="sec pg"><div class="wrap legal"${en ? ' lang="en"' : ''}>${sw}${pageHead(head)}
${upd}
<div class="prose">${body(fillTokens(f('body'), x, base, key))}</div>
${cookieBlock}
${relatedPages(x, key)}
</div></section>${footer(x)}</main>`;
  const o = {
    path, active: key, lang: x.lang, title: f('seoTitle') || `${head.h1} | ${x.name}`, description: f('seoDescription'), image: p.ogImage, noindex: on(p.noindex),
    jsonld: [crumbs(x, [[f('navLabel') || head.h1, path]])], alternates: hasEn ? [['th', lp], ['en', '/en' + lp], ['x-default', lp]] : null
  };
  return shell(x, o, inner);
}

// language switch + hreflang for a page that has Thai and English versions
const langSwitch = (c, k, en) => (hasEnglish(c, k) ? `<p class="lang-switch"><a href="${en ? LEGAL_PATH[k] : '/en' + LEGAL_PATH[k]}" hreflang="${en ? 'th' : 'en'}" lang="${en ? 'th' : 'en'}">${en ? 'ภาษาไทย' : 'English'}</a></p>` : '');
const langAlternates = (c, k) => (hasEnglish(c, k) ? [['th', LEGAL_PATH[k]], ['en', '/en' + LEGAL_PATH[k]], ['x-default', LEGAL_PATH[k]]] : null);

function faqPage(c, base, lang) {
  const x = ctx(c, base, lang), p = c.pages.faq, en = x.lang === 'en';
  const f = n => (en ? p[n + 'En'] : p[n]) || '';
  const items = c.faq.map(i => ({ q: en ? i.qEn : i.q, a: en ? i.aEn : i.a })).filter(i => i.q && i.a);
  const path = (en ? '/en' : '') + '/faq';
  const head = { eyebrow: p.eyebrow, h1: f('h1') || p.h1, h2: en ? '' : p.h2, intro: f('intro') };
  // left: title, search and "still stuck? contact us"; right: numbered questions that open in place
  const T = (th, e) => (en ? e : th);
  const ct = c.contact || {}, sup = pageExists(c, 'support') ? legalHref(c, 'support', en) : '', mail = EMAIL_RE.test(ct.email || '') ? ct.email : '';
  const answer = a => String(a).split(/\n{2,}/).map(par => `<p>${esc(par).replace(/\n/g, '<br>')}</p>`).join('');
  const ico = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  const inner = `<main id="top"><section class="sec pg faqp"><div class="wrap"${en ? ' lang="en"' : ''}>${langSwitch(c, 'faq', en)}
<div class="fq">
  <aside class="fq-side">
    <span class="eyebrow">${esc(head.eyebrow || 'FAQ')}</span>
    <h1 class="disp">${esc(head.h1)}</h1>${head.h2 ? `<h2 class="sub">${esc(head.h2)}</h2>` : ''}${head.intro ? `<p class="intro">${esc(head.intro)}</p>` : ''}
    <label class="fq-search">${ico('M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4')}<input type="search" data-fq-q placeholder="${T('ค้นหาคำถาม…', 'Search questions…')}" aria-label="${T('ค้นหาคำถาม', 'Search questions')}" autocomplete="off"></label>
    <p class="fq-count" data-fq-count data-unit="${T('คำถาม', 'questions')}">${items.length} ${T('คำถาม', 'questions')}</p>
    ${sup || mail ? `<div class="fq-help">${ico('M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z')}<b>${T('ยังไม่พบคำตอบ?', 'Still need help?')}</b><p>${T('ทีมงานพร้อมช่วยเหลือ ส่งคำถามมาได้เลย', 'Our team is happy to help. Send us your question.')}</p>
      <div class="fq-help-a">${sup ? `<a class="btn sm" href="${esc(sup)}">${T('ติดต่อซัพพอร์ต', 'Contact support')}</a>` : ''}${mail ? `<a class="fq-mail" href="mailto:${esc(mail)}">${esc(mail)}</a>` : ''}</div></div>` : ''}
  </aside>
  <div class="fq-main">
    <div class="fq-tools"><button type="button" class="fq-all" data-fq-all data-open="${T('เปิดทั้งหมด', 'Expand all')}" data-close="${T('ปิดทั้งหมด', 'Collapse all')}">${T('เปิดทั้งหมด', 'Expand all')}</button></div>
    <div class="fq-list">${items.map((i, n) => `<details class="fq-i"${n === 0 ? ' open' : ''}><summary><span class="n">${String(n + 1).padStart(2, '0')}</span><h3>${esc(i.q)}</h3><span class="pm" aria-hidden="true"></span></summary><div class="fq-a">${answer(i.a)}</div></details>`).join('')}</div>
    <p class="fq-empty" data-fq-empty hidden>${T('ไม่พบคำถามที่ตรงกับคำค้นนี้ ลองคำอื่น หรือติดต่อซัพพอร์ต', 'No question matches that search. Try other words, or contact support.')}</p>
  </div>
</div>
${relatedPages(x, 'faq')}
</div></section>${footer(x)}</main>`;
  const o = {
    path, active: 'faq', lang: x.lang, title: f('seoTitle') || `${head.h1} | ${x.name}`, description: f('seoDescription'), image: p.ogImage, noindex: on(p.noindex),
    jsonld: [crumbs(x, [[f('navLabel') || head.h1, path]]), { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map(i => ({ '@type': 'Question', name: i.q, acceptedAnswer: { '@type': 'Answer', text: i.a } })) }],
    alternates: langAlternates(c, 'faq')
  };
  return shell(x, o, inner);
}

function supportPage(c, base, lang) {
  const x = ctx(c, base, lang), p = c.pages.support, ct = c.contact || {}, en = x.lang === 'en';
  const f = n => (en ? p[n + 'En'] : p[n]) || '';
  const fb = safeUrl(c.links.social.facebook), line = safeUrl(ct.line);
  const phone = String(ct.phone || '').replace(/[^\d+]/g, '');
  const report = EMAIL_RE.test(ct.reportEmail || '') ? ct.reportEmail : (EMAIL_RE.test(ct.email || '') ? ct.email : '');
  const L = en
    ? { company: 'Company', email: 'Support email', report: 'Report a player / content', how: 'How to report', phone: 'Phone', line: 'LINE', hours: 'Opening hours', response: 'Reply time', address: 'Address', faq: 'Support FAQ', hoursV: ct.hoursEn || ct.hours, responseV: ct.responseEn || ct.response }
    : { company: 'ผู้ให้บริการ', email: 'อีเมลซัพพอร์ต', report: 'รายงานผู้เล่น / เนื้อหา', how: 'วิธีรายงาน', phone: 'โทรศัพท์', line: 'LINE', hours: 'เวลาทำการ', response: 'เวลาตอบกลับ', address: 'ที่อยู่', faq: 'คำถามที่พบบ่อยเรื่องซัพพอร์ต', hoursV: ct.hours, responseV: ct.response };
  const cards = [
    ct.company ? [L.company, esc(ct.company)] : null,
    EMAIL_RE.test(ct.email || '') ? [L.email, `<a href="mailto:${esc(ct.email)}">${esc(ct.email)}</a>`] : null,
    report ? [L.report, `<a href="mailto:${esc(report)}">${esc(report)}</a> · <a href="#report">${L.how}</a>`] : null,
    ct.phone ? [L.phone, phone.length >= 6 ? `<a href="tel:${esc(phone)}">${esc(ct.phone)}</a>` : esc(ct.phone)] : null,
    ct.line ? [L.line, /^https?:\/\//i.test(line) ? `<a href="${esc(line)}" target="_blank" rel="noopener noreferrer">${esc(ct.line)}</a>` : esc(ct.line)] : null,
    /^https?:\/\//i.test(fb) ? ['Facebook', `<a href="${esc(fb)}" target="_blank" rel="noopener noreferrer">${esc(fb.replace(/^https?:\/\/(www\.)?/, ''))}</a>`] : null,
    L.hoursV ? [L.hours, esc(L.hoursV)] : null,
    L.responseV ? [L.response, esc(L.responseV)] : null,
    ct.address ? [L.address, esc(ct.address).replace(/\n/g, '<br>')] : null
  ].filter(Boolean);
  const faqs = (c.supportFaq || []).map(i => [en ? i.qEn : i.q, fillTokens(en ? i.aEn : i.a, x, base, 'support')]).filter(([q, a]) => q && a.trim());
  const path = (en ? '/en' : '') + '/support';
  const head = { eyebrow: p.eyebrow, h1: f('h1') || p.h1, h2: en ? '' : p.h2, intro: f('intro') };
  const inner = `<main id="top"><section class="sec pg"><div class="wrap legal"${en ? ' lang="en"' : ''}>${langSwitch(c, 'support', en)}${pageHead(head)}
${cards.length ? `<div class="cards c3 contact">${cards.map(([k, v]) => `<div class="card"><small class="ck">${esc(k)}</small><p class="cv">${v}</p></div>`).join('')}</div>` : ''}
<div class="prose">${body(fillTokens(f('body'), x, base, 'support'))}</div>
${faqs.length ? `<h2 class="legal-h" id="faq">${L.faq}</h2><div class="faqs">${faqs.map(([q, a]) => `<details><summary><h3>${esc(q)}</h3></summary><div class="prose">${body(a)}</div></details>`).join('')}</div>` : ''}
${relatedPages(x, 'support')}
</div></section>${footer(x)}</main>`;
  const o = {
    path, active: 'support', lang: x.lang, title: f('seoTitle') || `${head.h1} | ${x.name}`, description: f('seoDescription'), image: p.ogImage, noindex: on(p.noindex),
    jsonld: [crumbs(x, [[f('navLabel') || head.h1, path]])], alternates: langAlternates(c, 'support')
  };
  const cp = { '@type': 'ContactPoint', contactType: 'customer support', availableLanguage: ['th', 'en'] };
  if (EMAIL_RE.test(ct.email || '')) cp.email = ct.email;
  if (phone.length >= 6) cp.telephone = ct.phone;
  o.jsonld.push({ '@context': 'https://schema.org', '@type': 'ContactPage', name: head.h1, url: base + path, mainEntity: Object.assign({ '@type': 'Organization', name: ct.company || x.name, url: base + '/' }, cp.email || cp.telephone ? { contactPoint: cp } : {}) });
  return shell(x, o, inner);
}

const preregMod = require('./prereg');
const preregSection = preregMod({ esc, safeUrl, imgTag });
const preregAssets = () => `<link rel="stylesheet" href="${asset('/prereg.css')}">`;
const preregScript = () => `<script src="${asset('/prereg.js')}" defer></script>`;
const portalPage = portalMod({ esc, ctx, shell, asset, safeUrl, pageExists, legalHref });
const render = {
  account(c, base, key) { return portalPage(c, base, key); },
  home(c, base, opts) {
    const x = ctx(c, base), h = c.home, dl = c.links.download, so = c.links.social, en = x.lang === 'en';
    const shown = k => !c.links.show || on(c.links.show[k]);
    const store = (k, label) => {
      if (!shown(k)) return '';
      const u = safeUrl(dl[k]);
      return u
        ? `<a class="store" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${svg(k)}<div><small>${esc(h.downloadLabel)}</small><b>${label}</b></div></a>`
        : `<button class="store" type="button" data-stay data-msg="${en ? label + ' version coming soon' : 'เวอร์ชัน ' + label + ' เร็วๆ นี้'}">${svg(k)}<div><small>${esc(h.soonLabel)}</small><b>${label}</b></div><em>SOON</em></button>`;
    };
    const social = cls => `<div class="social ${cls}"><span>${esc(h.followLabel)}</span>${[['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['discord', 'Discord'], ['youtube', 'YouTube']].filter(([k]) => shown(k)).map(([k, l]) => {
      const u = safeUrl(so[k]);
      return u ? `<a class="so" href="${esc(u)}" target="_blank" rel="noopener noreferrer" aria-label="${l}" title="${l}">${svg(k)}</a>`
        : `<a class="so" href="#" data-stay data-msg="" aria-label="${l}" title="${l} · Coming soon">${svg(k)}</a>`;
    }).join('')}</div>`;
    const reg = !shown('register') ? '' : safeUrl(h.registerLink)
      ? `<a class="btn" href="${esc(safeUrl(h.registerLink))}" target="_blank" rel="noopener noreferrer">${esc(h.registerText)}</a>`
      : `<button class="btn" type="button" data-stay data-msg="${esc(h.registerMsg)}">${esc(h.registerText)} <small>SOON</small></button>`;
    const stores = store('windows', 'Windows PC') + store('ios', 'App Store') + store('android', 'Google Play');
    const latest = published(c).slice(0, 7);
    // the slanted game band: pitch on the left, car on the right; a button without a link says "coming soon"
    const bandBtn = (label, link, cls) => { if (!label) return ''; const u = safeUrl(link); return u ? `<a class="${cls}" href="${esc(u)}"${/^https?:/i.test(u) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(label)}</a>` : `<button class="${cls}" type="button" data-stay data-msg="${esc(h.registerMsg || (en ? 'Coming soon' : 'เร็วๆ นี้'))}">${esc(label)}</button>`; };
    const bandPic = safeUrl(h.bandImage) || '/img/car1.jpg';
    const band = on(h.bandOn) && (h.bandTitle || h.bandText) ? `<section class="gb" aria-label="${esc(h.bandTitle || x.name)}"><div class="gb-band"><div class="wrap gb-in">
  <div class="gb-txt rv"><h2 class="gb-t">${esc(h.bandTitle)}</h2>${h.bandText ? `<p>${esc(h.bandText)}</p>` : ''}<div class="gb-btns">${bandBtn(h.bandBtn1, h.bandLink1, 'gb-b1')}${bandBtn(h.bandBtn2, h.bandLink2, 'gb-b2')}</div></div>
  <div class="gb-pic rv">${imgTag(bandPic, h.bandTitle || x.name, 'gb-img')}</div>
</div></div></section>` : '';
    const homePre = preregMod.enabled(c) && on((c.prereg || {}).onHome) ? (() => { const s = preregSection(c, x, 'home'); return s ? `<section class="sec pr-sec"><div class="wrap">${preregAssets()}${s}</div></section>${preregScript()}` : ''; })() : '';
    // "COMING SOON · MOBILE" -> big status + small platform line in the launcher-style dock
    const [st0, ...stRest] = String(h.badge || 'COMING SOON').split(/\s*[·|•]\s*/), st1 = stRest.join(' · ');
    const inner = `<main id="top">
<section class="hero">
  <div class="tiles" id="tiles" aria-hidden="true" data-video="${esc(heroMedia(h, 'heroVideo'))}" data-video-sm="${esc(h.heroVideoMobile || !h.heroVideo ? heroMedia(h, 'heroVideoMobile') : heroMedia(h, 'heroVideo'))}" data-image="${esc(heroMedia(h, 'heroImage'))}" style="background-image:url('${cssUrl(heroMedia(h, 'heroImage'))}')"></div><div class="soft"></div><div class="shade"></div>
  <div class="wrap hwrap"><div class="hl">
    <div class="htitle disp"><h1 class="ln"><span>${esc(h.h1)}</span></h1><h2 class="ln sub"><span>${esc(h.h2)}</span></h2><h3 class="ln"><span><em>${esc(h.h3)}</em></span></h3></div>
    <p class="lead fade-up" style="animation-delay:.35s">${esc(h.lead)}</p>
  </div></div>
  <div class="dock fade-up" style="animation-delay:.5s"><div class="wrap dk">
    <div class="dk-st"><b class="disp">${esc(st0)}</b>${st1 ? `<em>${esc(st1)}</em>` : ''}<div class="dk-bar" aria-hidden="true"><i></i></div><small>${esc(h.registerMsg)}</small></div>
    <div class="dk-cta">${reg}</div>
    <div class="dk-plat">${stores ? `<div class="plat-h">${esc(h.storesLabel)}</div><div class="stores">${stores}</div>` : ''}
      <div class="dk-soc">${social('dks')}<button class="snd" type="button" aria-pressed="true" aria-label="${en ? 'Sound effects' : 'เสียงเอฟเฟกต์'}" title="${en ? 'Sound on/off' : 'เปิด/ปิดเสียงเอฟเฟกต์'}"><svg class="on" viewBox="0 0 24 24" aria-hidden="true"><path d="${SPK_ON}"/></svg><svg class="off" viewBox="0 0 24 24" aria-hidden="true"><path d="${SPK_OFF}"/></svg></button></div></div>
  </div></div>
</section>
${homePre}
${band}
${latest.length ? `<section class="sec lx" id="latest"><div class="wrap"><div class="lx-h"><h2>${esc(h.latestNewsTitle)}</h2><a class="more" href="/news">${en ? 'View all' : 'ดูทั้งหมด'} &rarr;</a></div>${whatsNew(latest, 3, en)}</div></section>` : ''}
${c.gameplay.length ? `<section class="sec" id="gameplay"><div class="wrap"><span class="eyebrow">${esc(c.pages.gameplay.eyebrow)}</span><h2 class="disp">${esc(c.pages.gameplay.h1)}</h2>${c.pages.gameplay.intro ? `<p class="intro">${esc(c.pages.gameplay.intro)}</p>` : ''}<div class="cards c3">${gameplayCards(c.gameplay.slice(0, 6))}</div><div class="cta"><a class="ghost" href="/gameplay">${esc(h.gameplayMore || (en ? 'View all' : 'ดูทั้งหมด'))} &rarr;</a></div></div></section>` : ''}
${footer(x)}
</main>`;
    const heroImg = heroMedia(h, 'heroImage');
    // tells Google this site is about a video game (name, genre, platforms, publisher)
    const game = { '@context': 'https://schema.org', '@type': 'VideoGame', name: x.name, url: base + '/', description: c.site.description, image: x.abs(c.site.ogImage) || x.abs(heroImg), inLanguage: x.lang, genre: ['Racing', 'Street racing'], gamePlatform: ['iOS', 'Android'], applicationCategory: 'Game', operatingSystem: 'iOS, Android', publisher: { '@type': 'Organization', name: x.name, url: base + '/' }, sameAs: Object.values(c.links.social).map(safeUrl).filter(Boolean) };
    return shell(x, { path: '/', active: 'home', title: h.seoTitle || c.site.defaultTitle, description: h.seoDescription || c.site.description, preload: heroImg, jsonld: [game], loaderPreview: opts && opts.loaderPreview }, inner, '/hero.js');
  },

  rewards(c, base) {
    const x = ctx(c, base), p = c.pages.rewards;
    const pre = preregMod.enabled(c) ? preregSection(c, x, 'page') : '';
    // with the counter switched off the plain list of reward cards is shown instead
    const plain = `<div class="cards c4">${c.rewards.map((r, i) => `<div class="card${i === c.rewards.length - 1 ? ' lg' : ''}"><div class="num">${esc(r.milestone)}</div><h3>${esc(r.title)}</h3><p>${esc(r.desc)}</p></div>`).join('')}</div>
<div class="cta"><a class="btn" href="/">${esc(c.home.registerText)}</a></div>`;
    const inner = `<main id="top"><section class="sec pg"><div class="wrap">${pre ? preregAssets() + pre : pageHead(p) + plain}
</div></section>${footer(x)}</main>${pre ? preregScript() : ''}`;
    return shell(x, pageOpts(x, 'rewards'), inner);
  },

  gameplay(c, base) {
    const x = ctx(c, base), p = c.pages.gameplay;
    const inner = `<main id="top"><section class="sec pg"><div class="wrap">${pageHead(p)}
<div class="cards c3">${gameplayCards(c.gameplay)}</div>
</div></section>${footer(x)}</main>`;
    return shell(x, pageOpts(x, 'gameplay'), inner);
  },

  drivers(c, base) {
    const x = ctx(c, base), p = c.pages.drivers;
    const inner = `<main id="top"><section class="sec pg"><div class="wrap">${pageHead(p)}
<div class="cards c4">${c.drivers.map(d => `<article class="feat">${imgTag(d.image, d.alt || d.title, 'im', ` style="object-position:${esc(String(d.pos || 'center').replace(/[^0-9a-z% .-]/gi, ''))}"`)}${d.badge ? `<span class="st">${esc(d.badge)}</span>` : ''}<div class="c"><h3>${esc(d.title)}</h3><p>${esc(d.desc)}</p></div></article>`).join('')}</div>
</div></section>${footer(x)}</main>`;
    return shell(x, pageOpts(x, 'drivers'), inner);
  },

  news(c, base) {
    const x = ctx(c, base), p = c.pages.news, list = published(c);
    const inner = `<main id="top"><section class="sec pg news"><div class="wrap">${pageHead(p)}
${list.length ? whatsNew(list, 500, x.lang === 'en') : `<p class="intro">${esc(p.empty || '')}</p>`}
</div></section>${footer(x)}</main>`;
    return shell(x, pageOpts(x, 'news'), inner);
  },

  article(c, base, n) {
    const x = ctx(c, base), path = '/news/' + encodeURIComponent(n.slug);
    const desc = n.seoDescription || n.excerpt || c.site.description;
    const inner = `<main id="top"><section class="sec pg"><div class="wrap"><article class="art">
<a class="back" href="/news">&larr; ${esc(c.pages.news.navLabel)}</a>
<div class="amr">${pill(n.tag)}<time datetime="${esc(n.date)}">${esc(x.lang === 'en' ? fmtDateEn(n.date) : fmtDate(n.date))}</time></div>
<h1 class="disp">${esc(n.title)}</h1>
${safeUrl(n.image) ? (sz => `<img class="hero-img" src="${esc(safeUrl(n.image))}" alt="${esc(n.imageAlt || n.title)}"${sz ? ` width="${sz.w}" height="${sz.h}"` : ''} fetchpriority="high" decoding="async">`)(sizeOf(n.image)) : ''}
<div class="prose">${body(n.body)}</div>
</article></div></section>${footer(x)}</main>`;
    const modified = n.modified || n.date;
    const org = { '@type': 'Organization', name: x.name, url: base + '/', logo: { '@type': 'ImageObject', url: x.abs(logoOf(c)) } };
    return shell(x, {
      path, active: 'news', ogType: 'article', image: n.image, imageAlt: n.imageAlt || n.title,
      title: n.seoTitle || `${n.title} | ${x.name}`, description: desc,
      meta: [['article:published_time', n.date], ['article:modified_time', modified], ['article:section', n.tag]],
      jsonld: [
        { '@context': 'https://schema.org', '@type': 'NewsArticle', headline: n.title.slice(0, 110), description: desc, datePublished: n.date, dateModified: modified, image: safeUrl(n.image) ? [x.abs(n.image)] : undefined, inLanguage: x.lang, mainEntityOfPage: { '@type': 'WebPage', '@id': base + path }, author: org, publisher: org },
        crumbs(x, [[c.pages.news.navLabel || 'News', '/news'], [n.title, path]])
      ]
    }, inner);
  },

  faq(c, base) { return faqPage(c, base, 'th'); },
  faqEn(c, base) { return faqPage(c, base, 'en'); },

  privacy(c, base) { return legalPage(c, base, 'privacy', 'th'); },
  privacyEn(c, base) { return legalPage(c, base, 'privacy', 'en'); },
  terms(c, base) { return legalPage(c, base, 'terms', 'th'); },
  termsEn(c, base) { return legalPage(c, base, 'terms', 'en'); },
  delete(c, base) { return legalPage(c, base, 'delete', 'th'); },
  deleteEn(c, base) { return legalPage(c, base, 'delete', 'en'); },
  odds(c, base) { return legalPage(c, base, 'odds', 'th'); },
  oddsEn(c, base) { return legalPage(c, base, 'odds', 'en'); },

  support(c, base) { return supportPage(c, base, 'th'); },
  supportEn(c, base) { return supportPage(c, base, 'en'); },

  // shown instead of every public page while the site is closed for maintenance
  maintenance(c, base, lang) {
    const x = ctx(c, base, lang), s = c.site, en = x.lang === 'en';
    const t = (en && s.maintenanceTitleEn) || s.maintenanceTitle || 'ปิดปรับปรุงชั่วคราว';
    const msg = (en && s.maintenanceMsgEn) || s.maintenanceMsg || '';
    const so = Object.entries(c.links.social || {}).map(([k, u]) => [k, safeUrl(u)]).filter(([, u]) => u);
    return `<!doctype html>
<html lang="${en ? 'en' : 'th'}">
<head>
${head(x, { path: en ? '/en' : '/', title: t + ' | ' + x.name, description: msg, noindex: true, lang: x.lang })}
</head>
<body class="mnt" style="--art:url('${cssUrl(heroMedia(c.home, 'heroImage'))}')">
<main class="mnt-box" id="top">
  <img class="mnt-logo" src="${esc(logoOf(c))}" width="88" height="88" alt="${esc(x.name)}">
  <span class="eyebrow">MAINTENANCE</span>
  <h1 class="disp">${esc(t)}</h1>
  ${msg ? `<p class="mnt-msg">${esc(msg)}</p>` : ''}
  ${s.maintenanceUntil ? `<p class="mnt-until">${en ? 'Expected back' : 'คาดว่าจะกลับมาให้บริการ'}: <b>${esc(s.maintenanceUntil)}</b></p>` : ''}
  ${so.length ? `<div class="mnt-so">${so.map(([k, u]) => `<a class="so" href="${esc(u)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(k)}">${svg(k)}</a>`).join('')}</div>` : ''}
</main>
</body>
</html>`;
  },

  notFound(c, base) {
    const x = ctx(c, base);
    return shell(x, { path: '/404', active: '', title: '404 | ' + x.name, description: '', noindex: true },
      `<main id="top"><section class="sec pg"><div class="wrap"><h1 class="disp">404</h1><p class="intro">${x.lang === 'en' ? 'Page not found' : 'ไม่พบหน้าที่ต้องการ'}</p><div class="cta"><a class="btn" href="/">${x.lang === 'en' ? 'Back to home' : 'กลับหน้าแรก'}</a></div></div></section>${footer(x)}</main>`);
  },

  // every public page with its last change date and the images on it (pages switched to "hide from Google" are left out)
  sitemap(c, base, savedAt) {
    const x = ctx(c, base), day = d => String(d || '').slice(0, 10);
    const imgs = list => [...new Set(list.map(u => x.abs(u)).filter(Boolean))];
    const pageImgs = { gameplay: c.gameplay.map(g => g.image), drivers: c.drivers.map(d => d.image), news: published(c).map(n => n.image) };
    const urls = [['/', day(savedAt), imgs([heroMedia(c.home, 'heroImage'), c.site.ogImage])]]
      .concat(PAGES.filter(k => !on(c.pages[k].noindex)).map(k => ['/' + k, day(savedAt), imgs(pageImgs[k] || [])]))
      .concat(['privacy', 'terms', 'support', 'delete', 'odds'].filter(k => pageExists(c, k)).flatMap(k => [[LEGAL_PATH[k], day(c.pages[k].updated || savedAt), []]]))
      .concat(['privacy', 'terms', 'support', 'faq', 'delete', 'odds'].filter(k => hasEnglish(c, k)).map(k => ['/en' + LEGAL_PATH[k], day(c.pages[k].updated || savedAt), []]))
      .concat(published(c).map(n => ['/news/' + encodeURIComponent(n.slug), day(n.modified || n.date), imgs([n.image])]))
      // the English site: the same pages under /en (articles only once they have an English title)
      .concat([['/en', day(savedAt), []]], ['rewards', 'gameplay', 'drivers', 'news'].filter(k => !on(c.pages[k].noindex)).map(k => ['/en/' + k, day(savedAt), []]),
        published(c).filter(n => String(n.titleEn || '').trim()).map(n => ['/en/news/' + encodeURIComponent(n.slug), day(n.modified || n.date), []]));
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.map(([p, d, im]) =>
      `<url><loc>${esc(base + p)}</loc>${d ? `<lastmod>${esc(d)}</lastmod>` : ''}${im.map(u => `<image:image><image:loc>${esc(u)}</image:loc></image:image>`).join('')}</url>`).join('\n')}\n</urlset>`;
  },

  robots(base) {
    return `User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${base}/sitemap.xml\n`;
  }
};

render.localize = localize;
render.enTwin = enTwin;
render.hasEnglish = hasEnglish;
render.pageExists = pageExists;
render.LEGAL_PATH = LEGAL_PATH;
render.LEGAL_ORDER = LEGAL_ORDER;
render.legalLabel = legalLabel;

module.exports = { render, PAGES, safeUrl, LOADER_STYLES };

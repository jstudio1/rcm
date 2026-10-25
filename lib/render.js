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
      else if (/^##\s+/.test(l)) { flush(); out += '<h2>' + inline(l.replace(/^##\s+/, '')) + '</h2>'; }
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

function ctx(c, base) {
  const name = c.site.name || 'Website';
  const abs = u => { u = safeUrl(u); return !u ? '' : u.startsWith('/') ? base + u : u; };
  return { c, base, name, abs };
}

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
  const url = base + o.path;
  const sameAs = Object.values(c.links.social).map(safeUrl).filter(Boolean);
  const ld = [{ '@context': 'https://schema.org', '@type': 'Organization', name, url: base + '/', logo: abs(logoOf(c)), sameAs }]
    .concat(o.path === '/' ? [{ '@context': 'https://schema.org', '@type': 'WebSite', name, url: base + '/', inLanguage: 'th' }] : [])
    .concat(o.jsonld || []);
  const tw = HANDLE_RE.test(s.twitter || '') ? '@' + s.twitter.replace(/^@/, '') : '';
  const ga = GA_RE.test(s.ga4 || '') ? s.ga4 : '';
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="${o.noindex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'}">
<link rel="canonical" href="${esc(url)}">
${VERIFY_RE.test(s.googleVerify || '') ? `<meta name="google-site-verification" content="${esc(s.googleVerify)}">` : ''}
${VERIFY_RE.test(s.bingVerify || '') ? `<meta name="msvalidate.01" content="${esc(s.bingVerify)}">` : ''}
<meta property="og:locale" content="th_TH">
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
const crumbs = (x, trail) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [['หน้าแรก', '/']].concat(trail).map(([n, u], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: x.base + u })) });
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

function header(x, active) {
  const { c, name } = x;
  const links = PAGES.map(k => `<a href="/${k}"${active === k ? ' class="act"' : ''}>${esc(c.pages[k].navLabel || k.toUpperCase())}</a>`).join('');
  const drawer = PAGES.map(k => `<a href="/${k}">${esc(c.pages[k].navLabel || k)}</a>`).join('');
  return `<header class="nav${active === 'home' ? '' : ' solid'}" id="nav"><div class="wrap">
  <a class="logo" href="/" aria-label="${esc(name)}"><img class="lg" src="${esc(logoOf(c))}" width="54" height="54" alt=""><b>${esc(name)}</b></a>
  <nav class="menu" aria-label="เมนูหลัก">${links}</nav>
  <div class="right"><a class="ob" href="/rewards">${esc(c.home.badge ? 'COMING SOON' : 'MENU')}</a><button class="burger" id="burger" aria-label="เปิดเมนู" aria-expanded="false"><span></span><span></span><span></span></button></div>
</div></header>
<div class="drawer" id="drawer">${drawer}</div>`;
}

function footer(x) {
  const { c, name } = x;
  return `<footer class="foot"><div class="wrap">
  <a class="fl" href="/"><img src="${esc(logoOf(c))}" width="44" height="44" alt="" loading="lazy" decoding="async">${esc(name)}</a>
  <nav aria-label="footer">${PAGES.map(k => `<a href="/${k}">${esc(c.pages[k].navLabel || k)}</a>`).join('')}</nav>
  <small>${esc(c.site.footer)}</small>
</div></footer>`;
}

function shell(x, o, inner, script) {
  return `<!doctype html>
<html lang="th">
<head>
${head(x, o)}
</head>
<body style="--art:url('${cssUrl(heroMedia(x.c.home, 'heroImage'))}')">
${header(x, o.active)}
${inner}
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script src="${asset(script || '/site.js')}" defer></script>
</body>
</html>`;
}

function pageHead(p) {
  return `<span class="eyebrow">${esc(p.eyebrow)}</span><h1 class="disp">${esc(p.h1)}</h1>${p.h2 ? `<h2 class="sub">${esc(p.h2)}</h2>` : ''}${p.intro ? `<p class="intro">${esc(p.intro)}</p>` : ''}`;
}
const pageTitle = (x, p) => p.seoTitle || `${p.h1} | ${x.name}`;

// ---- launcher-style news blocks (like the in-game "What's New" screen) ----
const DAY = 864e5;
// "today / yesterday / N days ago" for the last month, a full date after that
const ago = d => {
  const t = Date.parse(d); if (isNaN(t)) return '';
  const n = Math.floor((Date.now() - t) / DAY);
  return n < 0 || n > 30 ? fmtDate(d) : n === 0 ? 'วันนี้' : n === 1 ? 'เมื่อวาน' : n + ' วันที่แล้ว';
};
// tags read as yellow labels; patch / update / maintenance ones are red
const hot = t => /patch|update|maint|fix/i.test(t || '');
const pill = t => t ? `<span class="pill${hot(t) ? ' red' : ''}">${esc(t)}</span>` : '';
const newsHref = n => '/news/' + encodeURIComponent(n.slug);
const when = n => `<time datetime="${esc(n.date)}">${esc(ago(n.date))}</time>`;
// featured story + up to 3 side items, then the rest (up to `more`) as image cards
function whatsNew(list, more) {
  if (!list.length) return '';
  const [top, ...rest] = list, side = rest.slice(0, 3), extra = rest.slice(3, 3 + more);
  const alt = n => n.imageAlt || n.title;
  const feat = `<a class="wn-feat" href="${newsHref(top)}">${imgTag(top.image, alt(top), 'im')}${pill(top.tag)}<div class="c"><h3>${esc(top.title)}</h3>${top.excerpt ? `<p>${esc(top.excerpt)}</p>` : ''}${when(top)}</div></a>`;
  const items = side.map(n => `<a class="wn-item" href="${newsHref(n)}">${imgTag(n.image, alt(n), 'th')}<div class="c">${n.tag ? `<span class="cat${hot(n.tag) ? ' red' : ''}">${esc(n.tag)}</span>` : ''}<h4>${esc(n.title)}</h4>${n.excerpt ? `<p>${esc(n.excerpt)}</p>` : ''}</div></a>`).join('');
  const cards = extra.map(n => `<a class="mcard" href="${newsHref(n)}">${imgTag(n.image, alt(n), 'im')}${pill(n.tag)}<div class="c"><h3>${esc(n.title)}</h3>${when(n)}</div></a>`).join('');
  return `<div class="wn${side.length ? '' : ' solo'}">${feat}${side.length ? `<div class="wn-list">${items}</div>` : ''}</div>`
    + (cards ? `<h3 class="lx-sub">ข่าวสารเพิ่มเติม</h3><div class="wn-more">${cards}</div>` : '');
}
const gameplayCards = list => list.map(g => `<article class="feat">${imgTag(g.image, g.alt || g.title, 'im')}<div class="c"><h3>${esc(g.title)}</h3><p>${esc(g.desc)}</p></div></article>`).join('');
const published = c => c.news.filter(n => n.published).sort((a, b) => String(b.date).localeCompare(String(a.date)));

const render = {
  home(c, base) {
    const x = ctx(c, base), h = c.home, dl = c.links.download, so = c.links.social;
    const store = (k, label) => {
      const u = safeUrl(dl[k]);
      return u
        ? `<a class="store" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${svg(k)}<div><small>${esc(h.downloadLabel)}</small><b>${label}</b></div></a>`
        : `<button class="store" type="button" data-stay data-msg="เวอร์ชัน ${label} เร็วๆ นี้">${svg(k)}<div><small>${esc(h.soonLabel)}</small><b>${label}</b></div><em>SOON</em></button>`;
    };
    const social = cls => `<div class="social ${cls}"><span>${esc(h.followLabel)}</span>${[['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['discord', 'Discord'], ['youtube', 'YouTube']].map(([k, l]) => {
      const u = safeUrl(so[k]);
      return u ? `<a class="so" href="${esc(u)}" target="_blank" rel="noopener noreferrer" aria-label="${l}" title="${l}">${svg(k)}</a>`
        : `<a class="so" href="#" data-stay data-msg="" aria-label="${l}" title="${l} · Coming soon">${svg(k)}</a>`;
    }).join('')}</div>`;
    const reg = safeUrl(h.registerLink)
      ? `<a class="btn" href="${esc(safeUrl(h.registerLink))}" target="_blank" rel="noopener noreferrer">${esc(h.registerText)}</a>`
      : `<button class="btn" type="button" data-stay data-msg="${esc(h.registerMsg)}">${esc(h.registerText)} <small>SOON</small></button>`;
    const latest = published(c).slice(0, 7);
    // "COMING SOON · MOBILE & PC" -> big status + small platform line in the launcher-style dock
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
    <div class="dk-plat"><div class="plat-h">${esc(h.storesLabel)}</div><div class="stores">${store('windows', 'Windows PC')}${store('ios', 'App Store')}${store('android', 'Google Play')}</div>
      <div class="dk-soc">${social('dks')}<button class="snd" type="button" aria-pressed="true" aria-label="เสียงเอฟเฟกต์" title="เปิด/ปิดเสียงเอฟเฟกต์"><svg class="on" viewBox="0 0 24 24" aria-hidden="true"><path d="${SPK_ON}"/></svg><svg class="off" viewBox="0 0 24 24" aria-hidden="true"><path d="${SPK_OFF}"/></svg></button></div></div>
  </div></div>
</section>
${latest.length ? `<section class="sec lx" id="latest"><div class="wrap"><div class="lx-h"><h2>${esc(h.latestNewsTitle)}</h2><a class="more" href="/news">ดูทั้งหมด &rarr;</a></div>${whatsNew(latest, 3)}</div></section>` : ''}
${c.gameplay.length ? `<section class="sec" id="gameplay"><div class="wrap"><span class="eyebrow">${esc(c.pages.gameplay.eyebrow)}</span><h2 class="disp">${esc(c.pages.gameplay.h1)}</h2>${c.pages.gameplay.intro ? `<p class="intro">${esc(c.pages.gameplay.intro)}</p>` : ''}<div class="cards c3">${gameplayCards(c.gameplay.slice(0, 6))}</div><div class="cta"><a class="ghost" href="/gameplay">${esc(h.gameplayMore || 'ดูทั้งหมด')} &rarr;</a></div></div></section>` : ''}
${footer(x)}
</main>`;
    const heroImg = heroMedia(h, 'heroImage');
    // tells Google this site is about a video game (name, genre, platforms, publisher)
    const game = { '@context': 'https://schema.org', '@type': 'VideoGame', name: x.name, url: base + '/', description: c.site.description, image: x.abs(c.site.ogImage) || x.abs(heroImg), inLanguage: 'th', genre: ['Racing', 'Street racing'], gamePlatform: ['PC', 'iOS', 'Android'], applicationCategory: 'Game', operatingSystem: 'Windows, iOS, Android', publisher: { '@type': 'Organization', name: x.name, url: base + '/' }, sameAs: Object.values(c.links.social).map(safeUrl).filter(Boolean) };
    return shell(x, { path: '/', active: 'home', title: h.seoTitle || c.site.defaultTitle, description: h.seoDescription || c.site.description, preload: heroImg, jsonld: [game] }, inner, '/hero.js');
  },

  rewards(c, base) {
    const x = ctx(c, base), p = c.pages.rewards;
    const inner = `<main id="top"><section class="sec pg"><div class="wrap">${pageHead(p)}
<div class="cards c4">${c.rewards.map((r, i) => `<div class="card${i === c.rewards.length - 1 ? ' lg' : ''}"><div class="num">${esc(r.milestone)}</div><h3>${esc(r.title)}</h3><p>${esc(r.desc)}</p>${r.status ? `<span class="tag${/^unlock/i.test(r.status) ? ' on' : ''}">${esc(r.status)}</span>` : ''}</div>`).join('')}</div>
<div class="cta"><a class="btn" href="/">${esc(c.home.registerText)}</a></div>
</div></section>${footer(x)}</main>`;
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
${list.length ? whatsNew(list, 500) : `<p class="intro">${esc(p.empty || '')}</p>`}
</div></section>${footer(x)}</main>`;
    return shell(x, pageOpts(x, 'news'), inner);
  },

  article(c, base, n) {
    const x = ctx(c, base), path = '/news/' + encodeURIComponent(n.slug);
    const desc = n.seoDescription || n.excerpt || c.site.description;
    const inner = `<main id="top"><section class="sec pg"><div class="wrap"><article class="art">
<a class="back" href="/news">&larr; ${esc(c.pages.news.navLabel)}</a>
<div class="amr">${pill(n.tag)}<time datetime="${esc(n.date)}">${esc(fmtDate(n.date))}</time></div>
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
        { '@context': 'https://schema.org', '@type': 'NewsArticle', headline: n.title.slice(0, 110), description: desc, datePublished: n.date, dateModified: modified, image: safeUrl(n.image) ? [x.abs(n.image)] : undefined, inLanguage: 'th', mainEntityOfPage: { '@type': 'WebPage', '@id': base + path }, author: org, publisher: org },
        crumbs(x, [[c.pages.news.navLabel || 'News', '/news'], [n.title, path]])
      ]
    }, inner);
  },

  faq(c, base) {
    const x = ctx(c, base), p = c.pages.faq;
    const inner = `<main id="top"><section class="sec pg"><div class="wrap">${pageHead(p)}
<div class="faqs">${c.faq.map(f => `<details><summary><h3>${esc(f.q)}</h3></summary><p>${esc(f.a)}</p></details>`).join('')}</div>
</div></section>${footer(x)}</main>`;
    const o = pageOpts(x, 'faq');
    o.jsonld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: c.faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });
    return shell(x, o, inner);
  },

  notFound(c, base) {
    const x = ctx(c, base);
    return shell(x, { path: '/404', active: '', title: '404 | ' + x.name, description: '', noindex: true },
      `<main id="top"><section class="sec pg"><div class="wrap"><h1 class="disp">404</h1><p class="intro">ไม่พบหน้าที่ต้องการ</p><div class="cta"><a class="btn" href="/">กลับหน้าแรก</a></div></div></section>${footer(x)}</main>`);
  },

  // every public page with its last change date and the images on it (pages switched to "hide from Google" are left out)
  sitemap(c, base, savedAt) {
    const x = ctx(c, base), day = d => String(d || '').slice(0, 10);
    const imgs = list => [...new Set(list.map(u => x.abs(u)).filter(Boolean))];
    const pageImgs = { gameplay: c.gameplay.map(g => g.image), drivers: c.drivers.map(d => d.image), news: published(c).map(n => n.image) };
    const urls = [['/', day(savedAt), imgs([heroMedia(c.home, 'heroImage'), c.site.ogImage])]]
      .concat(PAGES.filter(k => !on(c.pages[k].noindex)).map(k => ['/' + k, day(savedAt), imgs(pageImgs[k] || [])]))
      .concat(published(c).map(n => ['/news/' + encodeURIComponent(n.slug), day(n.modified || n.date), imgs([n.image])]));
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.map(([p, d, im]) =>
      `<url><loc>${esc(base + p)}</loc>${d ? `<lastmod>${esc(d)}</lastmod>` : ''}${im.map(u => `<image:image><image:loc>${esc(u)}</image:loc></image:image>`).join('')}</url>`).join('\n')}\n</urlset>`;
  },

  robots(base) {
    return `User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${base}/sitemap.xml\n`;
  }
};

module.exports = { render, PAGES, safeUrl };

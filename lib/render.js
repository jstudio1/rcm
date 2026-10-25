// Server-side rendering: every public page is plain HTML (good for SEO), built from data/content.json.
const icons = require('../views/icons.json');

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Allowed: http(s) links, site paths, #anchors, mailto. Backslashes and control/space characters are refused
// because browsers turn "/\evil.com" or "/<tab>/evil.com" into a link to another site.
const safeUrl = u => {
  u = String(u || '').trim();
  if (/[\\\u0000- \u007f]/.test(u)) return '';
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
const HERO_DEFAULTS = { heroVideo: '/img/rc_burn_v2.mp4', heroVideoMobile: '/img/rc_burn_v2_m.mp4', heroImage: '/img/keyart_rc_v1_web.jpg' };
const heroMedia = (h, k) => safeUrl(h[k]) || (h[k] ? '' : HERO_DEFAULTS[k]);

function ctx(c, base) {
  const name = c.site.name || 'Website';
  const abs = u => { u = safeUrl(u); return !u ? '' : u.startsWith('/') ? base + u : u; };
  return { c, base, name, abs };
}

function head(x, o) {
  const { c, base, abs, name } = x;
  const title = o.title || c.site.defaultTitle || name;
  const desc = o.description || c.site.description || '';
  const img = abs(o.image || c.site.ogImage);
  const url = base + o.path;
  const ld = [{ '@context': 'https://schema.org', '@type': 'Organization', name, url: base + '/', logo: abs(logoOf(c)), sameAs: Object.values(c.links.social).map(safeUrl).filter(Boolean) }]
    .concat(o.path === '/' ? [{ '@context': 'https://schema.org', '@type': 'WebSite', name, url: base + '/' }] : [])
    .concat(o.jsonld || []);
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${c.site.keywords ? `<meta name="keywords" content="${esc(c.site.keywords)}">` : ''}
<meta name="robots" content="${o.noindex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large'}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:site_name" content="${esc(name)}">
<meta property="og:type" content="${o.ogType || 'website'}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
${img ? `<meta property="og:image" content="${esc(img)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
${img ? `<meta name="twitter:image" content="${esc(img)}">` : ''}
<meta name="theme-color" content="#0b0c10">
<link rel="icon" href="${esc(iconOf(c))}">
<link rel="shortcut icon" href="/favicon.ico">
<link rel="apple-touch-icon" href="${esc(safeUrl(c.site.favicon) || '/img/apple-touch-icon.png')}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,500;0,600;0,700;0,800;1,800&family=Barlow:wght@400;500;600&family=Kanit:wght@300;400;500;600&display=swap">
<link rel="stylesheet" href="/style.css">
${ld.map(o2 => `<script type="application/ld+json">${j(o2)}</script>`).join('\n')}`;
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
  <a class="fl" href="/"><img src="${esc(logoOf(c))}" alt="">${esc(name)}</a>
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
<script src="${script || '/site.js'}"></script>
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
const bgImg = u => safeUrl(u) ? ` style="background-image:url('${cssUrl(u)}')"` : '';
const newsHref = n => '/news/' + encodeURIComponent(n.slug);
const when = n => `<time datetime="${esc(n.date)}">${esc(ago(n.date))}</time>`;
// featured story + up to 3 side items, then the rest (up to `more`) as image cards
function whatsNew(list, more) {
  if (!list.length) return '';
  const [top, ...rest] = list, side = rest.slice(0, 3), extra = rest.slice(3, 3 + more);
  const feat = `<a class="wn-feat" href="${newsHref(top)}"><div class="im"${bgImg(top.image)}></div>${pill(top.tag)}<div class="c"><h3>${esc(top.title)}</h3>${top.excerpt ? `<p>${esc(top.excerpt)}</p>` : ''}${when(top)}</div></a>`;
  const items = side.map(n => `<a class="wn-item" href="${newsHref(n)}"><div class="th"${bgImg(n.image)}></div><div class="c">${n.tag ? `<span class="cat${hot(n.tag) ? ' red' : ''}">${esc(n.tag)}</span>` : ''}<h4>${esc(n.title)}</h4>${n.excerpt ? `<p>${esc(n.excerpt)}</p>` : ''}</div></a>`).join('');
  const cards = extra.map(n => `<a class="mcard" href="${newsHref(n)}"><div class="im"${bgImg(n.image)}></div>${pill(n.tag)}<div class="c"><h3>${esc(n.title)}</h3>${when(n)}</div></a>`).join('');
  return `<div class="wn${side.length ? '' : ' solo'}">${feat}${side.length ? `<div class="wn-list">${items}</div>` : ''}</div>`
    + (cards ? `<h3 class="lx-sub">ข่าวสารเพิ่มเติม</h3><div class="wn-more">${cards}</div>` : '');
}
const gameplayCards = list => list.map(g => `<article class="feat"><div class="im" role="img" aria-label="${esc(g.alt || g.title)}" style="background-image:url('${cssUrl(g.image)}')"></div><div class="c"><h3>${esc(g.title)}</h3><p>${esc(g.desc)}</p></div></article>`).join('');
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
      <div class="dk-soc">${social('dk')}<button class="snd" type="button" aria-pressed="true" aria-label="เสียงเอฟเฟกต์" title="เปิด/ปิดเสียงเอฟเฟกต์"><svg class="on" viewBox="0 0 24 24" aria-hidden="true"><path d="${SPK_ON}"/></svg><svg class="off" viewBox="0 0 24 24" aria-hidden="true"><path d="${SPK_OFF}"/></svg></button></div></div>
  </div></div>
</section>
${latest.length ? `<section class="sec lx" id="latest"><div class="wrap"><div class="lx-h"><h2>${esc(h.latestNewsTitle)}</h2><a class="more" href="/news">ดูทั้งหมด &rarr;</a></div>${whatsNew(latest, 3)}</div></section>` : ''}
${c.gameplay.length ? `<section class="sec" id="gameplay"><div class="wrap"><span class="eyebrow">${esc(c.pages.gameplay.eyebrow)}</span><h2 class="disp">${esc(c.pages.gameplay.h1)}</h2>${c.pages.gameplay.intro ? `<p class="intro">${esc(c.pages.gameplay.intro)}</p>` : ''}<div class="cards c3">${gameplayCards(c.gameplay.slice(0, 6))}</div><div class="cta"><a class="ghost" href="/gameplay">${esc(h.gameplayMore || 'ดูทั้งหมด')} &rarr;</a></div></div></section>` : ''}
${footer(x)}
</main>`;
    return shell(x, { path: '/', active: 'home', title: h.seoTitle || c.site.defaultTitle, description: h.seoDescription || c.site.description }, inner, '/hero.js');
  },

  rewards(c, base) {
    const x = ctx(c, base), p = c.pages.rewards;
    const inner = `<main id="top"><section class="sec pg"><div class="wrap">${pageHead(p)}
<div class="cards c4">${c.rewards.map((r, i) => `<div class="card${i === c.rewards.length - 1 ? ' lg' : ''}"><div class="num">${esc(r.milestone)}</div><h3>${esc(r.title)}</h3><p>${esc(r.desc)}</p>${r.status ? `<span class="tag${/^unlock/i.test(r.status) ? ' on' : ''}">${esc(r.status)}</span>` : ''}</div>`).join('')}</div>
<div class="cta"><a class="btn" href="/">${esc(c.home.registerText)}</a></div>
</div></section>${footer(x)}</main>`;
    return shell(x, { path: '/rewards', active: 'rewards', title: pageTitle(x, p), description: p.seoDescription }, inner);
  },

  gameplay(c, base) {
    const x = ctx(c, base), p = c.pages.gameplay;
    const inner = `<main id="top"><section class="sec pg"><div class="wrap">${pageHead(p)}
<div class="cards c3">${gameplayCards(c.gameplay)}</div>
</div></section>${footer(x)}</main>`;
    return shell(x, { path: '/gameplay', active: 'gameplay', title: pageTitle(x, p), description: p.seoDescription }, inner);
  },

  drivers(c, base) {
    const x = ctx(c, base), p = c.pages.drivers;
    const inner = `<main id="top"><section class="sec pg"><div class="wrap">${pageHead(p)}
<div class="cards c4">${c.drivers.map(d => `<article class="feat"><div class="im" role="img" aria-label="${esc(d.title)}" style="background-image:url('${cssUrl(d.image)}');background-position:${esc(String(d.pos || 'center').replace(/[^0-9a-z% .-]/gi, ''))}"></div>${d.badge ? `<span class="st">${esc(d.badge)}</span>` : ''}<div class="c"><h3>${esc(d.title)}</h3><p>${esc(d.desc)}</p></div></article>`).join('')}</div>
</div></section>${footer(x)}</main>`;
    return shell(x, { path: '/drivers', active: 'drivers', title: pageTitle(x, p), description: p.seoDescription }, inner);
  },

  news(c, base) {
    const x = ctx(c, base), p = c.pages.news, list = published(c);
    const inner = `<main id="top"><section class="sec pg news"><div class="wrap">${pageHead(p)}
${list.length ? whatsNew(list, 500) : `<p class="intro">${esc(p.empty || '')}</p>`}
</div></section>${footer(x)}</main>`;
    return shell(x, { path: '/news', active: 'news', title: pageTitle(x, p), description: p.seoDescription }, inner);
  },

  article(c, base, n) {
    const x = ctx(c, base), path = '/news/' + encodeURIComponent(n.slug);
    const desc = n.seoDescription || n.excerpt || c.site.description;
    const inner = `<main id="top"><section class="sec pg"><div class="wrap"><article class="art">
<a class="back" href="/news">&larr; ${esc(c.pages.news.navLabel)}</a>
<div class="amr">${pill(n.tag)}<time datetime="${esc(n.date)}">${esc(fmtDate(n.date))}</time></div>
<h1 class="disp">${esc(n.title)}</h1>
${n.image ? `<img class="hero-img" src="${esc(safeUrl(n.image))}" alt="${esc(n.title)}">` : ''}
<div class="prose">${body(n.body)}</div>
</article></div></section>${footer(x)}</main>`;
    return shell(x, {
      path, active: 'news', ogType: 'article', image: n.image,
      title: n.seoTitle || `${n.title} | ${x.name}`, description: desc,
      jsonld: [{ '@context': 'https://schema.org', '@type': 'NewsArticle', headline: n.title, datePublished: n.date, description: desc, image: n.image ? [x.abs(n.image)] : undefined, mainEntityOfPage: base + path, publisher: { '@type': 'Organization', name: x.name } }]
    }, inner);
  },

  faq(c, base) {
    const x = ctx(c, base), p = c.pages.faq;
    const inner = `<main id="top"><section class="sec pg"><div class="wrap">${pageHead(p)}
<div class="faqs">${c.faq.map(f => `<details><summary><h3>${esc(f.q)}</h3></summary><p>${esc(f.a)}</p></details>`).join('')}</div>
</div></section>${footer(x)}</main>`;
    return shell(x, {
      path: '/faq', active: 'faq', title: pageTitle(x, p), description: p.seoDescription,
      jsonld: [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: c.faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }]
    }, inner);
  },

  notFound(c, base) {
    const x = ctx(c, base);
    return shell(x, { path: '/404', active: '', title: '404 | ' + x.name, description: '', noindex: true },
      `<main id="top"><section class="sec pg"><div class="wrap"><h1 class="disp">404</h1><p class="intro">ไม่พบหน้าที่ต้องการ</p><div class="cta"><a class="btn" href="/">กลับหน้าแรก</a></div></div></section>${footer(x)}</main>`);
  },

  sitemap(c, base) {
    const urls = [['/', ''], ...PAGES.map(k => ['/' + k, ''])].concat(published(c).map(n => ['/news/' + encodeURIComponent(n.slug), n.date]));
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([p, d]) => `<url><loc>${esc(base + p)}</loc>${d ? `<lastmod>${esc(String(d).slice(0, 10))}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>`;
  },

  robots(base) {
    return `User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${base}/sitemap.xml\n`;
  }
};

module.exports = { render, PAGES, safeUrl };

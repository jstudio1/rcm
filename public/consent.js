// Cookie consent banner. The texts and buttons come from the admin (Cookies & consent) and are already in the page;
// this file only shows/hides them and stores the visitor's choice in the "rc_consent" cookie: "<version>.<1|0>".
// Analytics (the server-side visitor id, and Google Analytics when an ID is set) only runs after "accept".
(function () {
  var el = document.getElementById('cc');
  if (!el) return;
  var ver = el.getAttribute('data-ver') || '1', ga = el.getAttribute('data-ga') || '', gaSrc = el.getAttribute('data-ga-src') || '/ga.js';
  var main = el.querySelector('.cc-main'), set = el.querySelector('.cc-set'), an = el.querySelector('[data-cc-an]');
  var secure = location.protocol === 'https:', opener = null;

  function read() { // true / false, or null when there is no valid choice for this policy version
    var m = document.cookie.match(/(?:^|; )rc_consent=([^;]*)/);
    if (!m) return null;
    var v = m[1].split('.');
    return v[0] === ver ? v[1] === '1' : null;
  }
  function write(yes) {
    document.cookie = 'rc_consent=' + ver + '.' + (yes ? 1 : 0) + '; Max-Age=15552000; Path=/; SameSite=Lax' + (secure ? '; Secure' : '');
  }
  function loadGa() {
    if (!ga || window.__rcGa) return;
    window.__rcGa = 1;
    var a = document.createElement('script'); a.async = true; a.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ga);
    document.head.appendChild(a);
    var b = document.createElement('script'); b.src = gaSrc; b.setAttribute('data-ga', ga);
    document.head.appendChild(b);
  }
  function dropGa() {
    if (ga) window['ga-disable-' + ga] = true;
    var host = location.hostname, parts = host.split('.');
    document.cookie.split('; ').forEach(function (c) {
      var n = c.split('=')[0];
      if (n === '_ga' || n.indexOf('_ga_') === 0 || n === '_gid') {
        document.cookie = n + '=; Max-Age=0; Path=/';
        document.cookie = n + '=; Max-Age=0; Path=/; Domain=' + host;
        if (parts.length > 2) document.cookie = n + '=; Max-Age=0; Path=/; Domain=.' + parts.slice(-2).join('.');
        document.cookie = n + '=; Max-Age=0; Path=/; Domain=.' + host;
      }
    });
  }
  function view(which) { main.hidden = which !== 'main'; set.hidden = which !== 'set'; }
  function show(which, quiet) {
    opener = document.activeElement;
    var cur = read();
    if (an) an.checked = cur === true;
    view(which || 'main');
    el.hidden = false;
    var first = el.querySelector('.cc-b.pri'); if (first && !quiet) setTimeout(function () { first.focus(); }, 30);
  }
  function hide() {
    el.hidden = true;
    if (opener && opener.focus && document.contains(opener)) { try { opener.focus(); } catch (e) {} }
  }
  function choose(yes) {
    write(yes);
    if (yes) loadGa();
    else { dropGa(); try { fetch('/api/cc', { credentials: 'same-origin', cache: 'no-store' }); } catch (e) {} }
    hide();
    try { document.dispatchEvent(new CustomEvent('rc-consent', { detail: { analytics: yes } })); } catch (e) {}
  }

  el.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-cc]') : null;
    if (!b) return;
    var a = b.getAttribute('data-cc');
    if (a === 'accept') choose(true);
    else if (a === 'reject') choose(false);
    else if (a === 'custom') { if (an) an.checked = read() === true; view('set'); }
    else if (a === 'save') choose(!!(an && an.checked));
  });
  document.addEventListener('click', function (e) { // "ตั้งค่าคุกกี้" links in the footer / policy page
    var o = e.target.closest ? e.target.closest('[data-cc-open]') : null;
    if (o) { e.preventDefault(); show('set'); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !el.hidden && read() !== null) hide();
  });

  var state = read();
  if (state === true) loadGa();
  // the full-screen loading screen goes first; the banner follows as soon as it is gone
  function start() {
    if (/[?&]cc=open\b/.test(location.search)) show('main', true);
    else if (state === null) show('main', true);
  }
  if (document.documentElement.classList.contains('ldr-on')) {
    var done = false, go = function () { if (!done) { done = true; start(); } };
    document.addEventListener('rc-loaded', function () { setTimeout(go, 700); });
    setTimeout(go, 9000);
  } else start();
})();

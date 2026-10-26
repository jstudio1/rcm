// Loading-screen engine, shared by every design (launcher, tachometer, headlights, neon).
// Runs right after the loader markup, before the rest of the page is parsed.
// It only drives progress and phases; each design reacts through these hooks:
//   --p on .ldr (0..1)        progress, for CSS (needle angle, brightness, bar width...)
//   .ldr-fill                 scaled to the progress
//   .ldr-pct                  "42%"
//   .ldr-st[data-ready]       status text, replaced by data-ready when ready
//   .ldr-wait[data-ready]     secondary label, same
//   [data-steps="N,1,2"]      text that steps through the list as loading advances (e.g. gears)
//   [data-lit] > *            children get .on one by one (lights, LEDs)
//   .ldr-tip                  rotating tips while loading
//   .ldr-go                   START button: enabled when ready, click enters at once
//   classes .ready / .open    phases: loaded / leaving (the design animates its own exit)
// It stays at least MIN ms (so the animation reads) and never longer than MAX ms.
(function () {
  var el = document.getElementById('ldr');
  if (!el) return;
  var root = document.documentElement, KEY = 'rc-ldr-seen';
  var preview = /[?&]loader=preview\b/.test(location.search);
  try { if (!preview && el.getAttribute('data-once') === '1' && sessionStorage.getItem(KEY)) { el.parentNode.removeChild(el); return; } } catch (e) {}

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MIN = reduce ? 300 : +(el.getAttribute('data-min') || 1600), DWELL = reduce ? 200 : 900, MAX = +(el.getAttribute('data-max') || 4200), t0 = Date.now();
  root.classList.add('ldr-on');

  var $ = function (s) { return el.querySelector(s); }, $$ = function (s) { return el.querySelectorAll(s); };
  var fill = $('.ldr-fill'), pct = $('.ldr-pct'), tip = $('.ldr-tip'), btn = $('.ldr-go');
  var steps = $$('[data-steps]'), litSets = $$('[data-lit]');
  var TIPS = ['กำลังเตรียมสนามแข่ง…', 'เช็กลมยาง…', 'เติมน้ำมันให้เต็มถัง…', 'จูนเครื่องยนต์…', 'อุ่นยางให้พร้อม…', 'รอสัญญาณไฟเขียว…'];
  var p = 0, loaded = false, ready = false, done = false, ti = 0;

  var tipTimer = tip ? setInterval(function () {
    if (ready) return;
    tip.classList.add('swap');
    setTimeout(function () { ti = (ti + 1) % TIPS.length; tip.textContent = TIPS[ti]; tip.classList.remove('swap'); }, 250);
  }, 900) : 0;

  function paint() {
    var f = p / 100, i, j;
    el.style.setProperty('--p', f.toFixed(4));
    if (fill) fill.style.transform = 'scaleX(' + f + ')';
    if (pct) pct.textContent = Math.round(p) + '%';
    el.setAttribute('aria-valuenow', Math.round(p));
    for (i = 0; i < steps.length; i++) {
      var list = steps[i].getAttribute('data-steps').split(',');
      steps[i].textContent = list[Math.min(list.length - 1, Math.floor(f * list.length))];
    }
    for (i = 0; i < litSets.length; i++) {
      var kids = litSets[i].children, n = Math.floor(f * kids.length + 0.0001);
      for (j = 0; j < kids.length; j++) kids[j].classList.toggle('on', j < n);
    }
  }
  function tick() {
    if (ready) return;
    // never faster than MIN: even a cached, instant load shows the whole sweep (needle, lights, bar)
    var cap = Math.min(100, (Date.now() - t0) / MIN * 100);
    var target = Math.min(loaded ? 100 : 90, cap);
    p += (target - p) * (loaded ? 0.2 : 0.06);
    if (loaded && cap >= 100 && p > 99.4) p = 100;
    paint();
    if (p < 100) requestAnimationFrame(tick);
    else setReady();
  }
  function relabel(sel) { var x = $(sel); if (x && x.hasAttribute('data-ready')) x.textContent = x.getAttribute('data-ready'); }
  function setReady() {
    if (ready) return;
    ready = true; p = 100; paint();
    if (tipTimer) clearInterval(tipTimer);
    el.classList.add('ready');
    relabel('.ldr-st'); relabel('.ldr-wait');
    if (tip) tip.textContent = 'พร้อมออกสตาร์ทแล้ว!';
    if (btn) btn.disabled = false;
    setTimeout(go, DWELL);
  }
  function go() {
    if (done) return;
    if (!ready) setReady();
    done = true;
    try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
    el.classList.add('open');
    // the scrollbar comes back when scrolling unlocks; a design that covers the screen while leaving
    // (tuk-tuk flash) sets data-unlock so that small sideways shift happens out of sight
    var unlock = +(el.getAttribute('data-unlock') || 0);
    if (unlock) setTimeout(function () { root.classList.remove('ldr-on'); }, unlock); else root.classList.remove('ldr-on');
    try { document.dispatchEvent(new CustomEvent('rc-loaded')); } catch (e) {}
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1000);
  }
  if (btn) btn.addEventListener('click', go);

  if (document.readyState === 'complete') loaded = true;
  else window.addEventListener('load', function () { loaded = true; });
  setTimeout(function () { loaded = true; }, MAX - DWELL - 600); // slow connection: finish anyway
  setTimeout(go, MAX);
  requestAnimationFrame(tick);
})();

// Pre-registration rewards: keeps the counter, goal states and the reward detail in step with the number of sign-ups.
// The server already drew everything for the number it knows; this script only (1) lets a visitor pick a reward,
// (2) counts the number up, and (3) in API mode asks the game's endpoint for the live number. Text only, no HTML strings.
(function () {
  'use strict';
  var root = document.getElementById('prereg');
  if (!root) return;
  var cfg = {}; try { cfg = JSON.parse(root.getAttribute('data-cfg') || '{}'); } catch (e) {}
  var T = cfg.text || {};
  var cols = [].slice.call(root.querySelectorAll('.pr-col'));
  var goals = cols.map(function (c) { return Number(c.getAttribute('data-goal')); });
  var details = [].slice.call(root.querySelectorAll('.pr-d'));
  var numEl = root.querySelector('[data-count]'), nextEl = root.querySelector('[data-next]'), doneEl = root.querySelector('[data-reached]');
  var fmt = function (n) { return Number(n).toLocaleString('en-US'); };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var shown = Number(numEl && numEl.getAttribute('data-n')) || 0;

  function nextText(left) {
    nextEl.textContent = '';
    if (left <= 0) { nextEl.textContent = T.done || ''; return; }
    String(T.next || '{n}').split('{n}').forEach(function (part, i, a) {
      nextEl.appendChild(document.createTextNode(part));
      if (i < a.length - 1) { var b = document.createElement('b'); b.setAttribute('data-left', ''); b.textContent = fmt(left); nextEl.appendChild(b); }
    });
  }
  function apply(count) {
    var nextIdx = -1, reached = 0;
    goals.forEach(function (g, i) { if (count >= g) reached++; else if (nextIdx < 0) nextIdx = i; });
    cols.forEach(function (col, i) {
      var s = count >= goals[i] ? 'reached' : i === nextIdx ? 'next' : 'locked';
      col.className = 'pr-col ' + s;
      col.querySelector('[data-chip]').textContent = s === 'reached' ? T.reached : s === 'next' ? T.nextLabel : T.locked;
      if (details[i]) details[i].classList.toggle('ok', s === 'reached');
      col.style.setProperty('--f', (i >= goals.length - 1 ? 0 : Math.max(0, Math.min(100, (count - goals[i]) / (goals[i + 1] - goals[i]) * 100))) + '%');
    });
    if (doneEl) doneEl.textContent = String(reached);
    nextText(nextIdx < 0 ? 0 : goals[nextIdx] - count);
  }
  function show(n) { if (numEl) { numEl.textContent = fmt(n); numEl.setAttribute('data-n', String(n)); } }
  function countTo(to) {
    if (reduce || !numEl || Math.abs(to - shown) < 2) { shown = to; show(to); return; }
    var from = shown, t0 = null;
    (function step(t) {
      if (t0 === null) t0 = t;
      var k = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - k, 3);
      show(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(step); else shown = to;
    })(performance.now());
  }

  // choose a reward
  root.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.pr-card');
    if (!b) return;
    var i = b.getAttribute('data-i');
    [].forEach.call(root.querySelectorAll('.pr-card'), function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
    details.forEach(function (d) { d.hidden = d.getAttribute('data-i') !== i; });
  });

  // count up when the section scrolls into view
  if ('IntersectionObserver' in window && !reduce && numEl) {
    var final = shown; show(0); shown = 0;
    new IntersectionObserver(function (es, ob) { if (es[0].isIntersecting) { ob.disconnect(); countTo(final); } }, { threshold: 0.3 }).observe(root);
  }

  // live number from the game (API mode)
  if (cfg.api) {
    var busy = false;
    var pull = function () {
      if (busy || document.hidden) return;
      busy = true;
      var ctl = window.AbortController ? new AbortController() : null, timer = ctl && setTimeout(function () { ctl.abort(); }, 6000);
      fetch(cfg.api, { credentials: 'omit', headers: { Accept: 'application/json' }, signal: ctl ? ctl.signal : undefined })
        .then(function (r) { if (!r.ok) throw new Error('bad status'); return r.json(); })
        .then(function (d) {
          var n = Number(d && (d.count != null ? d.count : d.total));
          if (isFinite(n) && n >= 0) { n = Math.floor(n); apply(n); countTo(n); }
        })
        .catch(function () {})
        .then(function () { if (timer) clearTimeout(timer); busy = false; });
    };
    pull();
    setInterval(pull, Math.max(30, Number(cfg.every) || 60) * 1000);
    document.addEventListener('visibilitychange', pull); // coming back to the tab refreshes straight away
  }
})();

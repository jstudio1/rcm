// Pre-registration rewards: how many people have signed up, and the rewards unlocked at each goal.
// A mockup until it is wired to the game: in "mock" mode the count is the number typed in the admin; in "api" mode
// the page asks the address set in the admin (a JSON endpoint answering {"count": 13002}). The count shown by the
// server is always the fallback, so the section reads correctly even without JavaScript or while the API is slow.

const on = v => v === true || v === 'true' || v === '1';
const enabled = c => on((c.prereg || {}).enabled);

// public number endpoint: https only (http only for a developer's own machine), no credentials in the address
function apiUrl(c) {
  const p = c.prereg || {};
  if (p.mode !== 'api') return '';
  let u; try { u = new URL(String(p.apiUrl || '').trim()); } catch (e) { return ''; }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.username || u.password || !(u.protocol === 'https:' || (u.protocol === 'http:' && local))) return '';
  u.hash = '';
  return u.href;
}
const apiOrigin = c => { const u = apiUrl(c); return u ? new URL(u).origin : ''; };

// a goal is the number typed in "target", or the milestone label read as 5000 / 50K / 1.5M
function goalOf(r) {
  const t = Number(String(r.target || '').replace(/[^\d.]/g, ''));
  if (t > 0) return Math.round(t);
  const m = /^\s*([\d,.]+)\s*([kKmM]?)\s*$/.exec(String(r.milestone || ''));
  if (!m) return 0;
  const n = Number(m[1].replace(/,/g, ''));
  return Math.round(n * ({ k: 1e3, m: 1e6 }[m[2].toLowerCase()] || 1)) || 0;
}
const fmt = n => Number(n || 0).toLocaleString('en-US');
const countOf = c => { const n = Number(String((c.prereg || {}).mockCount || '').replace(/[^\d]/g, '')); return Number.isFinite(n) ? n : 0; };

module.exports = function make(h) {
  const { esc, safeUrl, imgTag } = h;
  const ICON = {
    gift: 'M3 9h18v4H3zM5 13v8h14v-8M12 9v12M12 9c-3 0-4-4-1-4 2 0 1 4 1 4zm0 0c3 0 4-4 1-4-2 0-1 4-1 4z',
    users: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5M17 4.5a3.2 3.2 0 010 6.2M19 14.8c2 .6 3 2.2 3 4.2',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    lock: 'M6 11h12v10H6zM8 11V8a4 4 0 018 0v3',
    info: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 11v6M12 7.5v.5',
    arrow: 'M5 12h14M13 6l6 6-6 6'
  };
  const ic = (k, cls) => `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON[k]}"/></svg>`;
  const fill = (tpl, n) => esc(tpl).replace(/\{n\}/g, '<b data-left>' + fmt(n) + '</b>');

  return function section(c, x, where) {
    const p = c.prereg, count = countOf(c);
    const goals = c.rewards.map(r => Object.assign({ g: goalOf(r) }, r)).filter(r => r.g > 0).sort((a, b) => a.g - b.g);
    if (!goals.length) return '';
    const reached = goals.filter(r => count >= r.g).length, nextIdx = goals.findIndex(r => count < r.g);
    const sel = Math.max(0, reached - 1);
    const left = nextIdx < 0 ? 0 : goals[nextIdx].g - count;
    const api = apiUrl(c);
    const cfg = { api, every: 60, text: { next: p.nextText, done: p.allDoneText, reached: p.reachedLabel, nextLabel: p.nextLabel, locked: p.lockedLabel, dReached: p.detailReached, dLocked: p.detailLocked } };
    const stateOf = i => (count >= goals[i].g ? 'reached' : i === nextIdx ? 'next' : 'locked');
    const chip = s => (s === 'reached' ? p.reachedLabel : s === 'next' ? p.nextLabel : p.lockedLabel);
    const dot = () => ic('check', 'k') + ic('lock', 'l');
    const cols = goals.map((r, i) => {
      const s = stateOf(i), pic = r.image ? imgTag(r.image, r.alt || r.title, 'pr-img') : `<span class="pr-img ph">${ic('gift')}</span>`;
      return `<li class="pr-col ${s}" data-goal="${r.g}"><span class="pr-dot">${dot()}</span>
  <button type="button" class="pr-card" data-i="${i}" aria-pressed="${i === sel ? 'true' : 'false'}"><span class="pr-g"><b>${fmt(r.g)}</b> <small>${esc(p.unit)}</small></span><span class="pr-chip sm" data-chip>${esc(chip(s))}</span>${pic}<strong class="pr-t">${esc(r.title)}</strong><span class="pr-v">${esc(p.viewLabel)} ${ic('arrow', 'ar')}</span></button></li>`;
    }).join('');
    const detail = goals.map((r, i) => `<div class="pr-d${count >= r.g ? ' ok' : ''}" data-i="${i}"${i === sel ? '' : ' hidden'}><span class="pr-di">${ic('gift')}</span><div><b>${esc(r.title)}</b> <small>${fmt(r.g)} ${esc(p.unit)}</small><p>${esc(r.desc)}</p></div><span class="pr-ds"><span class="y">${ic('check')} ${esc(p.detailReached)}</span><span class="n">${esc(p.detailLocked)}</span></span></div>`).join('');
    const h2 = x.c.home, link = safeUrl(h2.registerLink);
    const showReg = !x.c.links.show || on(x.c.links.show.register);
    const cta = !showReg ? '' : link
      ? `<a class="btn pr-btn" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${ic('users')} ${esc(h2.registerText)} ${ic('arrow')}</a>`
      : `<button class="btn pr-btn" type="button" data-stay data-msg="${esc(h2.registerMsg)}">${ic('users')} ${esc(h2.registerText)} ${ic('arrow')}</button>`;
    const heading = where === 'home' ? 'h2' : 'h1';
    return `<section class="pr" id="prereg" data-cfg="${esc(JSON.stringify(cfg))}" aria-label="${esc(p.eyebrow)}">
<div class="pr-head"><span class="eyebrow">${ic('gift', 'ey')} ${esc(p.eyebrow)}</span><${heading} class="disp">${esc(p.title)} <em>${esc(p.titleAccent)}</em></${heading}><p>${esc(p.intro)}</p></div>
<div class="pr-count"><span class="pr-chip">${ic('info')} ${esc(p.statusLabel)}</span><div class="pr-lab">${ic('users')} ${esc(p.counterLabel)}</div>
<div class="pr-num"><b data-count data-n="${count}">${fmt(count)}</b><small>${esc(p.unit)}</small></div>
<p class="pr-next" data-next>${nextIdx < 0 ? esc(p.allDoneText) : fill(p.nextText, left)}</p></div>
<div class="pr-bar"><span>${ic('gift')} ${esc(p.goalsLabel)}</span><span>${esc(p.reachedCount)} <b data-reached>${reached}</b> / ${goals.length}</span></div>
<ol class="pr-grid">${cols}</ol>
<div class="pr-detail" aria-live="polite">${detail}</div>
${cta ? `<div class="pr-cta">${cta}</div>` : ''}
</section>`;
  };
};
module.exports.enabled = enabled; module.exports.apiUrl = apiUrl; module.exports.apiOrigin = apiOrigin; module.exports.goalOf = goalOf; module.exports.countOf = countOf;

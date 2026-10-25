// Google PageSpeed Insights from the admin: run a test, keep a history, optional daily auto-check.
// Everything lives in data/pagespeed.json (git-ignored, because it may hold the API key).
// Runs happen in the background; the admin polls for the result, so slow tests never hit proxy timeouts.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DIR, 'pagespeed.json');
const API = process.env.PSI_API_URL || 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'; // override only for local testing
const KEY_RE = /^[A-Za-z0-9_-]{20,80}$/;
const MAX_HISTORY = 300;
const STALE_MS = 180e3; // a run older than this is treated as dead (e.g. the process restarted mid-test)
const METRICS = { fcp: 'first-contentful-paint', lcp: 'largest-contentful-paint', tbt: 'total-blocking-time', cls: 'cumulative-layout-shift', si: 'speed-index' };
const METRIC_IDS = new Set(Object.values(METRICS).concat(['interactive', 'max-potential-fid', 'final-screenshot', 'screenshot-thumbnails', 'full-page-screenshot', 'main-thread-tasks', 'metrics', 'network-requests', 'diagnostics', 'largest-contentful-paint-element', 'layout-shifts', 'long-tasks', 'critical-request-chains', 'resource-summary', 'third-party-summary']));

function read() {
  try { const o = JSON.parse(fs.readFileSync(FILE, 'utf8')); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
}
function write(o) {
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = FILE + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(o), { mode: 0o600 });
  fs.renameSync(tmp, FILE);
}
const update = fn => { const s = read(); fn(s); write(s); return s; };

// what the admin is allowed to see (never the key itself)
function status() {
  const s = read(), now = Date.now();
  const running = s.running && now - s.running.started < STALE_MS ? Object.assign({}, s.running, { elapsed: Math.round((now - s.running.started) / 1000) }) : null;
  return {
    hasKey: !!s.key, keyHint: s.key ? '…' + s.key.slice(-4) : '',
    auto: Object.assign({ on: false, hour: 3 }, s.auto), lastAuto: s.lastAuto || '',
    running, error: s.error || null,
    history: (s.history || []).slice(-120),
    latest: s.latest || {}
  };
}

function saveSettings(b) {
  return update(s => {
    if (typeof b.key === 'string') {
      const k = b.key.trim();
      if (k && !KEY_RE.test(k)) throw Object.assign(new Error('API key ไม่ถูกรูปแบบ'), { user: true });
      s.key = k;
    }
    if (b.auto && typeof b.auto === 'object') {
      const hour = Math.max(0, Math.min(23, parseInt(b.auto.hour, 10) || 0));
      s.auto = { on: !!b.auto.on, hour };
    }
  });
}

const pick = (o, ...keys) => keys.reduce((a, k) => (a == null ? a : a[k]), o);
function parse(j, strategy, pagePath, url, source) {
  const lh = j.lighthouseResult || {}, cat = lh.categories || {}, a = lh.audits || {};
  const sc = k => (cat[k] && cat[k].score != null ? Math.round(cat[k].score * 100) : null);
  const metrics = {};
  for (const [k, id] of Object.entries(METRICS)) if (a[id]) metrics[k] = { v: a[id].numericValue, d: a[id].displayValue || '', s: a[id].score };
  const fm = pick(j, 'loadingExperience', 'metrics');
  const fv = (k, div) => fm && fm[k] ? { v: fm[k].percentile / (div || 1), c: fm[k].category } : null;
  const field = fm ? { lcp: fv('LARGEST_CONTENTFUL_PAINT_MS'), inp: fv('INTERACTION_TO_NEXT_PAINT'), cls: fv('CUMULATIVE_LAYOUT_SHIFT_SCORE', 100), fcp: fv('FIRST_CONTENTFUL_PAINT_MS'), overall: pick(j, 'loadingExperience', 'overall_category') || '', origin: !!pick(j, 'loadingExperience', 'origin_fallback') } : null;
  const opps = Object.values(a)
    .filter(x => x && x.score != null && x.score < 0.9 && !METRIC_IDS.has(x.id) && ['numeric', 'binary', 'metricSavings'].includes(x.scoreDisplayMode))
    .map(x => {
      const ms = Math.max(0, ...Object.values(x.metricSavings || {}).filter(n => typeof n === 'number'), pick(x, 'details', 'overallSavingsMs') || 0);
      return { id: x.id, title: String(x.title || x.id).slice(0, 200), display: String(x.displayValue || '').slice(0, 120), ms: Math.round(ms), bytes: pick(x, 'details', 'overallSavingsBytes') || 0, score: x.score };
    })
    .sort((p, q) => q.ms - p.ms || q.bytes - p.bytes || p.score - q.score)
    .slice(0, 12);
  const shot = pick(a, 'final-screenshot', 'details', 'data');
  const entry = {
    id: crypto.randomBytes(5).toString('hex'), at: new Date().toISOString(), strategy, path: pagePath, url, source,
    scores: { perf: sc('performance'), a11y: sc('accessibility'), bp: sc('best-practices'), seo: sc('seo') },
    metrics, field: field && (field.lcp || field.inp || field.cls) ? field : null
  };
  const full = Object.assign({}, entry, { opps, screenshot: typeof shot === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(shot) && shot.length < 400e3 ? shot : '', lighthouse: lh.lighthouseVersion || '' });
  return { entry, full };
}

// friendly Thai message for the usual failure causes
function explain(code, msg) {
  msg = String(msg || '');
  if (code === 429 || /quota|rate/i.test(msg)) return 'Google ไม่ให้ตรวจเพิ่ม (โควตาเต็ม) ใส่ API key ของคุณเองในการตั้งค่าด้านล่างเพื่อใช้ได้ 25,000 ครั้งต่อวัน';
  if (/API key not valid|API_KEY_INVALID|keyInvalid/i.test(msg)) return 'API key ไม่ถูกต้อง ตรวจสอบในการตั้งค่าด้านล่าง';
  if (/FAILED_DOCUMENT_REQUEST|ERRORED_DOCUMENT_REQUEST|DNS_FAILURE|NO_FCP|unable to reliably load/i.test(msg)) return 'Google เปิดเว็บไม่ได้ ตรวจได้เฉพาะเว็บที่ออนไลน์อยู่จริงเท่านั้น (ไม่ใช่ localhost)';
  if (/timeout|aborted/i.test(msg)) return 'Google ใช้เวลานานเกินไป ลองใหม่อีกครั้ง';
  return 'ตรวจไม่สำเร็จ: ' + msg.slice(0, 200);
}

// starts a test in the background; returns false if one is already running
function start(strategy, pagePath, url, source) {
  const s = read();
  if (s.running && Date.now() - s.running.started < STALE_MS) return false;
  s.running = { id: crypto.randomBytes(5).toString('hex'), strategy, path: pagePath, started: Date.now(), source };
  s.error = null;
  write(s);
  run(s.running, s.key, url).catch(e => console.error('pagespeed:', e.message));
  return true;
}

async function run(job, key, url) {
  let out, err;
  try {
    const q = new URLSearchParams({ url, strategy: job.strategy, locale: 'th' });
    for (const c of ['PERFORMANCE', 'ACCESSIBILITY', 'BEST_PRACTICES', 'SEO']) q.append('category', c);
    if (key) q.set('key', key);
    const r = await fetch(API + '?' + q, { signal: AbortSignal.timeout(150e3) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) err = explain(r.status, pick(j, 'error', 'message') || r.statusText);
    else out = parse(j, job.strategy, job.path, url, job.source);
  } catch (e) { err = explain(0, e.name === 'TimeoutError' ? 'timeout' : e.message); }
  update(s => {
    if (!s.running || s.running.id !== job.id) return; // superseded
    s.running = null;
    if (err) { s.error = { at: new Date().toISOString(), msg: err, strategy: job.strategy }; return; }
    const h = s.history || (s.history = []);
    const prev = [...h].reverse().find(x => x.strategy === job.strategy && x.path === job.path);
    // flag a drop of 10+ points against the previous test of the same page and device
    if (prev && prev.scores.perf != null && out.entry.scores.perf != null && prev.scores.perf - out.entry.scores.perf >= 10) out.entry.drop = out.full.drop = prev.scores.perf - out.entry.scores.perf;
    h.push(out.entry);
    if (h.length > MAX_HISTORY) h.splice(0, h.length - MAX_HISTORY);
    s.latest = s.latest || {};
    s.latest[job.strategy] = out.full;
  });
}

// daily auto-check: mobile then desktop of the home page, once per day after the chosen hour.
// A lock file per day makes sure only one Node process runs it.
function autoTick(urlFor) {
  const s = read();
  if (!s.auto || !s.auto.on) return;
  // the server's local calendar day (same clock as the hour setting), not UTC
  const now = new Date(), day = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map(n => String(n).padStart(2, '0')).join('-');
  if (s.lastAuto === day || now.getHours() < (s.auto.hour || 0)) return;
  const url = urlFor('/');
  if (!url) return;
  const lock = path.join(DIR, `pagespeed-auto-${day}.lock`);
  try { fs.writeFileSync(lock, String(process.pid), { flag: 'wx' }); } catch (e) { return; } // another process has it
  try { for (const f of fs.readdirSync(DIR)) if (/^pagespeed-auto-.*\.lock$/.test(f) && f !== path.basename(lock)) fs.unlinkSync(path.join(DIR, f)); } catch (e) {}
  update(x => { x.lastAuto = day; });
  const go = strategy => new Promise(res => {
    if (!start(strategy, '/', url, 'auto')) return setTimeout(() => go(strategy).then(res), 30e3);
    const wait = () => { const r = read().running; if (r && r.strategy === strategy && Date.now() - r.started < STALE_MS) setTimeout(wait, 5e3); else res(); };
    setTimeout(wait, 5e3);
  });
  go('mobile').then(() => go('desktop'));
}

module.exports = { status, saveSettings, start, autoTick };

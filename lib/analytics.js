// Visitor statistics: every public page view is appended to data/visits/YYYY-MM-DD.jsonl (one JSON line per view)
// and the admin reads them back as daily summaries. No third-party service, no dependencies.
// Days are cut at midnight Thailand time (UTC+7).
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data', 'visits');
fs.mkdirSync(DIR, { recursive: true });
const TZ = 7 * 3600e3, DAY = 86400e3;
const KEEP_DAYS = Math.max(30, Number(process.env.ANALYTICS_DAYS) || 90);

const dayOf = t => new Date(t + TZ).toISOString().slice(0, 10);
const hourOf = t => new Date(t + TZ).getUTCHours();
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const dayNum = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / DAY;
const numDay = n => new Date(n * DAY).toISOString().slice(0, 10);
const validDay = d => typeof d === 'string' && DAY_RE.test(d) && numDay(dayNum(d)) === d;

// ---------- who is visiting: parse the User-Agent ----------
const BOT_RE = /^(?:node|deno|bun)(?:\/|$)|bot|crawl|spider|slurp|facebookexternalhit|facebot|whatsapp|telegram|discord|skypeuri|preview|monitor|uptime|lighthouse|pagespeed|gtmetrix|pingdom|statuscake|headless|phantom|puppeteer|playwright|python|curl\/|wget|libwww|java\/|go-http|httpclient|http-client|axios|node-fetch|undici|scrapy|postman|insomnia|petalbot|semrush|ahrefs|mj12|dotbot|yandex|baidu|duckduck|ia_archiver|archive\.org|checker|scanner|fetcher|validator|analyz|zgrab|masscan|nmap|nikto|sqlmap|censys|shodan|expanse|netcraft/i;
function parseUA(ua) {
  ua = String(ua || '').slice(0, 400);
  const bot = !ua || BOT_RE.test(ua);
  let os = 'อื่นๆ', d = 'other';
  if (/Android/i.test(ua)) { os = 'Android'; d = 'android'; }
  else if (/iPhone|iPad|iPod/i.test(ua)) { os = 'iOS'; d = 'ios'; }
  else if (/Windows NT|Win64|Win32|Windows Phone/i.test(ua)) { os = 'Windows'; d = 'desktop'; }
  else if (/Macintosh|Mac OS X/i.test(ua)) { os = 'macOS'; d = 'desktop'; }
  else if (/CrOS/.test(ua)) { os = 'ChromeOS'; d = 'desktop'; }
  else if (/Linux|X11/i.test(ua)) { os = 'Linux'; d = 'desktop'; }
  let b = 'อื่นๆ';
  if (/\bLine\//i.test(ua)) b = 'LINE';
  else if (/FBAN|FBAV|FB_IAB|FBIOS/.test(ua)) b = 'Facebook';
  else if (/Instagram/i.test(ua)) b = 'Instagram';
  else if (/TikTok|musical_ly|BytedanceWebview|trill/i.test(ua)) b = 'TikTok';
  else if (/EdgA?\/|EdgiOS|Edge\//.test(ua)) b = 'Edge';
  else if (/OPR\/|Opera|OPT\//.test(ua)) b = 'Opera';
  else if (/SamsungBrowser/i.test(ua)) b = 'Samsung Internet';
  else if (/Firefox|FxiOS/.test(ua)) b = 'Firefox';
  else if (/CriOS|Chrome\//.test(ua)) b = 'Chrome';
  else if (/Safari\//.test(ua)) b = 'Safari';
  const m = bot && /([A-Za-z0-9_.-]*(?:bot|crawl|spider|slurp|lighthouse|preview|fetcher)[A-Za-z0-9_.-]*)/i.exec(ua);
  return { bot, d, os, b, botName: bot ? (m ? m[1].slice(0, 40) : (ua ? ua.slice(0, 30) : '(ไม่มี User-Agent)')) : '' };
}

// where did they come from (host only: query strings and paths are never stored)
function refHost(ref, ownHost, utm) {
  if (utm) return 'utm:' + String(utm).toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40);
  if (!ref) return '';
  let h = '';
  try { h = new URL(ref).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return ''; }
  const own = String(ownHost || '').toLowerCase().replace(/:\d+$/, '').replace(/^www\./, '');
  return h === own ? '(internal)' : h.slice(0, 80);
}
const SOURCES = [[/(^|\.)google\./, 'Google'], [/(^|\.)bing\.com$/, 'Bing'], [/(^|\.)(facebook|fb)\.com$|^fb\.me$|(^|\.)fbcdn\./, 'Facebook'], [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)line\.me$|(^|\.)line\.naver\.jp$/, 'LINE'], [/(^|\.)tiktok\.com$/, 'TikTok'], [/(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube'], [/(^|\.)(twitter|x)\.com$|^t\.co$/, 'X (Twitter)'],
  [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo'], [/(^|\.)yahoo\./, 'Yahoo'], [/(^|\.)discord(app)?\.com$|^discord\.gg$/, 'Discord'], [/(^|\.)pantip\.com$/, 'Pantip']];
function sourceName(r) {
  if (!r) return 'เข้าตรง (Direct)';
  if (r.startsWith('utm:')) return 'แคมเปญ: ' + r.slice(4);
  for (const [re, n] of SOURCES) if (re.test(r)) return n;
  return r;
}

const normIp = s => String(s || '').trim().replace(/^::ffff:/i, '').slice(0, 64) || 'unknown';

// ---------- writing (batched appends) ----------
let queue = [], timer = null;
function flush(sync) {
  if (!queue.length) return;
  const by = {};
  for (const [day, line] of queue) (by[day] = by[day] || []).push(line);
  queue = [];
  for (const [day, lines] of Object.entries(by)) {
    cache.delete(day);
    const file = path.join(DIR, day + '.jsonl'), data = lines.join('\n') + '\n';
    try { sync ? fs.appendFileSync(file, data, { mode: 0o600 }) : fs.appendFile(file, data, { mode: 0o600 }, e => { if (e) console.error('analytics:', e.message); }); }
    catch (e) { console.error('analytics:', e.message); }
  }
}
// rec: { t, ip, path, vid, isNew, ua, ref, host, utm }

// ---- visitors who have not agreed to analytics cookies are still counted, but anonymously:
// the last part of the IP is cut off and the "visitor id" is a hash that changes every day and is never stored with the IP
const crypto = require('crypto');
const SALT_FILE = path.join(__dirname, '..', 'data', 'analytics.salt');
let salt;
function getSalt() {
  if (salt) return salt;
  try { salt = fs.readFileSync(SALT_FILE, 'utf8').trim(); } catch (e) {}
  if (!salt || salt.length < 32) { salt = crypto.randomBytes(32).toString('hex'); try { fs.writeFileSync(SALT_FILE, salt, { mode: 0o600 }); } catch (e) {} }
  return salt;
}
const anonId = (ip, ua, day) => 'd:' + crypto.createHmac('sha256', getSalt() + day).update(String(ip) + '|' + String(ua || '').slice(0, 400)).digest('hex').slice(0, 20);
function maskIp(ip) {
  ip = String(ip || '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip.replace(/\.\d{1,3}$/, '.*');
  if (ip.includes(':')) return ip.split(':').slice(0, 3).join(':') + '::*';
  return 'unknown';
}
// A flood of requests must not fill the disk or make the statistics unreadable:
// one address is recorded at most MAX_PER_IP_HOUR times an hour, and a day's file stops growing at DAY_CAP bytes.
const MAX_PER_IP_HOUR = Number(process.env.ANALYTICS_MAX_PER_IP_HOUR) || 600;
const DAY_CAP = Number(process.env.ANALYTICS_DAY_CAP_BYTES) || 60e6;
const perIp = new Map();
let dayUsed = { day: '', n: 0 };
function allowed(ipKey, t, size) {
  const hour = Math.floor(t / 3600e3);
  let r = perIp.get(ipKey);
  if (!r || r.h !== hour) { if (perIp.size > 20000) perIp.clear(); r = { h: hour, n: 0 }; perIp.set(ipKey, r); }
  if (++r.n > MAX_PER_IP_HOUR) return false;
  const day = dayOf(t);
  if (dayUsed.day !== day) { let n = 0; try { n = fs.statSync(path.join(DIR, day + '.jsonl')).size; } catch (e) {} dayUsed = { day, n }; }
  if (dayUsed.n + size > DAY_CAP) return false;
  dayUsed.n += size + 1;
  return true;
}
function record(rec) {
  const u = parseUA(rec.ua);
  const line = { t: rec.t, ip: normIp(rec.ip), p: String(rec.path || '/').slice(0, 200), d: u.d, os: u.os, b: u.b, r: refHost(rec.ref, rec.host, rec.utm) };
  if (u.bot) { line.bot = 1; line.ua = u.botName; }
  else if (rec.anon) { line.ip = maskIp(line.ip); line.v = anonId(rec.ip, rec.ua, dayOf(rec.t)); line.a = 1; }
  else { line.v = rec.vid || ''; if (rec.isNew) line.n = 1; }
  const text = JSON.stringify(line);
  if (!allowed(normIp(rec.ip), rec.t, text.length)) return;
  queue.push([dayOf(rec.t), text]);
  if (queue.length >= 100) flush(); else if (!timer) { timer = setTimeout(() => { timer = null; flush(); }, 1500); timer.unref(); }
}
process.on('exit', () => flush(true));

// ---------- reading ----------
const cache = new Map(); // day -> { sig, sum }
function readLines(day) {
  const file = path.join(DIR, day + '.jsonl');
  let text; try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return []; }
  const out = [];
  for (const l of text.split('\n')) { if (!l) continue; try { out.push(JSON.parse(l)); } catch (e) {} }
  return out;
}
const inc = (o, k, n) => { o[k] = (o[k] || 0) + (n || 1); };
function summarize(day) {
  const file = path.join(DIR, day + '.jsonl');
  let st; try { st = fs.statSync(file); } catch (e) { return empty(day); }
  const sig = st.size + ':' + Math.floor(st.mtimeMs), c = cache.get(day);
  if (c && c.sig === sig && (day < dayOf(Date.now()) || Date.now() - c.at < 15e3)) return c.sum;
  const s = empty(day), V = new Set(), H = Array.from({ length: 24 }, () => new Set()), DV = { android: new Set(), ios: new Set(), desktop: new Set(), other: new Set() }, NV = new Set();
  for (const r of readLines(day)) {
    s.all++;
    if (r.bot) { s.bots++; inc(s.botNames, r.ua || '?'); continue; }
    s.views++; if (r.a) s.anon++; s.hours[hourOf(r.t)]++;
    const v = r.v || ('ip:' + r.ip);
    V.add(v); H[hourOf(r.t)].add(v); (DV[r.d] || DV.other).add(v); if (r.n) NV.add(v);
    inc(s.devices, r.d); inc(s.os, r.os); inc(s.browsers, r.b); inc(s.pages, r.p);
    if (r.r !== '(internal)') inc(s.sources, r.r || '');
    const e = s.ips[r.ip] || (s.ips[r.ip] = { n: 0, v: new Set(), d: {}, first: r.t, last: r.t, p: r.p });
    e.n++; e.v.add(v); inc(e.d, r.d); if (r.t < e.first) e.first = r.t; if (r.t >= e.last) { e.last = r.t; e.p = r.p; }
  }
  s.vids = [...V]; s.newV = NV.size; s.hu = H.map(x => x.size);
  s.dv = Object.fromEntries(Object.entries(DV).map(([k, x]) => [k, [...x]]));
  for (const e of Object.values(s.ips)) e.v = [...e.v];
  cache.set(day, { sig, at: Date.now(), sum: s });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return s;
}
function empty(day) {
  return { day, all: 0, bots: 0, views: 0, anon: 0, vids: [], newV: 0, hours: new Array(24).fill(0), hu: new Array(24).fill(0), devices: {}, dv: {}, os: {}, browsers: {}, pages: {}, sources: {}, ips: {}, botNames: {} };
}
const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);

// (the length is checked before the list is built: a range of thousands of years must not allocate millions of entries)
function daysBetween(from, to) { const a = dayNum(from), b = dayNum(to), out = []; if (b - a > 366) throw Object.assign(new Error('range too long'), { code: 400 }); for (let i = a; i <= b; i++) out.push(numDay(i)); return out; }

function totals(sums) {
  const V = new Set(), I = new Set(), NV = new Set();
  let all = 0, views = 0, bots = 0, anon = 0;
  for (const s of sums) { all += s.all; views += s.views; bots += s.bots; anon += s.anon || 0; for (const v of s.vids) V.add(v); for (const ip of Object.keys(s.ips)) I.add(ip); }
  return { traffic: all, views, bots, anonViews: anon, visitors: V.size, ips: I.size };
}

// from/to: 'YYYY-MM-DD' (Thailand time), inclusive
function report(from, to) {
  flush(true);
  if (!validDay(from) || !validDay(to) || from > to) throw Object.assign(new Error('bad range'), { code: 400 });
  const days = daysBetween(from, to);
  if (days.length > 366) throw Object.assign(new Error('range too long'), { code: 400 });
  const sums = days.map(summarize);
  const cur = totals(sums);
  // new vs returning visitors
  const V = new Set(); let newV = 0;
  const series = [], seen = new Set(); let cumViews = 0;
  sums.forEach(s => {
    s.vids.forEach(v => V.add(v)); newV += s.newV; cumViews += s.views; s.vids.forEach(v => seen.add(v));
    series.push({ day: s.day, traffic: s.all, views: s.views, visitors: s.vids.length, bots: s.bots, cumViews, cumVisitors: seen.size });
  });
  const merge = pick => { const o = {}; for (const s of sums) for (const [k, n] of Object.entries(s[pick])) o[k] = (o[k] || 0) + n; return o; };
  const devU = {};
  for (const k of ['android', 'ios', 'desktop', 'other']) { const u = new Set(); for (const s of sums) for (const v of (s.dv[k] || [])) u.add(v); devU[k] = u.size; }
  const devV = merge('devices');
  const devices = ['android', 'ios', 'desktop', 'other'].map(k => ({ key: k, views: devV[k] || 0, visitors: devU[k] }));
  // visitors by IP
  const ipMap = {};
  for (const s of sums) for (const [ip, e] of Object.entries(s.ips)) {
    const m = ipMap[ip] || (ipMap[ip] = { ip, views: 0, v: new Set(), d: {}, first: e.first, last: e.last, p: e.p });
    m.views += e.n; for (const v of e.v) m.v.add(v); for (const [k, n] of Object.entries(e.d)) inc(m.d, k, n);
    if (e.first < m.first) m.first = e.first; if (e.last >= m.last) { m.last = e.last; m.p = e.p; }
  }
  const ips = Object.values(ipMap).sort((a, b) => b.views - a.views).slice(0, 200)
    .map(m => ({ ip: m.ip, views: m.views, visitors: m.v.size, device: Object.entries(m.d).sort((a, b) => b[1] - a[1])[0][0], devices: m.d, first: m.first, last: m.last, last_page: m.p }));
  const srcRaw = merge('sources'), src = {};
  for (const [r, n] of Object.entries(srcRaw)) inc(src, sourceName(r), n);
  // the same period just before this one, for the growth figures
  const len = days.length, pFrom = numDay(dayNum(from) - len), pTo = numDay(dayNum(from) - 1);
  const prev = totals(daysBetween(pFrom, pTo).map(summarize));
  const hours = new Array(24).fill(0); for (const s of sums) s.hours.forEach((n, i) => { hours[i] += n; });
  return {
    from, to, days: len, tz: 'Asia/Bangkok',
    totals: Object.assign(cur, { newVisitors: newV, returningVisitors: Math.max(0, cur.visitors - newV) }),
    prev: Object.assign(prev, { from: pFrom, to: pTo }),
    series, hours, hourly: len === 1 ? sums[0].hours.map((n, i) => ({ hour: i, views: n, visitors: sums[0].hu[i] })) : null,
    devices, os: top(merge('os'), 8), browsers: top(merge('browsers'), 8), sources: top(src, 10), pages: top(merge('pages'), 15),
    botNames: top(merge('botNames'), 8), ips
  };
}

// recent visits, newest first; optional exact-IP filter
function visits(from, to, opt) {
  opt = opt || {};
  flush(true);
  if (!validDay(from) || !validDay(to) || from > to) throw Object.assign(new Error('bad range'), { code: 400 });
  const limit = Math.min(200, Math.max(1, Number(opt.limit) || 50)), offset = Math.max(0, Number(opt.offset) || 0);
  const days = daysBetween(from, to).reverse(), out = [];
  let skipped = 0, total = 0;
  for (const day of days) {
    const rows = readLines(day).filter(r => (opt.bots ? true : !r.bot) && (!opt.ip || r.ip === opt.ip)).reverse();
    total += rows.length;
    for (const r of rows) { if (skipped < offset) { skipped++; continue; } if (out.length < limit) out.push({ t: r.t, ip: r.ip, path: r.p, device: r.d, os: r.os, browser: r.b, source: sourceName(r.r === '(internal)' ? '' : r.r) + (r.r === '(internal)' ? ' · ภายในเว็บ' : ''), isNew: !!r.n, anon: !!r.a, bot: !!r.bot, bot_name: r.ua || '' }); }
  }
  return { rows: out, total };
}

// delete day files older than the retention period
function purge() {
  const cutoff = numDay(dayNum(dayOf(Date.now())) - KEEP_DAYS);
  try { for (const f of fs.readdirSync(DIR)) { const d = f.slice(0, 10); if (/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f) && d < cutoff) { try { fs.unlinkSync(path.join(DIR, f)); } catch (e) {} } } } catch (e) {}
}
purge(); setInterval(purge, DAY).unref();

module.exports = { record, parseUA, report, visits, validDay, dayOf, flush, KEEP_DAYS };

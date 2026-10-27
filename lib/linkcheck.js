// Checks that a public https URL of this site opens (for the admin's "store URLs" panel).
// The server makes the request, so it must never be usable to reach internal services (SSRF):
// https only, standard port, no private / loopback / link-local / metadata addresses (checked on every redirect and on the
// address actually connected to), short timeout, only the response headers are read.
const https = require('https');
const dns = require('dns');
const net = require('net');

function isPrivate(ip) {
  ip = String(ip).toLowerCase();
  if (net.isIPv6(ip)) {
    const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
    if (m) return isPrivate(m[1]);
    return ip === '::' || ip === '::1' || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || /^ff/.test(ip) || ip.startsWith('2001:db8') || ip.startsWith('64:ff9b');
  }
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => !(n >= 0 && n <= 255))) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51) || (a === 203 && b === 0);
}

// resolves the name ourselves and only ever returns public addresses
function safeLookup(host, opts, cb) {
  dns.lookup(host, { all: true }, (err, addrs) => {
    if (err) return cb(err);
    const ok = addrs.filter(a => !isPrivate(a.address));
    if (!ok.length) return cb(Object.assign(new Error('blocked address'), { code: 'EBLOCKED' }));
    if (opts && opts.all) return cb(null, ok);
    cb(null, ok[0].address, ok[0].family);
  });
}

function validate(u) {
  let url;
  try { url = new URL(u); } catch (e) { throw new Error('bad URL'); }
  if (url.protocol !== 'https:') throw new Error('https only');
  if (url.port && url.port !== '443') throw new Error('port not allowed');
  if (url.username || url.password) throw new Error('credentials not allowed');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && isPrivate(host)) throw new Error('blocked address');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('blocked address');
  return url;
}

function once(url, timeout) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const req = https.request({ protocol: 'https:', hostname: url.hostname, port: 443, path: url.pathname + url.search, method: 'GET', lookup: safeLookup, timeout,
      headers: { 'User-Agent': 'RCM-LinkCheck/1.0 (+admin)', Accept: 'text/html,*/*;q=0.5', 'Accept-Encoding': 'identity' } }, res => {
      resolve({ status: res.statusCode, location: res.headers.location || '', type: String(res.headers['content-type'] || '').split(';')[0], robots: String(res.headers['x-robots-tag'] || ''), ms: Date.now() - t0 });
      res.destroy();
    });
    req.on('timeout', () => { req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })); });
    req.on('error', e => resolve({ error: e.code === 'EBLOCKED' ? 'blocked address' : e.code === 'ETIMEDOUT' ? 'timeout' : (e.code || e.message || 'error'), ms: Date.now() - t0 }));
    req.end();
  });
}

// follows up to 3 redirects, re-validating every hop
async function check(u, opt) {
  const timeout = (opt && opt.timeout) || 8000, hops = [];
  let cur;
  try { cur = validate(u); } catch (e) { return { url: u, error: e.message, hops }; }
  for (let i = 0; i <= 3; i++) {
    const r = await once(cur, timeout);
    if (r.error) return { url: u, error: r.error, hops, final: cur.href };
    hops.push({ url: cur.href, status: r.status });
    if ([301, 302, 303, 307, 308].includes(r.status) && r.location) {
      try { cur = validate(new URL(r.location, cur).href); } catch (e) { return { url: u, error: 'redirect: ' + e.message, hops, final: cur.href }; }
      continue;
    }
    return { url: u, status: r.status, final: cur.href, type: r.type, noindex: /noindex/i.test(r.robots), ms: r.ms, hops, https: true };
  }
  return { url: u, error: 'too many redirects', hops };
}

module.exports = { check, isPrivate, validate };

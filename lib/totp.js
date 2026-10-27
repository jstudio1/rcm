// Time-based one-time passwords (RFC 6238) for the optional admin two-step login. No dependencies.
// Works with Google Authenticator, Microsoft Authenticator, Authy, 1Password, etc. (SHA-1, 6 digits, 30 seconds).
const crypto = require('crypto');

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP = 30e3;

function b32encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function b32decode(str) {
  let bits = 0, value = 0; const out = [];
  for (const ch of String(str).toUpperCase().replace(/[\s=-]/g, '')) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('bad base32');
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

const newSecret = () => b32encode(crypto.randomBytes(20));

function hotp(secret, counter) {
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(counter / 2 ** 32), 0); msg.writeUInt32BE(counter >>> 0, 4);
  const h = crypto.createHmac('sha1', b32decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1e6).padStart(6, '0');
}

// Returns the time step the code belongs to (so it can be remembered and never accepted twice), or 0 when it is wrong.
// One step of clock drift either way is allowed. A step that is not newer than `lastStep` is a replay and is refused.
function verify(secret, code, lastStep, now) {
  code = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return 0;
  const cur = Math.floor((now == null ? Date.now() : now) / STEP);
  let found = 0;
  for (const d of [0, -1, 1]) { // every candidate is compared (no early exit) so timing doesn't reveal which one matched
    const s = cur + d;
    const ok = crypto.timingSafeEqual(Buffer.from(hotp(secret, s)), Buffer.from(code));
    if (ok && s > (lastStep || 0) && !found) found = s;
  }
  return found;
}

const uri = (secret, account, issuer) =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

module.exports = { newSecret, hotp, verify, uri, b32encode, b32decode };

// Cross-process exclusion. Busy locks fail closed, never overwrite state.
// Every guarded operation takes well under a second, so a lock file older than STALE_MS belongs to a process that died
// mid-write: it is removed (re-checked first) instead of blocking logins and saves until someone deletes it by hand.
const fs = require('fs');
const STALE_MS = 60e3;
const busy = () => Object.assign(new Error('Storage busy; retry later'), { code: 503 });
module.exports = function locked(file, fn) {
  const lock = file + '.lock';
  let fd;
  try { fd = fs.openSync(lock, 'wx', 0o600); }
  catch (e) {
    if (e.code !== 'EEXIST') throw e;
    try {
      if (Date.now() - fs.statSync(lock).mtimeMs <= STALE_MS) throw busy();
      fs.unlinkSync(lock);
      fd = fs.openSync(lock, 'wx', 0o600);
    } catch (e2) { throw e2.code === 503 ? e2 : busy(); }
  }
  try { fs.writeSync(fd, String(process.pid)); return fn(); }
  finally { fs.closeSync(fd); try { fs.unlinkSync(lock); } catch (e) {} }
};
module.exports.STALE_MS = STALE_MS;

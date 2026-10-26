// Cross-process exclusion. Busy/crashed locks fail closed, never overwrite state.
const fs = require('fs');
module.exports = function locked(file, fn) {
  const lock = file + '.lock';
  let fd;
  try { fd = fs.openSync(lock, 'wx', 0o600); }
  catch (e) { if (e.code === 'EEXIST') throw Object.assign(new Error('Storage busy; retry later'), { code: 503 }); throw e; }
  try { fs.writeSync(fd, String(process.pid)); return fn(); }
  finally { fs.closeSync(fd); fs.unlinkSync(lock); }
};

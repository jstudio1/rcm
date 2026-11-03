// Makes uploaded files readable by the front web server (mode 644). Older versions saved uploads as 600, which
// nginx/Plesk running as another user cannot serve (the picture shows as broken). Safe to run any time; a no-op on Windows.
const fs = require('fs'), path = require('path');
module.exports = function fixUploads(dir) {
  let fixed = 0, total = 0;
  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const f = path.join(dir, name);
    try {
      const st = fs.lstatSync(f);
      if (!st.isFile()) continue;
      total++;
      if ((st.mode & 0o644) !== 0o644 && process.platform !== 'win32') { fs.chmodSync(f, 0o644); fixed++; }
    } catch (e) { console.error('fix-uploads skipped ' + name + ': ' + e.message); }
  }
  return { total, fixed };
};

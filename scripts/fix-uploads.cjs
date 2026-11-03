// npm run fix-uploads  ->  makes every file in public/uploads readable by the web server (mode 644)
const r = require('../lib/fixuploads')(require('path').join(__dirname, '..', 'public', 'uploads'));
console.log('uploads checked: ' + r.total + ', permissions fixed: ' + r.fixed);

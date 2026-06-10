const fs = require('fs');
let a = fs.readFileSync('/opt/wms/server/src/app.ts', 'utf8');
a = a.replace(
  `imgSrc: ["'self'", "data:", "blob:"]`,
  `imgSrc: ["'self'", "data:", "blob:", "android-webview-video-poster:"]`
);
fs.writeFileSync('/opt/wms/server/src/app.ts', a);
console.log('CSP img-src fixed');

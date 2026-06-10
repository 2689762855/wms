const fs = require('fs');
let a = fs.readFileSync('/opt/wms/server/src/app.ts', 'utf8');

const oldLine = `const report = req.body?.['csp-report'];`;
const newLine = `const report = req.body?.['csp-report'];
  const jsErr = req.body?.['js-error'];
  if (jsErr) { console.error('[JS-ERROR]', JSON.stringify({error: jsErr, ua: req.body?.userAgent || 'unknown'})); }`;

a = a.replace(oldLine, newLine);
fs.writeFileSync('/opt/wms/server/src/app.ts', a);
console.log('done');

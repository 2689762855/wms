// Fix CORS on server: add same-origin detection for PDA/WebView compatibility
const fs = require('fs');
const app = fs.readFileSync('/opt/wms/server/src/app.ts', 'utf8');

const corsStart = app.indexOf('// CORS：');
const corsEnd = app.indexOf('app.use(cookieParser());');

const replacement = `// CORS：同源请求放行 + 受信任域名白名单（PDA/移动端 WebView 兼容）
const STATIC_ALLOWED_ORIGINS = [
  'https://ckglxt.top',
  'https://www.ckglxt.top',
  'https://cgklxt.top',
  'https://localhost',
  'capacitor://localhost',
  'http://localhost:5173',   // 本地开发
  'http://192.168.1.4:5173', // 内网开发
];

// 同源检测：PDA/移动端 WebView 可能发送与 Host 一致的 Origin，必须显式放行
app.use((req, _res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host === req.headers.host.split(':')[0]) {
        _res.setHeader('Access-Control-Allow-Origin', origin);
        _res.setHeader('Access-Control-Allow-Credentials', 'true');
        if (req.method === 'OPTIONS') {
          _res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
          _res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'Content-Type,Authorization');
          return _res.status(204).end();
        }
      }
    } catch {}
  }
  next();
});

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (STATIC_ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    if (origin.endsWith('.ckglxt.top') || origin.endsWith('.cgklxt.top')) return callback(null, true);
    // 同源请求已在上方中间件处理，走到这里才是真正的跨域拒绝
    callback(new Error('Not allowed by CORS'));
  },
}));

`;

const newApp = app.substring(0, corsStart) + replacement + app.substring(corsEnd);
fs.writeFileSync('/opt/wms/server/src/app.ts', newApp);
console.log('CORS fix applied');

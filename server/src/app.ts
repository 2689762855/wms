import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authRouter } from './routes/auth';
import { warehousesRouter } from './routes/warehouses';
import { categoriesRouter } from './routes/categories';
import { productsRouter } from './routes/products';
import { inventoryRouter } from './routes/inventory';
import { inboundRouter } from './routes/inbound';
import { outboundRouter } from './routes/outbound';
import { transferRouter } from './routes/transfer';
import { checkTasksRouter } from './routes/checkTasks';
import { alertsRouter } from './routes/alerts';
import { reportsRouter } from './routes/reports';
import { usersRouter } from './routes/users';
import { locationsRouter } from './routes/locations';
import { customersRouter, customerTemplateRouter } from './routes/customers';
import { stockMoveRouter } from './routes/stockMove';
import { settingsRouter } from './routes/settings';
import { appRouter } from './routes/app';
import { productWarehousesRouter } from './routes/productWarehouses';
import { contractsRouter } from './routes/contracts';
import { containersRouter } from './routes/containers';
import { suppliersRouter } from './routes/suppliers';
import { errorHandler } from './middleware/errorHandler';

const isProduction = process.env.NODE_ENV === 'production';

// 安全检查：生产环境必须设置 JWT 密钥，否则拒绝启动
if (isProduction && !process.env.JWT_ADMIN_SECRET) {
  console.error('[安全] FATAL: NODE_ENV=production 但未设置 JWT_ADMIN_SECRET 环境变量');
  console.error('[安全] 请运行: export JWT_ADMIN_SECRET=$(openssl rand -hex 32)');
  process.exit(1);
}
if (isProduction && !process.env.INTER_SERVER_SECRET) {
  console.error('[安全] FATAL: NODE_ENV=production 但未设置 INTER_SERVER_SECRET 环境变量');
  console.error('[安全] 请运行: export INTER_SERVER_SECRET=$(openssl rand -hex 32)');
  process.exit(1);
}
if (!isProduction) {
  if (!process.env.JWT_ADMIN_SECRET) console.warn('[安全] 警告：使用开发模式默认 JWT_ADMIN_SECRET');
  if (!process.env.INTER_SERVER_SECRET) console.warn('[安全] 警告：使用开发模式默认 INTER_SERVER_SECRET');
}

const app = express();
// Cloudflare CDN → nginx → Express：信任第一层代理的 X-Forwarded-For
app.set('trust proxy', 1);

app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "blob:", "https://static.cloudflareinsights.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "android-webview-video-poster:"],
      connectSrc: ["'self'", "https://ckglxt.top", "https://cgklxt.top", "http://ckglxt.top", "http://cgklxt.top", "https://cloudflareinsights.com"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      upgradeInsecureRequests: null,
      reportUri: '/api/csp-report',
    },
  },
}));
// CORS：同源请求放行 + 受信任域名白名单（PDA/移动端 WebView HTTP 访问兼容）
const STATIC_ALLOWED_ORIGINS = [
  'https://ckglxt.top',
  'https://www.ckglxt.top',
  'https://cgklxt.top',
  'https://localhost',
  'capacitor://localhost',
  'http://localhost:5173',   // 本地开发
  'http://192.168.1.4:5173', // 内网开发
];

// 同源检测：PDA/移动端 WebView 可能发送 HTTP Origin，与 Host 一致时显式放行
app.use((req, _res, next) => {
  const origin = req.headers.origin as string | undefined;
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      const reqHost = (req.headers.host || '').split(':')[0];
      if (originHost === reqHost) {
        _res.setHeader('Access-Control-Allow-Origin', origin);
        _res.setHeader('Access-Control-Allow-Credentials', 'true');
        if (req.method === 'OPTIONS') {
          _res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
          _res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'Content-Type,Authorization');
          return _res.status(204).end();
        }
      }
    } catch { /* invalid origin URL, let cors() handle it */ }
  }
  next();
});

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (STATIC_ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    if (origin.endsWith('.ckglxt.top') || origin.endsWith('.cgklxt.top')) return callback(null, true);
    // 同源请求已在上方中间件处理，走到这里才是真正的跨域拒绝
    // 用 callback(null, false) 替代 new Error()，避免恶意跨域请求触发 500
    callback(null, false);
  },
}));
app.use(cookieParser());
// 自定义 morgan token：记录租户 ID
morgan.token('tenant', (req: any) => req.customerId ? `cust=${req.customerId}` : '-');
morgan.token('user-id', (req: any) => req.userId ? `uid=${req.userId}` : '-');
app.use(morgan(':remote-addr :method :url :status :response-time ms :tenant :user-id'));
app.use(express.json({ limit: '1mb', type: ['application/json', 'application/csp-report'] }));

// 畸形 JSON 返回 400 而非 500
app.use((err: any, _req: any, res: any, next: any) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: '请求格式错误' });
  }
  next(err);
});

// 限速：登录接口严格限制
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: '请求过于频繁，请15分钟后再试' },
});
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', rateLimit({ windowMs: 60 * 60 * 1000, max: 3, message: { error: '注册请求过于频繁，请1小时后再试' } }));

// 通用限速
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: '请求过于频繁，请稍后再试' },
}));

// CSP 违规报告 + JS 运行时错误上报（PDA/旧浏览器兼容诊断）
app.post('/api/csp-report', (req, res) => {
  const report = req.body?.['csp-report'];
  if (report) {
    const detail = JSON.stringify({
      blockedUri: report['blocked-uri'],
      violatedDirective: report['violated-directive'],
      documentUri: report['document-uri'],
      scriptSample: report['script-sample']?.substring(0, 100),
    });
    console.log('[CSP]', detail);
    console.error('[CSP]', detail);
  }
  const jsErr = req.body?.['js-error'];
  if (jsErr) {
    console.error('[JS-ERROR]', JSON.stringify({ error: jsErr, ua: req.body?.userAgent || 'unknown' }));
  }
  res.status(204).end();
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/warehouses', warehousesRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/products', productsRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/inbound', inboundRouter);
app.use('/api/outbound', outboundRouter);
app.use('/api/transfer', transferRouter);
app.use('/api/check-tasks', checkTasksRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/users', usersRouter);
app.use('/api/locations', locationsRouter);
app.use('/api/customers', customerTemplateRouter);
app.use('/api/customers', customersRouter);
app.use('/api/stock-move', stockMoveRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/product-warehouses', productWarehousesRouter);
app.use('/api/contracts', contractsRouter);
app.use('/api/containers', containersRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/app', appRouter);

// API 404 处理：返回 JSON 而非 HTML（必须在 SPA fallback 之前）
app.use('/api', (_req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

// 生产环境：托管前端静态文件
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 确保上传目录存在
fs.mkdirSync(path.join(__dirname, '../uploads/products'), { recursive: true });
fs.mkdirSync(path.join(__dirname, '../public'), { recursive: true });
// 商品图片静态托管（必须在 SPA fallback 之前）
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/public', express.static(path.join(__dirname, '../public')));
// 兼容两种目录结构：开发时 ../../client/dist，部署时 ../client/dist
let distPath = path.join(__dirname, '../../client/dist');
if (!fs.existsSync(distPath)) {
  distPath = path.join(__dirname, '../client/dist');
}
const sendNoCache = (res: any, filePath: string, fallback?: () => void) => {
  res.set('Cache-Control', 'no-cache');
  const sendOpts = { headers: { 'Cache-Control': 'no-cache' } };
  if (fallback) {
    res.sendFile(filePath, sendOpts, (err: any) => { if (err) fallback(); });
  } else {
    res.sendFile(filePath, sendOpts);
  }
};
app.get('/', (_req, res) => {
  sendNoCache(res, path.join(distPath, 'landing.html'), () => sendNoCache(res, path.join(distPath, 'index.html')));
});
// 静态资源缓存策略（哈希文件名，可长期缓存）
app.use((_req, res, next) => {
  const p = _req.path;
  if (p.match(/\.(js|css|svg|png|ico|woff2?)$/)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (p === '/' || p === '/index.html' || p.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-cache');
  }
  next();
});
// ZIP 文件强制下载（浏览器默认会尝试显示二进制内容）
// max-age=3600：允许 Cloudflare 缓存 1 小时，后续下载从边缘节点直出（无需回源 116MB）
app.use((req, _res, next) => {
  if (req.path.endsWith('.zip')) {
    _res.setHeader('Content-Disposition', 'attachment');
    _res.setHeader('Cache-Control', 'public, max-age=3600');
  }
  next();
});
app.use(express.static(distPath));
// robots.txt：Cloudflare Managed Content 已注入规则，源站返回纯文本避免 SPA fallback 附加 HTML
app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send('User-agent: *\nAllow: /\n');
});
// SPA fallback: 非首页、非 API、非 uploads 请求返回 index.html
app.use((_req, res, next) => {
  if (_req.path === '/' || _req.path.startsWith('/api') || _req.path.startsWith('/uploads')) return next();
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(distPath, 'index.html'), (err) => { if (err) next(); });
});

// Error handling
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, isProduction ? '127.0.0.1' : '0.0.0.0', async () => {
  // 确保所有活跃客户的租户库已初始化并同步数据
  try {
    const { PrismaClient } = await import('@prisma/client');
    const { platformPrisma, initTenantDatabase } = await import('./utils/prisma');
    const activeCustomers = await platformPrisma.customer.findMany({
      where: { deletedAt: null },
      include: { warehouses: { include: { locations: true } } },
    });
    for (const customer of activeCustomers) {
      const dbPath = path.join(__dirname, '../prisma', `tenant_${customer.id}.db`);
      await initTenantDatabase(customer.id);
      const tenantPrisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
      try {
        if (!await tenantPrisma.customer.findUnique({ where: { id: customer.id } })) {
          await tenantPrisma.customer.create({ data: { id: customer.id, username: customer.username, passwordHash: 'synced', realName: customer.realName, status: customer.status } });
        }
        for (const wh of customer.warehouses) {
          if (!await tenantPrisma.warehouse.findUnique({ where: { id: wh.id } })) {
            await tenantPrisma.warehouse.create({ data: { id: wh.id, name: wh.name, address: wh.address, customerId: wh.customerId } });
          }
          for (const loc of wh.locations) {
            if (!await tenantPrisma.location.findUnique({ where: { id: loc.id } })) {
              await tenantPrisma.location.create({ data: { id: loc.id, name: loc.name, code: loc.code, warehouseId: loc.warehouseId } });
            }
          }
        }
      } finally { await tenantPrisma.$disconnect(); }
    }
    console.log('[init] 租户数据库同步完成');
  } catch (err) { console.error('[init] 租户数据库初始化失败:', err); }
  console.log(`库存管理系统已启动: http://localhost:${PORT}`);
});
export default app;

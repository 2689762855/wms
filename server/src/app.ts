import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
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
import { errorHandler } from './middleware/errorHandler';

const isProduction = process.env.NODE_ENV === 'production';

// 安全检查：生产环境必须设置 JWT 密钥，否则拒绝启动
if (isProduction && !process.env.JWT_ADMIN_SECRET) {
  console.error('[安全] FATAL: NODE_ENV=production 但未设置 JWT_ADMIN_SECRET 环境变量');
  console.error('[安全] 请运行: export JWT_ADMIN_SECRET=$(openssl rand -hex 32)');
  process.exit(1);
}
if (!isProduction && !process.env.JWT_ADMIN_SECRET) {
  console.warn('[安全] 警告：使用开发模式默认 JWT 密钥，生产部署前务必设置 JWT_ADMIN_SECRET');
}

const app = express();
// Cloudflare CDN → nginx → Express：信任第一层代理的 X-Forwarded-For
app.set('trust proxy', 1);

app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://static.cloudflareinsights.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "https://cloudflareinsights.com"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      upgradeInsecureRequests: null,
    },
  },
}));
// CORS：仅允许受信任的域名（不能放过任意来源）
const allowedOrigins = [
  'https://ckglxt.top',
  'https://cgklxt.top',
  'https://localhost',
  'capacitor://localhost',
  'http://localhost:5173',   // 本地开发
  'http://192.168.1.4:5173', // 内网开发
];
app.use(cors({
  origin(origin, callback) {
    // 无 origin 的请求（如 curl、服务器间调用）放行
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // 允许任意 ckglxt.top 子域名
    if (origin.endsWith('.ckglxt.top') || origin.endsWith('.cgklxt.top')) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
}));
app.use(morgan('short'));
app.use(express.json({ limit: '1mb' }));

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
app.use('/api/app', appRouter);

// API 404 处理：返回 JSON 而非 HTML（必须在 SPA fallback 之前）
app.use('/api', (_req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

// 生产环境：托管前端静态文件
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 确保上传目录存在
fs.mkdirSync(path.join(__dirname, '../uploads/products'), { recursive: true });
// 商品图片静态托管（必须在 SPA fallback 之前）
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
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
app.use(express.static(distPath));
// SPA fallback: 非首页、非 API、非 uploads 请求返回 index.html
app.use((_req, res, next) => {
  if (_req.path === '/' || _req.path.startsWith('/api') || _req.path.startsWith('/uploads')) return next();
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(distPath, 'index.html'), (err) => { if (err) next(); });
});

// Error handling
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, isProduction ? '127.0.0.1' : '0.0.0.0', () => {
  console.log(`库存管理系统已启动: http://localhost:${PORT}`);
});

export default app;

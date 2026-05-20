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
import { customersRouter } from './routes/customers';
import { stockMoveRouter } from './routes/stockMove';
import { appRouter } from './routes/app';
import { errorHandler } from './middleware/errorHandler';

const isProduction = process.env.NODE_ENV === 'production';

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      upgradeInsecureRequests: null,
    },
  },
}));
app.use(cors({ origin: true }));
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
app.use('/api/customers', customersRouter);
app.use('/api/stock-move', stockMoveRouter);
app.use('/api/app', appRouter);

// 生产环境：托管前端静态文件
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 兼容两种目录结构：开发时 ../../client/dist，部署时 ../client/dist
let distPath = path.join(__dirname, '../../client/dist');
if (!fs.existsSync(distPath)) {
  distPath = path.join(__dirname, '../client/dist');
}
app.get('/', (_req, res) => {
  res.sendFile(path.join(distPath, 'landing.html'), (err) => { if (err) res.sendFile(path.join(distPath, 'index.html')); });
});
app.use(express.static(distPath));
// SPA fallback: 非首页、非 API 请求返回 index.html
app.use((_req, res, next) => {
  if (_req.path === '/' || _req.path.startsWith('/api')) return next();
  res.sendFile(path.join(distPath, 'index.html'), (err) => { if (err) next(); });
});

// Error handling
app.use(errorHandler);

// 确保上传目录存在
fs.mkdirSync(path.join(__dirname, '../uploads/products'), { recursive: true });
// 商品图片静态托管
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`库存管理系统已启动: http://localhost:${PORT}`);
});

export default app;

import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma, { platformPrisma, initTenantDatabase, resetTenantDatabase } from '../utils/prisma';
import { AuthRequest, authenticate, JWT_ADMIN_SECRET, INTER_SERVER_SECRET, THIS_HOST } from '../middleware/auth';

const JWT_EXPIRES_IN = '24h';
const COOKIE_MAX_AGE = 24 * 60 * 60 * 1000; // 24h ms

const isProduction = process.env.NODE_ENV === 'production';

function setTokenCookie(res: Response, token: string) {
  res.cookie('wms_token', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/api',
    maxAge: COOKIE_MAX_AGE,
  });
}

export const authRouter = Router();

// 登录失败锁定：连续5次失败锁定15分钟，成功登录后清零
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const failedLogins = new Map<string, { count: number; lockedUntil: number }>();

function checkLockout(username: string): string | null {
  const entry = failedLogins.get(username);
  if (!entry) return null;
  if (entry.lockedUntil > Date.now()) {
    const mins = Math.ceil((entry.lockedUntil - Date.now()) / 60000);
    return `账号已临时锁定，请 ${mins} 分钟后重试`;
  }
  if (entry.lockedUntil > 0) {
    // 锁定期已过，重置计数（但保留记录等下次失败时重新计数）
  }
  return null;
}

function recordFailedLogin(username: string) {
  const entry = failedLogins.get(username) || { count: 0, lockedUntil: 0 };
  entry.count++;
  if (entry.count >= MAX_FAILURES) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
  }
  failedLogins.set(username, entry);
}

function clearFailedLogins(username: string) {
  failedLogins.delete(username);
}

// 统一登录（自动识别 User 或 Customer）
authRouter.post('/login', async (req: AuthRequest, res: Response) => {
  try {
    const { username, password, device } = req.body;
    const deviceType = device === 'mobile' ? 'mobile' : 'desktop';
    if (!username || !password) {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }

    // 锁定检查
    const lockMsg = checkLockout(username);
    if (lockMsg) return res.status(429).json({ error: lockMsg });

    // 先查 User 表
    const user = await prisma.user.findUnique({ where: { username } });
    if (user) {
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        recordFailedLogin(username);
        return res.status(401).json({ error: '用户名或密码错误' });
      }
      let customerId = null;
      if (user.warehouseId) {
        const wh = await prisma.warehouse.findUnique({ where: { id: user.warehouseId }, select: { customerId: true } });
        customerId = wh?.customerId ?? null;
      }
      const tokenVersionField = deviceType === 'mobile' ? 'mobileTokenVersion' : 'desktopTokenVersion';
      const tokenVersion = (deviceType === 'mobile' ? user.mobileTokenVersion : user.desktopTokenVersion) + 1;
      await platformPrisma.user.update({ where: { id: user.id }, data: { [tokenVersionField]: tokenVersion } });
      const token = jwt.sign(
        { userId: user.id, role: user.role, warehouseId: user.warehouseId, customerId, operatorType: user.operatorType ?? null, tokenVersion, device: deviceType },
        JWT_ADMIN_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      const { passwordHash: _, ...rest } = user;
      clearFailedLogins(username);
      setTokenCookie(res, token);
      return res.json({ token, user: rest });
    }

    // 再查 Customer 表
    const customer = await prisma.customer.findFirst({
      where: { username, deletedAt: null },
      include: { warehouses: { take: 1, orderBy: { id: 'asc' } } },
    });
    if (customer) {
      // 检查是否过期
      if (customer.expiresAt && new Date() > customer.expiresAt) {
        await prisma.customer.update({ where: { id: customer.id }, data: { status: 'suspended' } });
        return res.status(403).json({ error: '账号已过期，请联系管理员续费' });
      }
      if (customer.status === 'suspended') {
        return res.status(403).json({ error: '账号已被暂停，请联系管理员' });
      }
      const valid = await bcrypt.compare(password, customer.passwordHash);
      if (!valid) {
        recordFailedLogin(username);
        return res.status(401).json({ error: '用户名或密码错误' });
      }

      // 7天内到期提醒
      let expiryWarning: string | undefined;
      if (customer.expiresAt) {
        const daysLeft = Math.ceil((customer.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        if (daysLeft <= 7 && daysLeft > 0) {
          expiryWarning = `账号将在 ${daysLeft} 天后到期，请及时续费`;
        }
      }
      if (customer.status === 'pending') {
        expiryWarning = '账号审核中，当前仅可查看，无法操作';
      }

      const warehouseId = customer.warehouses[0]?.id ?? null;
      const { passwordHash: _, serverHost, ...rest } = customer;

      // 多服务器路由
      if (serverHost && serverHost !== THIS_HOST) {
        const transferToken = jwt.sign(
          { userId: customer.id, role: 'tenant_admin', warehouseId, customerId: customer.id },
          INTER_SERVER_SECRET,
          { expiresIn: '5m' }
        );
        return res.json({ serverRedirect: `https://${serverHost}`, transferToken, expiryWarning });
      }

      const tokenVersionField = deviceType === 'mobile' ? 'mobileTokenVersion' : 'desktopTokenVersion';
      const tokenVersion = (deviceType === 'mobile' ? customer.mobileTokenVersion : customer.desktopTokenVersion) + 1;
      await platformPrisma.customer.update({ where: { id: customer.id }, data: { [tokenVersionField]: tokenVersion } });
      const token = jwt.sign(
        { userId: customer.id, role: 'tenant_admin', warehouseId, customerId: customer.id, tokenVersion, device: deviceType },
        JWT_ADMIN_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      clearFailedLogins(username);
      setTokenCookie(res, token);
      return res.json({ token, user: { ...rest, role: 'tenant_admin', warehouseId, expiresAt: customer.expiresAt }, expiryWarning });
    }

        recordFailedLogin(username);
    return res.status(401).json({ error: '用户名或密码错误' });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 超管切换客户视角
authRouter.post('/switch-customer', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userRole !== 'super_admin') {
      return res.status(403).json({ error: '仅超级管理员可操作' });
    }
    const { customerId } = req.body;
    if (!customerId) return res.status(400).json({ error: '请指定客户' });

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      include: { warehouses: { take: 1, orderBy: { id: 'asc' } } },
    });
    if (!customer) return res.status(404).json({ error: '客户不存在' });

    const warehouseId = customer.warehouses[0]?.id ?? null;
    const token = jwt.sign(
      { userId: customer.id, role: 'tenant_admin', warehouseId, customerId: customer.id },
      JWT_ADMIN_SECRET,
      { expiresIn: '8h' }
    );
    const { passwordHash: _, ...rest } = customer;
      setTokenCookie(res, token);
    res.json({ token, user: { ...rest, role: 'tenant_admin', warehouseId } });
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取当前用户
authRouter.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userRole === 'tenant_admin') {
      const customer = await platformPrisma.customer.findFirst({
        where: { id: req.userId, deletedAt: null },
        include: { warehouses: { select: { id: true, name: true } } },
      });
      if (!customer) return res.status(404).json({ error: '客户不存在' });
      const { passwordHash: _, ...rest } = customer;
      return res.json({ ...rest, role: 'tenant_admin', warehouses: customer.warehouses });
    }

    // admin / warehouse_admin / operator（User 在平台库，需要显式指定）
    const user = await platformPrisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: '用户不存在' });
    const { passwordHash: _, ...rest } = user;
    res.json(rest);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// 修改密码
authRouter.put('/change-password', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '请输入旧密码和新密码' });
    }
    if (newPassword.length < 6 || newPassword.length > 128) {
      return res.status(400).json({ error: '新密码 6-128 位' });
    }
    // 操作员由所属租户管理员管理密码，不能自己修改
    if (req.userRole === 'operator') {
      return res.status(403).json({ error: '操作员请联系管理员修改密码' });
    }

    if (req.userRole === 'tenant_admin') {
      const customer = await platformPrisma.customer.findUnique({ where: { id: req.userId } });
      if (!customer) return res.status(404).json({ error: '账号不存在' });
      const valid = await bcrypt.compare(oldPassword, customer.passwordHash);
      if (!valid) return res.status(400).json({ error: '旧密码错误' });
      const newHash = await bcrypt.hash(newPassword, 10);
      await platformPrisma.customer.update({ where: { id: req.userId }, data: { passwordHash: newHash } });
    } else {
      const user = await platformPrisma.user.findUnique({ where: { id: req.userId } });
      if (!user) return res.status(404).json({ error: '用户不存在' });
      const valid = await bcrypt.compare(oldPassword, user.passwordHash);
      if (!valid) return res.status(400).json({ error: '旧密码错误' });
      const newHash = await bcrypt.hash(newPassword, 10);
      await platformPrisma.user.update({ where: { id: req.userId }, data: { passwordHash: newHash } });
    }

    res.json({ message: '密码修改成功' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 客户登录
authRouter.post('/tenant/login', async (req: AuthRequest, res: Response) => {
  try {
    const { username, password, device } = req.body;
    const deviceType = device === 'mobile' ? 'mobile' : 'desktop';
    if (!username || !password) {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }

    const customer = await prisma.customer.findFirst({
      where: { username, deletedAt: null },
      include: { warehouses: { take: 1, orderBy: { id: 'asc' } } },
    });
    if (!customer) {
        recordFailedLogin(username);
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    if (customer.status === 'suspended') {
      return res.status(403).json({ error: '账号已被暂停，请联系管理员' });
    }

    const valid = await bcrypt.compare(password, customer.passwordHash);
    if (!valid) {
        recordFailedLogin(username);
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const warehouseId = customer.warehouses[0]?.id ?? null;
    const { passwordHash: _, serverHost, status: custStatus, ...customerWithoutPassword } = customer;
    const tokenVersionField2 = deviceType === 'mobile' ? 'mobileTokenVersion' : 'desktopTokenVersion';
    const tokenVersion = (deviceType === 'mobile' ? customer.mobileTokenVersion : customer.desktopTokenVersion) + 1;

    // 多服务器路由
    if (serverHost && serverHost !== THIS_HOST) {
      const transferToken = jwt.sign(
        { userId: customer.id, role: 'tenant_admin', warehouseId, customerId: customer.id, tokenVersion, device: deviceType },
        INTER_SERVER_SECRET,
        { expiresIn: '5m' }
      );
      return res.json({ serverRedirect: `https://${serverHost}`, transferToken });
    }

    await platformPrisma.customer.update({ where: { id: customer.id }, data: { [tokenVersionField2]: tokenVersion } });
    const token = jwt.sign(
      { userId: customer.id, role: 'tenant_admin', warehouseId, customerId: customer.id, tokenVersion, device: deviceType },
      JWT_ADMIN_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
      clearFailedLogins(username);
      setTokenCookie(res, token);
    res.json({ token, user: { ...customerWithoutPassword, role: 'tenant_admin', warehouseId } });
  } catch (err) {
    console.error('Tenant login error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 跨服务器中转登录：worker 服务器验证中转 token 并返回本地 token
authRouter.post('/claim', async (req: AuthRequest, res: Response) => {
  try {
    const { transferToken } = req.body;
    if (!transferToken) return res.status(400).json({ error: '缺少中转 token' });

    const payload = jwt.verify(transferToken, INTER_SERVER_SECRET) as {
      userId: number;
      role: string;
      warehouseId?: number | null;
      customerId?: number;
    };

    // 验证该客户确实归本服务器
    const customer = await prisma.customer.findFirst({
      where: { id: payload.userId, deletedAt: null },
      select: { serverHost: true, id: true, status: true },
    });
    if (!customer || customer.serverHost !== THIS_HOST) {
      return res.status(403).json({ error: '无权访问此服务器' });
    }

    // 生成正式 token
    const token = jwt.sign(payload, JWT_ADMIN_SECRET, { expiresIn: JWT_EXPIRES_IN });
    setTokenCookie(res, token);
    res.json({ token });
  } catch (err) {
    console.error('中转 token 验证失败:', err);
    return res.status(401).json({ error: '中转 token 无效或已过期' });
  }
});

// 返回当前服务器标识
authRouter.get('/host-info', (_req, res: Response) => {
  res.json({ host: THIS_HOST });
});

// 公开注册（无需登录）
authRouter.post('/register', async (req: AuthRequest, res: Response) => {
  try {
    const { username, password, realName, phone } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    if (username.length < 3 || username.length > 50) {
      return res.status(400).json({ error: '用户名 3-50 字符' });
    }
    if (!/^[a-zA-Z0-9_一-鿿]+$/.test(username)) {
      return res.status(400).json({ error: '用户名只能包含字母、数字、下划线和中文' });
    }
    if (password.length < 6 || password.length > 128) {
      return res.status(400).json({ error: '密码 6-128 位' });
    }
    if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ error: '手机号格式不正确' });
    }

    const existing = await prisma.customer.findFirst({ where: { username, deletedAt: null } });
    if (existing) return res.status(400).json({ error: '用户名已被注册' });
    // 检查是否被软删除，恢复
    const softDeleted = await prisma.customer.findFirst({ where: { username, deletedAt: { not: null } } });
    if (softDeleted) {
      await prisma.customer.update({ where: { id: softDeleted.id }, data: { deletedAt: null } });
    }
    const userConflict = await prisma.user.findUnique({ where: { username } });
    if (userConflict) return res.status(400).json({ error: '用户名已被占用' });

    const passwordHash = await bcrypt.hash(password, 10);
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90天试用

    // 自动审批：默认开启，可通过后台 Setting 手动关闭
    // 注册频率由 express-rate-limit（3次/小时）防护，不再按日计数自动关审批
    const autoSetting = await prisma.setting.findUnique({ where: { key: 'autoApproveRegistrations' } });
    const initialStatus = (!autoSetting || autoSetting.value === 'true') ? 'active' : 'pending';

    // 1. 在主库创建客户记录 + 仓库（登录流程需要从主库读取 warehouseId）
    const customer = await prisma.customer.create({
      data: { username, passwordHash, realName: realName || username, phone: phone || null, maxWarehouses: 1, expiresAt, status: initialStatus },
    });
    const mainWh = await prisma.warehouse.create({
      data: { name: `${realName || username}主仓库`, customerId: customer.id },
    });

    // 2. 初始化租户数据库（建表）
    await initTenantDatabase(customer.id);
    // 清空可能残留的旧注册数据（SQLite ID 复用场景）
    await resetTenantDatabase(customer.id);

    // 3. 在租户库中创建仓库和库位
    const { PrismaClient } = await import('@prisma/client');
    const { fileURLToPath } = await import('url');
    const pathMod = await import('path');
    const _dirname = pathMod.dirname(fileURLToPath(import.meta.url));
    const dbPath = pathMod.join(_dirname, '../../prisma', `tenant_${customer.id}.db`);
    const tenantPrisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
    try {
      await tenantPrisma.customer.create({
        data: { id: customer.id, username, passwordHash: "tenant_db", realName: realName || username, status: initialStatus },
      });
      const wh = await tenantPrisma.warehouse.create({
        data: { name: `${realName || username}主仓库`, id: mainWh.id, customerId: customer.id },
      });
      const locNames = ['A区-01架', 'A区-02架', 'B区-01架', 'B区-02架'];
      const ts = Date.now().toString(36).toUpperCase();
      for (let i = 0; i < locNames.length; i++) {
        const code = 'LOC-' + ts + '-' + i.toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase();
        await tenantPrisma.location.create({ data: { name: locNames[i], warehouseId: wh.id, code } });
      }
    } finally {
      await tenantPrisma.$disconnect();
    }

    res.status(201).json({ message: '注册成功，90 天免费试用已开通', username, expiresAt });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: '注册失败' });
  }
});

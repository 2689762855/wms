import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma, { platformPrisma } from '../utils/prisma';
import { AuthRequest, authenticate, JWT_ADMIN_SECRET, INTER_SERVER_SECRET, THIS_HOST } from '../middleware/auth';

const JWT_EXPIRES_IN = '24h';

export const authRouter = Router();

// 统一登录（自动识别 User 或 Customer）
authRouter.post('/login', async (req: AuthRequest, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }

    // 先查 User 表
    const user = await prisma.user.findUnique({ where: { username } });
    if (user) {
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: '用户名或密码错误' });
      }
      let customerId = null;
      if (user.warehouseId) {
        const wh = await prisma.warehouse.findUnique({ where: { id: user.warehouseId }, select: { customerId: true } });
        customerId = wh?.customerId ?? null;
      }
      const tokenVersion = user.tokenVersion + 1;
      await platformPrisma.user.update({ where: { id: user.id }, data: { tokenVersion } });
      const token = jwt.sign(
        { userId: user.id, role: user.role, warehouseId: user.warehouseId, customerId, operatorType: user.operatorType ?? null, tokenVersion },
        JWT_ADMIN_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      const { passwordHash: _, ...rest } = user;
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

      const token = jwt.sign(
        { userId: customer.id, role: 'tenant_admin', warehouseId, customerId: customer.id },
        JWT_ADMIN_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      return res.json({ token, user: { ...rest, role: 'tenant_admin', warehouseId, expiresAt: customer.expiresAt }, expiryWarning });
    }

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
    res.json({ token, user: { ...rest, role: 'tenant_admin', warehouseId } });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// 获取当前用户
authRouter.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userRole === 'tenant_admin') {
      const customer = await prisma.customer.findFirst({
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

// 客户登录
authRouter.post('/tenant/login', async (req: AuthRequest, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }

    const customer = await prisma.customer.findFirst({
      where: { username, deletedAt: null },
      include: { warehouses: { take: 1, orderBy: { id: 'asc' } } },
    });
    if (!customer) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    if (customer.status === 'suspended') {
      return res.status(403).json({ error: '账号已被暂停，请联系管理员' });
    }

    const valid = await bcrypt.compare(password, customer.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const warehouseId = customer.warehouses[0]?.id ?? null;
    const { passwordHash: _, serverHost, status: custStatus, ...customerWithoutPassword } = customer;

    // 多服务器路由
    if (serverHost && serverHost !== THIS_HOST) {
      const transferToken = jwt.sign(
        { userId: customer.id, role: 'tenant_admin', warehouseId, customerId: customer.id },
        INTER_SERVER_SECRET,
        { expiresIn: '5m' }
      );
      return res.json({ serverRedirect: `https://${serverHost}`, transferToken });
    }

    const token = jwt.sign(
      { userId: customer.id, role: 'tenant_admin', warehouseId, customerId: customer.id },
      JWT_ADMIN_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
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

    // 检查是否开启自动审批
    const autoSetting = await prisma.setting.findUnique({ where: { key: 'autoApproveRegistrations' } });
    const initialStatus = autoSetting?.value === 'true' ? 'active' : 'pending';

    const [customer] = await prisma.$transaction(async (tx) => {
      const cust = await tx.customer.create({
        data: { username, passwordHash, realName: realName || username, phone: phone || null, maxWarehouses: 1, expiresAt, status: initialStatus },
      });

      // 自动创建仓库
      const wh = await tx.warehouse.create({
        data: { name: `${realName || username}主仓库`, customerId: cust.id },
      });

      // 创建默认库位
      const locNames = ['A区-01架', 'A区-02架', 'B区-01架', 'B区-02架'];
      for (const locName of locNames) {
        const code = 'LOC-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase();
        await tx.location.create({ data: { name: locName, warehouseId: wh.id, code } });
      }
      return [cust];
    });

    res.status(201).json({ message: '注册成功，90 天免费试用已开通', username, expiresAt });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: '注册失败' });
  }
});

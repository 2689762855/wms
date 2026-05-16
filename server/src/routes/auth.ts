import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate, JWT_ADMIN_SECRET } from '../middleware/auth';

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
      const token = jwt.sign(
        { userId: user.id, role: user.role, warehouseId: user.warehouseId },
        JWT_ADMIN_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      const { passwordHash: _, ...rest } = user;
      return res.json({ token, user: rest });
    }

    // 再查 Customer 表
    const customer = await prisma.customer.findUnique({
      where: { username },
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

      const warehouseId = customer.warehouses[0]?.id ?? null;
      const token = jwt.sign(
        { userId: customer.id, role: 'tenant_admin', warehouseId, customerId: customer.id },
        JWT_ADMIN_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      const { passwordHash: _, ...rest } = customer;
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

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
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
      const customer = await prisma.customer.findUnique({
        where: { id: req.userId },
        include: { warehouses: { select: { id: true, name: true } } },
      });
      if (!customer) return res.status(404).json({ error: '客户不存在' });
      const { passwordHash: _, ...rest } = customer;
      return res.json({ ...rest, role: 'tenant_admin', warehouses: customer.warehouses });
    }

    // admin / warehouse_admin / operator
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
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

    const customer = await prisma.customer.findUnique({
      where: { username },
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
    const token = jwt.sign(
      { userId: customer.id, role: 'tenant_admin', warehouseId, customerId: customer.id },
      JWT_ADMIN_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    const { passwordHash: _, ...customerWithoutPassword } = customer;
    res.json({ token, user: { ...customerWithoutPassword, role: 'tenant_admin', warehouseId } });
  } catch (err) {
    console.error('Tenant login error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

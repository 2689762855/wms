import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate, JWT_ADMIN_SECRET } from '../middleware/auth';

const JWT_EXPIRES_IN = '24h';

export const authRouter = Router();

// 登录
authRouter.post('/login', async (req: AuthRequest, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const token = jwt.sign({ userId: user.id, role: user.role, warehouseId: user.warehouseId }, JWT_ADMIN_SECRET, { expiresIn: JWT_EXPIRES_IN });
    const { passwordHash: _, ...userWithoutPassword } = user;
    res.json({ token, user: userWithoutPassword });
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

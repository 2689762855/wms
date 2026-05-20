import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate, authorize, validateId } from '../middleware/auth';

export const usersRouter = Router();

// 用户列表
usersRouter.get('/', authenticate, authorize('super_admin', 'warehouse_admin', 'tenant_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const where: Record<string, unknown> = {};
    if (req.userRole === 'warehouse_admin') {
      where.role = 'operator';
      where.createdById = req.userId;
    }
    if (req.userRole === 'tenant_admin') {
      where.role = 'operator';
      // 如果指定了仓库则按仓库过滤，否则显示客户下所有仓库的操作员
      if (req.query.warehouseId) {
        where.warehouseId = parseInt(req.query.warehouseId as string);
      } else if (req.userWarehouseId) {
        where.warehouseId = req.userWarehouseId;
      }
    }
    const users = await prisma.user.findMany({
      where,
      select: { id: true, username: true, role: true, realName: true, phone: true, warehouseId: true, createdAt: true,
        createdBy: { select: { id: true, realName: true, username: true } },
        warehouse: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// 创建用户
usersRouter.post('/', authenticate, authorize('super_admin', 'warehouse_admin', 'tenant_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { username, password, role, realName, phone, warehouseId } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
    if (username.length > 50) return res.status(400).json({ error: '用户名不能超过50字符' });
    if (password.length < 6) return res.status(400).json({ error: '密码至少6位' });
    if (password.length > 128) return res.status(400).json({ error: '密码不能超过128位' });

    // 仓管只能创建操作员，且仓库自动继承
    let finalRole = role || 'operator';
    let finalWarehouseId = warehouseId || null;
    if (req.userRole === 'warehouse_admin') {
      finalRole = 'operator';
      finalWarehouseId = req.userWarehouseId;
    } else if (req.userRole === 'tenant_admin') {
      finalRole = 'operator';
      finalWarehouseId = warehouseId || req.userWarehouseId;
      // 校验仓库属于当前客户
      if (finalWarehouseId && req.customerId) {
        const wh = await prisma.warehouse.findUnique({ where: { id: finalWarehouseId }, select: { customerId: true } });
        if (!wh || wh.customerId !== req.customerId) {
          return res.status(403).json({ error: '无权操作此仓库' });
        }
      }
      // 检查操作员数量限制：标准版最多3人，专业版最多20人
      const customer = await prisma.customer.findFirst({ where: { id: req.customerId!, deletedAt: null }, select: { maxWarehouses: true } });
      const maxOperators = (customer?.maxWarehouses || 1) >= 3 ? 20 : 3;
      const operatorCount = await prisma.user.count({
        where: { createdById: req.userId, role: 'operator' },
      });
      if (operatorCount >= maxOperators) {
        return res.status(400).json({ error: `操作员已达上限（${maxOperators}人），请升级版本` });
      }
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) return res.status(400).json({ error: '用户名已存在' });
    const customerConflict = await prisma.customer.findFirst({ where: { username, deletedAt: null } });
    if (customerConflict) return res.status(400).json({ error: '用户名已被客户账号使用' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { username, passwordHash, role: finalRole, realName, phone, warehouseId: finalWarehouseId, createdById: req.userId },
      select: { id: true, username: true, role: true, realName: true, phone: true, warehouseId: true, createdAt: true,
        warehouse: { select: { id: true, name: true } },
      },
    });
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// 编辑用户
usersRouter.put('/:id', validateId, authenticate, authorize('super_admin', 'warehouse_admin', 'tenant_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ error: '用户不存在' });

    if (req.userRole === 'warehouse_admin' || req.userRole === 'tenant_admin') {
      if (target.role !== 'operator' || target.createdById !== req.userId) {
        return res.status(403).json({ error: '只能编辑自己创建的操作员' });
      }
    }

    const { role, realName, phone, password, warehouseId } = req.body;
    const data: Record<string, unknown> = {};
    if (realName !== undefined) data.realName = realName;
    if (phone !== undefined) data.phone = phone;
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: '密码至少6位' });
      if (password.length > 128) return res.status(400).json({ error: '密码不能超过128位' });
      data.passwordHash = await bcrypt.hash(password, 10);
    }
    if (req.userRole === 'super_admin') {
      if (role) data.role = role;
      if (warehouseId !== undefined) data.warehouseId = warehouseId;
    } else if (req.userRole === 'tenant_admin' && warehouseId !== undefined) {
      if (req.customerId) {
        const wh = await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { customerId: true } });
        if (!wh || wh.customerId !== req.customerId) return res.status(403).json({ error: '无权操作此仓库' });
      }
      data.warehouseId = warehouseId;
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, username: true, role: true, realName: true, phone: true, warehouseId: true, createdAt: true,
        warehouse: { select: { id: true, name: true } },
      },
    });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// 删除用户
usersRouter.delete('/:id', validateId, authenticate, authorize('super_admin', 'warehouse_admin', 'tenant_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (id === req.userId) return res.status(400).json({ error: '不能删除自己' });
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ error: '用户不存在' });
    if (req.userRole === 'warehouse_admin' || req.userRole === 'tenant_admin') {
      if (target.role !== 'operator' || target.createdById !== req.userId) {
        return res.status(403).json({ error: '只能删除自己创建的操作员' });
      }
    }
    await prisma.user.delete({ where: { id } });
    res.json({ message: '已删除' });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

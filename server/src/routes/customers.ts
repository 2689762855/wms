import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate, superAdmin } from '../middleware/auth';

export const customersRouter = Router();
customersRouter.use(authenticate);
customersRouter.use(superAdmin);

// 客户列表
customersRouter.get('/', async (_req: AuthRequest, res: Response) => {
  const customers = await prisma.customer.findMany({
    include: {
      warehouses: { select: { id: true, name: true, createdAt: true } },
      _count: { select: { products: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const result = customers.map(c => {
    const { passwordHash: _, ...rest } = c;
    return rest;
  });
  res.json(result);
});

// 客户详情
customersRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      warehouses: { include: { _count: { select: { inventories: true, users: true } } } },
      _count: { select: { products: true } },
    },
  });
  if (!customer) return res.status(404).json({ error: '客户不存在' });
  const { passwordHash: _, ...rest } = customer;
  res.json(rest);
});

// 创建客户（自动创建专属仓库）
customersRouter.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { username, password, realName, maxWarehouses, warehouseName } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    if (username.length > 50) return res.status(400).json({ error: '用户名不能超过 50 字符' });
    if (password.length < 6) return res.status(400).json({ error: '密码至少 6 位' });
    if (password.length > 128) return res.status(400).json({ error: '密码不能超过 128 位' });

    const existing = await prisma.customer.findUnique({ where: { username } });
    if (existing) return res.status(400).json({ error: '用户名已存在' });

    const passwordHash = await bcrypt.hash(password, 10);
    const customer = await prisma.customer.create({
      data: {
        username,
        passwordHash,
        realName: realName || username,
        maxWarehouses: maxWarehouses || 1,
        createdBy: req.userId,
      },
    });

    // 自动创建专属仓库
    const wh = await prisma.warehouse.create({
      data: {
        name: warehouseName || `${realName || username}主仓库`,
        address: null,
        customerId: customer.id,
      },
    });

    const { passwordHash: _, ...safe } = customer;
    res.status(201).json({ ...safe, warehouses: [wh] });
  } catch (err) {
    console.error('Create customer error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 编辑客户（状态、仓库数量、追加仓库）
customersRouter.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) return res.status(404).json({ error: '客户不存在' });

    const { realName, status, maxWarehouses, password, addWarehouseName } = req.body;

    const data: Record<string, unknown> = {};
    if (realName !== undefined) data.realName = realName;
    if (status !== undefined) {
      if (!['active', 'suspended'].includes(status)) {
        return res.status(400).json({ error: '状态值无效' });
      }
      data.status = status;
    }
    if (maxWarehouses !== undefined) {
      if (maxWarehouses < 1) return res.status(400).json({ error: '仓库数量至少为 1' });
      data.maxWarehouses = maxWarehouses;
    }
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: '密码至少 6 位' });
      if (password.length > 128) return res.status(400).json({ error: '密码不能超过 128 位' });
      data.passwordHash = await bcrypt.hash(password, 10);
    }

    await prisma.customer.update({ where: { id }, data });

    // 追加仓库
    if (addWarehouseName) {
      const count = await prisma.warehouse.count({ where: { customerId: id } });
      const limit = maxWarehouses ?? customer.maxWarehouses;
      if (count >= limit) {
        return res.status(400).json({ error: `仓库数量已达上限 (${limit}个)` });
      }
      await prisma.warehouse.create({ data: { name: addWarehouseName, customerId: id } });
    }

    const updated = await prisma.customer.findUnique({
      where: { id },
      include: { warehouses: { select: { id: true, name: true } } },
    });
    const { passwordHash: _, ...safe } = updated!;
    res.json(safe);
  } catch (err) {
    console.error('Update customer error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 删除客户（级联删除其仓库下的所有数据）
customersRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  try {
    // 获取该客户的所有仓库 ID
    const warehouses = await prisma.warehouse.findMany({ where: { customerId: id }, select: { id: true } });
    const warehouseIds = warehouses.map(w => w.id);

    // 级联删除顺序：子表 → 父表
    for (const wid of warehouseIds) {
      await prisma.stockLog.deleteMany({ where: { warehouseId: wid } });
      await prisma.checkItem.deleteMany({ where: { task: { warehouseId: wid } } });
      await prisma.checkTask.deleteMany({ where: { warehouseId: wid } });
      await prisma.transferItem.deleteMany({ where: { transfer: { OR: [{ fromWarehouseId: wid }, { toWarehouseId: wid }] } } });
      await prisma.transferOrder.deleteMany({ where: { OR: [{ fromWarehouseId: wid }, { toWarehouseId: wid }] } });
      await prisma.outboundItem.deleteMany({ where: { outbound: { warehouseId: wid } } });
      await prisma.outboundOrder.deleteMany({ where: { warehouseId: wid } });
      await prisma.inboundItem.deleteMany({ where: { inbound: { warehouseId: wid } } });
      await prisma.inboundOrder.deleteMany({ where: { warehouseId: wid } });
      await prisma.inventory.deleteMany({ where: { warehouseId: wid } });
      await prisma.user.deleteMany({ where: { warehouseId: wid } });
      await prisma.location.deleteMany({ where: { warehouseId: wid } });
      await prisma.warehouse.delete({ where: { id: wid } });
    }

    await prisma.product.deleteMany({ where: { customerId: id } });
    await prisma.category.deleteMany({ where: { customerId: id } });
    await prisma.customer.delete({ where: { id } });

    res.json({ message: '已删除客户及其所有数据' });
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: '客户不存在' });
    console.error('Delete customer error:', err);
    res.status(500).json({ error: '删除失败' });
  }
});

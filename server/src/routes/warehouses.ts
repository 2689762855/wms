import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate, adminWrite } from '../middleware/auth';

export const warehousesRouter = Router();
warehousesRouter.use(authenticate);
warehousesRouter.use(adminWrite);

warehousesRouter.get('/', async (req: AuthRequest, res: Response) => {
  const where: Record<string, unknown> = {};
  if (req.customerId) {
    where.customerId = req.customerId;
  }
  const list = await prisma.warehouse.findMany({
    where,
    include: {
      _count: { select: { users: true, inventories: true, inboundOrders: true, outboundOrders: true } },
      inventories: true,
      users: { select: { id: true, realName: true, role: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const result = list.map(w => ({
    id: w.id,
    name: w.name,
    address: w.address,
    createdAt: w.createdAt,
    userCount: w._count.users,
    inventoryCount: w._count.inventories,
    totalInbound: w._count.inboundOrders,
    totalOutbound: w._count.outboundOrders,
    totalQuantity: w.inventories.reduce((s, inv) => s + inv.quantity, 0),
    users: w.users,
  }));

  res.json(result);
});

warehousesRouter.post('/', async (req: AuthRequest, res: Response) => {
  const { name, address } = req.body;
  if (!name) return res.status(400).json({ error: '仓库名称必填' });
  if (name.length > 100) return res.status(400).json({ error: '仓库名称不能超过 100 字符' });
  if (address && address.length > 500) return res.status(400).json({ error: '地址不能超过 500 字符' });

  // 客户创建仓库需检查数量限制
  let customerId: number | null = null;
  if (req.userRole === 'tenant_admin') {
    const customer = await prisma.customer.findUnique({ where: { id: req.userId } });
    if (!customer || customer.status !== 'active') {
      return res.status(403).json({ error: '账号不可用' });
    }
    const count = await prisma.warehouse.count({ where: { customerId: customer.id } });
    if (count >= customer.maxWarehouses) {
      return res.status(400).json({ error: `仓库数量已达上限 (${customer.maxWarehouses}个)，请联系管理员扩容` });
    }
    customerId = customer.id;
  } else if (req.userRole === 'super_admin' && req.body.customerId) {
    customerId = req.body.customerId;
  }

  const warehouse = await prisma.warehouse.create({ data: { name, address, customerId } });
  res.status(201).json(warehouse);
});

warehousesRouter.put('/:id', async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const existing = await prisma.warehouse.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: '仓库不存在' });
  if (req.customerId && existing.customerId !== req.customerId) {
    return res.status(403).json({ error: '无权操作此仓库' });
  }

  const { name, address } = req.body;
  if (name && name.length > 100) return res.status(400).json({ error: '仓库名称不能超过 100 字符' });
  if (address && address.length > 500) return res.status(400).json({ error: '地址不能超过 500 字符' });
  const warehouse = await prisma.warehouse.update({ where: { id }, data: { name, address } });
  res.json(warehouse);
});

warehousesRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const existing = await prisma.warehouse.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: '仓库不存在' });
  if (req.userRole === 'tenant_admin') {
    return res.status(403).json({ error: '客户不能删除仓库，请联系管理员' });
  }
  await prisma.warehouse.delete({ where: { id } });
  res.json({ message: '已删除' });
});

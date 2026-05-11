import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate, adminWrite } from '../middleware/auth';

export const warehousesRouter = Router();
warehousesRouter.use(authenticate);
warehousesRouter.use(adminWrite);

warehousesRouter.get('/', async (_req: AuthRequest, res: Response) => {
  const list = await prisma.warehouse.findMany({
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
  const warehouse = await prisma.warehouse.create({ data: { name, address } });
  res.status(201).json(warehouse);
});

warehousesRouter.put('/:id', async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const { name, address } = req.body;
  if (name && name.length > 100) return res.status(400).json({ error: '仓库名称不能超过 100 字符' });
  if (address && address.length > 500) return res.status(400).json({ error: '地址不能超过 500 字符' });
  const warehouse = await prisma.warehouse.update({ where: { id }, data: { name, address } });
  res.json(warehouse);
});

warehousesRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  await prisma.warehouse.delete({ where: { id } });
  res.json({ message: '已删除' });
});

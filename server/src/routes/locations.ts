import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate, adminWrite, requireWarehouse } from '../middleware/auth';

export const locationsRouter = Router();
locationsRouter.use(authenticate);

// 按扫码 code 查询库位
locationsRouter.get('/code/:code', async (req: AuthRequest, res: Response) => {
  const location = await prisma.location.findUnique({
    where: { code: req.params.code },
    include: { warehouse: true },
  });
  if (!location) return res.status(404).json({ error: '未找到该库位，请检查二维码是否正确' });
  res.json(location);
});

// 库位下的库存列表
locationsRouter.get('/:id/inventory', async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const inventory = await prisma.inventory.findMany({
    where: { locationId: id, quantity: { gt: 0 } },
    include: { product: { include: { category: { include: { parent: { include: { parent: true } } } } } } },
    orderBy: { product: { name: 'asc' } },
  });
  res.json(inventory);
});

// 仓库的库位列表
locationsRouter.get('/', async (req: AuthRequest, res: Response) => {
  const warehouseId = parseInt(req.query.warehouseId as string) || req.userWarehouseId;
  if (!warehouseId) return res.status(400).json({ error: '请指定仓库' });
  const list = await prisma.location.findMany({ where: { warehouseId }, orderBy: { name: 'asc' } });
  res.json(list);
});

// 创建库位
locationsRouter.post('/', authenticate, adminWrite, requireWarehouse, async (req: AuthRequest, res: Response) => {
  const { name, warehouseId } = req.body;
  if (!name) return res.status(400).json({ error: '库位名称必填' });
  const wid = req.userRole === 'super_admin' ? warehouseId : req.userWarehouseId;
  if (!wid) return res.status(400).json({ error: '请指定仓库' });

  // 生成唯一 code
  const code = 'LOC-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 5).toUpperCase();

  const location = await prisma.location.create({ data: { name, warehouseId: wid, code } });
  res.status(201).json(location);
});

// 编辑库位
locationsRouter.put('/:id', authenticate, adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const { name } = req.body;
  const loc = await prisma.location.update({ where: { id }, data: { name } });
  res.json(loc);
});

// 删除库位
locationsRouter.delete('/:id', authenticate, adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  await prisma.location.delete({ where: { id } });
  res.json({ message: '已删除' });
});

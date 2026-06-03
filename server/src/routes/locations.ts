import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate, adminWrite, requireWarehouse, validateId } from '../middleware/auth';

export const locationsRouter = Router();
locationsRouter.use(authenticate);

// 按扫码 code 查询库位
locationsRouter.get('/code/:code', async (req: AuthRequest, res: Response) => {
  const location = await prisma.location.findFirst({
    where: { code: req.params.code as string },
    include: { warehouse: true },
  });
  if (!location) return res.status(404).json({ error: '未找到该库位，请检查二维码是否正确' });
  // 校验仓库归属
  if (req.customerId) {
    if (!location.warehouse || location.warehouse.customerId !== req.customerId) {
      return res.status(403).json({ error: '无权访问此库位' });
    }
  }
  res.json(location);
});

// 库位下的库存列表
locationsRouter.get('/:id/inventory', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  // 校验库位归属
  if (req.customerId) {
    const loc = await prisma.location.findUnique({ where: { id }, include: { warehouse: { select: { customerId: true } } } });
    if (!loc) return res.status(404).json({ error: '库位不存在' });
    if (loc.warehouse.customerId !== req.customerId) {
      return res.status(403).json({ error: '无权访问此库位' });
    }
  }
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
  // 校验仓库归属
  if (req.customerId) {
    const wh = await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { customerId: true } });
    if (!wh || wh.customerId !== req.customerId) {
      return res.status(403).json({ error: '无权查看此仓库的库位' });
    }
  }
  const list = await prisma.location.findMany({ where: { warehouseId }, orderBy: { name: 'asc' } });
  res.json(list);
});

// 创建库位
locationsRouter.post('/', authenticate, adminWrite, requireWarehouse, async (req: AuthRequest, res: Response) => {
  const { name, warehouseId } = req.body;
  if (!name) return res.status(400).json({ error: '库位名称必填' });
  let wid: number;
  if (req.userRole === 'super_admin') {
    wid = warehouseId;
  } else if (req.userRole === 'tenant_admin') {
    wid = warehouseId || req.userWarehouseId;
    // 校验仓库属于当前客户
    if (wid && req.customerId) {
      const wh = await prisma.warehouse.findUnique({ where: { id: wid }, select: { customerId: true } });
      if (!wh || wh.customerId !== req.customerId) {
        return res.status(403).json({ error: '无权操作此仓库' });
      }
    }
  } else {
    wid = req.userWarehouseId!;
  }
  if (!wid) return res.status(400).json({ error: '请指定仓库' });

  // 生成唯一 code
  const code = 'LOC-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 5).toUpperCase();

  const location = await prisma.location.create({ data: { name, warehouseId: wid, code } });
  res.status(201).json(location);
});

// 编辑库位
locationsRouter.put('/:id', validateId, authenticate, adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const existing = await prisma.location.findUnique({ where: { id }, include: { warehouse: { select: { customerId: true } } } });
  if (!existing) return res.status(404).json({ error: '库位不存在' });
  if (req.customerId && existing.warehouse.customerId !== req.customerId) {
    return res.status(403).json({ error: '无权操作此库位' });
  }
  const { name } = req.body;
  const loc = await prisma.location.update({ where: { id }, data: { name } });
  res.json(loc);
});

// 删除库位
locationsRouter.delete('/:id', validateId, authenticate, adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const existing = await prisma.location.findUnique({ where: { id }, include: { warehouse: { select: { customerId: true } } } });
  if (!existing) return res.status(404).json({ error: '库位不存在' });
  if (req.customerId && existing.warehouse.customerId !== req.customerId) {
    return res.status(403).json({ error: '无权操作此库位' });
  }
  const stockCount = await prisma.inventory.count({ where: { locationId: id, quantity: { gt: 0 } } });
  if (stockCount > 0) return res.status(400).json({ error: '该库位下还有库存，请先转移后再删除' });
  await prisma.location.delete({ where: { id } });
  res.json({ message: '已删除' });
});

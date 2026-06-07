import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate, adminWrite } from '../middleware/auth';

export const productWarehousesRouter = Router();
productWarehousesRouter.use(authenticate);

// 列表
productWarehousesRouter.get('/', async (req: AuthRequest, res: Response) => {
  let warehouseId = req.query.warehouseId ? parseInt(req.query.warehouseId as string) : undefined;
  const productId = req.query.productId ? parseInt(req.query.productId as string) : undefined;

  if (req.userRole !== 'super_admin' && req.userWarehouseId) {
    warehouseId = req.userWarehouseId;
  }

  const where: Record<string, unknown> = {};
  if (warehouseId) where.warehouseId = warehouseId;
  if (productId) where.productId = productId;

  const data = await prisma.productWarehouse.findMany({
    where,
    include: {
      product: { select: { id: true, sku: true, name: true, spec: true, unit: true, barcode: true } },
      warehouse: { select: { id: true, name: true } },
    },
    orderBy: { product: { name: 'asc' } },
  });
  res.json(data);
});

// Upsert
productWarehousesRouter.put('/', adminWrite, async (req: AuthRequest, res: Response) => {
  const { productId, warehouseId, safetyStock } = req.body;
  if (!productId || !warehouseId) {
    return res.status(400).json({ error: 'productId 和 warehouseId 必填' });
  }

  if (req.userRole !== 'super_admin' && req.userWarehouseId) {
    if (warehouseId !== req.userWarehouseId) {
      return res.status(403).json({ error: '无权操作此仓库' });
    }
  }

  const pw = await prisma.productWarehouse.upsert({
    where: { productId_warehouseId: { productId, warehouseId } },
    create: { productId, warehouseId, safetyStock: safetyStock || 0 },
    update: { safetyStock: safetyStock || 0 },
  });
  res.json(pw);
});

// 删除
productWarehousesRouter.delete('/', adminWrite, async (req: AuthRequest, res: Response) => {
  const { productId, warehouseId } = req.body;
  if (!productId || !warehouseId) {
    return res.status(400).json({ error: 'productId 和 warehouseId 必填' });
  }

  if (req.userRole !== 'super_admin' && req.userWarehouseId) {
    if (warehouseId !== req.userWarehouseId) {
      return res.status(403).json({ error: '无权操作此仓库' });
    }
  }

  await prisma.productWarehouse.deleteMany({
    where: { productId, warehouseId },
  });
  res.json({ success: true });
});

import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate, adminWrite } from '../middleware/auth';

export const productWarehousesRouter = Router();
productWarehousesRouter.use(authenticate);

// 列表
productWarehousesRouter.get('/', async (req: AuthRequest, res: Response) => {
  let warehouseId = req.query.warehouseId ? parseInt(req.query.warehouseId as string) : undefined;
  const productId = req.query.productId ? parseInt(req.query.productId as string) : undefined;

  let tenantWhIds: number[] | undefined;
  if (req.userRole === 'tenant_admin' && req.customerId) {
    const whs = await prisma.warehouse.findMany({ where: { customerId: req.customerId }, select: { id: true } });
    tenantWhIds = whs.map(w => w.id);
    if (warehouseId && !tenantWhIds.includes(warehouseId)) {
      return res.status(403).json({ error: '无权查看此仓库' });
    }
  } else if (req.userRole !== 'super_admin' && req.userWarehouseId) {
    warehouseId = req.userWarehouseId;
  }

  const where: Record<string, unknown> = {};
  if (warehouseId) where.warehouseId = warehouseId;
  else if (tenantWhIds) where.warehouseId = { in: tenantWhIds };
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

  // 权限校验
  const wh = await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { customerId: true } });
  if (!wh) return res.status(404).json({ error: '仓库不存在' });

  if (req.userRole === 'tenant_admin' && req.customerId) {
    if (wh.customerId !== req.customerId) {
      return res.status(403).json({ error: '无权操作此仓库' });
    }
  } else if (req.userRole !== 'super_admin' && req.userWarehouseId) {
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

  // 权限校验
  if (req.userRole === 'tenant_admin' && req.customerId) {
    const wh = await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { customerId: true } });
    if (!wh || wh.customerId !== req.customerId) {
      return res.status(403).json({ error: '无权操作此仓库' });
    }
  } else if (req.userRole !== 'super_admin' && req.userWarehouseId) {
    if (warehouseId !== req.userWarehouseId) {
      return res.status(403).json({ error: '无权操作此仓库' });
    }
  }

  await prisma.productWarehouse.deleteMany({
    where: { productId, warehouseId },
  });
  res.json({ success: true });
});

import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate } from '../middleware/auth';

export const alertsRouter = Router();
alertsRouter.use(authenticate);

// 库存预警：按商品+仓库维度，各仓库库存严格低于安全库存时预警
alertsRouter.get('/', async (req: AuthRequest, res: Response) => {
  let warehouseId = req.query.warehouseId ? parseInt(req.query.warehouseId as string) : undefined;
  let tenantWhIds: number[] | undefined;
  if (req.userRole === 'tenant_admin' && req.customerId) {
    const whs = await prisma.warehouse.findMany({ where: { customerId: req.customerId }, select: { id: true } });
    tenantWhIds = whs.map(w => w.id);
    if (warehouseId && !tenantWhIds.includes(warehouseId)) {
      return res.status(403).json({ error: '无权查看此仓库的预警' });
    }
  } else if (req.userRole !== 'super_admin' && req.userWarehouseId) {
    warehouseId = req.userWarehouseId;
  }

  // 查出设了安全库存的商品（按客户隔离）
  const productWhere: Record<string, unknown> = { safetyStock: { gt: 0 } };
  if (req.customerId) {
    productWhere.customerId = req.customerId;
  }
  const products = await prisma.product.findMany({
    where: productWhere,
    include: { category: true },
  });
  if (!products.length) return res.json([]);

  const productIds = products.map(p => p.id);
  const productMap = new Map(products.map(p => [p.id, p]));

  // 查这些商品在指定仓库（或全部仓库）的库存
  const invWhere: Record<string, unknown> = {
    productId: { in: productIds },
    quantity: { gt: 0 },
  };
  if (warehouseId) invWhere.warehouseId = warehouseId;

  const inventories = await prisma.inventory.findMany({
    where: invWhere,
    include: {
      warehouse: { select: { id: true, name: true } },
      location: { select: { id: true, name: true, code: true } },
    },
  });

  // 按 productId + warehouseId 汇总各库位库存
  const stockMap = new Map<string, { qty: number; locations: { name: string; code: string; qty: number }[] }>();
  const allWarehouseIds = new Set<number>();

  for (const inv of inventories) {
    const key = `${inv.productId}-${inv.warehouseId}`;
    const existing = stockMap.get(key);
    if (existing) {
      existing.qty += inv.quantity;
      existing.locations.push({ name: inv.location?.name || '无库位', code: inv.location?.code || '', qty: inv.quantity });
    } else {
      stockMap.set(key, {
        qty: inv.quantity,
        locations: [{ name: inv.location?.name || '无库位', code: inv.location?.code || '', qty: inv.quantity }],
      });
    }
    allWarehouseIds.add(inv.warehouseId);
  }

  // 加载所有仓库（确保零库存商品也能按仓库生成预警）
  const whCustomerMap = new Map<number, number | null>();
  if (warehouseId) {
    allWarehouseIds.add(warehouseId);
  } else {
    const allWh = await prisma.warehouse.findMany({ select: { id: true, name: true, customerId: true } });
    for (const wh of allWh) { allWarehouseIds.add(wh.id); whCustomerMap.set(wh.id, wh.customerId); }
  }

  // 仓库名称缓存
  const whCache = new Map<number, string>();
  for (const inv of inventories) {
    if (inv.warehouse && !whCache.has(inv.warehouseId)) {
      whCache.set(inv.warehouseId, inv.warehouse.name);
    }
  }
  if (warehouseId && !whCache.has(warehouseId)) {
    const wh = await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { id: true, name: true, customerId: true } });
    if (wh) { whCache.set(wh.id, wh.name); whCustomerMap.set(wh.id, wh.customerId); }
  }
  if (!warehouseId) {
    const allWh = await prisma.warehouse.findMany({ select: { id: true, name: true, customerId: true } });
    for (const wh of allWh) { whCache.set(wh.id, wh.name); whCustomerMap.set(wh.id, wh.customerId); }
  }

  // 按商品×仓库生成预警
  const result: {
    product: Record<string, unknown>;
    warehouseId: number;
    warehouseName: string;
    currentQty: number;
    safetyStock: number;
    shortage: number;
    locations: { name: string; code: string; qty: number }[];
  }[] = [];

  for (const product of products) {
    for (const whId of allWarehouseIds) {
      // 跳过产品与仓库客户不匹配的组合（产品无客户的匹配所有仓库）
      const whCustomer = whCustomerMap.get(whId);
      if (product.customerId != null && whCustomer != null && product.customerId !== whCustomer) continue;

      const key = `${product.id}-${whId}`;
      const stock = stockMap.get(key);
      const currentQty = stock?.qty || 0;
      if (currentQty < product.safetyStock) {
        result.push({
          product: {
            id: product.id,
            sku: product.sku,
            name: product.name,
            spec: product.spec,
            unit: product.unit,
            barcode: product.barcode,
            category: product.category,
          },
          warehouseId: whId,
          warehouseName: whCache.get(whId) || '',
          currentQty,
          safetyStock: product.safetyStock,
          shortage: product.safetyStock - currentQty,
          locations: stock?.locations || [],
        });
      }
    }
  }

  result.sort((a, b) => b.shortage - a.shortage);

  res.json(result);
});

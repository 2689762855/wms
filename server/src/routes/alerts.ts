import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate } from '../middleware/auth'
import { applyWarehouseScope } from '../utils/warehouseScope';

export const alertsRouter = Router();
alertsRouter.use(authenticate);

// 库存预警：低库存 + 临期，按商品+仓库维度
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

  // 查出所有已配置仓库安全库存的记录
  const pwWhere: Record<string, unknown> = {};
  if (req.customerId) {
    // tenant_admin：只看自己客户的仓库
    if (!tenantWhIds || tenantWhIds.length === 0) return res.json([]);
    pwWhere.warehouseId = { in: tenantWhIds };
  }
  if (warehouseId) pwWhere.warehouseId = warehouseId;
  else if (req.userRole !== 'super_admin' && req.userWarehouseId) pwWhere.warehouseId = req.userWarehouseId;

  const productWarehouses = await prisma.productWarehouse.findMany({
    where: pwWhere,
    include: {
      product: { include: { category: true } },
      warehouse: { select: { id: true, name: true } },
    },
  });
  if (!productWarehouses.length) return res.json([]);

  // 查所有配置对的库存
  const pwProductIds = [...new Set(productWarehouses.map(pw => pw.productId))];
  const pwWarehouseIds = [...new Set(productWarehouses.map(pw => pw.warehouseId))];

  const inventories = await prisma.inventory.findMany({
    where: {
      productId: { in: pwProductIds },
      warehouseId: { in: pwWarehouseIds },
      quantity: { gt: 0 },
    },
    include: {
      location: { select: { id: true, name: true, code: true } },
    },
  });

  // 按 productId + warehouseId 汇总库存
  const stockMap = new Map<string, { qty: number; locations: { name: string; code: string; qty: number }[] }>();
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
  }

  // 按配置生成预警：只检查已配置的商品×仓库对
  const result: {
    product: Record<string, unknown>;
    warehouseId: number;
    warehouseName: string;
    currentQty: number;
    safetyStock: number;
    shortage: number;
    locations: { name: string; code: string; qty: number }[];
    alertType?: string;
  }[] = [];

  for (const pw of productWarehouses) {
    const key = `${pw.productId}-${pw.warehouseId}`;
    const stock = stockMap.get(key);
    const currentQty = stock?.qty || 0;
    if (currentQty < pw.safetyStock) {
      result.push({
        product: {
          id: pw.product.id,
          sku: pw.product.sku,
          name: pw.product.name,
          spec: pw.product.spec,
          unit: pw.product.unit,
          barcode: pw.product.barcode,
          category: pw.product.category,
        },
        warehouseId: pw.warehouseId,
        warehouseName: pw.warehouse.name,
        currentQty,
        safetyStock: pw.safetyStock,
        shortage: pw.safetyStock - currentQty,
        locations: stock?.locations || [],
      });
    }
  }

  // 临期预警：查有保质期且到期日临近的商品
  const now = new Date();
  const expiryProducts = await prisma.product.findMany({
    where: {
      expiryDate: { not: null },
      ...(req.customerId ? { customerId: req.customerId } : {}),
    },
    include: { category: true },
  });

  for (const product of expiryProducts) {
    const daysLeft = Math.floor((product.expiryDate!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    if (daysLeft > product.expiryWarningDays) continue;

    // 查该商品在各仓库的库存
    const invWhere2: Record<string, unknown> = {
      productId: product.id,
      quantity: { gt: 0 },
    };
    if (warehouseId) invWhere2.warehouseId = warehouseId;
    else if (tenantWhIds) invWhere2.warehouseId = { in: tenantWhIds };
    else if (req.userRole !== 'super_admin' && req.userWarehouseId) invWhere2.warehouseId = req.userWarehouseId;

    const stocks = await prisma.inventory.findMany({
      where: invWhere2,
      include: { warehouse: { select: { id: true, name: true } }, location: { select: { name: true, code: true } } },
    });

    if (!stocks.length) continue;

    // 按仓库汇总（同时缓存仓库名）
    const whMap2 = new Map<number, { qty: number; whName: string; locations: { name: string; code: string; qty: number }[] }>();
    for (const s of stocks) {
      const e = whMap2.get(s.warehouseId);
      if (e) { e.qty += s.quantity; e.locations.push({ name: s.location?.name || '无库位', code: s.location?.code || '', qty: s.quantity }); }
      else whMap2.set(s.warehouseId, { qty: s.quantity, whName: s.warehouse?.name || '', locations: [{ name: s.location?.name || '无库位', code: s.location?.code || '', qty: s.quantity }] });
    }

    for (const [whId, stock] of whMap2) {
      result.push({
        product: {
          id: product.id,
          sku: product.sku,
          name: product.name,
          spec: product.spec,
          unit: product.unit,
          barcode: product.barcode,
          category: product.category,
          expiryDate: product.expiryDate,
          expiryWarningDays: product.expiryWarningDays,
        },
        warehouseId: whId,
        warehouseName: stock.whName,
        currentQty: stock.qty,
        safetyStock: 0,
        shortage: daysLeft,
        locations: stock.locations,
        alertType: 'expiry' as const,
      });
    }
  }

  result.sort((a, b) => {
    const aExp = a.alertType === 'expiry';
    const bExp = b.alertType === 'expiry';
    if (aExp && !bExp) return -1;
    if (!aExp && bExp) return 1;
    if (aExp) return a.shortage - b.shortage; // 临期：剩余天数少优先
    return b.shortage - a.shortage; // 库存：缺货多优先
  });

  res.json(result);
});

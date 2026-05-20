import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate } from '../middleware/auth';

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
  // 确保 allWarehouseIds 中所有仓库的客户数据都已加载
  const missingWhIds = [...allWarehouseIds].filter(id => !whCustomerMap.has(id));
  if (missingWhIds.length > 0) {
    const missingWhs = await prisma.warehouse.findMany({
      where: { id: { in: missingWhIds } },
      select: { id: true, name: true, customerId: true },
    });
    for (const wh of missingWhs) { whCache.set(wh.id, wh.name); whCustomerMap.set(wh.id, wh.customerId); }
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
      // 跳过产品与仓库客户不匹配的组合（customerId 严格相等才匹配）
      const whCustomer = whCustomerMap.get(whId);
      if (product.customerId !== whCustomer) continue;

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

    // 按仓库汇总
    const whMap2 = new Map<number, { qty: number; locations: { name: string; code: string; qty: number }[] }>();
    for (const s of stocks) {
      const e = whMap2.get(s.warehouseId);
      if (e) { e.qty += s.quantity; e.locations.push({ name: s.location?.name || '无库位', code: s.location?.code || '', qty: s.quantity }); }
      else whMap2.set(s.warehouseId, { qty: s.quantity, locations: [{ name: s.location?.name || '无库位', code: s.location?.code || '', qty: s.quantity }] });
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
        warehouseName: whCache.get(whId) || '',
        currentQty: stock.qty,
        safetyStock: 0,
        shortage: daysLeft,
        locations: stock.locations,
        alertType: 'expiry',
      });
    }
  }

  result.sort((a, b) => {
    const aExp = (a as any).alertType === 'expiry';
    const bExp = (b as any).alertType === 'expiry';
    if (aExp && !bExp) return -1;
    if (!aExp && bExp) return 1;
    if (aExp) return (a as any).shortage - (b as any).shortage; // 临期：剩余天数少优先
    return b.shortage - a.shortage; // 库存：缺货多优先
  });

  res.json(result);
});

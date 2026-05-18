import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate } from '../middleware/auth';

export const reportsRouter = Router();
reportsRouter.use(authenticate);

// 库存汇总: 每个仓库的库存金额和数量
reportsRouter.get('/stock-summary', async (req: AuthRequest, res: Response) => {
  let warehouseIds: number[] | undefined;
  if (req.userRole === 'tenant_admin' && req.customerId) {
    const whs = await prisma.warehouse.findMany({ where: { customerId: req.customerId }, select: { id: true } });
    warehouseIds = whs.map(w => w.id);
  }
  const where: Record<string, unknown> = {};
  if (req.userRole === 'super_admin') {
    // no filter
  } else if (warehouseIds) {
    where.id = { in: warehouseIds };
  } else if (req.userWarehouseId) {
    where.id = req.userWarehouseId;
  }
  const warehouses = await prisma.warehouse.findMany({
    where,
    include: {
      inventories: {
        include: { product: true },
      },
    },
  });

  const globalProductIds = new Set<number>();
  const summary = warehouses.map(w => {
    const uniqueProductIds = new Set(w.inventories.map(inv => inv.productId));
    uniqueProductIds.forEach(id => globalProductIds.add(id));
    return {
      warehouse: w.name,
      totalItems: uniqueProductIds.size,
      totalQuantity: w.inventories.reduce((sum, inv) => sum + inv.quantity, 0),
      totalValue: w.inventories.reduce((sum, inv) => sum + inv.quantity * (inv.product.costPrice || 0), 0),
    };
  });

  res.json({ summary, totalItems: globalProductIds.size });
});

// 出入库汇总: 按时间段统计
reportsRouter.get('/in-out-summary', async (req: AuthRequest, res: Response) => {
  const days = parseInt((req.query.days as string) || '30');

  const since = new Date();
  since.setDate(since.getDate() - days);

  let whFilter: { warehouseId?: number | { in: number[] } } = {};
  if (req.userRole === 'tenant_admin' && req.customerId) {
    const whs = await prisma.warehouse.findMany({ where: { customerId: req.customerId }, select: { id: true } });
    whFilter.warehouseId = { in: whs.map(w => w.id) };
  } else if (req.userRole !== 'super_admin' && req.userWarehouseId) {
    whFilter.warehouseId = req.userWarehouseId;
  }

  const [inbounds, outbounds] = await Promise.all([
    prisma.inboundOrder.findMany({
      where: { status: 'confirmed', createdAt: { gte: since }, ...whFilter },
      include: { items: { include: { product: true } } },
    }),
    prisma.outboundOrder.findMany({
      where: { status: 'confirmed', createdAt: { gte: since }, ...whFilter },
      include: { items: { include: { product: true } } },
    }),
  ]);

  // 按天聚合
  const dailyMap: Record<string, { inboundQty: number; outboundQty: number; inboundValue: number; outboundValue: number }> = {};

  for (const order of inbounds) {
    const day = order.createdAt.toISOString().slice(0, 10);
    if (!dailyMap[day]) dailyMap[day] = { inboundQty: 0, outboundQty: 0, inboundValue: 0, outboundValue: 0 };
    for (const item of order.items) {
      dailyMap[day].inboundQty += item.quantity;
      dailyMap[day].inboundValue += item.quantity * (item.unitPrice || 0);
    }
  }

  for (const order of outbounds) {
    const day = order.createdAt.toISOString().slice(0, 10);
    if (!dailyMap[day]) dailyMap[day] = { inboundQty: 0, outboundQty: 0, inboundValue: 0, outboundValue: 0 };
    for (const item of order.items) {
      dailyMap[day].outboundQty += item.quantity;
    }
  }

  const daily = Object.entries(dailyMap)
    .map(([date, d]) => ({ date, ...d }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalInboundQty = inbounds.reduce((s, o) => s + o.items.reduce((ss, i) => ss + i.quantity, 0), 0);
  const totalOutboundQty = outbounds.reduce((s, o) => s + o.items.reduce((ss, i) => ss + i.quantity, 0), 0);

  res.json({ daily, totalInboundQty, totalOutboundQty, totalInbounds: inbounds.length, totalOutbounds: outbounds.length });
});

// 各仓库出入库对比
reportsRouter.get('/warehouse-comparison', async (req: AuthRequest, res: Response) => {
  const days = parseInt((req.query.days as string) || '30');
  const since = new Date();
  since.setDate(since.getDate() - days);

  let whFilter2: { warehouseId?: number | { in: number[] } } = {};
  if (req.userRole === 'tenant_admin' && req.customerId) {
    const whs2 = await prisma.warehouse.findMany({ where: { customerId: req.customerId }, select: { id: true } });
    whFilter2.warehouseId = { in: whs2.map(w => w.id) };
  } else if (req.userRole !== 'super_admin' && req.userWarehouseId) {
    whFilter2.warehouseId = req.userWarehouseId;
  }

  const [inbounds2, outbounds2] = await Promise.all([
    prisma.inboundOrder.findMany({
      where: { status: 'confirmed', createdAt: { gte: since }, ...whFilter2 },
      include: { items: true, warehouse: true },
    }),
    prisma.outboundOrder.findMany({
      where: { status: 'confirmed', createdAt: { gte: since }, ...whFilter2 },
      include: { items: true, warehouse: true },
    }),
  ]);

  const map: Record<string, { warehouse: string; inbound: number; outbound: number }> = {};
  for (const o of inbounds2) {
    const name = o.warehouse.name;
    if (!map[name]) map[name] = { warehouse: name, inbound: 0, outbound: 0 };
    map[name].inbound += o.items.reduce((s, i) => s + i.quantity, 0);
  }
  for (const o of outbounds2) {
    const name = o.warehouse.name;
    if (!map[name]) map[name] = { warehouse: name, inbound: 0, outbound: 0 };
    map[name].outbound += o.items.reduce((s, i) => s + i.quantity, 0);
  }

  res.json(Object.values(map));
});

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
        take: 20000,
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

// 分客户货柜/出货统计（月/年，含金额）
reportsRouter.get('/customer-stats', async (req: AuthRequest, res: Response) => {
  const year = parseInt((req.query.year as string) || String(new Date().getFullYear()));
  const start = new Date(`${year}-01-01T00:00:00.000Z`);
  const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  // Prisma 6 DateTime is stored as Unix ms integers, use raw SQL with numeric comparison
  const params: any[] = [start.getTime(), end.getTime()];
  let custFilter = '';
  if (req.customerId) {
    custFilter = 'AND c.customerId = ?';
    params.push(Number(req.customerId));
  }
  const containers = await prisma.$queryRawUnsafe<any[]>(
    `SELECT c.id, c.businessCustomerId, c.sealTime, ci.outboundId, ci.productId, ci.actualQty
     FROM Container c
     LEFT JOIN ContainerItem ci ON ci.containerId = c.id
     WHERE c.status = 'sealed' AND c.businessCustomerId IS NOT NULL AND c.businessCustomerId != 0 AND c.sealTime >= ? AND c.sealTime < ? ${custFilter}
     ORDER BY c.sealTime ASC`,
    ...params
  );
  // 按 container 归组
  const containerMap = new Map<number, { businessCustomerId: number; month: number; items: { outboundId: number; productId: number; actualQty: number }[] }>();
  for (const row of containers) {
    if (!containerMap.has(row.id)) {
      containerMap.set(row.id, {
        businessCustomerId: row.businessCustomerId,
        month: new Date(Number(row.sealTime)).getMonth(),
        items: [],
      });
    }
    if (row.outboundId) {
      containerMap.get(row.id)!.items.push({ outboundId: row.outboundId, productId: row.productId, actualQty: row.actualQty || 0 });
    }
  }
  // 合同单价：通过 outboundItem 关联
  const allOutboundIds = [...new Set([...containerMap.values()].flatMap(c => c.items.map(i => i.outboundId)))];
  const obItems = allOutboundIds.length > 0
    ? await prisma.outboundItem.findMany({
        where: { outboundId: { in: allOutboundIds }, contractId: { not: null } },
        select: { outboundId: true, productId: true, contractId: true },
      })
    : [];
  const contractIds = [...new Set(obItems.map(o => o.contractId!))];
  const contractPrices = contractIds.length > 0
    ? await prisma.contractItem.findMany({
        where: { contractId: { in: contractIds } },
        select: { contractId: true, productId: true, unitPrice: true },
      })
    : [];
  const priceMap = new Map<string, number>();
  for (const cp of contractPrices) {
    if (cp.unitPrice != null) priceMap.set(`${cp.contractId}_${cp.productId}`, cp.unitPrice);
  }
  const obContractMap = new Map<string, number>();
  for (const oi of obItems) {
    obContractMap.set(`${oi.outboundId}_${oi.productId}`, oi.contractId!);
  }

  // 按 businessCustomerId 分组
  const customerMap = new Map<number, {
    customerName: string;
    monthlyContainers: number[];
    monthlyQty: number[];
    monthlyAmount: number[];
  }>();

  for (const [cid, data] of containerMap) {
    const bizId = data.businessCustomerId;
    if (!customerMap.has(bizId)) {
      customerMap.set(bizId, {
        customerName: '',
        monthlyContainers: Array(12).fill(0),
        monthlyQty: Array(12).fill(0),
        monthlyAmount: Array(12).fill(0),
      });
    }
    const entry = customerMap.get(bizId)!;
    entry.monthlyContainers[data.month]++;
    for (const item of data.items) {
      const qty = item.actualQty || 0;
      entry.monthlyQty[data.month] += qty;
      const cid3 = obContractMap.get(`${item.outboundId}_${item.productId}`);
      const price = cid3 ? priceMap.get(`${cid3}_${item.productId}`) : undefined;
      if (price) entry.monthlyAmount[data.month] += price * qty;
    }
  }

  // 客户名称
  const bizIds = [...customerMap.keys()];
  if (bizIds.length > 0) {
    const bizList = await prisma.businessCustomer.findMany({
      where: { id: { in: bizIds } },
      select: { id: true, realName: true },
    });
    bizList.forEach(b => {
      const e = customerMap.get(b.id);
      if (e) e.customerName = b.realName;
    });
  }

  // 合同数统计（Prisma 6 DateTime 整数存储，用 raw SQL + 毫秒值）
  const contracts: { businessCustomerId: number; createdAt: Date }[] = await prisma.$queryRawUnsafe(
    `SELECT businessCustomerId, createdAt FROM Contract WHERE businessCustomerId IS NOT NULL AND businessCustomerId != 0 AND createdAt >= ? AND createdAt < ?`,
    start.getTime(), end.getTime()
  );
  const contractMap = new Map<number, number[]>();
  for (const ct of contracts) {
    const cid = ct.businessCustomerId || 0;
    if (!contractMap.has(cid)) contractMap.set(cid, Array(12).fill(0));
    contractMap.get(cid)![new Date(Number(ct.createdAt)).getMonth()]++;
  }

  const customers = Array.from(customerMap.entries()).map(([cid, data]) => ({
    businessCustomerId: cid,
    customerName: data.customerName,
    monthlyContainers: data.monthlyContainers,
    monthlyContracts: contractMap.get(cid) || Array(12).fill(0),
    monthlyQty: data.monthlyQty,
    monthlyAmount: data.monthlyAmount.map(v => Math.round(v * 100) / 100),
    yearlyContainers: data.monthlyContainers.reduce((a, b) => a + b, 0),
    yearlyContracts: (contractMap.get(cid) || Array(12).fill(0)).reduce((a, b) => a + b, 0),
    yearlyQty: data.monthlyQty.reduce((a, b) => a + b, 0),
    yearlyAmount: Math.round(data.monthlyAmount.reduce((a, b) => a + b, 0) * 100) / 100,
  }));

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const totals = {
    monthlyContainers: Array.from({ length: 12 }, (_, i) => sum(customers.map(c => c.monthlyContainers[i]))),
    monthlyContracts: Array.from({ length: 12 }, (_, i) => sum(customers.map(c => c.monthlyContracts[i]))),
    monthlyQty: Array.from({ length: 12 }, (_, i) => sum(customers.map(c => c.monthlyQty[i]))),
    monthlyAmount: Array.from({ length: 12 }, (_, i) => Math.round(sum(customers.map(c => c.monthlyAmount[i])) * 100) / 100),
    yearlyContainers: sum(customers.map(c => c.yearlyContainers)),
    yearlyContracts: sum(customers.map(c => c.yearlyContracts)),
    yearlyQty: sum(customers.map(c => c.yearlyQty)),
    yearlyAmount: Math.round(sum(customers.map(c => c.yearlyAmount)) * 100) / 100,
  };

  res.json({ year, customers, totals });
});

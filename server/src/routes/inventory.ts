import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate } from '../middleware/auth';

export const inventoryRouter = Router();
inventoryRouter.use(authenticate);

// 库存查询
inventoryRouter.get('/', async (req: AuthRequest, res: Response) => {
  let warehouseId = req.query.warehouseId ? parseInt(req.query.warehouseId as string) : undefined;
  const locationId = req.query.locationId ? parseInt(req.query.locationId as string) : undefined;
  const productId = req.query.productId ? parseInt(req.query.productId as string) : undefined;
  const keyword = (req.query.keyword as string) || '';

  // 非超管只能看自己仓库/客户的数据
  let tenantWhIds: number[] | undefined;
  if (req.userRole === 'tenant_admin' && req.customerId) {
    const whs = await prisma.warehouse.findMany({ where: { customerId: req.customerId }, select: { id: true } });
    tenantWhIds = whs.map(w => w.id);
  }
  if (req.userRole === 'tenant_admin') {
    if (warehouseId) {
      // 指定了仓库，校验归属
      if (!tenantWhIds || !tenantWhIds.includes(warehouseId)) {
        return res.status(403).json({ error: '无权查看此仓库' });
      }
    }
  } else if (req.userRole !== 'super_admin' && req.userWarehouseId) {
    warehouseId = req.userWarehouseId;
  }

  const where: Record<string, unknown> = { quantity: { gt: 0 } };
  if (warehouseId) {
    where.warehouseId = warehouseId;
  } else if (tenantWhIds) {
    where.warehouseId = { in: tenantWhIds };
  }
  if (locationId) where.locationId = locationId;
  if (productId) where.productId = productId;
  if (keyword) {
    where.product = { name: { contains: keyword } };
  }

  const data = await prisma.inventory.findMany({
    where,
    include: { product: { include: { category: true } }, warehouse: true, location: true },
    orderBy: { product: { name: 'asc' } },
  });

  // 附加仓库级安全库存
  const pwMap = new Map<string, number>();
  const distinctPairs = [...new Set(data.map(d => `${d.productId}-${d.warehouseId}`))];
  if (distinctPairs.length > 0) {
    const pwRecords = await prisma.productWarehouse.findMany({
      where: {
        OR: distinctPairs.map(key => {
          const [pid, wid] = key.split('-').map(Number);
          return { productId: pid, warehouseId: wid };
        }),
      },
      select: { productId: true, warehouseId: true, safetyStock: true },
    });
    for (const pw of pwRecords) {
      pwMap.set(`${pw.productId}-${pw.warehouseId}`, pw.safetyStock);
    }
  }

  const enriched = data.map(d => ({
    ...d,
    product: d.product ? { ...d.product, warehouseSafetyStock: pwMap.get(`${d.productId}-${d.warehouseId}`) } : d.product,
  }));
  res.json(enriched);
});

// 库存流水
inventoryRouter.get('/logs', async (req: AuthRequest, res: Response) => {
  const page = parseInt((req.query.page as string) || '1');
  const pageSize = parseInt((req.query.pageSize as string) || '50');
  const productId = req.query.productId ? parseInt(req.query.productId as string) : undefined;

  const where: Record<string, unknown> = {};
  if (productId) where.productId = productId;
  if (req.userRole === 'tenant_admin' && req.customerId) {
    const whs = await prisma.warehouse.findMany({ where: { customerId: req.customerId }, select: { id: true } });
    where.warehouseId = { in: whs.map(w => w.id) };
  } else if (req.userRole !== 'super_admin' && req.userWarehouseId) {
    where.warehouseId = req.userWarehouseId;
  }

  const [data, total] = await Promise.all([
    prisma.stockLog.findMany({
      where,
      include: { product: true },
      skip: (page - 1) * pageSize,
      take: Math.min(pageSize, 100),
      orderBy: { createdAt: 'desc' },
    }),
    prisma.stockLog.count({ where }),
  ]);
  res.json({ data, total, page, pageSize });
});

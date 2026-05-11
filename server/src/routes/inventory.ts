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

  // 非超管强制只能看自己仓库的数据
  if (req.userRole !== 'super_admin' && req.userWarehouseId) {
    warehouseId = req.userWarehouseId;
  }

  const where: Record<string, unknown> = { quantity: { gt: 0 } };
  if (warehouseId) where.warehouseId = warehouseId;
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
  res.json(data);
});

// 库存流水
inventoryRouter.get('/logs', async (req: AuthRequest, res: Response) => {
  const page = parseInt((req.query.page as string) || '1');
  const pageSize = parseInt((req.query.pageSize as string) || '50');
  const productId = req.query.productId ? parseInt(req.query.productId as string) : undefined;

  const where: Record<string, unknown> = {};
  if (productId) where.productId = productId;
  if (req.userRole !== 'super_admin' && req.userWarehouseId) {
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

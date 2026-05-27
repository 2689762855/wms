import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate, adminWrite, validateId } from '../middleware/auth';

export const containersRouter = Router();
containersRouter.use(authenticate);

// 货柜列表
containersRouter.get('/', async (req: AuthRequest, res: Response) => {
  const page = parseInt((req.query.page as string) || '1');
  const pageSize = parseInt((req.query.pageSize as string) || '20');
  const keyword = (req.query.keyword as string) || '';
  const status = req.query.status as string;
  const customerId = req.query.customerId ? parseInt(req.query.customerId as string) : undefined;

  const where: Record<string, unknown> = {};
  if (keyword) where.containerNo = { contains: keyword };
  if (status) where.status = status;
  if (customerId) where.customerId = customerId;
  if (req.customerId) where.customerId = req.customerId;

  const [data, total] = await Promise.all([
    prisma.container.findMany({
      where,
      include: {
        customer: { select: { id: true, username: true, realName: true } },
        items: {
          include: {
            product: { select: { id: true, sku: true, name: true, spec: true, unit: true } },
          },
        },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.container.count({ where }),
  ]);
  res.json({ data, total, page, pageSize });
});

// 货柜详情
containersRouter.get('/:id', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const container = await prisma.container.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, username: true, realName: true } },
      items: {
        include: {
          product: { select: { id: true, sku: true, name: true, spec: true, unit: true } },
          location: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!container) return res.status(404).json({ error: '货柜不存在' });
  res.json(container);
});

// 创建货柜
containersRouter.post('/', adminWrite, async (req: AuthRequest, res: Response) => {
  const { containerNo, toYardTime, customerId, note } = req.body;
  if (!containerNo) return res.status(400).json({ error: '柜号必填' });
  if (!customerId && !req.customerId) return res.status(400).json({ error: '请选择客户' });

  const existing = await prisma.container.findUnique({ where: { containerNo } });
  if (existing) return res.status(400).json({ error: '柜号已存在' });

  const container = await prisma.container.create({
    data: {
      containerNo,
      toYardTime: toYardTime ? new Date(toYardTime) : null,
      customerId: customerId || (req.customerId as number),
      note,
    },
    include: {
      customer: { select: { id: true, username: true, realName: true } },
      items: {
        include: {
          product: { select: { id: true, sku: true, name: true, spec: true, unit: true } },
        },
      },
    },
  });
  res.status(201).json(container);
});

// 装柜：录入实装数
containersRouter.put('/:id/load', validateId, adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const { items } = req.body;

  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: '请提供装柜明细' });
  }

  const container = await prisma.container.findUnique({ where: { id } });
  if (!container) return res.status(404).json({ error: '货柜不存在' });
  if (container.status !== 'pending' && container.status !== 'loading') return res.status(400).json({ error: '货柜状态不允许装柜' });

  // 删除旧明细，重新写入
  await prisma.containerItem.deleteMany({ where: { containerId: id } });
  for (const item of items) {
    const returnedQty = Math.max(0, (item.plannedQty || 0) - (item.actualQty || 0));
    await prisma.containerItem.create({
      data: {
        containerId: id,
        outboundId: item.outboundId,
        productId: item.productId,
        plannedQty: item.plannedQty || 0,
        actualQty: item.actualQty || 0,
        returnedQty,
        locationId: item.locationId || null,
      },
    });
  }

  await prisma.container.update({ where: { id }, data: { status: 'loading' } });

  const updated = await prisma.container.findUnique({
    where: { id },
    include: {
      items: { include: { product: { select: { id: true, sku: true, name: true, spec: true, unit: true } } } },
    },
  });
  res.json(updated);
});

// 封柜：记录实装流水 + 甩柜归还库存
// 注意：出库确认时已扣库存，此处不再重复扣减
containersRouter.put('/:id/seal', validateId, adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);

  const container = await prisma.container.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!container) return res.status(404).json({ error: '货柜不存在' });
  if (container.status !== 'loading') return res.status(400).json({ error: '请先完成装柜' });

  const updated = await prisma.$transaction(async (tx) => {
    for (const item of container.items) {
      const outbound = await tx.outboundOrder.findUnique({
        where: { id: item.outboundId },
        select: { warehouseId: true },
      });
      const warehouseId = outbound?.warehouseId;
      if (!warehouseId) continue;

      if (item.returnedQty > 0) {
        const inv = await tx.inventory.findFirst({
          where: { productId: item.productId, warehouseId },
          orderBy: { quantity: 'desc' },
        });
        const totalBefore = (await tx.inventory.aggregate({
          where: { productId: item.productId, warehouseId },
          _sum: { quantity: true },
        }))._sum.quantity || 0;

        if (inv) {
          await tx.inventory.update({
            where: { id: inv.id },
            data: { quantity: { increment: item.returnedQty } },
          });
        } else {
          const obItem = await tx.outboundItem.findFirst({
            where: { outboundId: item.outboundId, productId: item.productId },
            select: { locationId: true },
          });
          const locationId = item.locationId || obItem?.locationId;
          if (locationId) {
            await tx.inventory.create({
              data: { productId: item.productId, warehouseId, locationId, quantity: item.returnedQty },
            });
          }
        }

        await tx.stockLog.create({
          data: {
            productId: item.productId,
            warehouseId,
            changeQty: item.returnedQty,
            beforeQty: totalBefore,
            afterQty: totalBefore + item.returnedQty,
            type: 'container_return',
            refId: id,
          },
        });
      }
    }

    return await tx.container.update({
      where: { id },
      data: { status: 'sealed', sealTime: new Date() },
      include: {
        items: { include: { product: { select: { id: true, sku: true, name: true, spec: true, unit: true } } } },
      },
    });
  });

  res.json(updated);
});

// 删除货柜（仅 pending 状态可删）
containersRouter.delete('/:id', validateId, adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const container = await prisma.container.findUnique({ where: { id } });
  if (!container) return res.status(404).json({ error: '货柜不存在' });
  if (container.status !== 'pending') return res.status(400).json({ error: '仅待装柜状态可删除' });
  await prisma.container.delete({ where: { id } });
  res.json({ message: '已删除' });
});

// 装柜报表
containersRouter.get('/:id/report', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const container = await prisma.container.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          product: { select: { id: true, sku: true, name: true, spec: true, unit: true } },
        },
      },
    },
  });
  if (!container) return res.status(404).json({ error: '货柜不存在' });

  const summary = container.items.map((item) => ({
    sku: item.product.sku,
    name: item.product.name,
    spec: item.product.spec,
    unit: item.product.unit,
    plannedQty: item.plannedQty,
    actualQty: item.actualQty || 0,
    returnedQty: item.returnedQty,
  }));

  const totals = summary.reduce(
    (acc, item) => {
      acc.totalPlanned += item.plannedQty;
      acc.totalActual += item.actualQty;
      acc.totalReturned += item.returnedQty;
      return acc;
    },
    { totalPlanned: 0, totalActual: 0, totalReturned: 0 },
  );

  res.json({
    containerNo: container.containerNo,
    toYardTime: container.toYardTime,
    sealTime: container.sealTime,
    status: container.status,
    summary,
    totals,
  });
});

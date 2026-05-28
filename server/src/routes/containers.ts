import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { getPresetTemplate } from '../utils/reportPresets';
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
            product: { select: { id: true, sku: true, name: true, spec: true, unit: true } }, returnLocation: { select: { id: true, name: true } },
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
          product: { select: { id: true, sku: true, name: true, spec: true, unit: true } }, returnLocation: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!container) return res.status(404).json({ error: '货柜不存在' });
  if (req.customerId && container.customerId !== req.customerId) return res.status(403).json({ error: '无权访问' });
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
          product: { select: { id: true, sku: true, name: true, spec: true, unit: true } }, returnLocation: { select: { id: true, name: true } },
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
  if (req.customerId && container.customerId !== req.customerId) return res.status(403).json({ error: '无权访问' });
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
      items: { include: { product: { select: { id: true, sku: true, name: true, spec: true, unit: true } }, returnLocation: { select: { id: true, name: true } } } },
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
  if (req.customerId && container.customerId !== req.customerId) return res.status(403).json({ error: '无权访问' });
  if (container.status !== 'loading') return res.status(400).json({ error: '请先完成装柜' });

  const returnLocations = req.body.returnLocations as Record<string, number> | undefined;

  const updated = await prisma.$transaction(async (tx) => {
    // 按商品合并甩柜数量，统一归还
    const returnMap = new Map<number, { warehouseId: number; qty: number; locationId?: number }>();
    for (const item of container.items) {
      if (item.returnedQty > 0) {
        const outbound = await tx.outboundOrder.findUnique({
          where: { id: item.outboundId },
          select: { warehouseId: true },
        });
        const warehouseId = outbound?.warehouseId;
        if (!warehouseId) continue;

        const existing = returnMap.get(item.productId);
        if (existing) {
          existing.qty += item.returnedQty;
        } else {
          const userLocation = returnLocations?.[String(item.productId)];
          returnMap.set(item.productId, {
            warehouseId,
            qty: item.returnedQty,
            locationId: userLocation ? Number(userLocation) : undefined,
          });
        }
      }
    }

    for (const [productId, data] of returnMap) {
      const { warehouseId, qty, locationId: userLocId } = data;

      // 优先用用户指定的库位
      let locationId = userLocId;
      if (!locationId) {
        const inv = await tx.inventory.findFirst({
          where: { productId, warehouseId },
          orderBy: { quantity: 'desc' },
        });
        if (inv) locationId = inv.locationId;
        if (!locationId) {
          const obItem = await tx.outboundItem.findFirst({
            where: { outboundId: { in: container.items.map(i => i.outboundId) }, productId },
            select: { locationId: true },
          });
          locationId = obItem?.locationId ?? undefined;
        }
      }

      const totalBefore = (await tx.inventory.aggregate({
        where: { productId, warehouseId },
        _sum: { quantity: true },
      }))._sum.quantity || 0;

      if (locationId) {
        const inv = await tx.inventory.findFirst({
          where: { productId, warehouseId, locationId },
        });
        if (inv) {
          await tx.inventory.update({
            where: { id: inv.id },
            data: { quantity: { increment: qty } },
          });
        } else {
          await tx.inventory.create({
            data: { productId, warehouseId, locationId, quantity: qty },
          });
        }
      }

      await tx.stockLog.create({
        data: {
          productId,
          warehouseId,
          changeQty: qty,
          beforeQty: totalBefore,
          afterQty: totalBefore + qty,
          type: 'container_return',
          refId: id,
        },
      });

      // 更新该商品所有货柜条目的归还库位
      if (locationId) {
        await tx.containerItem.updateMany({
          where: { containerId: id, productId },
          data: { returnLocationId: locationId },
        });
      }
    }

    return await tx.container.update({
      where: { id },
      data: { status: 'sealed', sealTime: new Date() },
      include: {
        items: { include: { product: { select: { id: true, sku: true, name: true, spec: true, unit: true } }, returnLocation: { select: { id: true, name: true } } } },
      },
    });
  });

  res.json(updated);
});

// 调整装柜数量（支持封柜后修正，海外仓反馈偏差时使用）
containersRouter.put('/:id/adjust', validateId, adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const { items } = req.body; // [{ productId, actualQty }]

  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: '请提供调整明细' });
  }

  const container = await prisma.container.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!container) return res.status(404).json({ error: '货柜不存在' });
  if (req.customerId && container.customerId !== req.customerId) return res.status(403).json({ error: '无权访问' });
  if (container.status === 'pending') return res.status(400).json({ error: '请先保存装柜数据' });

  const isSealed = container.status === 'sealed';

  await prisma.$transaction(async (tx) => {
    for (const adj of items) {
      const pid = adj.productId;
      const newActual = adj.actualQty || 0;
      const existingItems = container.items.filter(i => i.productId === pid);
      if (existingItems.length === 0) continue;

      const totalPlanned = existingItems.reduce((s, i) => s + i.plannedQty, 0);
      const oldReturnedTotal = existingItems.reduce((s, i) => s + i.returnedQty, 0);
      const newReturnedTotal = Math.max(0, totalPlanned - newActual);

      // 按计划数比例分配新的实装数和甩柜数到各条目
      for (const item of existingItems) {
        const ratio = totalPlanned > 0 ? item.plannedQty / totalPlanned : 0;
        const itemActual = Math.round(newActual * ratio);
        const itemReturned = Math.max(0, item.plannedQty - itemActual);
        await tx.containerItem.update({
          where: { id: item.id },
          data: { actualQty: itemActual, returnedQty: itemReturned },
        });
      }

      // 封柜后调整库存：oldReturnedTotal 已归还，newReturnedTotal 是修正后的甩柜数
      if (isSealed && newReturnedTotal !== oldReturnedTotal) {
        const diff = newReturnedTotal - oldReturnedTotal; // 正数=多甩需补还, 负数=少甩需扣回
        if (diff === 0) continue;

        // 取原出库单的仓库和归还库位
        const firstItem = existingItems[0];
        const ob = await tx.outboundOrder.findUnique({
          where: { id: firstItem.outboundId },
          select: { warehouseId: true },
        });
        const warehouseId = ob?.warehouseId;
        if (!warehouseId) continue;

        // 优先用已记录的归还库位
        let locationId = firstItem.returnLocationId;
        if (!locationId) {
          const inv = await tx.inventory.findFirst({
            where: { productId: pid, warehouseId },
            orderBy: { quantity: 'desc' },
          });
          locationId = inv?.locationId ?? undefined;
        }

        const totalBefore = (await tx.inventory.aggregate({
          where: { productId: pid, warehouseId },
          _sum: { quantity: true },
        }))._sum.quantity || 0;

        if (locationId) {
          const inv = await tx.inventory.findFirst({
            where: { productId: pid, warehouseId, locationId },
          });
          if (inv) {
            await tx.inventory.update({
              where: { id: inv.id },
              data: { quantity: { increment: diff } },
            });
          } else if (diff > 0) {
            await tx.inventory.create({
              data: { productId: pid, warehouseId, locationId, quantity: diff },
            });
          }
        }

        await tx.stockLog.create({
          data: {
            productId: pid,
            warehouseId,
            changeQty: diff,
            beforeQty: totalBefore,
            afterQty: totalBefore + diff,
            type: 'container_adjust',
            refId: id,
          },
        });
      }
    }
  });

  const updated = await prisma.container.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, username: true, realName: true } },
      items: {
        include: {
          product: { select: { id: true, sku: true, name: true, spec: true, unit: true } },
          returnLocation: { select: { id: true, name: true } },
        },
      },
    },
  });
  res.json(updated);
});

// 删除货柜（仅 pending 状态可删）
containersRouter.delete('/:id', validateId, adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const container = await prisma.container.findUnique({ where: { id } });
  if (!container) return res.status(404).json({ error: '货柜不存在' });
  if (req.customerId && container.customerId !== req.customerId) return res.status(403).json({ error: '无权访问' });
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
      customer: { select: { realName: true, username: true, reportTemplate: true, templatePreset: true, excelPreset: true, exportTemplate: true } },
      items: {
        include: {
          product: { select: { id: true, sku: true, name: true, spec: true, unit: true } }, returnLocation: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!container) return res.status(404).json({ error: '货柜不存在' });
  if (req.customerId && container.customerId !== req.customerId) return res.status(403).json({ error: '无权访问' });

  // 按商品合并
  const merged = new Map<number, { sku: string; name: string; spec: string; unit: string; plannedQty: number; actualQty: number; returnedQty: number }>();
  for (const item of container.items) {
    const pid = item.productId;
    const existing = merged.get(pid);
    if (existing) {
      existing.plannedQty += item.plannedQty;
      existing.actualQty += (item.actualQty || 0);
      existing.returnedQty += Math.max(0, item.returnedQty);
    } else {
      merged.set(pid, {
        sku: item.product.sku,
        name: item.product.name,
        spec: item.product.spec,
        unit: item.product.unit,
        plannedQty: item.plannedQty,
        actualQty: item.actualQty || 0,
        returnedQty: Math.max(0, item.returnedQty),
      });
    }
  }
  const summary = Array.from(merged.values());

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
    customerId: container.customerId,
    customerName: container.customer?.realName || container.customer?.username || '',
    templatePreset: container.customer?.templatePreset || null,
    excelPreset: container.customer?.excelPreset || null,
    exportTemplate: container.customer?.exportTemplate || null,
    reportTemplate: container.customer?.templatePreset
      ? (getPresetTemplate(container.customer.templatePreset) || container.customer?.reportTemplate || null)
      : (container.customer?.reportTemplate || null),
    summary,
    totals,
  });
});

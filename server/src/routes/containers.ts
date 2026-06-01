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
  const businessCustomerId = req.query.businessCustomerId ? parseInt(req.query.businessCustomerId as string) : undefined;

  const where: Record<string, unknown> = {};
  if (keyword) where.containerNo = { contains: keyword };
  if (status) where.status = status;
  if (businessCustomerId) where.businessCustomerId = businessCustomerId;
  if (customerId) where.customerId = customerId;
  if (req.customerId) where.customerId = req.customerId;

  const [data, total] = await Promise.all([
    prisma.container.findMany({
      where,
      include: {
        customer: { select: { id: true, username: true, realName: true } },
        contracts: { include: { contract: { select: { id: true, contractNo: true, status: true } } } },
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
  // 附加 businessCustomer 数据
  const bizIds = [...new Set(data.map(c => c.businessCustomerId).filter(Boolean))] as number[];
  const bizMap = new Map<number, { id: number; realName: string }>();
  if (bizIds.length > 0) {
    const bizList = await prisma.businessCustomer.findMany({ where: { id: { in: bizIds } }, select: { id: true, realName: true } });
    bizList.forEach(b => bizMap.set(b.id, b));
  }
  const result = data.map(c => ({ ...c, businessCustomer: bizMap.get(c.businessCustomerId) || null }));
  res.json({ data: result, total, page, pageSize });
});

// 货柜详情
containersRouter.get('/:id', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const container = await prisma.container.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, username: true, realName: true } },
      contracts: { include: { contract: { select: { id: true, contractNo: true, status: true } } } },
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
  const biz = container.businessCustomerId
    ? await prisma.businessCustomer.findUnique({ where: { id: container.businessCustomerId }, select: { id: true, realName: true } })
    : null;
  res.json({ ...container, businessCustomer: biz });
});

// 创建货柜
containersRouter.post('/', adminWrite, async (req: AuthRequest, res: Response) => {
  const { containerNo, toYardTime, customerName, note, contractIds, actualContainerNo, items: extraItems } = req.body;
  if (!containerNo) return res.status(400).json({ error: '柜号必填' });
  if (!customerName) return res.status(400).json({ error: '请输入客户名称' });

  const tenantId = req.customerId ?? 0;
  let bizCust = await prisma.businessCustomer.upsert({
    where: { realName_tenantId: { realName: customerName, tenantId } },
    create: { realName: customerName, tenantId },
    update: {},
  });
  const existing = await prisma.container.findUnique({ where: { containerNo } });
  if (existing) return res.status(400).json({ error: '柜号已存在' });

  const result = await prisma.$transaction(async (tx) => {
    const container = await tx.container.create({
      data: {
        containerNo,
        toYardTime: toYardTime ? new Date(toYardTime) : null,
        customerId: tenantId,
        businessCustomerId: bizCust.id,
        note,
        actualContainerNo: actualContainerNo || null,
        ...(contractIds?.length > 0 ? {
          contracts: { create: contractIds.map((cid: number) => ({ contractId: cid })) },
        } : {}),
        ...(extraItems?.length > 0 ? {
          items: { create: extraItems.map((ei: any) => ({ productId: ei.productId, plannedQty: ei.plannedQty || 0, actualQty: ei.actualQty || ei.plannedQty || 0, returnedQty: 0, outboundId: 0 })) },
        } : {}),
      },
      include: {
        customer: { select: { id: true, username: true, realName: true } },
        contracts: { include: { contract: { select: { id: true, contractNo: true, status: true } } } },
        items: {
          include: {
            product: { select: { id: true, sku: true, name: true, spec: true, unit: true } }, returnLocation: { select: { id: true, name: true } },
          },
        },
      },
    });
    // 自动匹配排柜编号相同的出库单
    const matchedOutbounds = await tx.outboundOrder.findMany({
      where: { containerNo, containerId: null, status: 'confirmed' },
      include: { items: true },
    });
    let linkedCount = 0;
    for (const ob of matchedOutbounds) {
      await tx.outboundOrder.update({ where: { id: ob.id }, data: { containerId: container.id } });
      for (const item of ob.items) {
        await tx.containerItem.create({
          data: { containerId: container.id, outboundId: ob.id, productId: item.productId, plannedQty: item.quantity, actualQty: item.quantity, returnedQty: 0, locationId: item.locationId, batchNo: item.batchNo },
        });
        const ocIds = [...new Set(ob.items.map(i => i.contractId).filter(Boolean))] as number[];
        for (const cid of ocIds) {
          await tx.containerContract.upsert({ where: { containerId_contractId: { containerId: container.id, contractId: cid } }, create: { containerId: container.id, contractId: cid }, update: {} }).catch(() => {});
        }
      }
      linkedCount++;
    }
    return { container, linkedCount };
  });

  res.status(201).json({ ...result.container, businessCustomer: { id: bizCust.id, realName: bizCust.realName }, linkedOutbounds: result.linkedCount });
});

// 新增 SKU 到排柜（可选合同）
containersRouter.post('/:id/items', validateId, adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const { productId, quantity, contractId } = req.body;
  if (!productId || !quantity) return res.status(400).json({ error: '请选择商品和数量' });
  const container = await prisma.container.findUnique({ where: { id } });
  if (!container) return res.status(404).json({ error: '排柜不存在' });
  if (container.status === 'sealed' || container.status === 'cancelled') return res.status(400).json({ error: '排柜状态不允许操作' });
  const item = await prisma.containerItem.create({
    data: { containerId: id, outboundId: 0, productId, plannedQty: quantity, actualQty: quantity, returnedQty: 0 },
  });
  if (contractId) {
    await prisma.containerContract.upsert({
      where: { containerId_contractId: { containerId: id, contractId } },
      create: { containerId: id, contractId },
      update: {},
    });
  }
  res.status(201).json(item);
});

// 装柜：录入实装数
containersRouter.put('/:id/load', validateId, adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const { items } = req.body;

  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: '请提供装柜明细' });
  }

  const container = await prisma.container.findUnique({ where: { id } });
  if (!container) return res.status(404).json({ error: '货柜不存在' });
  if (req.customerId && container.customerId !== req.customerId) return res.status(403).json({ error: '无权访问' });
  if (container.status !== 'pending' && container.status !== 'loading') return res.status(400).json({ error: '货柜状态不允许装柜' });

  const updated = await prisma.$transaction(async (tx) => {
    for (const item of items) {
      const returnedQty = Math.max(0, (item.plannedQty || 0) - (item.actualQty || 0));
      const existing = await tx.containerItem.findFirst({
        where: { containerId: id, outboundId: item.outboundId, productId: item.productId },
      });
      if (existing) {
        await tx.containerItem.update({
          where: { id: existing.id },
          data: { plannedQty: item.plannedQty || 0, actualQty: item.actualQty || 0, returnedQty, locationId: item.locationId || null },
        });
      } else {
        await tx.containerItem.create({
          data: { containerId: id, outboundId: item.outboundId, productId: item.productId, plannedQty: item.plannedQty || 0, actualQty: item.actualQty || 0, returnedQty, locationId: item.locationId || null },
        });
      }
    }

    await tx.container.update({ where: { id }, data: { status: 'loading' } });

    return tx.container.findUnique({
      where: { id },
      include: {
        items: { include: { product: { select: { id: true, sku: true, name: true, spec: true, unit: true } }, returnLocation: { select: { id: true, name: true } } } },
      },
    });
  });
  res.json(updated);
});

// 封柜：记录实装流水 + 甩柜归还库存
// 注意：出库确认时已扣库存，此处不再重复扣减
containersRouter.put('/:id/seal', validateId, adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);

  const container = await prisma.container.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!container) return res.status(404).json({ error: '货柜不存在' });
  if (req.customerId && container.customerId !== req.customerId) return res.status(403).json({ error: '无权访问' });
  if (container.status !== 'loading') return res.status(400).json({ error: '请先完成装柜' });

  const returnLocations = req.body.returnLocations as Record<string, number> | undefined;
  const sealTime = req.body.sealTime ? new Date(req.body.sealTime) : new Date();
  const actualContainerNo = req.body.actualContainerNo || undefined;

  const updated = await prisma.$transaction(async (tx) => {
    // 按商品+批次合并甩柜数量，统一归还
    const returnMap = new Map<string, { warehouseId: number; qty: number; locationId?: number; batchNo: string | null }>();
    for (const item of container.items) {
      if (item.returnedQty > 0) {
        const outbound = await tx.outboundOrder.findUnique({
          where: { id: item.outboundId },
          select: { warehouseId: true },
        });
        const warehouseId = outbound?.warehouseId;
        if (!warehouseId) continue;

        // 批次号：优先 containerItem，兜底查 outboundItem
        let batchNo = item.batchNo || null;
        if (!batchNo) {
          const obItem = await tx.outboundItem.findFirst({
            where: { outboundId: item.outboundId, productId: item.productId },
            select: { batchNo: true },
          });
          batchNo = obItem?.batchNo || null;
        }
        const key = `${item.productId}_${batchNo || 'null'}`;
        const existing = returnMap.get(key);
        if (existing) {
          existing.qty += item.returnedQty;
        } else {
          const userLocation = returnLocations?.[String(item.productId)];
          returnMap.set(key, {
            warehouseId,
            qty: item.returnedQty,
            locationId: userLocation ? Number(userLocation) : undefined,
            batchNo,
          });
        }
      }
    }

    for (const [key, data] of returnMap) {
      const productId = parseInt(key.split('_')[0]);
      const { warehouseId, qty, locationId: userLocId, batchNo } = data;

      // 优先用用户指定的库位
      let locationId = userLocId;
      if (!locationId) {
        const inv = await tx.inventory.findFirst({
          where: { productId, warehouseId, batchNo: batchNo ?? null },
          orderBy: { quantity: 'desc' },
        });
        if (inv) locationId = inv.locationId ?? undefined;
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
          where: { productId, warehouseId, locationId, batchNo: batchNo ?? null },
        });
        if (inv) {
          await tx.inventory.update({
            where: { id: inv.id },
            data: { quantity: { increment: qty } },
          });
        } else {
          await tx.inventory.create({
            data: { productId, warehouseId, locationId, quantity: qty, batchNo },
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
          refNo: container.containerNo,
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

    // 有甩柜退还时，检查关联合同是否应恢复为进行中
    if (returnMap.size > 0) {
      const contractIds = [...new Set((await tx.outboundItem.findMany({
        where: { outboundId: { in: container.items.map(i => i.outboundId) }, contractId: { not: null } },
        select: { contractId: true },
      })).map(o => o.contractId!))];
      for (const cid of contractIds) {
        const contract = await tx.contract.findUnique({ where: { id: cid }, include: { items: true } });
        if (!contract) continue;
        const obItems = await tx.outboundItem.findMany({ where: { contractId: cid } });
        const shippedMap = new Map<number, number>();
        for (const oi of obItems) shippedMap.set(oi.productId, (shippedMap.get(oi.productId) || 0) + oi.quantity);
        const containerReturns = await tx.containerItem.findMany({
          where: { outboundId: { in: obItems.map(o => o.outboundId) }, returnedQty: { gt: 0 } },
        });
        for (const ci of containerReturns) {
          shippedMap.set(ci.productId, (shippedMap.get(ci.productId) || 0) - ci.returnedQty);
        }
        const fulfilled = contract.items.every(ci => (shippedMap.get(ci.productId) || 0) >= ci.plannedQty);
        if (fulfilled && contract.status !== 'completed') {
          await tx.contract.update({ where: { id: cid }, data: { status: 'completed' } });
        } else if (!fulfilled && contract.status === 'completed') {
          await tx.contract.update({ where: { id: cid }, data: { status: 'active' } });
        }
      }
    }

    return await tx.container.update({
      where: { id },
      data: { status: 'sealed', sealTime, actualContainerNo },
      include: {
        items: { include: { product: { select: { id: true, sku: true, name: true, spec: true, unit: true } }, returnLocation: { select: { id: true, name: true } } } },
      },
    });
  });

  res.json(updated);
});

// 修改封柜时间
containersRouter.put('/:id/seal-time', validateId, adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const { sealTime } = req.body;
  if (!sealTime) return res.status(400).json({ error: '请提供封柜时间' });
  const container = await prisma.container.findUnique({ where: { id } });
  if (!container) return res.status(404).json({ error: '货柜不存在' });
  const updated = await prisma.container.update({ where: { id }, data: { sealTime: new Date(sealTime) } });
  res.json(updated);
});

// 作废排柜（仅 pending/loading 可作废，释放排柜号）
containersRouter.put('/:id/cancel', validateId, adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const container = await prisma.container.findUnique({ where: { id } });
  if (!container) return res.status(404).json({ error: '排柜不存在' });
  if (container.status === 'sealed') return res.status(400).json({ error: '已封柜的排柜不可作废' });
  if (container.status === 'cancelled') return res.status(400).json({ error: '已作废' });
  // 释放排柜号：原号加后缀 _cancelled_timestamp
  const newNo = container.containerNo + '_cancelled_' + Date.now().toString(36);
  const updated = await prisma.container.update({ where: { id }, data: { status: 'cancelled', containerNo: newNo } });
  res.json(updated);
});

// 调整装柜数量（支持封柜后修正，海外仓反馈偏差时使用）
containersRouter.put('/:id/adjust', validateId, adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const { items, returnLocations } = req.body; // items: [{ productId, actualQty }], returnLocations: { pid: locId }

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
        const userLoc = returnLocations?.[String(pid)];
        await tx.containerItem.update({
          where: { id: item.id },
          data: { actualQty: itemActual, returnedQty: itemReturned, ...(userLoc ? { returnLocationId: Number(userLoc) } : {}) },
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

        // 优先用用户指定的归还库位 → 已记录归还库位 → 原出库库位 → 批次库存库位
        const batchNo = firstItem.batchNo || null;
        let locationId = returnLocations?.[String(pid)] ?? firstItem.returnLocationId ?? firstItem.locationId;
        if (!locationId) {
          const inv = await tx.inventory.findFirst({
            where: { productId: pid, warehouseId, batchNo: batchNo ?? null },
            orderBy: { quantity: 'desc' },
          });
          locationId = inv?.locationId ?? null;
        }

        const totalBefore = (await tx.inventory.aggregate({
          where: { productId: pid, warehouseId },
          _sum: { quantity: true },
        }))._sum.quantity || 0;

        if (locationId) {
          const inv = await tx.inventory.findFirst({
            where: { productId: pid, warehouseId, locationId, batchNo: batchNo ?? null },
          });
          if (inv) {
            // 防止扣成负数：实际扣减量不超过现有库存
            const actualDiff = diff < 0 ? Math.max(diff, -inv.quantity) : diff;
            if (actualDiff === 0) continue;
            await tx.inventory.update({
              where: { id: inv.id },
              data: { quantity: { increment: actualDiff } },
            });
          } else if (diff > 0) {
            await tx.inventory.create({
              data: { productId: pid, warehouseId, locationId, quantity: diff, batchNo },
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
            refNo: container.containerNo,
          },
        });
      }
    }

    // 甩柜数变化时，检查关联合同状态
    const contractCheckIds = [...new Set((await tx.outboundItem.findMany({
      where: { outboundId: { in: container.items.map(i => i.outboundId) }, contractId: { not: null } },
      select: { contractId: true },
    })).map(o => o.contractId!))];
    for (const cid of contractCheckIds) {
      const c = await tx.contract.findUnique({ where: { id: cid }, include: { items: true } });
      if (!c) continue;
      const obItems = await tx.outboundItem.findMany({ where: { contractId: cid } });
      const shipMap = new Map<number, number>();
      for (const oi of obItems) shipMap.set(oi.productId, (shipMap.get(oi.productId) || 0) + oi.quantity);
      const retItems = await tx.containerItem.findMany({
        where: { outboundId: { in: obItems.map(o => o.outboundId) }, returnedQty: { gt: 0 } },
      });
      for (const ri of retItems) shipMap.set(ri.productId, (shipMap.get(ri.productId) || 0) - ri.returnedQty);
      const fulfilled = c.items.every(ci => (shipMap.get(ci.productId) || 0) >= ci.plannedQty);
      if (fulfilled && c.status !== 'completed') {
        await tx.contract.update({ where: { id: cid }, data: { status: 'completed' } });
      } else if (!fulfilled && c.status === 'completed') {
        await tx.contract.update({ where: { id: cid }, data: { status: 'active' } });
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
  const id = parseInt(req.params.id as string);
  const container = await prisma.container.findUnique({ where: { id } });
  if (!container) return res.status(404).json({ error: '货柜不存在' });
  if (req.customerId && container.customerId !== req.customerId) return res.status(403).json({ error: '无权访问' });
  if (container.status !== 'pending' && container.status !== 'cancelled') return res.status(400).json({ error: '仅待装柜或已作废状态可删除' });
  await prisma.container.delete({ where: { id } });
  res.json({ message: '已删除' });
});

// 装柜报表
containersRouter.get('/:id/report', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
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

  // 关联合同：从出库单自动检测所有合同
  const outboundIds = [...new Set(container.items.map(i => i.outboundId))];
  const obContractIds = await prisma.outboundItem.findMany({
    where: { outboundId: { in: outboundIds }, contractId: { not: null } },
    select: { contractId: true },
    distinct: ['contractId'],
  });
  const allContractIds = obContractIds.map(o => o.contractId!);

  // 出库条目→合同映射（用于按合同取单价）
  const itemContracts = await prisma.outboundItem.findMany({
    where: { outboundId: { in: outboundIds }, contractId: { not: null } },
    select: { outboundId: true, productId: true, contractId: true },
  });
  const itemContractMap = new Map<number, number>();
  for (const ic of itemContracts) {
    itemContractMap.set(ic.productId, ic.contractId);
  }

  let contractPriceMap: Map<string, number> = new Map();
  if (allContractIds.length > 0) {
    const contractItems = await prisma.contractItem.findMany({
      where: { contractId: { in: allContractIds } },
      select: { contractId: true, productId: true, unitPrice: true },
    });
    for (const ci of contractItems) {
      if (ci.unitPrice != null) contractPriceMap.set(`${ci.contractId}_${ci.productId}`, ci.unitPrice);
    }
  }

  // 按商品合并
  const merged = new Map<number, { sku: string; name: string; spec: string; unit: string; plannedQty: number; actualQty: number; returnedQty: number; unitPrice?: number }>();
  for (const item of container.items) {
    const pid = item.productId;
    const cid = itemContractMap.get(pid);
    const price = cid ? contractPriceMap.get(`${cid}_${pid}`) : undefined;
    const existing = merged.get(pid);
    if (existing) {
      existing.plannedQty += item.plannedQty;
      existing.actualQty += (item.actualQty || 0);
      existing.returnedQty += Math.max(0, item.returnedQty);
      if (price != null) existing.unitPrice = price;
    } else {
      merged.set(pid, {
        sku: item.product.sku,
        name: item.product.name,
        spec: item.product.spec || '',
        unit: item.product.unit,
        plannedQty: item.plannedQty,
        actualQty: item.actualQty || 0,
        returnedQty: Math.max(0, item.returnedQty),
        unitPrice: price ?? undefined,
      });
    }
  }
  const summary = Array.from(merged.values());

  const totals = summary.reduce(
    (acc, item) => {
      acc.totalPlanned += item.plannedQty;
      acc.totalActual += item.actualQty;
      acc.totalReturned += item.returnedQty;
      if (item.unitPrice != null) acc.totalAmount = (acc.totalAmount || 0) + item.unitPrice * item.actualQty;
      return acc;
    },
    { totalPlanned: 0, totalActual: 0, totalReturned: 0, totalAmount: 0 as number },
  );

  // 模板设置从租户帐号读取，不是业务客户
  const templateCustomer = req.customerId
    ? await prisma.customer.findUnique({ where: { id: req.customerId }, select: { reportTemplate: true, templatePreset: true, excelPreset: true, exportTemplate: true } })
    : container.customer;
  const tpl = templateCustomer;
  const bizCustomer = container.businessCustomerId
    ? await prisma.businessCustomer.findUnique({ where: { id: container.businessCustomerId }, select: { realName: true } })
    : null;
  res.json({
    containerNo: container.containerNo,
    actualContainerNo: container.actualContainerNo || '',
    toYardTime: container.toYardTime,
    sealTime: container.sealTime,
    status: container.status,
    customerId: req.customerId || container.customerId,  // 模板管理用租户 ID
    customerName: bizCustomer?.realName || container.customer?.realName || container.customer?.username || '',
    templatePreset: tpl?.templatePreset || null,
    excelPreset: tpl?.excelPreset || null,
    exportTemplate: tpl?.exportTemplate || null,
    reportTemplate: tpl?.templatePreset
      ? (getPresetTemplate(tpl.templatePreset) || tpl?.reportTemplate || null)
      : (tpl?.reportTemplate || null),
    contractIds: allContractIds,
    summary,
    totals,
  });
});

// 排柜对账
containersRouter.get('/:id/reconciliation', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const container = await prisma.container.findUnique({
    where: { id },
    include: {
      contracts: { include: { contract: { select: { id: true, contractNo: true, status: true } } } },
      items: { include: { product: { select: { id: true, sku: true, name: true, spec: true, unit: true } } } },
    },
  });
  if (!container) return res.status(404).json({ error: '排柜不存在' });

  // 出库单条目 → 合同
  const outboundIds = [...new Set(container.items.map(i => i.outboundId))];
  const obItems = outboundIds.length > 0
    ? await prisma.outboundItem.findMany({
        where: { outboundId: { in: outboundIds }, contractId: { not: null } },
        select: { outboundId: true, productId: true, contractId: true },
      })
    : [];

  // productId+outboundId → contractId 映射
  const contractMap = new Map<string, number>();
  for (const oi of obItems) {
    contractMap.set(`${oi.outboundId}_${oi.productId}`, oi.contractId!);
  }

  // 合同单价
  const allContractIds = [...new Set(obItems.map(o => o.contractId!).filter(Boolean))];
  const contractItems = allContractIds.length > 0
    ? await prisma.contractItem.findMany({
        where: { contractId: { in: allContractIds } },
        select: { contractId: true, productId: true, unitPrice: true },
      })
    : [];
  const priceMap = new Map<string, number>();
  for (const ci of contractItems) {
    if (ci.unitPrice != null) priceMap.set(`${ci.contractId}_${ci.productId}`, ci.unitPrice);
  }

  // 按合同分组
  const contractMap2 = new Map<number, {
    contractId: number; contractNo: string; contractStatus: string;
    items: Map<number, { productId: number; sku: string; name: string; spec: string; unit: string; plannedQty: number; actualQty: number; returnedQty: number; unitPrice?: number }>;
  }>();

  for (const ci of container.items) {
    const cid = contractMap.get(`${ci.outboundId}_${ci.productId}`) || 0;
    let group = contractMap2.get(cid);
    if (!group) {
      const cc = container.contracts.find(c => c.contractId === cid);
      group = {
        contractId: cid,
        contractNo: cc?.contract?.contractNo || '无合同',
        contractStatus: cc?.contract?.status || '',
        items: new Map(),
      };
      contractMap2.set(cid, group);
    }
    const pid = ci.productId;
    const existing = group.items.get(pid);
    const up = priceMap.get(`${cid}_${pid}`);
    if (existing) {
      existing.plannedQty += ci.plannedQty;
      existing.actualQty += (ci.actualQty || 0);
      existing.returnedQty += Math.max(0, ci.returnedQty);
    } else {
      group.items.set(pid, {
        productId: pid,
        sku: ci.product?.sku || '',
        name: ci.product?.name || '',
        spec: ci.product?.spec || '',
        unit: ci.product?.unit || '',
        plannedQty: ci.plannedQty,
        actualQty: ci.actualQty || 0,
        returnedQty: Math.max(0, ci.returnedQty),
        unitPrice: up ?? undefined,
      });
    }
  }

  const contracts = Array.from(contractMap2.values()).map(g => {
    const items = Array.from(g.items.values());
    const totals = items.reduce((a, i) => ({
      planned: a.planned + i.plannedQty,
      actual: a.actual + i.actualQty,
      returned: a.returned + i.returnedQty,
      amount: a.amount + (i.unitPrice || 0) * i.actualQty,
    }), { planned: 0, actual: 0, returned: 0, amount: 0 });
    return { contractId: g.contractId, contractNo: g.contractNo, contractStatus: g.contractStatus, items, totals };
  });

  res.json({
    container: { id: container.id, containerNo: container.containerNo, status: container.status },
    contracts,
  });
});

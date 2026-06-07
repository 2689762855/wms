import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { getPagination } from '../utils/pagination';
import { syncContractFulfillment } from '../utils/contractFulfillment';
import { getPresetTemplate } from '../utils/reportPresets';
import { AuthRequest, authenticate, adminWrite, validateId } from '../middleware/auth';

export const containersActionsRouter = Router();


// 新增 SKU 到排柜（可选合同）
containersActionsRouter.post('/:id/items', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const { productId, quantity, contractId } = req.body;
  if (!productId || !quantity) return res.status(400).json({ error: '请选择商品和数量' });
  const container = await prisma.container.findUnique({ where: { id } });
  if (!container) return res.status(404).json({ error: '排柜不存在' });
  if (req.customerId && container.customerId !== req.customerId) return res.status(403).json({ error: '无权操作' });
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
containersActionsRouter.put('/:id/load', validateId, async (req: AuthRequest, res: Response) => {
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
containersActionsRouter.put('/:id/seal', validateId, adminWrite, async (req: AuthRequest, res: Response) => {
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
      await syncContractFulfillment(tx, container.items.map(i => i.outboundId));
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
containersActionsRouter.put('/:id/seal-time', validateId, adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const { sealTime } = req.body;
  if (!sealTime) return res.status(400).json({ error: '请提供封柜时间' });
  const container = await prisma.container.findUnique({ where: { id } });
  if (!container) return res.status(404).json({ error: '货柜不存在' });
  const updated = await prisma.container.update({ where: { id }, data: { sealTime: new Date(sealTime) } });
  res.json(updated);
});

// 作废排柜（仅 pending/loading 可作废，释放排柜号）
containersActionsRouter.put('/:id/cancel', validateId, adminWrite, async (req: AuthRequest, res: Response) => {
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
containersActionsRouter.put('/:id/adjust', validateId, adminWrite, async (req: AuthRequest, res: Response) => {
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

  try {
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

      // 封柜后只允许调低（甩柜），不允许调高超装
      if (isSealed) {
        const oldActual = existingItems.reduce((s, i) => s + (i.actualQty || 0), 0);
        if (newActual > oldActual) {
          throw new Error(`商品 #${pid} 已封柜，不允许增加实装数（原${oldActual}→新${newActual}）`);
        }
        const diff = oldActual - newActual;
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
    await syncContractFulfillment(tx, container.items.map(i => i.outboundId));
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
  } catch (err: any) { return res.status(400).json({ error: err.message || '调整失败' }); }
});

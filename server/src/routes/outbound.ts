import { Router, Response } from 'express';
import prisma, { PRODUCT_INCLUDE } from '../utils/prisma';
import { getPagination } from '../utils/pagination';
import { AuthRequest, authenticate, adminWrite, validateId } from '../middleware/auth'
import { applyWarehouseScope } from '../utils/warehouseScope';
import { nextOrderNo } from '../utils/sequence';

export const outboundRouter = Router();
outboundRouter.use(authenticate);

// CSV 导出
outboundRouter.get('/export', async (req: AuthRequest, res: Response) => {
  const where: Record<string, unknown> = {};
  if (req.userRole !== 'super_admin') {
    if (req.userRole === 'tenant_admin') {
      const queryWid = parseInt(req.query.warehouseId as string);
      if (queryWid) where.warehouseId = queryWid;
      else if (req.customerId) {
        const whs = await prisma.warehouse.findMany({ where: { customerId: req.customerId }, select: { id: true } });
        where.warehouseId = { in: whs.map(w => w.id) };
      }
    } else if (req.userWarehouseId) {
      where.warehouseId = req.userWarehouseId;
    }
  }
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) (where.createdAt as any).gte = new Date(startDate);
    if (endDate) (where.createdAt as any).lte = new Date(endDate + 'T23:59:59.999Z');
  }
  const ids = (req.query.ids as string)?.split(',').map(Number).filter(n => !isNaN(n));
  if (ids?.length) where.id = { in: ids };

  const orders = await prisma.outboundOrder.findMany({
    where,
    include: { warehouse: true, items: { include: { product: true } } },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });

  // 生成 CSV（BOM for Excel 中文兼容）
  const BOM = '﻿';
  const header = '日期,单号,领用人,物料名称,规格,单位,数量,仓库\n';
  const rows: string[] = [];
  for (const o of orders) {
    const dt = new Date(o.createdAt).toISOString().slice(0, 10);
    const wh = o.warehouse?.name || '';
    for (const item of o.items || []) {
      const p = item.product;
      rows.push(`${dt},${o.orderNo},${o.receiver || ''},${p?.name || ''},${p?.spec || ''},${p?.unit || 'pcs'},${item.quantity},${wh}`);
    }
  }
  const csv = BOM + header + rows.join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="outbound-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send(csv);
});

outboundRouter.get('/', async (req: AuthRequest, res: Response) => {
  const { page, pageSize, skip } = getPagination(req);
  const where: Record<string, unknown> = {};
  const unlinkedOnly = req.query.unlinkedOnly === 'true';
  if (unlinkedOnly) where.containerId = null;
  if (req.userRole !== 'super_admin') {
    if (req.userRole === 'tenant_admin') {
      const queryWid = parseInt(req.query.warehouseId as string);
      if (queryWid) {
        where.warehouseId = queryWid;
      } else if (req.customerId) {
        const whs = await prisma.warehouse.findMany({ where: { customerId: req.customerId }, select: { id: true } });
        where.warehouseId = { in: whs.map(w => w.id) };
      }
    } else if (req.userWarehouseId) {
      where.warehouseId = req.userWarehouseId;
    }
  }
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) (where.createdAt as any).gte = new Date(startDate);
    if (endDate) (where.createdAt as any).lte = new Date(endDate);
  }
  const receiver = req.query.receiver as string;
  if (receiver) {
    where.receiver = { contains: receiver };
  }
  const [data, total] = await Promise.all([
    prisma.outboundOrder.findMany({
      where,
      include: { warehouse: true, container: { select: { id: true, containerNo: true, status: true } }, items: { include: { product: PRODUCT_INCLUDE, location: true } } },
      skip, take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.outboundOrder.count({ where }),
  ]);
  res.json({ data, total, page, pageSize });
});

outboundRouter.get('/:id', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ "error": "无效ID" });
  const order = await prisma.outboundOrder.findUnique({
    where: { id },
    include: { warehouse: true, location: true, container: { select: { id: true, containerNo: true, status: true } }, items: { include: { product: PRODUCT_INCLUDE, location: true, contract: { select: { id: true, contractNo: true, items: { include: { product: { select: { id: true } } } } } } } } },
  });
  if (!order) return res.status(404).json({ error: '不存在' });
  if (req.userRole !== 'super_admin') {
    if (req.userRole === 'tenant_admin' && req.customerId) {
      const wh = await prisma.warehouse.findUnique({ where: { id: order.warehouseId }, select: { customerId: true } });
      if (!wh || wh.customerId !== req.customerId) return res.status(403).json({ error: '无权查看此仓库的单据' });
    } else if (req.userWarehouseId && order.warehouseId !== req.userWarehouseId) {
      return res.status(403).json({ error: '无权查看此仓库的单据' });
    }
  }
  res.json(order);
});

outboundRouter.post('/', async (req: AuthRequest, res: Response) => {
  const { warehouseId, receiver, note, items, locationId, containerId, containerNo } = req.body;
  if (!warehouseId || !items?.length) return res.status(400).json({ error: '仓库和明细必填' });
  if (receiver && receiver.length > 200) return res.status(400).json({ error: '收货人不能超过 200 字符' });
  if (note && note.length > 1000) return res.status(400).json({ error: '备注不能超过 1000 字符' });
  if (items.some((i: { productId: number; quantity: number }) => !i.productId || i.quantity <= 0)) {
    return res.status(400).json({ error: '商品明细数量必须大于 0' });
  }
  if (req.userRole !== 'super_admin') {
    if (req.userRole === 'tenant_admin' && req.customerId) {
      const wh = await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { customerId: true } });
      if (!wh || wh.customerId !== req.customerId) return res.status(403).json({ error: '无权操作此仓库' });
    } else if (req.userWarehouseId && warehouseId !== req.userWarehouseId) {
      return res.status(403).json({ error: '无权操作此仓库' });
    }
  }

  // 生成单号（原子序号，防并发重复）
  const orderNo = await nextOrderNo('OUT');

  const order = await prisma.outboundOrder.create({
    data: {
      orderNo,
      warehouseId,
      receiver,
      note,
      ...(req.userRole !== 'tenant_admin' ? { operatorId: req.userId } : {}),
      locationId: locationId || null,
      containerId: containerId || null,
      containerNo: containerNo || null,
      items: {
        create: items.map((i: { productId: number; quantity: number; locationId?: number | null; contractId?: number | null; batchNo?: string | null }) => ({
          productId: i.productId,
          quantity: i.quantity,
          locationId: i.locationId ?? null,
          contractId: i.contractId ?? null,
          batchNo: i.batchNo ?? null,
        })),
      },
    },
    include: { items: { include: { product: PRODUCT_INCLUDE, location: true } } },
  });
  // 同步容器合同关联
  if (containerId) {
    const ocIds = [...new Set(items.filter((i: any) => i.contractId).map((i: any) => i.contractId))] as number[];
    for (const cid of ocIds) {
      await prisma.containerContract.upsert({
        where: { containerId_contractId: { containerId, contractId: cid } },
        create: { containerId, contractId: cid },
        update: {},
      }).catch(() => {});
    }
  }
  res.status(201).json(order);
});

// 编辑草稿出库单
outboundRouter.put('/:id', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: '无效ID' });

  const order = await prisma.outboundOrder.findUnique({ where: { id }, include: { items: true } });
  if (!order) return res.status(404).json({ error: '不存在' });
  if (order.status !== 'draft') return res.status(400).json({ error: '仅草稿状态的单据可编辑' });

  const { warehouseId, receiver, note, items, locationId, containerId, containerNo } = req.body;
  if (!warehouseId || !items?.length) return res.status(400).json({ error: '仓库和明细必填' });
  if (receiver && receiver.length > 200) return res.status(400).json({ error: '收货人不能超过 200 字符' });
  if (note && note.length > 1000) return res.status(400).json({ error: '备注不能超过 1000 字符' });
  if (items.some((i: { productId: number; quantity: number }) => !i.productId || i.quantity <= 0)) {
    return res.status(400).json({ error: '商品明细数量必须大于 0' });
  }

  if (req.userRole !== 'super_admin') {
    if (req.userRole === 'tenant_admin' && req.customerId) {
      const wh = await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { customerId: true } });
      if (!wh || wh.customerId !== req.customerId) return res.status(403).json({ error: '无权操作此仓库' });
    } else if (req.userWarehouseId && warehouseId !== req.userWarehouseId) {
      return res.status(403).json({ error: '无权操作此仓库' });
    }
  }

  // 删除旧明细（raw SQL 避免 Prisma FK 约束误判）+ 写入新明细
  await prisma.$executeRaw`DELETE FROM OutboundItem WHERE outboundId = ${id}`;

  const updated = await prisma.outboundOrder.update({
    where: { id },
    data: {
      warehouseId,
      receiver: receiver ?? null,
      note: note ?? null,
      locationId: locationId || null,
      containerId: containerId || null,
      containerNo: containerNo || null,
      items: {
        create: items.map((i: any) => ({
          productId: i.productId,
          quantity: i.quantity,
          locationId: i.locationId ?? null,
          contractId: i.contractId ?? null,
          batchNo: i.batchNo ?? null,
        })),
      },
    },
    include: { items: { include: { product: PRODUCT_INCLUDE, location: true } } },
  });
  res.json(updated);
});

// 关联出库单到排柜
outboundRouter.put('/:id/link-container', validateId, adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ "error": "无效ID" });
  const { containerId } = req.body;
  if (!containerId) return res.status(400).json({ error: '请指定排柜' });
  const order = await prisma.outboundOrder.findUnique({ where: { id } });
  if (!order) return res.status(404).json({ error: '出库单不存在' });
  if (order.status !== 'confirmed') return res.status(400).json({ error: '仅已确认的出库单可关联排柜' });
  const container = await prisma.container.findUnique({ where: { id: containerId } });
  if (!container) return res.status(404).json({ error: '排柜不存在' });
  if (container.status === 'sealed' || container.status === 'cancelled') return res.status(400).json({ error: '排柜状态不允许关联' });

  await prisma.outboundOrder.update({ where: { id }, data: { containerId } });
  // 自动创建 containerItems
  const items = await prisma.outboundItem.findMany({ where: { outboundId: id }, include: { product: { select: { name: true } } } });
  for (const item of items) {
    const exist = await prisma.containerItem.findFirst({ where: { containerId, outboundId: id, productId: item.productId } });
    if (!exist) {
      await prisma.containerItem.create({ data: { containerId, outboundId: id, productId: item.productId, plannedQty: item.quantity, actualQty: item.quantity, returnedQty: 0, locationId: item.locationId, batchNo: item.batchNo } });
    }
  }
  // 同步容器合同
  const ocIds = [...new Set(items.map(i => i.contractId).filter(Boolean))] as number[];
  for (const cid of ocIds) {
    await prisma.containerContract.upsert({ where: { containerId_contractId: { containerId, contractId: cid } }, create: { containerId, contractId: cid }, update: {} }).catch(() => {});
  }
  res.json({ message: '已关联' });
});

outboundRouter.put('/:id/confirm', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ "error": "无效ID" });
  const order = await prisma.outboundOrder.findUnique({ where: { id }, include: { items: true } });
  if (!order) return res.status(404).json({ error: '不存在' });
  if (order.status === 'confirmed') return res.status(400).json({ error: '已确认' });
  if (req.userRole !== 'super_admin') {
    if (req.userRole === 'tenant_admin' && req.customerId) {
      const wh = await prisma.warehouse.findUnique({ where: { id: order.warehouseId }, select: { customerId: true } });
      if (!wh || wh.customerId !== req.customerId) return res.status(403).json({ error: '无权操作此仓库的单据' });
    } else if (req.userWarehouseId && order.warehouseId !== req.userWarehouseId) {
      return res.status(403).json({ error: '无权操作此仓库的单据' });
    }
  }

  try {
  await prisma.$transaction(async (tx) => {
    // 收集需要创建的 containerItems（供后续货柜关联使用）
    const containerEntries: { productId: number; quantity: number; batchNo: string | null; contractId: number | null; locationId: number | null }[] = [];

    for (const item of order.items) {
      const locId = item.locationId ?? order.locationId ?? null;
      const specifiedBatch = item.batchNo ?? undefined;
      let remaining = item.quantity;

      // 查变动前全库位总量
      const totalBefore = (await tx.inventory.aggregate({
        where: { productId: item.productId, warehouseId: order.warehouseId },
        _sum: { quantity: true },
      }))._sum.quantity || 0;

      if (totalBefore < item.quantity) {
        throw new Error(`库存不足: productId=${item.productId}, 当前总库存=${totalBefore}, 出库=${item.quantity}`);
      }

      // FIFO 分配：从指定批次或所有批次按 batchNo 升序逐个消耗
      const skippedBatches = new Set<string>();
      while (remaining > 0) {
        const where: Record<string, unknown> = {
          productId: item.productId,
          warehouseId: order.warehouseId,
          locationId: locId || undefined,
          quantity: { gt: 0 },
          ...(specifiedBatch ? { batchNo: specifiedBatch } : {}),
        };
        if (skippedBatches.size > 0) where.batchNo = { notIn: [...skippedBatches] };
        const inv = await tx.inventory.findFirst({
          where,
          orderBy: specifiedBatch ? undefined : { batchNo: 'asc' as const },
        });
        if (!inv) {
          let msg: string;
          if (specifiedBatch) {
            msg = `库存不足: productId=${item.productId}, 指定批次 ${specifiedBatch} 库存不够`;
          } else if (skippedBatches.size > 0) {
            msg = `库存不足: productId=${item.productId}, 所有可用批次已被其他排柜锁定 (${[...skippedBatches].join(', ')})`;
          } else {
            msg = `库存不足: productId=${item.productId}, 已分配 ${item.quantity - remaining}, 还需 ${remaining}`;
          }
          throw new Error(msg);
        }

        // 批次锁定检查：跨合同时跳过被货柜锁定的批次
        if (inv.batchNo && !specifiedBatch) {
          const batchInbound = await tx.inboundItem.findFirst({
            where: { batchNo: inv.batchNo, contractId: { not: null } },
            select: { contractId: true },
          });
          if (batchInbound) {
            const outboundContractId = item.contractId || null;
            if (batchInbound.contractId !== outboundContractId) {
              const hasContainer = await tx.container.findFirst({
                where: { outbounds: { some: { items: { some: { contractId: batchInbound.contractId } } } } },
              });
              if (hasContainer) {
                skippedBatches.add(inv.batchNo!);
                continue;
              }
            }
          }
        }

        // 消耗这个批次
        const take = Math.min(remaining, inv.quantity);
        await tx.inventory.update({
          where: { id: inv.id },
          data: { quantity: { decrement: take } },
        });
        await tx.stockLog.create({
          data: {
            productId: item.productId,
            warehouseId: order.warehouseId,
            changeQty: -take,
            beforeQty: totalBefore,
            afterQty: totalBefore - item.quantity,
            type: 'outbound',
            refId: order.id,
          },
        });

        // 记录 container 条目（按批次拆分）
        containerEntries.push({
          productId: item.productId,
          quantity: take,
          batchNo: inv.batchNo || null,
          contractId: item.contractId ?? null,
          locationId: inv.locationId,
        });

        remaining -= take;
      }
    }

    await tx.outboundOrder.update({ where: { id }, data: { status: 'confirmed' } });

    // 如果关联了货柜，按批次拆分条目填入货柜明细
    if (order.containerId) {
      const container = await tx.container.findUnique({ where: { id: order.containerId } });
      if (container && (container.status === 'pending' || container.status === 'loading')) {
        for (const ce of containerEntries) {
          await tx.containerItem.create({
            data: {
              containerId: order.containerId,
              outboundId: id,
              productId: ce.productId,
              plannedQty: ce.quantity,
              actualQty: ce.quantity,
              returnedQty: 0,
              locationId: ce.locationId,
              batchNo: ce.batchNo,
            },
          });
        }
        if (container.status === 'pending') {
          await tx.container.update({ where: { id: order.containerId }, data: { status: 'loading' } });
        }
        // 同步容器合同关联
        const ocIds = [...new Set(containerEntries.map(e => e.contractId).filter(Boolean))] as number[];
        for (const cid of ocIds) {
          await tx.containerContract.upsert({
            where: { containerId_contractId: { containerId: order.containerId, contractId: cid } },
            create: { containerId: order.containerId, contractId: cid },
            update: {},
          });
        }
      }
    }
  });
  } catch (err: any) {
    if (err.message?.startsWith('库存不足') || err.message?.startsWith('批次')) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }

  // 检查关联合同是否全部出完（已出 - 甩柜退回 >= 计划）
  try {
    const contractIds = [...new Set(order.items.map(i => i.contractId).filter(Boolean))] as number[];
    for (const cid of contractIds) {
      const contract = await prisma.contract.findUnique({ where: { id: cid }, include: { items: true } });
      if (!contract || contract.status === 'completed') continue;
      const outboundItems = await prisma.outboundItem.findMany({ where: { contractId: cid } });
      const shippedMap = new Map<number, number>();
      for (const oi of outboundItems) {
        shippedMap.set(oi.productId, (shippedMap.get(oi.productId) || 0) + oi.quantity);
      }
      // 扣掉甩柜退回
      const outboundIds = outboundItems.map(o => o.outboundId);
      if (outboundIds.length > 0) {
        const returnedItems = await prisma.containerItem.findMany({
          where: { outboundId: { in: outboundIds }, returnedQty: { gt: 0 } },
        });
        for (const ri of returnedItems) {
          shippedMap.set(ri.productId, (shippedMap.get(ri.productId) || 0) - ri.returnedQty);
        }
      }
      const allShipped = contract.items.every(ci => (shippedMap.get(ci.productId) || 0) >= ci.plannedQty);
      if (allShipped) {
        await prisma.contract.update({ where: { id: cid }, data: { status: 'completed' } });
      }
    }
  } catch (err) {
    console.error('Outbound confirm: contract status update failed:', err);
    // 合同状态更新失败不影响已确认的入库单，下次查询时会自动修正
  }

  const updated = await prisma.outboundOrder.findUnique({
    where: { id },
    include: { warehouse: true, container: { select: { id: true, containerNo: true, status: true } }, items: { include: { product: PRODUCT_INCLUDE, location: true } } },
  });
  res.json(updated);
});

// 删除出库单（仅草稿）
outboundRouter.delete('/:id', validateId, adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ "error": "无效ID" });
  const order = await prisma.outboundOrder.findUnique({ where: { id } });
  if (!order) return res.status(404).json({ error: '不存在' });
  if (order.status !== 'draft') return res.status(400).json({ error: '已确认的单据不可删除' });
  if (req.userRole !== 'super_admin') {
    if (req.userRole === 'tenant_admin' && req.customerId) {
      const wh = await prisma.warehouse.findUnique({ where: { id: order.warehouseId }, select: { customerId: true } });
      if (!wh || wh.customerId !== req.customerId) return res.status(403).json({ error: '无权删除此仓库的单据' });
    } else if (req.userWarehouseId && order.warehouseId !== req.userWarehouseId) {
      return res.status(403).json({ error: '无权删除此仓库的单据' });
    }
  }
  await prisma.$transaction(async (tx) => {
    await tx.outboundItem.deleteMany({ where: { outboundId: id } });
    await tx.outboundOrder.delete({ where: { id } });
  });
  res.json({ message: '已删除' });
});

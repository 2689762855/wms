import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { getPagination } from '../utils/pagination';
import { AuthRequest, authenticate, adminWrite, validateId } from '../middleware/auth';
import { nextOrderNo } from '../utils/sequence';

// 执行调拨库存转移（confirm 和 approve 共用）
async function executeTransfer(
  tx: any,
  order: { id: number; fromWarehouseId: number; toWarehouseId: number; items: { productId: number; quantity: number; locationId?: number | null }[] },
  targetLocationId: number,
) {
  for (const item of order.items) {
    const fromWhere: Record<string, unknown> = { productId: item.productId, warehouseId: order.fromWarehouseId, quantity: { gt: 0 } };
    if (item.locationId) fromWhere.locationId = item.locationId;
    const fromInvs = await tx.inventory.findMany({ where: fromWhere });
    const totalQty = fromInvs.reduce((s: number, inv: { quantity: number }) => s + inv.quantity, 0);
    if (totalQty < item.quantity) {
      throw new Error(`库存不足: productId=${item.productId}, 库存=${totalQty}, 需要=${item.quantity}`);
    }
    const fromTotalBefore = (await tx.inventory.aggregate({
      where: { productId: item.productId, warehouseId: order.fromWarehouseId },
      _sum: { quantity: true },
    }))._sum.quantity || 0;
    // toTotalBefore 必须在循环外计算（bug #134 同类），避免多批次时读到前一轮的增量
    const toTotalBefore = (await tx.inventory.aggregate({
      where: { productId: item.productId, warehouseId: order.toWarehouseId },
      _sum: { quantity: true },
    }))._sum.quantity || 0;
    let remaining = item.quantity;
    let toAccumulated = 0;
    for (const inv of fromInvs) {
      if (remaining <= 0) break;
      const deduct = Math.min(inv.quantity, remaining);
      await tx.inventory.update({ where: { id: inv.id }, data: { quantity: { decrement: deduct } } });
      await tx.stockLog.create({
        data: { productId: item.productId, warehouseId: order.fromWarehouseId, changeQty: -deduct, beforeQty: fromTotalBefore, afterQty: fromTotalBefore - item.quantity, type: 'transfer_out', refId: order.id },
      });

      // 调入方：按批次写入，保留源批次的 batchNo
      const toInv = await tx.inventory.findFirst({
        where: { productId: item.productId, warehouseId: order.toWarehouseId, locationId: targetLocationId ?? null, batchNo: inv.batchNo ?? null },
      });
      if (toInv) {
        await tx.inventory.update({ where: { id: toInv.id }, data: { quantity: { increment: deduct } } });
      } else {
        await tx.inventory.create({ data: { productId: item.productId, warehouseId: order.toWarehouseId, locationId: targetLocationId ?? null, quantity: deduct, batchNo: inv.batchNo } });
      }
      toAccumulated += deduct;
      await tx.stockLog.create({
        data: { productId: item.productId, warehouseId: order.toWarehouseId, changeQty: deduct, beforeQty: toTotalBefore, afterQty: toTotalBefore + toAccumulated, type: 'transfer_in', refId: order.id },
      });

      remaining -= deduct;
    }
  }
}

export const transferRouter = Router();
transferRouter.use(authenticate);

// 调拨单列表：超管看全部，其他看涉及自己仓库的
transferRouter.get('/', async (req: AuthRequest, res: Response) => {
  const { page, pageSize, skip } = getPagination(req);
  const status = req.query.status as string;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (req.userRole === 'tenant_admin' && req.customerId) {
    const whs = await prisma.warehouse.findMany({ where: { customerId: req.customerId }, select: { id: true } });
    const ids = whs.map(w => w.id);
    if (ids.length) where.OR = [{ fromWarehouseId: { in: ids } }, { toWarehouseId: { in: ids } }];
  } else if (req.userRole !== 'super_admin' && req.userWarehouseId) {
    where.OR = [
      { fromWarehouseId: req.userWarehouseId },
      { toWarehouseId: req.userWarehouseId },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.transferOrder.findMany({
      where,
      include: { fromWarehouse: true, toWarehouse: true, items: { include: { product: { include: { category: { include: { parent: { include: { parent: true } } } } } } } }, operator: { select: { id: true, realName: true } }, reviewedBy: { select: { id: true, realName: true } } },
      skip, take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.transferOrder.count({ where }),
  ]);
  res.json({ data, total, page, pageSize });
});

transferRouter.get('/:id', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const where: Record<string, unknown> = { id };
  if (req.userRole === 'tenant_admin' && req.customerId) {
    const whs = await prisma.warehouse.findMany({ where: { customerId: req.customerId }, select: { id: true } });
    const ids = whs.map(w => w.id);
    if (ids.length) where.OR = [{ fromWarehouseId: { in: ids } }, { toWarehouseId: { in: ids } }];
  } else if (req.userRole !== 'super_admin' && req.userWarehouseId) {
    where.OR = [
      { fromWarehouseId: req.userWarehouseId },
      { toWarehouseId: req.userWarehouseId },
    ];
  }
  const order = await prisma.transferOrder.findFirst({
    where,
    include: { fromWarehouse: true, toWarehouse: true, items: { include: { product: { include: { category: { include: { parent: { include: { parent: true } } } } } } } }, operator: { select: { id: true, realName: true } }, reviewedBy: { select: { id: true, realName: true } } },
  });
  if (!order) return res.status(404).json({ error: '不存在或无权访问' });
  res.json(order);
});

// 创建调拨单（非超管只能从自己仓库发出）
transferRouter.post('/', async (req: AuthRequest, res: Response) => {
  const { toWarehouseId, note, items } = req.body;
  let fromWarehouseId: number;
  if (req.userRole === 'super_admin') {
    fromWarehouseId = req.body.fromWarehouseId;
  } else if (req.userRole === 'tenant_admin') {
    fromWarehouseId = req.body.fromWarehouseId || req.userWarehouseId;
    if (fromWarehouseId && req.customerId) {
      const wh = await prisma.warehouse.findUnique({ where: { id: fromWarehouseId }, select: { customerId: true } });
      if (!wh || wh.customerId !== req.customerId) {
        return res.status(403).json({ error: '无权操作此仓库' });
      }
    }
  } else {
    fromWarehouseId = req.userWarehouseId!;
  }
  // 校验目标仓库与操作员同属一个客户
  if (req.customerId) {
    const toWh = await prisma.warehouse.findUnique({ where: { id: toWarehouseId }, select: { customerId: true } });
    if (!toWh || toWh.customerId !== req.customerId) return res.status(403).json({ error: '目标仓库不属于您的客户' });
  }
  if (!fromWarehouseId || !toWarehouseId || !items?.length) return res.status(400).json({ error: '源仓库、目标仓库和明细必填' });
  if (fromWarehouseId === toWarehouseId) return res.status(400).json({ error: '不能调拨到同一仓库' });
  if (note && note.length > 1000) return res.status(400).json({ error: '备注不能超过 1000 字符' });
  if (items.some((i: { productId: number; quantity: number }) => !i.productId || i.quantity <= 0)) {
    return res.status(400).json({ error: '商品明细数量必须大于 0' });
  }
  // 来源库位校验
  for (const item of items) {
    if (item.locationId) {
      const loc = await prisma.location.findUnique({ where: { id: item.locationId } });
      if (!loc || loc.warehouseId !== fromWarehouseId) {
        return res.status(400).json({ error: `库位不属于源仓库: locationId=${item.locationId}` });
      }
      // 检查该库位库存是否充足
      const invs = await prisma.inventory.findMany({
        where: { productId: item.productId, warehouseId: fromWarehouseId, locationId: item.locationId },
      });
      const total = invs.reduce((s, inv) => s + inv.quantity, 0);
      if (total < item.quantity) {
        return res.status(400).json({ error: `库位库存不足: productId=${item.productId}, 库存=${total}, 需要=${item.quantity}` });
      }
    }
  }

  const orderNo = await nextOrderNo('TR');

  const order = await prisma.transferOrder.create({
    data: {
      orderNo, fromWarehouseId, toWarehouseId, note,
      ...(req.userRole !== 'tenant_admin' ? { operatorId: req.userId } : {}),
      items: { create: items.map((i: { productId: number; quantity: number; locationId?: number }) => ({ productId: i.productId, quantity: i.quantity, locationId: i.locationId ?? null })) },
    },
    include: { items: { include: { product: { include: { category: { include: { parent: { include: { parent: true } } } } } } } }, fromWarehouse: true, toWarehouse: true },
  });
  res.status(201).json(order);
});

// 确认调拨（直接执行库存转移，跳过审批）
transferRouter.put('/:id/confirm', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const { targetLocationId } = req.body;
  const order = await prisma.transferOrder.findUnique({ where: { id }, include: { items: true } });
  if (!order) return res.status(404).json({ error: '不存在' });
  if (order.status === 'approved') return res.status(400).json({ error: '已执行' });
  if (req.userRole !== 'super_admin') {
    if (req.userRole === 'tenant_admin') {
      const wh = await prisma.warehouse.findUnique({ where: { id: order.fromWarehouseId }, select: { customerId: true } });
      if (!wh || wh.customerId !== req.customerId) {
        return res.status(403).json({ error: '只能确认自己仓库发起的调拨单' });
      }
    } else if (order.fromWarehouseId !== req.userWarehouseId) {
      return res.status(403).json({ error: '只能确认自己仓库发起的调拨单' });
    }
  }
  if (!targetLocationId) return res.status(400).json({ error: '请选择目标库位' });
  const targetLoc = await prisma.location.findUnique({ where: { id: targetLocationId } });
  if (!targetLoc) return res.status(400).json({ error: '目标库位不存在' });
  if (targetLoc.warehouseId !== order.toWarehouseId) {
    return res.status(400).json({ error: '目标库位不属于目标仓库' });
  }

  await prisma.$transaction(async (tx) => {
    await executeTransfer(tx, order, targetLocationId);
    await tx.transferOrder.update({ where: { id }, data: { status: 'approved', reviewedAt: new Date() } });
  });

  const updated = await prisma.transferOrder.findUnique({
    where: { id },
    include: { fromWarehouse: true, toWarehouse: true, items: { include: { product: { include: { category: { include: { parent: { include: { parent: true } } } } } } } } },
  });
  res.json(updated);
});

// 删除调拨单（仅草稿和待审批）
transferRouter.delete('/:id', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const order = await prisma.transferOrder.findUnique({ where: { id } });
  if (!order) return res.status(404).json({ error: '不存在' });
  if (order.status === 'approved') return res.status(400).json({ error: '已执行的调拨单不可删除' });
  if (req.userRole !== 'super_admin') {
    if (req.userRole === 'tenant_admin') {
      const wh = await prisma.warehouse.findUnique({ where: { id: order.fromWarehouseId }, select: { customerId: true } });
      if (!wh || wh.customerId !== req.customerId) {
        return res.status(403).json({ error: '只能删除自己仓库的调拨单' });
      }
    } else if (order.fromWarehouseId !== req.userWarehouseId) {
      return res.status(403).json({ error: '只能删除自己仓库的调拨单' });
    }
  }
  await prisma.$transaction(async (tx) => {
    await tx.transferItem.deleteMany({ where: { transferId: id } });
    await tx.transferOrder.delete({ where: { id } });
  });
  res.json({ message: '已删除' });
});

// 提交审批（改为 pending 状态，保留给需要跨客户审批的场景）
transferRouter.put('/:id/submit', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const order = await prisma.transferOrder.findUnique({ where: { id } });
  if (!order) return res.status(404).json({ error: '不存在' });
  if (order.status !== 'draft') return res.status(400).json({ error: '只能提交草稿状态的调拨单' });
  if (req.userRole !== 'super_admin') {
    if (req.userRole === 'tenant_admin') {
      const wh = await prisma.warehouse.findUnique({ where: { id: order.fromWarehouseId }, select: { customerId: true } });
      if (!wh || wh.customerId !== req.customerId) {
        return res.status(403).json({ error: '只能提交自己仓库的调拨单' });
      }
    } else if (order.fromWarehouseId !== req.userWarehouseId) {
      return res.status(403).json({ error: '只能提交自己仓库的调拨单' });
    }
  }

  const updated = await prisma.transferOrder.update({ where: { id }, data: { status: 'pending' } });
  res.json(updated);
});

// 通过审批
transferRouter.put('/:id/approve', validateId, adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const { targetLocationId } = req.body;
  const order = await prisma.transferOrder.findUnique({ where: { id }, include: { items: true } });
  if (!order) return res.status(404).json({ error: '不存在' });
  if (order.status !== 'pending') return res.status(400).json({ error: '只能通过待审批的调拨单' });
  if (req.userRole !== 'super_admin') {
    if (req.userRole === 'tenant_admin') {
      const wh = await prisma.warehouse.findUnique({ where: { id: order.toWarehouseId }, select: { customerId: true } });
      if (!wh || wh.customerId !== req.customerId) {
        return res.status(403).json({ error: '只能审批发往自己仓库的调拨单' });
      }
    } else if (order.toWarehouseId !== req.userWarehouseId) {
      return res.status(403).json({ error: '只能审批发往自己仓库的调拨单' });
    }
  }
  if (!targetLocationId) return res.status(400).json({ error: '请选择目标库位' });
  const targetLoc = await prisma.location.findUnique({ where: { id: targetLocationId } });
  if (!targetLoc) return res.status(400).json({ error: '目标库位不存在' });
  if (targetLoc.warehouseId !== order.toWarehouseId) {
    return res.status(400).json({ error: '目标库位不属于目标仓库' });
  }

  await prisma.$transaction(async (tx) => {
    await executeTransfer(tx, order, targetLocationId);
    const updateData: Record<string, unknown> = { status: 'approved', reviewedAt: new Date() };
    if (req.userRole !== 'tenant_admin') updateData.reviewedById = req.userId;
    await tx.transferOrder.update({ where: { id }, data: updateData });
  });

  const updated = await prisma.transferOrder.findUnique({
    where: { id },
    include: { fromWarehouse: true, toWarehouse: true, items: { include: { product: { include: { category: { include: { parent: { include: { parent: true } } } } } } } }, reviewedBy: { select: { id: true, realName: true } } },
  });
  res.json(updated);
});

// 拒绝
transferRouter.put('/:id/reject', validateId, adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: '请填写拒绝理由' });

  const order = await prisma.transferOrder.findUnique({ where: { id } });
  if (!order) return res.status(404).json({ error: '不存在' });
  if (order.status !== 'pending') return res.status(400).json({ error: '只能拒绝待审批的调拨单' });
  if (req.userRole !== 'super_admin') {
    if (req.userRole === 'tenant_admin') {
      const wh = await prisma.warehouse.findUnique({ where: { id: order.toWarehouseId }, select: { customerId: true } });
      if (!wh || wh.customerId !== req.customerId) {
        return res.status(403).json({ error: '只能审批发往自己仓库的调拨单' });
      }
    } else if (order.toWarehouseId !== req.userWarehouseId) {
      return res.status(403).json({ error: '只能审批发往自己仓库的调拨单' });
    }
  }

  const rejectData: Record<string, unknown> = { status: 'rejected', reviewNote: reason, reviewedAt: new Date() };
  if (req.userRole !== 'tenant_admin') rejectData.reviewedById = req.userId;

  const updated = await prisma.transferOrder.update({
    where: { id },
    data: rejectData,
    include: { fromWarehouse: true, toWarehouse: true, items: { include: { product: { include: { category: { include: { parent: { include: { parent: true } } } } } } } }, reviewedBy: { select: { id: true, realName: true } } },
  });
  res.json(updated);
});

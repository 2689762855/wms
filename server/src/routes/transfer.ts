import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate, adminWrite } from '../middleware/auth';
import { nextOrderNo } from '../utils/sequence';

export const transferRouter = Router();
transferRouter.use(authenticate);

// 调拨单列表：超管看全部，仓管看涉及自己仓库的
transferRouter.get('/', async (req: AuthRequest, res: Response) => {
  const page = parseInt((req.query.page as string) || '1');
  const pageSize = Math.min(parseInt((req.query.pageSize as string) || '20'), 100);
  const status = req.query.status as string;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (req.userRole !== 'super_admin' && req.userWarehouseId) {
    where.OR = [
      { fromWarehouseId: req.userWarehouseId },
      { toWarehouseId: req.userWarehouseId },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.transferOrder.findMany({
      where,
      include: { fromWarehouse: true, toWarehouse: true, items: { include: { product: { include: { category: { include: { parent: { include: { parent: true } } } } } } } }, operator: { select: { id: true, realName: true } }, reviewedBy: { select: { id: true, realName: true } } },
      skip: (page - 1) * pageSize, take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.transferOrder.count({ where }),
  ]);
  res.json({ data, total, page, pageSize });
});

transferRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const where: Record<string, unknown> = { id };
  if (req.userRole !== 'super_admin' && req.userWarehouseId) {
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

// 创建调拨单（仓管只能从自己仓库发出）
transferRouter.post('/', async (req: AuthRequest, res: Response) => {
  const { toWarehouseId, note, items } = req.body;
  const fromWarehouseId = (req.userRole === 'super_admin' || req.userRole === 'warehouse_admin') ? (req.body.fromWarehouseId || req.userWarehouseId) : req.userWarehouseId;
  if (!fromWarehouseId || !toWarehouseId || !items?.length) return res.status(400).json({ error: '源仓库、目标仓库和明细必填' });
  if (fromWarehouseId === toWarehouseId) return res.status(400).json({ error: '不能调拨到同一仓库' });
  if (note && note.length > 1000) return res.status(400).json({ error: '备注不能超过 1000 字符' });
  if (items.some((i: { productId: number; quantity: number }) => !i.productId || i.quantity <= 0)) {
    return res.status(400).json({ error: '商品明细数量必须大于 0' });
  }

  // 生成单号（原子序号，防并发重复）
  const orderNo = await nextOrderNo('TR');

  const order = await prisma.transferOrder.create({
    data: {
      orderNo, fromWarehouseId, toWarehouseId, note, operatorId: req.userId,
      items: { create: items.map((i: { productId: number; quantity: number }) => ({ productId: i.productId, quantity: i.quantity })) },
    },
    include: { items: { include: { product: { include: { category: { include: { parent: { include: { parent: true } } } } } } } }, fromWarehouse: true, toWarehouse: true },
  });
  res.status(201).json(order);
});

// 提交审批（改为 pending 状态）
transferRouter.put('/:id/submit', async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const order = await prisma.transferOrder.findUnique({ where: { id } });
  if (!order) return res.status(404).json({ error: '不存在' });
  if (order.status !== 'draft') return res.status(400).json({ error: '只能提交草稿状态的调拨单' });
  if (req.userRole !== 'super_admin' && order.fromWarehouseId !== req.userWarehouseId) {
    return res.status(403).json({ error: '只能提交自己仓库的调拨单' });
  }

  const updated = await prisma.transferOrder.update({ where: { id }, data: { status: 'pending' } });
  res.json(updated);
});

// 通过审批
transferRouter.put('/:id/approve', adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const { targetLocationId } = req.body;
  const order = await prisma.transferOrder.findUnique({ where: { id }, include: { items: true } });
  if (!order) return res.status(404).json({ error: '不存在' });
  if (order.status !== 'pending') return res.status(400).json({ error: '只能通过待审批的调拨单' });
  if (req.userRole !== 'super_admin' && order.toWarehouseId !== req.userWarehouseId) {
    return res.status(403).json({ error: '只能审批发往自己仓库的调拨单' });
  }
  if (targetLocationId) {
    const targetLoc = await prisma.location.findUnique({ where: { id: targetLocationId } });
    if (!targetLoc) return res.status(400).json({ error: '目标库位不存在' });
    if (targetLoc.warehouseId !== order.toWarehouseId) {
      return res.status(400).json({ error: '目标库位不属于目标仓库' });
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      // 汇总该商品在源仓库所有库位的库存
      const fromInvs = await tx.inventory.findMany({
        where: { productId: item.productId, warehouseId: order.fromWarehouseId, quantity: { gt: 0 } },
      });
      const totalQty = fromInvs.reduce((s, inv) => s + inv.quantity, 0);
      if (totalQty < item.quantity) {
        throw new Error(`库存不足: productId=${item.productId}, 库存=${totalQty}, 需要=${item.quantity}`);
      }

      // 从各库位扣减
      let remaining = item.quantity;
      for (const inv of fromInvs) {
        if (remaining <= 0) break;
        const deduct = Math.min(inv.quantity, remaining);
        const updated = await tx.inventory.update({
          where: { id: inv.id },
          data: { quantity: { decrement: deduct } },
        });
        await tx.stockLog.create({
          data: { productId: item.productId, warehouseId: order.fromWarehouseId, changeQty: -deduct, beforeQty: inv.quantity, afterQty: updated.quantity, type: 'transfer_out', refId: order.id },
        });
        remaining -= deduct;
      }

      // 目标仓库找已有库存（指定库位）
      const toInv = await tx.inventory.findFirst({
        where: { productId: item.productId, warehouseId: order.toWarehouseId, locationId: targetLocationId ?? null },
      });
      const toBeforeQty = toInv?.quantity || 0;
      if (toInv) {
        await tx.inventory.update({ where: { id: toInv.id }, data: { quantity: { increment: item.quantity } } });
      } else {
        await tx.inventory.create({ data: { productId: item.productId, warehouseId: order.toWarehouseId, locationId: targetLocationId ?? null, quantity: item.quantity } });
      }
      await tx.stockLog.create({
        data: { productId: item.productId, warehouseId: order.toWarehouseId, changeQty: item.quantity, beforeQty: toBeforeQty, afterQty: toBeforeQty + item.quantity, type: 'transfer_in', refId: order.id },
      });
    }

    await tx.transferOrder.update({ where: { id }, data: { status: 'approved', reviewedById: req.userId, reviewedAt: new Date() } });
  });

  const updated = await prisma.transferOrder.findUnique({
    where: { id },
    include: { fromWarehouse: true, toWarehouse: true, items: { include: { product: { include: { category: { include: { parent: { include: { parent: true } } } } } } } }, reviewedBy: { select: { id: true, realName: true } } },
  });
  res.json(updated);
});

// 拒绝
transferRouter.put('/:id/reject', adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: '请填写拒绝理由' });

  const order = await prisma.transferOrder.findUnique({ where: { id } });
  if (!order) return res.status(404).json({ error: '不存在' });
  if (order.status !== 'pending') return res.status(400).json({ error: '只能拒绝待审批的调拨单' });
  if (req.userRole !== 'super_admin' && order.toWarehouseId !== req.userWarehouseId) {
    return res.status(403).json({ error: '只能审批发往自己仓库的调拨单' });
  }

  const updated = await prisma.transferOrder.update({
    where: { id },
    data: { status: 'rejected', reviewedById: req.userId, reviewNote: reason, reviewedAt: new Date() },
    include: { fromWarehouse: true, toWarehouse: true, items: { include: { product: { include: { category: { include: { parent: { include: { parent: true } } } } } } } }, reviewedBy: { select: { id: true, realName: true } } },
  });
  res.json(updated);
});

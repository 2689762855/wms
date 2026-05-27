import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate, adminWrite, validateId } from '../middleware/auth';
import { nextOrderNo } from '../utils/sequence';

export const inboundRouter = Router();
inboundRouter.use(authenticate);

// 入库单列表
inboundRouter.get('/', async (req: AuthRequest, res: Response) => {
  const page = parseInt((req.query.page as string) || '1');
  const pageSize = Math.min(parseInt((req.query.pageSize as string) || '20'), 100);
  const where: Record<string, unknown> = {};
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
  const [data, total] = await Promise.all([
    prisma.inboundOrder.findMany({
      where,
      include: { warehouse: true, items: { include: { product: { include: { category: { include: { parent: { include: { parent: true } } } } } }, location: true, contract: { select: { id: true, contractNo: true } } } } },
      skip: (page - 1) * pageSize, take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.inboundOrder.count({ where }),
  ]);
  res.json({ data, total, page, pageSize });
});

// 入库单详情
inboundRouter.get('/:id', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const order = await prisma.inboundOrder.findUnique({
    where: { id },
    include: { warehouse: true, items: { include: { product: { include: { category: { include: { parent: { include: { parent: true } } } } } }, location: true, contract: { select: { id: true, contractNo: true } } } } },
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

// 创建入库单
inboundRouter.post('/', async (req: AuthRequest, res: Response) => {
  const { warehouseId, supplier, note, items, locationId } = req.body;
  if (!warehouseId || !items?.length) return res.status(400).json({ error: '仓库和明细必填' });
  if (supplier && supplier.length > 200) return res.status(400).json({ error: '供应商名称不能超过 200 字符' });
  if (note && note.length > 1000) return res.status(400).json({ error: '备注不能超过 1000 字符' });
  if (items.some((i: { productId: number; quantity: number }) => !i.productId || i.quantity <= 0)) {
    return res.status(400).json({ error: '商品明细数量必须大于 0' });
  }
  // 非超管只能在自己仓库操作
  if (req.userRole !== 'super_admin') {
    if (req.userRole === 'tenant_admin' && req.customerId) {
      const wh = await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { customerId: true } });
      if (!wh || wh.customerId !== req.customerId) return res.status(403).json({ error: '无权操作此仓库' });
    } else if (req.userWarehouseId && warehouseId !== req.userWarehouseId) {
      return res.status(403).json({ error: '无权操作此仓库' });
    }
  }

  // 生成单号（原子序号，防并发重复）
  const orderNo = await nextOrderNo('IN');

  const order = await prisma.inboundOrder.create({
    data: {
      orderNo,
      warehouseId,
      supplier,
      note,
      ...(req.userRole !== 'tenant_admin' ? { operatorId: req.userId } : {}),
      locationId: locationId || null,
      items: {
        create: items.map((i: { productId: number; quantity: number; unitPrice?: number; locationId?: number | null; expiryDate?: string | null; contractId?: number | null }) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          locationId: i.locationId ?? null,
          expiryDate: i.expiryDate ? new Date(i.expiryDate) : null,
          contractId: i.contractId ?? null,
        })),
      },
    },
    include: { items: { include: { product: { include: { category: { include: { parent: { include: { parent: true } } } } } }, location: true } } },
  });
  res.status(201).json(order);
});

// 确认入库（更新库存）
inboundRouter.put('/:id/confirm', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);

  const order = await prisma.inboundOrder.findUnique({
    where: { id },
    include: { items: true },
  });
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

  // 使用事务：更新库存 + 记录流水 + 更新单状态
  await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      // 先查变动前全库位总量
      const totalBefore = (await tx.inventory.aggregate({
        where: { productId: item.productId, warehouseId: order.warehouseId },
        _sum: { quantity: true },
      }))._sum.quantity || 0;

      const locId = (item as any).locationId ?? order.locationId ?? null;
      await tx.inventory.upsert({
        where: {
          productId_warehouseId_locationId: {
            productId: item.productId,
            warehouseId: order.warehouseId,
            locationId: locId,
          },
        },
        create: {
          productId: item.productId,
          warehouseId: order.warehouseId,
          locationId: locId,
          quantity: item.quantity,
        },
        update: { quantity: { increment: item.quantity } },
      });

      await tx.stockLog.create({
        data: {
          productId: item.productId,
          warehouseId: order.warehouseId,
          changeQty: item.quantity,
          beforeQty: totalBefore,
          afterQty: totalBefore + item.quantity,
          type: 'inbound',
          refId: order.id,
        },
      });

      // 关联合同：增量更新已入库数量
      if ((item as any).contractId) {
        const ci = await tx.contractItem.findUnique({
          where: { contractId_productId: { contractId: (item as any).contractId, productId: item.productId } },
        });
        if (ci) {
          const newReceived = ci.receivedQty + item.quantity;
          await tx.contractItem.update({
            where: { id: ci.id },
            data: { receivedQty: newReceived },
          });
          // 超量预警：received > planned
          if (newReceived > ci.plannedQty) {
            console.log(`[合同预警] ${ci.productId} 已入库 ${newReceived}/${ci.plannedQty}`);
          }

          // 检查合同是否全部完成
          const allItems = await tx.contractItem.findMany({ where: { contractId: ci.contractId } });
          if (allItems.length > 0 && allItems.every(it => it.receivedQty >= it.plannedQty)) {
            await tx.contract.update({ where: { id: ci.contractId }, data: { status: 'completed' } });
          }
        }
      }
    }

    await tx.inboundOrder.update({ where: { id }, data: { status: 'confirmed' } });
  });

  const updated = await prisma.inboundOrder.findUnique({
    where: { id },
    include: { warehouse: true, items: { include: { product: { include: { category: { include: { parent: { include: { parent: true } } } } } }, location: true, contract: { select: { id: true, contractNo: true } } } } },
  });
  res.json(updated);
});

// 删除入库单（仅草稿）
inboundRouter.delete('/:id', validateId, adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const order = await prisma.inboundOrder.findUnique({ where: { id } });
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
    await tx.inboundItem.deleteMany({ where: { inboundId: id } });
    await tx.inboundOrder.delete({ where: { id } });
  });
  res.json({ message: '已删除' });
});

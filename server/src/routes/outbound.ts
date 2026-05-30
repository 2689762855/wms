import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate, adminWrite, validateId } from '../middleware/auth';
import { nextOrderNo } from '../utils/sequence';

export const outboundRouter = Router();
outboundRouter.use(authenticate);

outboundRouter.get('/', async (req: AuthRequest, res: Response) => {
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
    prisma.outboundOrder.findMany({
      where,
      include: { warehouse: true, container: { select: { id: true, containerNo: true, status: true } }, items: { include: { product: { include: { category: { include: { parent: { include: { parent: true } } } } } }, location: true } } },
      skip: (page - 1) * pageSize, take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.outboundOrder.count({ where }),
  ]);
  res.json({ data, total, page, pageSize });
});

outboundRouter.get('/:id', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const order = await prisma.outboundOrder.findUnique({
    where: { id },
    include: { warehouse: true, container: { select: { id: true, containerNo: true, status: true } }, items: { include: { product: { include: { category: { include: { parent: { include: { parent: true } } } } } }, location: true, contract: { select: { id: true, contractNo: true, items: { include: { product: { select: { id: true } } } } } } } } },
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
  const { warehouseId, receiver, note, items, locationId, containerId } = req.body;
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
    include: { items: { include: { product: { include: { category: { include: { parent: { include: { parent: true } } } } } }, location: true } } },
  });
  res.status(201).json(order);
});

outboundRouter.put('/:id/confirm', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
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

  await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      const locId = item.locationId ?? order.locationId ?? null;
      const batchNo = item.batchNo ?? undefined;
      const inv = await tx.inventory.findFirst({
        where: {
          productId: item.productId,
          warehouseId: order.warehouseId,
          locationId: locId,
          ...(batchNo ? { batchNo } : {}),
        },
        orderBy: batchNo ? undefined : { batchNo: 'asc' as const },
      });
      if (!inv || inv.quantity < item.quantity) {
        throw new Error(`库存不足: productId=${item.productId}, 当前库存=${inv?.quantity || 0}, 出库=${item.quantity}`);
      }

      // 批次锁定：合同的商品被货柜关联了 → 锁定，未关联货柜 → 不锁
      if (inv.batchNo) {
        const batchInbound = await tx.inboundItem.findFirst({
          where: { batchNo: inv.batchNo, contractId: { not: null } },
          select: { contractId: true },
        });
        if (batchInbound) {
          const outboundContractId = item.contractId || null;
          if (batchInbound.contractId !== outboundContractId) {
            // 检查该合同是否有关联的货柜（通过出库单）
            const hasContainer = await tx.container.findFirst({
              where: {
                outbounds: { some: { items: { some: { contractId: batchInbound.contractId } } } },
              },
            });
            if (hasContainer) {
              throw new Error(`批次 ${inv.batchNo} 属于合同 #${batchInbound.contractId}（已被货柜关联），不能用于合同 #${outboundContractId || '无'}`);
            }
          }
        }
      }

      // 先查变动前全库位总量
      const totalBefore = (await tx.inventory.aggregate({
        where: { productId: item.productId, warehouseId: order.warehouseId },
        _sum: { quantity: true },
      }))._sum.quantity || 0;

      await tx.inventory.update({
        where: { id: inv.id },
        data: { quantity: { decrement: item.quantity } },
      });

      await tx.stockLog.create({
        data: {
          productId: item.productId,
          warehouseId: order.warehouseId,
          changeQty: -item.quantity,
          beforeQty: totalBefore,
          afterQty: totalBefore - item.quantity,
          type: 'outbound',
          refId: order.id,
        },
      });
    }

    await tx.outboundOrder.update({ where: { id }, data: { status: 'confirmed' } });

    // 如果关联了货柜，自动填入货柜明细
    if (order.containerId) {
      const container = await tx.container.findUnique({ where: { id: order.containerId } });
      if (container && (container.status === 'pending' || container.status === 'loading')) {
        for (const item of order.items) {
          await tx.containerItem.create({
            data: {
              containerId: order.containerId,
              outboundId: id,
              productId: item.productId,
              plannedQty: item.quantity,
              actualQty: item.quantity,
              returnedQty: 0,
              locationId: item.locationId ?? null,
              batchNo: item.batchNo ?? null,
            },
          });
        }
        if (container.status === 'pending') {
          await tx.container.update({ where: { id: order.containerId }, data: { status: 'loading' } });
        }
      }
    }
  });

  // 检查关联合同是否全部出完（按 shippedQty 判完成）
  const contractIds = [...new Set(order.items.map(i => i.contractId).filter(Boolean))] as number[];
  for (const cid of contractIds) {
    const contract = await prisma.contract.findUnique({ where: { id: cid }, include: { items: true } });
    if (!contract || contract.status === 'completed') continue;
    // 计算每个商品的已出数量
    const outboundItems = await prisma.outboundItem.findMany({ where: { contractId: cid } });
    const shippedMap = new Map<number, number>();
    for (const oi of outboundItems) {
      shippedMap.set(oi.productId, (shippedMap.get(oi.productId) || 0) + oi.quantity);
    }
    const allShipped = contract.items.every(ci => (shippedMap.get(ci.productId) || 0) >= ci.plannedQty);
    if (allShipped) {
      await prisma.contract.update({ where: { id: cid }, data: { status: 'completed' } });
    }
  }

  const updated = await prisma.outboundOrder.findUnique({
    where: { id },
    include: { warehouse: true, container: { select: { id: true, containerNo: true, status: true } }, items: { include: { product: { include: { category: { include: { parent: { include: { parent: true } } } } } }, location: true } } },
  });
  res.json(updated);
});

// 删除出库单（仅草稿）
outboundRouter.delete('/:id', validateId, adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
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

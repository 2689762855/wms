import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate, adminWrite } from '../middleware/auth';
import { nextOrderNo } from '../utils/sequence';

export const inboundRouter = Router();
inboundRouter.use(authenticate);

// 入库单列表
inboundRouter.get('/', async (req: AuthRequest, res: Response) => {
  const page = parseInt((req.query.page as string) || '1');
  const pageSize = Math.min(parseInt((req.query.pageSize as string) || '20'), 100);
  const where: Record<string, unknown> = {};
  if (req.userRole !== 'super_admin' && req.userWarehouseId) {
    where.warehouseId = req.userWarehouseId;
  }
  const [data, total] = await Promise.all([
    prisma.inboundOrder.findMany({
      where,
      include: { warehouse: true, items: { include: { product: { include: { category: { include: { parent: { include: { parent: true } } } } } }, location: true } } },
      skip: (page - 1) * pageSize, take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.inboundOrder.count({ where }),
  ]);
  res.json({ data, total, page, pageSize });
});

// 入库单详情
inboundRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const order = await prisma.inboundOrder.findUnique({
    where: { id },
    include: { warehouse: true, items: { include: { product: { include: { category: { include: { parent: { include: { parent: true } } } } } }, location: true } } },
  });
  if (!order) return res.status(404).json({ error: '不存在' });
  if (req.userRole !== 'super_admin' && req.userWarehouseId && order.warehouseId !== req.userWarehouseId) {
    return res.status(403).json({ error: '无权查看此仓库的单据' });
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
  if (req.userRole !== 'super_admin' && req.userWarehouseId && warehouseId !== req.userWarehouseId) {
    return res.status(403).json({ error: '无权操作此仓库' });
  }

  // 生成单号（原子序号，防并发重复）
  const orderNo = await nextOrderNo('IN');

  const order = await prisma.inboundOrder.create({
    data: {
      orderNo,
      warehouseId,
      supplier,
      note,
      operatorId: req.userId,
      locationId: locationId || null,
      items: {
        create: items.map((i: { productId: number; quantity: number; unitPrice?: number; locationId?: number | null }) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          locationId: i.locationId ?? null,
        })),
      },
    },
    include: { items: { include: { product: { include: { category: { include: { parent: { include: { parent: true } } } } } }, location: true } } },
  });
  res.status(201).json(order);
});

// 确认入库（更新库存）
inboundRouter.put('/:id/confirm', async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);

  const order = await prisma.inboundOrder.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!order) return res.status(404).json({ error: '不存在' });
  if (order.status === 'confirmed') return res.status(400).json({ error: '已确认' });
  if (req.userRole !== 'super_admin' && req.userWarehouseId && order.warehouseId !== req.userWarehouseId) {
    return res.status(403).json({ error: '无权操作此仓库的单据' });
  }

  // 使用事务：更新库存 + 记录流水 + 更新单状态
  await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      const locId = (item as any).locationId ?? order.locationId ?? null;
      const inv = await tx.inventory.upsert({
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
          beforeQty: inv.quantity - item.quantity,
          afterQty: inv.quantity,
          type: 'inbound',
          refId: order.id,
        },
      });
    }

    await tx.inboundOrder.update({ where: { id }, data: { status: 'confirmed' } });
  });

  const updated = await prisma.inboundOrder.findUnique({
    where: { id },
    include: { warehouse: true, items: { include: { product: { include: { category: { include: { parent: { include: { parent: true } } } } } }, location: true } } },
  });
  res.json(updated);
});

// 删除入库单（仅草稿）
inboundRouter.delete('/:id', adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const order = await prisma.inboundOrder.findUnique({ where: { id } });
  if (!order) return res.status(404).json({ error: '不存在' });
  if (order.status !== 'draft') return res.status(400).json({ error: '已确认的单据不可删除' });
  if (req.userRole !== 'super_admin' && req.userWarehouseId && order.warehouseId !== req.userWarehouseId) {
    return res.status(403).json({ error: '无权删除此仓库的单据' });
  }
  await prisma.$transaction(async (tx) => {
    await tx.inboundItem.deleteMany({ where: { inboundId: id } });
    await tx.inboundOrder.delete({ where: { id } });
  });
  res.json({ message: '已删除' });
});

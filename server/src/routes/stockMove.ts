import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate, adminWrite } from '../middleware/auth';

export const stockMoveRouter = Router();
stockMoveRouter.use(authenticate);

interface MoveItem {
  productId: number;
  quantity: number;
}

// 库位库存转移
stockMoveRouter.post('/', adminWrite, async (req: AuthRequest, res: Response) => {
  const { fromLocationId, toLocationId, items } = req.body as {
    fromLocationId: number;
    toLocationId: number;
    items: MoveItem[];
  };

  if (!fromLocationId || !toLocationId) {
    return res.status(400).json({ error: '请指定源库位和目标库位' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: '请选择要转移的商品' });
  }
  if (items.some((i) => !i.productId || i.quantity <= 0)) {
    return res.status(400).json({ error: '商品数量必须大于 0' });
  }

  // 验证库位属于同一仓库
  const [fromLoc, toLoc] = await Promise.all([
    prisma.location.findUnique({ where: { id: fromLocationId } }),
    prisma.location.findUnique({ where: { id: toLocationId } }),
  ]);

  if (!fromLoc || !toLoc) {
    return res.status(404).json({ error: '库位不存在' });
  }
  if (fromLoc.warehouseId !== toLoc.warehouseId) {
    return res.status(400).json({ error: '只能在同一仓库内转移' });
  }
  if (fromLocationId === toLocationId) {
    return res.status(400).json({ error: '源库位和目标库位不能相同' });
  }

  const warehouseId = fromLoc.warehouseId;

  try {
    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        // 查找源库位库存
        const fromInv = await tx.inventory.findUnique({
          where: {
            productId_warehouseId_locationId: {
              productId: item.productId,
              warehouseId,
              locationId: fromLocationId,
            },
          },
        });

        if (!fromInv || fromInv.quantity < item.quantity) {
          throw new Error(
            `商品 #${item.productId} 库存不足 (需要 ${item.quantity}, 可用 ${fromInv?.quantity || 0})`,
          );
        }

        const fromBeforeQty = fromInv.quantity;

        // 源库位减库存（原子操作）
        await tx.inventory.update({
          where: { id: fromInv.id },
          data: { quantity: { decrement: item.quantity } },
        });

        // 目标库位增库存 (upsert，原子操作)
        const toInv = await tx.inventory.upsert({
          where: {
            productId_warehouseId_locationId: {
              productId: item.productId,
              warehouseId,
              locationId: toLocationId,
            },
          },
          update: { quantity: { increment: item.quantity } },
          create: {
            productId: item.productId,
            warehouseId,
            locationId: toLocationId,
            quantity: item.quantity,
          },
        });

        const toBeforeQty = toInv.quantity - item.quantity;

        // 记录日志
        await tx.stockLog.createMany({
          data: [
            {
              productId: item.productId,
              warehouseId,
              changeQty: -item.quantity,
              beforeQty: fromBeforeQty,
              afterQty: fromBeforeQty - item.quantity,
              type: 'location_move_out',
            },
            {
              productId: item.productId,
              warehouseId,
              changeQty: item.quantity,
              beforeQty: toBeforeQty,
              afterQty: toBeforeQty + item.quantity,
              type: 'location_move_in',
            },
          ],
        });
      }
    });

    res.json({ message: '转移成功' });
  } catch (err: any) {
    if (err.message?.includes('库存不足')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('Stock move error:', err);
    res.status(500).json({ error: '转移失败' });
  }
});

// 给无库位库存分配库位
stockMoveRouter.post('/assign-location', adminWrite, async (req: AuthRequest, res: Response) => {
  const { inventoryId, toLocationId } = req.body;
  if (!inventoryId || !toLocationId) {
    return res.status(400).json({ error: '请指定库存记录和目标库位' });
  }

  const inv = await prisma.inventory.findUnique({
    where: { id: inventoryId },
    include: { product: true },
  });
  if (!inv) return res.status(404).json({ error: '库存记录不存在' });
  if (inv.locationId !== null) return res.status(400).json({ error: '该库存已有库位' });

  const toLoc = await prisma.location.findUnique({ where: { id: toLocationId } });
  if (!toLoc || toLoc.warehouseId !== inv.warehouseId) {
    return res.status(400).json({ error: '目标库位不属于同一仓库' });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 目标库位已有同商品库存则合并
      const existing = await tx.inventory.findFirst({
        where: { productId: inv.productId, warehouseId: inv.warehouseId, locationId: toLocationId },
      });
      if (existing) {
        await tx.inventory.update({ where: { id: existing.id }, data: { quantity: { increment: inv.quantity } } });
        await tx.inventory.delete({ where: { id: inv.id } });
        await tx.stockLog.create({
          data: { productId: inv.productId, warehouseId: inv.warehouseId, changeQty: inv.quantity, beforeQty: existing.quantity, afterQty: existing.quantity + inv.quantity, type: 'assign_location', refId: inv.id },
        });
      } else {
        await tx.inventory.update({ where: { id: inv.id }, data: { locationId: toLocationId } });
      }
    });
    res.json({ message: '已分配库位' });
  } catch (err: any) {
    console.error('Assign location error:', err);
    res.status(500).json({ error: '分配失败' });
  }
});

export default stockMoveRouter;

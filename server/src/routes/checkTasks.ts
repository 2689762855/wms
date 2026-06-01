import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate, adminWrite, validateId } from '../middleware/auth';

export const checkTasksRouter = Router();
checkTasksRouter.use(authenticate);

// 盘点任务列表（只返回主任务，子任务通过详情查看）
checkTasksRouter.get('/', async (req: AuthRequest, res: Response) => {
  const where: Record<string, unknown> = { parentTaskId: null };
  if (req.userRole !== 'super_admin') {
    if (req.userRole === 'tenant_admin' && req.customerId) {
      const whs = await prisma.warehouse.findMany({ where: { customerId: req.customerId }, select: { id: true } });
      where.warehouseId = { in: whs.map(w => w.id) };
    } else if (req.userWarehouseId) {
      where.warehouseId = req.userWarehouseId;
    }
  }
  const list = await prisma.checkTask.findMany({
    where,
    include: {
      warehouse: true,
      operator: { select: { id: true, realName: true } },
      subTasks: { select: { id: true, status: true, reviewNote: true, location: { select: { name: true } }, items: { select: { diffQty: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(list);
});

// 子任务列表（移动端用，只显示未最终确认的主任务下的子任务）
checkTasksRouter.get('/sub', async (req: AuthRequest, res: Response) => {
  const parentId = req.query.parentId ? parseInt(req.query.parentId as string) : undefined;
  const where: Record<string, unknown> = {
    parentTaskId: { not: null },
    parentTask: { status: { not: 'completed' } },
  };
  if (parentId) where.parentTaskId = parentId;
  if (req.userRole !== 'super_admin') {
    if (req.userRole === 'tenant_admin' && req.customerId) {
      const whs = await prisma.warehouse.findMany({ where: { customerId: req.customerId }, select: { id: true } });
      where.warehouseId = { in: whs.map(w => w.id) };
    } else if (req.userWarehouseId) {
      where.warehouseId = req.userWarehouseId;
    }
  }
  const list = await prisma.checkTask.findMany({
    where,
    include: {
      warehouse: true,
      location: true,
      items: { include: { product: true } },
      operator: { select: { id: true, realName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(list);
});

// 盘点任务/子任务详情
checkTasksRouter.get('/:id', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const task = await prisma.checkTask.findUnique({
    where: { id },
    include: {
      warehouse: true,
      location: true,
      items: { include: { product: true } },
      operator: { select: { id: true, realName: true } },
      subTasks: {
        include: {
          location: { select: { id: true, name: true, code: true } },
          items: { select: { diffQty: true } },
        },
        orderBy: { id: 'asc' },
      },
    },
  });
  if (!task) return res.status(404).json({ error: '不存在' });
  // 操作员/仓管只能看自己仓库的盘点
  if (req.customerId && task.warehouse) {
    const wh = await prisma.warehouse.findUnique({ where: { id: task.warehouseId }, select: { customerId: true } });
    if (!wh || wh.customerId !== req.customerId) return res.status(403).json({ error: '无权访问' });
  }

  // 如果是主任务，为每个子任务补充完整 item 信息
  if (!task.parentTaskId && task.subTasks) {
    const subIds = task.subTasks.map(s => s.id);
    const fullSubs = await prisma.checkTask.findMany({
      where: { id: { in: subIds } },
      include: { items: { include: { product: true } }, location: { select: { id: true, name: true, code: true } } },
    });
    const fullMap = new Map(fullSubs.map(s => [s.id, s]));
    (task as any).subTasks = task.subTasks.map(s => fullMap.get(s.id) || s);
  }

  res.json(task);
});

// 创建主盘点任务（自动按库位拆分子任务）
checkTasksRouter.post('/', async (req: AuthRequest, res: Response) => {
  const { warehouseId, note } = req.body;
  if (!warehouseId) return res.status(400).json({ error: '仓库必选' });
  if (note && note.length > 1000) return res.status(400).json({ error: '备注不能超过 1000 字符' });
  if (req.userRole !== 'super_admin') {
    if (req.userRole === 'tenant_admin' && req.customerId) {
      const wh = await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { customerId: true } });
      if (!wh || wh.customerId !== req.customerId) return res.status(403).json({ error: '无权操作此仓库' });
    } else if (req.userWarehouseId && warehouseId !== req.userWarehouseId) {
      return res.status(403).json({ error: '无权操作此仓库' });
    }
  }

  const inventories = await prisma.inventory.findMany({
    where: { warehouseId, quantity: { gt: 0 } },
    include: { product: true },
  });

  if (!inventories.length) return res.status(400).json({ error: '该仓库暂无库存' });

  // 按 locationId 分组
  const groups = new Map<string, typeof inventories>();
  for (const inv of inventories) {
    const key = inv.locationId != null ? `loc-${inv.locationId}` : 'no-loc';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(inv);
  }

  const task = await prisma.$transaction(async (tx) => {
    // 创建主任务
    const master = await tx.checkTask.create({
      data: { warehouseId, note, ...(req.userRole !== 'tenant_admin' ? { operatorId: req.userId } : {}), status: 'in_progress' },
    });

    // 为每个库位创建子任务
    for (const [key, items] of groups) {
      const locationId = key.startsWith('loc-') ? parseInt(key.replace('loc-', '')) : null;
      await tx.checkTask.create({
        data: {
          warehouseId,
          locationId,
          parentTaskId: master.id,
          ...(req.userRole !== 'tenant_admin' ? { operatorId: req.userId } : {}),
          items: {
            create: items.map(inv => ({ productId: inv.productId, systemQty: inv.quantity })),
          },
        },
      });
    }
    return master;
  });

  const result = await prisma.checkTask.findUnique({
    where: { id: task.id },
    include: {
      subTasks: {
        include: {
          location: { select: { id: true, name: true, code: true } },
          items: { select: { diffQty: true } },
        },
        orderBy: { id: 'asc' },
      },
    },
  });
  res.status(201).json(result);
});

// 子任务提交盘点结果
checkTasksRouter.put('/:id/submit', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const { items } = req.body;

  const task = await prisma.checkTask.findUnique({ where: { id } });
  if (!task) return res.status(404).json({ error: '不存在' });
  // 操作员/仓管只能提交自己仓库的盘点
  if (req.customerId) {
    const wh = await prisma.warehouse.findUnique({ where: { id: task.warehouseId }, select: { customerId: true } });
    if (!wh || wh.customerId !== req.customerId) return res.status(403).json({ error: '无权操作此仓库' });
  }

  let hasDiff = false;
  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      const checkItem = await tx.checkItem.findUnique({ where: { id: item.id } });
      if (!checkItem) continue;
      const actualQty = typeof item.actualQty === 'number' ? item.actualQty : 0;
      const diffQty = actualQty - checkItem.systemQty;
      if (diffQty !== 0) hasDiff = true;
      await tx.checkItem.update({ where: { id: item.id }, data: { actualQty, diffQty } });
    }
    await tx.checkTask.update({
      where: { id },
      data: { status: hasDiff ? 'anomaly' : 'completed' },
    });

    // 更新主任务状态（在同一个事务内避免竞态）
    if (task.parentTaskId) {
      const siblings = await tx.checkTask.findMany({
        where: { parentTaskId: task.parentTaskId },
        select: { status: true },
      });
      const allDone = siblings.every(s => s.status === 'completed');
      const anyAnomaly = siblings.some(s => s.status === 'anomaly');
      if (allDone) {
        await tx.checkTask.update({ where: { id: task.parentTaskId }, data: { status: 'in_progress' } });
      } else if (anyAnomaly) {
        await tx.checkTask.update({ where: { id: task.parentTaskId }, data: { status: 'anomaly' } });
      }
    }
  });

  const updated = await prisma.checkTask.findUnique({
    where: { id },
    include: { items: { include: { product: true } } },
  });
  res.json(updated);
});

// 解决异常：确认调整或驳回重盘（仅管理员）
checkTasksRouter.put('/:id/resolve', validateId, adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const { action } = req.body;
  if (!['confirm', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'action 必须是 confirm 或 reject' });
  }

  const task = await prisma.checkTask.findUnique({ where: { id }, include: { items: true } });
  if (!task) return res.status(404).json({ error: '不存在' });
  if (task.status !== 'anomaly') return res.status(400).json({ error: '只能处理异常状态的盘点任务' });
  if (req.userRole !== 'super_admin') {
    if (req.userRole === 'tenant_admin' && req.customerId) {
      const wh = await prisma.warehouse.findUnique({ where: { id: task.warehouseId }, select: { customerId: true } });
      if (!wh || wh.customerId !== req.customerId) return res.status(403).json({ error: '无权处理此仓库的异常' });
    } else if (req.userRole === 'warehouse_admin' && req.userWarehouseId && task.warehouseId !== req.userWarehouseId) {
      return res.status(403).json({ error: '无权处理此仓库的异常' });
    }
  }

  if (action === 'reject') {
    await prisma.$transaction(async (tx) => {
      for (const item of task.items) {
        if (item.diffQty && item.diffQty !== 0) {
          await tx.checkItem.update({ where: { id: item.id }, data: { actualQty: null, diffQty: null } });
        }
      }
      await tx.checkTask.update({ where: { id }, data: { status: 'in_progress' } });
      // 主任务也回到进行中
      if (task.parentTaskId) {
        await tx.checkTask.update({ where: { id: task.parentTaskId }, data: { status: 'in_progress' } });
      }
    });
  } else {
    const reviewNote = req.body.note || null;
    await prisma.$transaction(async (tx) => {
      for (const item of task.items) {
        if (!item.diffQty || item.diffQty === 0) continue;
        const inv = await tx.inventory.findFirst({
          where: { productId: item.productId, warehouseId: task.warehouseId, locationId: task.locationId ?? null, batchNo: null },
        });
        const totalBefore = (await tx.inventory.aggregate({
          where: { productId: item.productId, warehouseId: task.warehouseId },
          _sum: { quantity: true },
        }))._sum.quantity || 0;
        const afterQty = totalBefore + item.diffQty;
        if (inv) {
          await tx.inventory.update({ where: { id: inv.id }, data: { quantity: { increment: item.diffQty } } });
        } else if (item.diffQty > 0) {
          await tx.inventory.create({ data: { productId: item.productId, warehouseId: task.warehouseId, locationId: task.locationId, quantity: item.diffQty } });
        } else if (item.diffQty < 0) {
          throw new Error(`库存记录不存在，无法扣减: productId=${item.productId}`);
        }
        await tx.stockLog.create({ data: { productId: item.productId, warehouseId: task.warehouseId, changeQty: item.diffQty, beforeQty: totalBefore, afterQty, type: 'check_adjust', refId: task.id } });
      }
      await tx.checkTask.update({ where: { id }, data: { status: 'completed', reviewNote } });
      // 检查主任务状态
      if (task.parentTaskId) {
        const siblings = await tx.checkTask.findMany({ where: { parentTaskId: task.parentTaskId }, select: { status: true } });
        const allDone = siblings.every(s => s.status === 'completed');
        const anyAnomaly = siblings.some(s => s.status === 'anomaly');
        await tx.checkTask.update({
          where: { id: task.parentTaskId },
          data: { status: anyAnomaly ? 'anomaly' : 'in_progress' },
        });
      }
    });
  }

  const updated = await prisma.checkTask.findUnique({
    where: { id },
    include: { items: { include: { product: true } } },
  });
  res.json(updated);
});

// 重开已完成的盘点子任务
checkTasksRouter.put('/:id/reopen', validateId, adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const task = await prisma.checkTask.findUnique({ where: { id }, include: { items: true } });
  if (!task) return res.status(404).json({ error: '不存在' });
  if (task.status !== 'completed') return res.status(400).json({ error: '只能重开已完成的盘点任务' });
  if (task.parentTaskId) {
    const parent = await prisma.checkTask.findUnique({ where: { id: task.parentTaskId } });
    if (parent?.status === 'completed') return res.status(400).json({ error: '主任务已最终确定，无法重开' });
  }
  if (req.userRole !== 'super_admin') {
    if (req.userRole === 'tenant_admin' && req.customerId) {
      const wh = await prisma.warehouse.findUnique({ where: { id: task.warehouseId }, select: { customerId: true } });
      if (!wh || wh.customerId !== req.customerId) return res.status(403).json({ error: '无权操作此仓库' });
    } else if (req.userRole === 'warehouse_admin' && req.userWarehouseId && task.warehouseId !== req.userWarehouseId) {
      return res.status(403).json({ error: '无权操作此仓库' });
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const item of task.items) {
      // 回滚盘点时对库存的调整
      if (item.diffQty && item.diffQty !== 0) {
        const inv = await tx.inventory.findFirst({
          where: { productId: item.productId, warehouseId: task.warehouseId, locationId: task.locationId ?? null, batchNo: null },
        });
        if (inv) {
          const beforeQty = (await tx.inventory.aggregate({
            where: { productId: item.productId, warehouseId: task.warehouseId },
            _sum: { quantity: true },
          }))._sum.quantity || 0;
          const afterQty = beforeQty - item.diffQty;
          await tx.inventory.update({ where: { id: inv.id }, data: { quantity: { decrement: item.diffQty } } });
          await tx.stockLog.create({ data: { productId: item.productId, warehouseId: task.warehouseId, changeQty: -item.diffQty, beforeQty, afterQty, type: 'check_reopen', refId: task.id } });
        }
      }
      await tx.checkItem.update({ where: { id: item.id }, data: { actualQty: null, diffQty: null } });
    }
    await tx.checkTask.update({ where: { id }, data: { status: 'in_progress' } });
    if (task.parentTaskId) {
      await tx.checkTask.update({ where: { id: task.parentTaskId }, data: { status: 'in_progress' } });
    }
  });

  const updated = await prisma.checkTask.findUnique({ where: { id }, include: { items: { include: { product: true } } } });
  res.json(updated);
});

// 最终确定主任务（所有子任务完成后，管理员确认锁定）
checkTasksRouter.put('/:id/finalize', validateId, adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const task = await prisma.checkTask.findUnique({
    where: { id },
    include: { subTasks: { select: { id: true, status: true } } },
  });
  if (!task) return res.status(404).json({ error: '不存在' });
  if (task.parentTaskId) return res.status(400).json({ error: '只能最终确定主任务' });
  if (task.status === 'completed') return res.status(400).json({ error: '已最终确定' });
  if (req.userRole !== 'super_admin') {
    if (req.userRole === 'tenant_admin' && req.customerId) {
      const wh = await prisma.warehouse.findUnique({ where: { id: task.warehouseId }, select: { customerId: true } });
      if (!wh || wh.customerId !== req.customerId) return res.status(403).json({ error: '无权操作此仓库' });
    } else if (req.userRole === 'warehouse_admin' && req.userWarehouseId && task.warehouseId !== req.userWarehouseId) {
      return res.status(403).json({ error: '无权操作此仓库' });
    }
  }

  const allDone = task.subTasks.every(s => s.status === 'completed');
  if (!allDone) return res.status(400).json({ error: '所有库位子任务必须全部完成才能最终确定' });

  // 标记主任务为已完成（锁定），子任务保持不变以便查看
  await prisma.checkTask.update({ where: { id }, data: { status: 'completed' } });

  res.json({ message: '盘点已最终确定' });
});

// 取消/删除主任务（级联删除所有子任务）
checkTasksRouter.delete('/:id', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const task = await prisma.checkTask.findUnique({ where: { id }, include: { subTasks: { select: { id: true } } } });
  if (!task) return res.status(404).json({ error: '不存在' });
  if (task.status !== 'in_progress') return res.status(400).json({ error: '只能取消进行中的盘点任务' });

  if (req.userRole !== 'super_admin') {
    if (req.userRole === 'tenant_admin' && req.customerId) {
      const wh = await prisma.warehouse.findUnique({ where: { id: task.warehouseId }, select: { customerId: true } });
      if (!wh || wh.customerId !== req.customerId) return res.status(403).json({ error: '无权操作此仓库' });
    } else if (req.userRole === 'warehouse_admin' && req.userWarehouseId && task.warehouseId !== req.userWarehouseId) {
      return res.status(403).json({ error: '无权操作此仓库' });
    } else if (req.userRole === 'operator' && task.operatorId !== req.userId) {
      return res.status(403).json({ error: '只能取消自己创建的盘点任务' });
    }
  }

  await prisma.$transaction(async (tx) => {
    // 如果有子任务，先删子任务的 items，再删子任务
    for (const sub of (task.subTasks || [])) {
      await tx.checkItem.deleteMany({ where: { taskId: sub.id } });
      await tx.checkTask.delete({ where: { id: sub.id } });
    }
    await tx.checkItem.deleteMany({ where: { taskId: id } });
    await tx.checkTask.delete({ where: { id } });
  });

  res.json({ message: '已取消' });
});

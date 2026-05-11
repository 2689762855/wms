import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate, adminWrite } from '../middleware/auth';

export const customersRouter = Router();
customersRouter.use(authenticate);

// 客户列表
customersRouter.get('/', async (_req: AuthRequest, res: Response) => {
  const customers = await prisma.customer.findMany({
    select: { id: true, username: true, realName: true, warehouseId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(customers);
});

// 创建客户
customersRouter.post('/', adminWrite, async (req: AuthRequest, res: Response) => {
  const { username, password, realName, warehouseId } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: '密码至少8位' });
  }

  const existing = await prisma.customer.findUnique({ where: { username } });
  if (existing) {
    return res.status(400).json({ error: '用户名已存在' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const customer = await prisma.customer.create({
    data: {
      username,
      passwordHash,
      realName: realName || null,
      // warehouse_admin 只能给客户分配自己所在的仓库
      warehouseId: req.userRole === 'warehouse_admin' ? req.userWarehouseId : (warehouseId || null),
      createdBy: req.userId,
    },
  });

  const { passwordHash: _, ...safe } = customer;
  res.status(201).json(safe);
});

// 删除客户
customersRouter.delete('/:id', adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: '无效的 ID' });
  try {
    await prisma.customer.delete({ where: { id } });
    res.json({ message: '已删除' });
  } catch (err: any) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: '客户不存在' });
    }
    res.status(500).json({ error: '删除失败' });
  }
});

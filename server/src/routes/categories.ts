import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate, adminWrite } from '../middleware/auth';

export const categoriesRouter = Router();
categoriesRouter.use(authenticate);
categoriesRouter.use(adminWrite);

// 获取所有分类（平铺列表，前端构建树）
categoriesRouter.get('/', async (_req: AuthRequest, res: Response) => {
  const list = await prisma.category.findMany({ orderBy: { name: 'asc' } });
  res.json(list);
});

categoriesRouter.post('/', async (req: AuthRequest, res: Response) => {
  const { name, parentId } = req.body;
  if (!name) return res.status(400).json({ error: '分类名称必填' });
  if (name.length > 100) return res.status(400).json({ error: '分类名称不能超过 100 字符' });
  const category = await prisma.category.create({ data: { name, parentId: parentId || null } });
  res.status(201).json(category);
});

categoriesRouter.put('/:id', async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const { name, parentId } = req.body;
  if (name && name.length > 100) return res.status(400).json({ error: '分类名称不能超过 100 字符' });

  // 检测循环引用：新父级不能是自己或自己的后代
  if (parentId) {
    if (parentId === id) return res.status(400).json({ error: '不能将分类设为自己的子分类' });
    let current = parentId;
    while (current) {
      if (current === id) return res.status(400).json({ error: '不能形成循环引用' });
      const parent = await prisma.category.findUnique({ where: { id: current }, select: { parentId: true } });
      if (!parent) break;
      current = parent.parentId!;
    }
  }

  const category = await prisma.category.update({ where: { id }, data: { name, parentId } });
  res.json(category);
});

categoriesRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const children = await prisma.category.count({ where: { parentId: id } });
  if (children > 0) return res.status(400).json({ error: '请先删除子分类' });
  await prisma.category.delete({ where: { id } });
  res.json({ message: '已删除' });
});

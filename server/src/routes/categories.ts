import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate, adminWrite, validateId } from '../middleware/auth';

export const categoriesRouter = Router();
categoriesRouter.use(authenticate);
categoriesRouter.use(adminWrite);

// 获取所有分类（平铺列表，前端构建树）
categoriesRouter.get('/', async (req: AuthRequest, res: Response) => {
  const where: Record<string, unknown> = {};
  if (req.customerId) {
    where.customerId = req.customerId;
  }
  const list = await prisma.category.findMany({ where, orderBy: { name: 'asc' } });
  res.json(list);
});

categoriesRouter.post('/', async (req: AuthRequest, res: Response) => {
  const { name, parentId } = req.body;
  if (!name) return res.status(400).json({ error: '分类名称必填' });
  if (name.length > 100) return res.status(400).json({ error: '分类名称不能超过 100 字符' });
  const category = await prisma.category.create({
    data: { name, parentId: parentId || null, customerId: req.customerId || null },
  });
  res.status(201).json(category);
});

categoriesRouter.put('/:id', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ "error": "无效ID" });
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: '分类不存在' });
  if (req.customerId && existing.customerId !== req.customerId) {
    return res.status(403).json({ error: '无权操作此分类' });
  }

  const { name, parentId } = req.body;
  if (name && name.length > 100) return res.status(400).json({ error: '分类名称不能超过 100 字符' });

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

categoriesRouter.delete('/:id', validateId, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ "error": "无效ID" });
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: '分类不存在' });
    if (req.customerId && existing.customerId !== req.customerId) {
      return res.status(403).json({ error: '无权操作此分类' });
    }
    const [children, products] = await Promise.all([
      prisma.category.count({ where: { parentId: id } }),
      prisma.product.count({ where: { categoryId: id } }),
    ]);
    if (children > 0) return res.status(400).json({ error: `无法删除：该分类下有 ${children} 个子分类，请先删除子分类` });
    if (products > 0) return res.status(400).json({ error: `无法删除：该分类下有 ${products} 个商品，请先移动或删除商品` });
    await prisma.category.delete({ where: { id } });
    res.json({ message: '已删除' });
  } catch (e: any) {
    if (e.code === 'P2003') return res.status(400).json({ error: '无法删除：该分类被其他数据引用' });
    console.error('Delete category error:', e);
    res.status(500).json({ error: '删除失败' });
  }
});

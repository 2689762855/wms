import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate, adminWrite, validateId } from '../middleware/auth';

export const suppliersRouter = Router();
suppliersRouter.use(authenticate);

// 列表
suppliersRouter.get('/', async (req: AuthRequest, res: Response) => {
  const list = await prisma.supplier.findMany({
    where: { customerId: req.customerId },
    orderBy: { name: 'asc' },
  });
  res.json(list);
});

// 新增
suppliersRouter.post('/', adminWrite, async (req: AuthRequest, res: Response) => {
  const { name, contact, phone } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '供应商名称不能为空' });
  if (name.length > 100) return res.status(400).json({ error: '名称不能超过100字符' });
  try {
    const s = await prisma.supplier.create({
      data: { name: name.trim(), contact, phone, customerId: req.customerId! },
    });
    res.status(201).json(s);
  } catch (e: any) {
    if (e?.code === 'P2002') return res.status(400).json({ error: '供应商名称已存在' });
    throw e;
  }
});

// 编辑
suppliersRouter.put('/:id', adminWrite, validateId, async (req: AuthRequest, res: Response) => {
  const { name, contact, phone } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '供应商名称不能为空' });
  try {
    const s = await prisma.supplier.updateMany({
      where: { id: parseInt(req.params.id), customerId: req.customerId },
      data: { name: name.trim(), contact, phone },
    });
    if (s.count === 0) return res.status(404).json({ error: '供应商不存在' });
    res.json({ success: true });
  } catch (e: any) {
    if (e?.code === 'P2002') return res.status(400).json({ error: '供应商名称已存在' });
    throw e;
  }
});

// 删除
suppliersRouter.delete('/:id', adminWrite, validateId, async (req: AuthRequest, res: Response) => {
  const s = await prisma.supplier.deleteMany({
    where: { id: parseInt(req.params.id), customerId: req.customerId },
  });
  if (s.count === 0) return res.status(404).json({ error: '供应商不存在' });
  res.json({ success: true });
});

export default suppliersRouter;

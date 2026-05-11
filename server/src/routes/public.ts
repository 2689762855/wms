import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';
import { customerAuth, AuthRequest, JWT_CUSTOMER_SECRET } from '../middleware/auth';

const JWT_EXPIRES_IN = '24h';

export const publicRouter = Router();

// 客户登录
publicRouter.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }

  const customer = await prisma.customer.findUnique({ where: { username } });
  if (!customer) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const valid = await bcrypt.compare(password, customer.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const token = jwt.sign(
    { customerId: customer.id, role: 'customer' },
    JWT_CUSTOMER_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );

  const { passwordHash, ...safe } = customer;
  res.json({ token, user: safe });
});

// 验证客户 token
publicRouter.get('/me', customerAuth, async (req: AuthRequest, res: Response) => {
  const customer = await prisma.customer.findUnique({ where: { id: req.customerId } });
  if (!customer) return res.status(404).json({ error: '账号不存在' });
  const { passwordHash, ...safe } = customer;
  res.json(safe);
});

// 仓库列表（需客户登录，受限制客户只看到自己的仓库）
publicRouter.get('/warehouses', customerAuth, async (req: AuthRequest, res: Response) => {
  const customer = await prisma.customer.findUnique({ where: { id: req.customerId } });
  if (!customer) return res.status(404).json({ error: '账号不存在' });

  const where = customer.warehouseId ? { id: customer.warehouseId } : {};
  const warehouses = await prisma.warehouse.findMany({
    where,
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  res.json(warehouses);
});

// 分类列表
publicRouter.get('/categories', customerAuth, async (_req: AuthRequest, res: Response) => {
  const list = await prisma.category.findMany({ orderBy: { name: 'asc' } });
  res.json(list);
});

// 库存查询（需客户登录）
publicRouter.get('/inventory', customerAuth, async (req: AuthRequest, res: Response) => {
  const customer = await prisma.customer.findUnique({ where: { id: req.customerId } });
  if (!customer) return res.status(404).json({ error: '账号不存在' });

  // 客户被限制只查看某个仓库时，强制使用该仓库
  const queryWarehouseId = req.query.warehouseId ? parseInt(req.query.warehouseId as string) : undefined;
  const warehouseId = customer.warehouseId
    ? customer.warehouseId
    : (queryWarehouseId && !isNaN(queryWarehouseId) ? queryWarehouseId : undefined);
  const keyword = ((req.query.keyword as string) || '').trim();

  const where: Record<string, unknown> = { quantity: { gt: 0 } };
  if (warehouseId) where.warehouseId = warehouseId;
  if (keyword) {
    where.product = {
      OR: [
        { name: { contains: keyword } },
        { sku: { contains: keyword } },
        { barcode: { contains: keyword } },
      ],
    };
  }

  const data = await prisma.inventory.findMany({
    where,
    include: {
      product: { include: { category: true } },
      warehouse: true,
      location: true,
    },
    orderBy: { product: { name: 'asc' } },
  });

  const safe = data.map(item => {
    const { costPrice, salePrice, ...safeProduct } = item.product;
    return { ...item, product: safeProduct };
  });

  res.json(safe);
});

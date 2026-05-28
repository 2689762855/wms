import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate, adminWrite } from '../middleware/auth';

export const contractsRouter = Router();
contractsRouter.use(authenticate);

// 合同列表
contractsRouter.get('/', async (req: AuthRequest, res: Response) => {
  const page = parseInt((req.query.page as string) || '1');
  const pageSize = parseInt((req.query.pageSize as string) || '20');
  const keyword = (req.query.keyword as string) || '';
  const status = req.query.status as string;
  const customerId = req.query.customerId ? parseInt(req.query.customerId as string) : undefined;

  const where: Record<string, unknown> = {};
  if (keyword) where.contractNo = { contains: keyword };
  if (status) where.status = status;
  if (customerId) where.customerId = customerId;
  if (req.customerId) where.customerId = req.customerId;

  const [data, total] = await Promise.all([
    prisma.contract.findMany({
      where,
      include: {
        customer: { select: { id: true, username: true, realName: true } },
        items: { include: { product: { select: { id: true, sku: true, name: true, spec: true, unit: true } } } },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.contract.count({ where }),
  ]);
  res.json({ data, total, page, pageSize });
});

// 合同详情
contractsRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const contract = await prisma.contract.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, username: true, realName: true } },
      items: {
        include: { product: { select: { id: true, sku: true, name: true, spec: true, unit: true } } },
      },
    },
  });
  if (!contract) return res.status(404).json({ error: '合同不存在' });
  res.json(contract);
});

// 创建合同
contractsRouter.post('/', adminWrite, async (req: AuthRequest, res: Response) => {
  const { contractNo, customerId, customerName, items } = req.body;
  if (!contractNo) return res.status(400).json({ error: '合同号必填' });
  let finalCustomerId = customerId || req.customerId;
  if (!finalCustomerId && customerName) {
    // 自动创建客户
    const bcrypt = require('bcryptjs');
    const newCust = await prisma.customer.create({
      data: {
        username: customerName + '_' + Date.now().toString(36),
        passwordHash: await bcrypt.hash('123456', 10),
        realName: customerName,
      },
    });
    finalCustomerId = newCust.id;
  }
  if (!finalCustomerId) return res.status(400).json({ error: '请选择客户' });
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: '请添加商品明细' });
  }

  const existing = await prisma.contract.findUnique({ where: { contractNo } });
  if (existing) return res.status(400).json({ error: '合同号已存在' });

  const contract = await prisma.contract.create({
    data: {
      contractNo,
      customerId: finalCustomerId,
      items: {
        create: items.map((i: { productId: number; plannedQty: number; unitPrice?: number }) => ({
          productId: i.productId,
          plannedQty: i.plannedQty || 0,
          unitPrice: i.unitPrice ?? undefined,
        })),
      },
    },
    include: {
      customer: { select: { id: true, username: true, realName: true } },
      items: { include: { product: { select: { id: true, sku: true, name: true, spec: true, unit: true } } } },
    },
  });
  res.status(201).json(contract);
});

// 编辑合同
contractsRouter.put('/:id', adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const { contractNo, items } = req.body;

  if (contractNo) {
    const dup = await prisma.contract.findUnique({ where: { contractNo } });
    if (dup && dup.id !== id) return res.status(400).json({ error: '合同号已存在' });
  }

  if (items && Array.isArray(items)) {
    const existingItems = await prisma.contractItem.findMany({ where: { contractId: id } });
    const hasReceived = existingItems.some(i => i.receivedQty > 0);
    if (hasReceived) return res.status(400).json({ error: '合同已有入库记录，无法修改商品明细' });

    await prisma.contractItem.deleteMany({ where: { contractId: id } });
    await prisma.contractItem.createMany({
      data: items.map((i: { productId: number; plannedQty: number; unitPrice?: number }) => ({
        contractId: id,
        productId: i.productId,
        plannedQty: i.plannedQty || 0,
        unitPrice: i.unitPrice ?? undefined,
      })),
    });
  }

  const contract = await prisma.contract.update({
    where: { id },
    data: contractNo ? { contractNo } : {},
    include: {
      customer: { select: { id: true, username: true, realName: true } },
      items: { include: { product: { select: { id: true, sku: true, name: true, spec: true, unit: true } } } },
    },
  });
  res.json(contract);
});

// 删除合同（已有入库记录的不可删）
contractsRouter.delete('/:id', adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const items = await prisma.contractItem.findMany({ where: { contractId: id, receivedQty: { gt: 0 } } });
  if (items.length > 0) return res.status(400).json({ error: '合同已有入库记录，无法删除' });
  await prisma.contract.delete({ where: { id } });
  res.json({ message: '已删除' });
});

// 更新合同状态
contractsRouter.patch('/:id/status', adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const { status } = req.body;
  if (!['active', 'completed', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: '无效状态' });
  }
  const contract = await prisma.contract.update({
    where: { id },
    data: { status },
  });
  res.json(contract);
});

// 合同对账：收发存汇总
contractsRouter.get('/:id/reconciliation', async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const contract = await prisma.contract.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, username: true, realName: true } },
      items: { include: { product: { select: { id: true, sku: true, name: true, spec: true, unit: true } } } },
    },
  });
  if (!contract) return res.status(404).json({ error: '合同不存在' });

  const inboundItems = await prisma.inboundItem.findMany({
    where: { contractId: id },
    include: {
      inbound: { select: { id: true, orderNo: true, createdAt: true } },
      product: { select: { id: true, sku: true, name: true } },
    },
    orderBy: { inbound: { createdAt: 'desc' } },
  });

  const outboundItems = await prisma.outboundItem.findMany({
    where: { contractId: id },
    include: {
      outbound: { select: { id: true, orderNo: true, createdAt: true } },
      product: { select: { id: true, sku: true, name: true } },
    },
    orderBy: { outbound: { createdAt: 'desc' } },
  });

  const outboundIds = [...new Set(outboundItems.map(oi => oi.outboundId))];
  const containerItems = await prisma.containerItem.findMany({
    where: { outboundId: { in: outboundIds } },
    include: {
      container: { select: { id: true, containerNo: true, sealTime: true, status: true } },
      product: { select: { id: true, sku: true, name: true } },
    },
    orderBy: { container: { sealTime: 'desc' } },
  });

  // 按商品汇总
  const productMap = new Map<number, {
    sku: string; name: string; spec: string; unit: string;
    plannedQty: number; receivedQty: number; unitPrice?: number;
    shippedQty: number; returnedQty: number;
  }>();

  for (const ci of contract.items) {
    productMap.set(ci.productId, {
      sku: ci.product.sku, name: ci.product.name,
      spec: ci.product.spec, unit: ci.product.unit,
      plannedQty: ci.plannedQty, receivedQty: ci.receivedQty,
      unitPrice: ci.unitPrice ?? undefined,
      shippedQty: 0, returnedQty: 0,
    });
  }

  for (const ci of containerItems) {
    const entry = productMap.get(ci.productId);
    if (entry) {
      entry.shippedQty += (ci.actualQty || 0);
      entry.returnedQty += Math.max(0, ci.returnedQty);
    }
  }

  const summary = Array.from(productMap.values());
  const totals = summary.reduce((acc, item) => ({
    planned: acc.planned + item.plannedQty,
    received: acc.received + item.receivedQty,
    shipped: acc.shipped + item.shippedQty,
    returned: acc.returned + item.returnedQty,
    amount: acc.amount + ((item.unitPrice || 0) * item.shippedQty),
  }), { planned: 0, received: 0, shipped: 0, returned: 0, amount: 0 });

  res.json({
    contract: {
      id: contract.id, contractNo: contract.contractNo, status: contract.status,
      customer: contract.customer, createdAt: contract.createdAt,
    },
    inboundItems,
    outboundItems,
    containerItems,
    summary,
    totals,
  });
});

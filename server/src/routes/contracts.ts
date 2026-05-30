import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate, adminWrite, validateId } from '../middleware/auth';

export const contractsRouter = Router();
contractsRouter.use(authenticate);

// 业务客户列表
contractsRouter.get('/business-customers', async (req: AuthRequest, res: Response) => {
  const where: Record<string, unknown> = {};
  if (req.customerId) where.tenantId = req.customerId;
  const customers = await prisma.businessCustomer.findMany({
    where,
    select: { id: true, realName: true },
    orderBy: { realName: 'asc' },
  });
  res.json(customers);
});

// 创建业务客户
contractsRouter.post('/business-customers', adminWrite, async (req: AuthRequest, res: Response) => {
  const { realName } = req.body;
  if (!realName) return res.status(400).json({ error: '客户名称必填' });
  const tenantId = req.customerId ?? 0;
  const existing = await prisma.businessCustomer.findUnique({
    where: { realName_tenantId: { realName, tenantId } },
  });
  if (existing) return res.json(existing);
  const customer = await prisma.businessCustomer.create({
    data: { realName, tenantId },
    select: { id: true, realName: true },
  });
  res.status(201).json(customer);
});

// 删除业务客户
contractsRouter.delete('/business-customers/:id', adminWrite, validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  await prisma.businessCustomer.delete({ where: { id } });
  res.json({ message: '已删除' });
});

// 合同列表
contractsRouter.get('/', async (req: AuthRequest, res: Response) => {
  const page = parseInt((req.query.page as string) || '1');
  const pageSize = parseInt((req.query.pageSize as string) || '20');
  const keyword = (req.query.keyword as string) || '';
  const status = req.query.status as string;
  const customerId = req.query.customerId ? parseInt(req.query.customerId as string) : undefined;
  const businessCustomerId = req.query.businessCustomerId ? parseInt(req.query.businessCustomerId as string) : undefined;

  const where: Record<string, unknown> = {};
  if (keyword) where.contractNo = { contains: keyword };
  if (status) where.status = status;
  if (businessCustomerId) where.businessCustomerId = businessCustomerId;
  if (customerId) where.customerId = customerId;
  if (req.customerId) where.customerId = req.customerId;

  const excludeShipped = req.query.excludeShipped === 'true';

  const [rawData] = await Promise.all([
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

  // 过滤已全部出货的合同
  let total = 0;
  let data = rawData;
  if (excludeShipped && rawData.length > 0) {
    const contractIds = rawData.map(c => c.id);
    const obItems = await prisma.outboundItem.findMany({
      where: { contractId: { in: contractIds } },
      select: { contractId: true, productId: true, quantity: true },
    });
    const shippedMap = new Map<string, number>();
    for (const ob of obItems) {
      const k = `${ob.contractId}_${ob.productId}`;
      shippedMap.set(k, (shippedMap.get(k) || 0) + ob.quantity);
    }
    data = rawData.filter(c =>
      c.items.some(ci => (shippedMap.get(`${c.id}_${ci.productId}`) || 0) < ci.plannedQty)
    );
    // 全量计数：查所有合同的出库情况
    const allContracts = await prisma.contract.findMany({ where, select: { id: true } });
    if (allContracts.length > 0) {
      const allIds = allContracts.map(c => c.id);
      const allObItems = await prisma.outboundItem.findMany({
        where: { contractId: { in: allIds } },
        select: { contractId: true, productId: true, quantity: true },
      });
      const allShippedMap = new Map<string, number>();
      for (const ob of allObItems) {
        const k = `${ob.contractId}_${ob.productId}`;
        allShippedMap.set(k, (allShippedMap.get(k) || 0) + ob.quantity);
      }
      // 需要合同 items 来判断 plannedQty
      const allWithItems = await prisma.contract.findMany({
        where: { id: { in: allIds } },
        select: { id: true, items: { select: { productId: true, plannedQty: true } } },
      });
      total = allWithItems.filter(c =>
        c.items.some(ci => (allShippedMap.get(`${c.id}_${ci.productId}`) || 0) < ci.plannedQty)
      ).length;
    }
  } else {
    total = await prisma.contract.count({ where });
  }
  // 附加 businessCustomer 数据
  const bizIds = [...new Set(data.map(c => c.businessCustomerId).filter(Boolean))] as number[];
  const bizMap = new Map<number, { id: number; realName: string }>();
  if (bizIds.length > 0) {
    const bizList = await prisma.businessCustomer.findMany({ where: { id: { in: bizIds } }, select: { id: true, realName: true } });
    bizList.forEach(b => bizMap.set(b.id, b));
  }
  const result = data.map(c => ({ ...c, businessCustomer: bizMap.get(c.businessCustomerId) || null }));
  res.json({ data: result, total, page, pageSize });
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
  const biz = contract.businessCustomerId
    ? await prisma.businessCustomer.findUnique({ where: { id: contract.businessCustomerId }, select: { id: true, realName: true } })
    : null;
  res.json({ ...contract, businessCustomer: biz });
});

// 创建合同
contractsRouter.post('/', adminWrite, async (req: AuthRequest, res: Response) => {
  const { contractNo, customerName, items } = req.body;
  if (!contractNo) return res.status(400).json({ error: '合同号必填' });
  if (!customerName) return res.status(400).json({ error: '请输入客户名称' });
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: '请添加商品明细' });
  }

  const tenantId = req.customerId ?? 0;
  // 业务客户：只在 BusinessCustomer 表操作，不污染 Customer 表
  let bizCust = await prisma.businessCustomer.upsert({
    where: { realName_tenantId: { realName: customerName, tenantId } },
    create: { realName: customerName, tenantId },
    update: {},
  });

  const existing = await prisma.contract.findUnique({ where: { contractNo } });
  if (existing) return res.status(400).json({ error: '合同号已存在' });

  const contract = await prisma.contract.create({
    data: {
      contractNo,
      customerId: tenantId,
      businessCustomerId: bizCust.id,
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
  const biz = await prisma.businessCustomer.findUnique({ where: { id: bizCust.id }, select: { id: true, realName: true } });
  res.status(201).json({ ...contract, businessCustomer: biz });
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
  const contract = await prisma.contract.findUnique({ where: { id }, select: { status: true } });
  if (contract?.status === 'completed') return res.status(400).json({ error: '已完成的合同不可删除' });
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

  // 未装柜的出库也计入已出数
  const containerOutboundIds = new Set(containerItems.map(ci => ci.outboundId));
  for (const oi of outboundItems) {
    if (!containerOutboundIds.has(oi.outboundId)) {
      const entry = productMap.get(oi.productId);
      if (entry) {
        entry.shippedQty += oi.quantity;
      }
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
      businessCustomer: contract.businessCustomerId
        ? await prisma.businessCustomer.findUnique({ where: { id: contract.businessCustomerId }, select: { id: true, realName: true } })
        : null,
    },
    inboundItems,
    outboundItems,
    containerItems,
    summary,
    totals,
  });
});

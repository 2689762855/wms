import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { getPagination } from '../utils/pagination';
import { syncContractFulfillment } from '../utils/contractFulfillment';
import { getPresetTemplate } from '../utils/reportPresets';
import { AuthRequest, authenticate, adminWrite, validateId } from '../middleware/auth';

export const containersCrudRouter = Router();

// 货柜列表
containersCrudRouter.get('/', async (req: AuthRequest, res: Response) => {
  const { page, pageSize, skip } = getPagination(req);
  const keyword = (req.query.keyword as string) || '';
  const status = req.query.status as string;
  const customerId = req.query.customerId ? parseInt(req.query.customerId as string) : undefined;
  const businessCustomerId = req.query.businessCustomerId ? parseInt(req.query.businessCustomerId as string) : undefined;

  const where: Record<string, unknown> = {};
  if (keyword) where.containerNo = { contains: keyword };
  if (status) where.status = status;
  if (businessCustomerId) where.businessCustomerId = businessCustomerId;
  if (customerId) where.customerId = customerId;
  if (req.customerId) where.customerId = req.customerId;

  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) (where.createdAt as any).gte = new Date(startDate);
    if (endDate) (where.createdAt as any).lte = new Date(endDate);
  }

  const [data, total] = await Promise.all([
    prisma.container.findMany({
      where,
      include: {
        customer: { select: { id: true, username: true, realName: true } },
        contracts: { include: { contract: { select: { id: true, contractNo: true, status: true } } } },
        items: {
          include: {
            product: { select: { id: true, sku: true, name: true, spec: true, unit: true } }, returnLocation: { select: { id: true, name: true } },
          },
        },
      },
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.container.count({ where }),
  ]);
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

// 货柜详情
containersCrudRouter.get('/:id', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const container = await prisma.container.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, username: true, realName: true } },
      contracts: { include: { contract: { select: { id: true, contractNo: true, status: true } } } },
      items: {
        include: {
          product: { select: { id: true, sku: true, name: true, spec: true, unit: true } }, returnLocation: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!container) return res.status(404).json({ error: '货柜不存在' });
  if (req.customerId && container.customerId !== req.customerId) return res.status(403).json({ error: '无权访问' });
  const biz = container.businessCustomerId
    ? await prisma.businessCustomer.findUnique({ where: { id: container.businessCustomerId }, select: { id: true, realName: true } })
    : null;
  res.json({ ...container, businessCustomer: biz });
});

// 创建货柜
containersCrudRouter.post('/', async (req: AuthRequest, res: Response) => {
  const { containerNo, toYardTime, customerName, note, contractIds, actualContainerNo, items: extraItems } = req.body;
  if (!containerNo) return res.status(400).json({ error: '柜号必填' });
  if (!customerName) return res.status(400).json({ error: '请输入客户名称' });

  const tenantId = req.customerId ?? 0;
  let bizCust = await prisma.businessCustomer.upsert({
    where: { realName_tenantId: { realName: customerName, tenantId } },
    create: { realName: customerName, tenantId },
    update: {},
  });
  const existing = await prisma.container.findFirst({ where: { containerNo, customerId: tenantId } });
  if (existing) return res.status(400).json({ error: '柜号已存在' });

  const result = await prisma.$transaction(async (tx) => {
    const container = await tx.container.create({
      data: {
        containerNo,
        toYardTime: toYardTime ? new Date(toYardTime) : null,
        customerId: tenantId,
        businessCustomerId: bizCust.id,
        note,
        actualContainerNo: actualContainerNo || null,
        ...(contractIds?.length > 0 ? {
          contracts: { create: contractIds.map((cid: number) => ({ contractId: cid })) },
        } : {}),
        ...(extraItems?.length > 0 ? {
          items: { create: extraItems.map((ei: any) => ({ productId: ei.productId, plannedQty: ei.plannedQty || 0, actualQty: ei.actualQty || ei.plannedQty || 0, returnedQty: 0, outboundId: 0 })) },
        } : {}),
      },
      include: {
        customer: { select: { id: true, username: true, realName: true } },
        contracts: { include: { contract: { select: { id: true, contractNo: true, status: true } } } },
        items: {
          include: {
            product: { select: { id: true, sku: true, name: true, spec: true, unit: true } }, returnLocation: { select: { id: true, name: true } },
          },
        },
      },
    });
    // 自动匹配排柜编号相同的出库单
    const matchedOutbounds = await tx.outboundOrder.findMany({
      where: { containerNo, containerId: null, status: 'confirmed' },
      include: { items: true },
    });
    let linkedCount = 0;
    for (const ob of matchedOutbounds) {
      await tx.outboundOrder.update({ where: { id: ob.id }, data: { containerId: container.id } });
      for (const item of ob.items) {
        await tx.containerItem.create({
          data: { containerId: container.id, outboundId: ob.id, productId: item.productId, plannedQty: item.quantity, actualQty: item.quantity, returnedQty: 0, locationId: item.locationId, batchNo: item.batchNo },
        });
        const ocIds = [...new Set(ob.items.map(i => i.contractId).filter(Boolean))] as number[];
        for (const cid of ocIds) {
          await tx.containerContract.upsert({ where: { containerId_contractId: { containerId: container.id, contractId: cid } }, create: { containerId: container.id, contractId: cid }, update: {} }).catch(() => {});
        }
      }
      linkedCount++;
    }
    return { container, linkedCount };
  });

  res.status(201).json({ ...result.container, businessCustomer: { id: bizCust.id, realName: bizCust.realName }, linkedOutbounds: result.linkedCount });
});

// 删除货柜（仅 pending 状态可删）
containersCrudRouter.delete('/:id', validateId, adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const container = await prisma.container.findUnique({ where: { id } });
  if (!container) return res.status(404).json({ error: '货柜不存在' });
  if (req.customerId && container.customerId !== req.customerId) return res.status(403).json({ error: '无权访问' });
  if (container.status !== 'pending' && container.status !== 'cancelled') return res.status(400).json({ error: '仅待装柜或已作废状态可删除' });
  await prisma.container.delete({ where: { id } });
  res.json({ message: '已删除' });
});

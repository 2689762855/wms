import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { getPagination } from '../utils/pagination';
import { syncContractFulfillment } from '../utils/contractFulfillment';
import { getPresetTemplate } from '../utils/reportPresets';
import { AuthRequest, authenticate, adminWrite, validateId } from '../middleware/auth';

export const containersReportsRouter = Router();


// 装柜报表
containersReportsRouter.get('/:id/report', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const container = await prisma.container.findUnique({
    where: { id },
    include: {
      customer: { select: { realName: true, username: true, reportTemplate: true, templatePreset: true, excelPreset: true, exportTemplate: true } },
      items: {
        include: {
          product: { select: { id: true, sku: true, name: true, spec: true, unit: true } }, returnLocation: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!container) return res.status(404).json({ error: '货柜不存在' });
  if (req.customerId && container.customerId !== req.customerId) return res.status(403).json({ error: '无权访问' });

  // 关联合同：从出库单自动检测所有合同
  const outboundIds = [...new Set(container.items.map(i => i.outboundId))];
  const obContractIds = await prisma.outboundItem.findMany({
    where: { outboundId: { in: outboundIds }, contractId: { not: null } },
    select: { contractId: true },
    distinct: ['contractId'],
  });
  const allContractIds = obContractIds.map(o => o.contractId!);

  // 出库条目→合同映射（用 outboundId+productId 精确匹配，防止同商品多合同串位）
  const itemContracts = await prisma.outboundItem.findMany({
    where: { outboundId: { in: outboundIds }, contractId: { not: null } },
    select: { outboundId: true, productId: true, contractId: true },
  });
  const itemContractMap = new Map<string, number>();
  for (const ic of itemContracts) {
    itemContractMap.set(`${ic.outboundId}_${ic.productId}`, ic.contractId!);
  }

  // 收集所有产品 ID，用于兜底查售价
  const allPids = [...new Set(container.items.map(i => i.productId))];
  const productPrices = allPids.length > 0
    ? await prisma.product.findMany({ where: { id: { in: allPids } }, select: { id: true, salePrice: true } })
    : [];
  const productPriceMap = new Map<number, number>();
  for (const p of productPrices) {
    if (p.salePrice != null) productPriceMap.set(p.id, p.salePrice);
  }

  let contractPriceMap: Map<string, number> = new Map();
  if (allContractIds.length > 0) {
    const contractItems = await prisma.contractItem.findMany({
      where: { contractId: { in: allContractIds } },
      select: { contractId: true, productId: true, unitPrice: true },
    });
    for (const ci of contractItems) {
      if (ci.unitPrice != null) contractPriceMap.set(`${ci.contractId}_${ci.productId}`, ci.unitPrice);
    }
  }

  // 按商品合并
  const merged = new Map<number, { sku: string; name: string; spec: string; unit: string; plannedQty: number; actualQty: number; returnedQty: number; unitPrice?: number }>();
  for (const item of container.items) {
    const pid = item.productId;
    const cid = itemContractMap.get(`${item.outboundId}_${pid}`);
    const price = cid ? (contractPriceMap.get(`${cid}_${pid}`) ?? productPriceMap.get(pid)) : productPriceMap.get(pid);
    const existing = merged.get(pid);
    if (existing) {
      existing.plannedQty += item.plannedQty;
      existing.actualQty += (item.actualQty || 0);
      existing.returnedQty += Math.max(0, item.returnedQty);
      if (price != null) existing.unitPrice = price;
    } else {
      merged.set(pid, {
        sku: item.product.sku,
        name: item.product.name,
        spec: item.product.spec || '',
        unit: item.product.unit,
        plannedQty: item.plannedQty,
        actualQty: item.actualQty || 0,
        returnedQty: Math.max(0, item.returnedQty),
        unitPrice: price ?? undefined,
      });
    }
  }
  const summary = Array.from(merged.values());

  const totals = summary.reduce(
    (acc, item) => {
      acc.totalPlanned += item.plannedQty;
      acc.totalActual += item.actualQty;
      acc.totalReturned += item.returnedQty;
      if (item.unitPrice != null) acc.totalAmount = (acc.totalAmount || 0) + item.unitPrice * item.actualQty;
      return acc;
    },
    { totalPlanned: 0, totalActual: 0, totalReturned: 0, totalAmount: 0 as number },
  );

  // 模板设置从租户帐号读取，不是业务客户
  const templateCustomer = req.customerId
    ? await prisma.customer.findUnique({ where: { id: req.customerId }, select: { reportTemplate: true, templatePreset: true, excelPreset: true, exportTemplate: true } })
    : container.customer;
  const tpl = templateCustomer;
  const bizCustomer = container.businessCustomerId
    ? await prisma.businessCustomer.findUnique({ where: { id: container.businessCustomerId }, select: { realName: true } })
    : null;
  res.json({
    containerNo: container.containerNo,
    actualContainerNo: container.actualContainerNo || '',
    toYardTime: container.toYardTime,
    sealTime: container.sealTime,
    status: container.status,
    customerId: req.customerId || container.customerId,  // 模板管理用租户 ID
    customerName: bizCustomer?.realName || container.customer?.realName || container.customer?.username || '',
    templatePreset: tpl?.templatePreset || null,
    excelPreset: tpl?.excelPreset || null,
    exportTemplate: tpl?.exportTemplate || null,
    reportTemplate: tpl?.templatePreset
      ? (getPresetTemplate(tpl.templatePreset) || tpl?.reportTemplate || null)
      : (tpl?.reportTemplate || null),
    contractIds: allContractIds,
    summary,
    totals,
  });
});

// 排柜对账
containersReportsRouter.get('/:id/reconciliation', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const container = await prisma.container.findUnique({
    where: { id },
    include: {
      contracts: { include: { contract: { select: { id: true, contractNo: true, status: true } } } },
      items: { include: { product: { select: { id: true, sku: true, name: true, spec: true, unit: true } } } },
    },
  });
  if (!container) return res.status(404).json({ error: '排柜不存在' });

  // 出库单条目 → 合同
  const outboundIds = [...new Set(container.items.map(i => i.outboundId))];
  const obItems = outboundIds.length > 0
    ? await prisma.outboundItem.findMany({
        where: { outboundId: { in: outboundIds }, contractId: { not: null } },
        select: { outboundId: true, productId: true, contractId: true },
      })
    : [];

  // productId+outboundId → contractId 映射
  const contractMap = new Map<string, number>();
  for (const oi of obItems) {
    contractMap.set(`${oi.outboundId}_${oi.productId}`, oi.contractId!);
  }

  // 合同单价
  const allContractIds = [...new Set(obItems.map(o => o.contractId!).filter(Boolean))];
  const contractItems = allContractIds.length > 0
    ? await prisma.contractItem.findMany({
        where: { contractId: { in: allContractIds } },
        select: { contractId: true, productId: true, unitPrice: true },
      })
    : [];
  const priceMap = new Map<string, number>();
  for (const ci of contractItems) {
    if (ci.unitPrice != null) priceMap.set(`${ci.contractId}_${ci.productId}`, ci.unitPrice);
  }

  // 商品默认售价兜底
  const allPids2 = [...new Set(container.items.map(i => i.productId))];
  const productPrices2 = allPids2.length > 0
    ? await prisma.product.findMany({ where: { id: { in: allPids2 } }, select: { id: true, salePrice: true } })
    : [];
  const productPriceMap2 = new Map<number, number>();
  for (const p of productPrices2) {
    if (p.salePrice != null) productPriceMap2.set(p.id, p.salePrice);
  }

  // 按合同分组
  const contractMap2 = new Map<number, {
    contractId: number; contractNo: string; contractStatus: string;
    items: Map<number, { productId: number; sku: string; name: string; spec: string; unit: string; plannedQty: number; actualQty: number; returnedQty: number; unitPrice?: number }>;
  }>();

  for (const ci of container.items) {
    const cid = contractMap.get(`${ci.outboundId}_${ci.productId}`) || 0;
    let group = contractMap2.get(cid);
    if (!group) {
      const cc = container.contracts.find(c => c.contractId === cid);
      group = {
        contractId: cid,
        contractNo: cc?.contract?.contractNo || '无合同',
        contractStatus: cc?.contract?.status || '',
        items: new Map(),
      };
      contractMap2.set(cid, group);
    }
    const pid = ci.productId;
    const existing = group.items.get(pid);
    const up = priceMap.get(`${cid}_${pid}`) ?? productPriceMap2.get(pid);
    if (existing) {
      existing.plannedQty += ci.plannedQty;
      existing.actualQty += (ci.actualQty || 0);
      existing.returnedQty += Math.max(0, ci.returnedQty);
    } else {
      group.items.set(pid, {
        productId: pid,
        sku: ci.product?.sku || '',
        name: ci.product?.name || '',
        spec: ci.product?.spec || '',
        unit: ci.product?.unit || '',
        plannedQty: ci.plannedQty,
        actualQty: ci.actualQty || 0,
        returnedQty: Math.max(0, ci.returnedQty),
        unitPrice: up ?? undefined,
      });
    }
  }

  const contracts = Array.from(contractMap2.values()).map(g => {
    const items = Array.from(g.items.values());
    const totals = items.reduce((a, i) => ({
      planned: a.planned + i.plannedQty,
      actual: a.actual + i.actualQty,
      returned: a.returned + i.returnedQty,
      amount: a.amount + (i.unitPrice || 0) * i.actualQty,
    }), { planned: 0, actual: 0, returned: 0, amount: 0 });
    return { contractId: g.contractId, contractNo: g.contractNo, contractStatus: g.contractStatus, items, totals };
  });

  res.json({
    container: { id: container.id, containerNo: container.containerNo, status: container.status },
    contracts,
  });
});

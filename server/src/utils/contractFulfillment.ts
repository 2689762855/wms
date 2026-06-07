import prisma from './prisma';

/**
 * 同步合同履约状态 — 检查出货+甩柜退回后的净出货量，自动标记 completed/active
 * containers.ts seal 和 adjust 路由、outbound.ts confirm 路由共用
 */
export async function syncContractFulfillment(
  tx: any,
  outboundIds: number[],
) {
  const contractIds = [...new Set((await tx.outboundItem.findMany({
    where: { outboundId: { in: outboundIds }, contractId: { not: null } },
    select: { contractId: true },
  })).map((o: { contractId: number }) => o.contractId))];

  for (const cid of contractIds) {
    const contract = await tx.contract.findUnique({
      where: { id: cid },
      include: { items: true },
    });
    if (!contract) continue;

    const obItems = await tx.outboundItem.findMany({ where: { contractId: cid } });
    const shippedMap = new Map<number, number>();
    for (const oi of obItems) {
      shippedMap.set(oi.productId, (shippedMap.get(oi.productId) || 0) + oi.quantity);
    }

    const containerReturns = await tx.containerItem.findMany({
      where: { outboundId: { in: obItems.map((o: { outboundId: number }) => o.outboundId) }, returnedQty: { gt: 0 } },
    });
    for (const ci of containerReturns) {
      shippedMap.set(ci.productId, (shippedMap.get(ci.productId) || 0) - ci.returnedQty);
    }

    const fulfilled = contract.items.every(
      (ci: { productId: number; plannedQty: number }) =>
        (shippedMap.get(ci.productId) || 0) >= ci.plannedQty,
    );

    if (fulfilled && contract.status !== 'completed') {
      await tx.contract.update({ where: { id: cid }, data: { status: 'completed' } });
    } else if (!fulfilled && contract.status === 'completed') {
      await tx.contract.update({ where: { id: cid }, data: { status: 'active' } });
    }
  }
}

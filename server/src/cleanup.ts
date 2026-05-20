import prisma from './utils/prisma';

const RETENTION_DAYS = 7;

async function cleanup() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const customers = await prisma.customer.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true, username: true },
  });

  if (customers.length === 0) {
    console.log(`[${new Date().toISOString()}] 无过期删除客户`);
    return;
  }

  let totalDeleted = 0;
  for (const { id, username } of customers) {
    try {
      const warehouses = await prisma.warehouse.findMany({ where: { customerId: id }, select: { id: true } });
      const warehouseIds = warehouses.map(w => w.id);

      for (const wid of warehouseIds) {
        await prisma.stockLog.deleteMany({ where: { warehouseId: wid } });
        await prisma.checkItem.deleteMany({ where: { task: { warehouseId: wid } } });
        await prisma.checkTask.deleteMany({ where: { warehouseId: wid } });
        await prisma.transferItem.deleteMany({ where: { transfer: { OR: [{ fromWarehouseId: wid }, { toWarehouseId: wid }] } } });
        await prisma.transferOrder.deleteMany({ where: { OR: [{ fromWarehouseId: wid }, { toWarehouseId: wid }] } });
        await prisma.outboundItem.deleteMany({ where: { outbound: { warehouseId: wid } } });
        await prisma.outboundOrder.deleteMany({ where: { warehouseId: wid } });
        await prisma.inboundItem.deleteMany({ where: { inbound: { warehouseId: wid } } });
        await prisma.inboundOrder.deleteMany({ where: { warehouseId: wid } });
        await prisma.inventory.deleteMany({ where: { warehouseId: wid } });
        await prisma.user.deleteMany({ where: { warehouseId: wid } });
        await prisma.location.deleteMany({ where: { warehouseId: wid } });
        await prisma.warehouse.delete({ where: { id: wid } });
      }

      await prisma.product.deleteMany({ where: { customerId: id } });
      await prisma.category.deleteMany({ where: { customerId: id } });
      await prisma.customer.delete({ where: { id } });

      console.log(`  已彻底删除: ${username} (id=${id})`);
      totalDeleted++;
    } catch (err) {
      console.error(`  删除 ${username} (id=${id}) 失败:`, err);
    }
  }

  console.log(`[${new Date().toISOString()}] 清理完成，共删除 ${totalDeleted}/${customers.length} 个过期客户`);
}

cleanup()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('清理脚本失败:', err);
    process.exit(1);
  });

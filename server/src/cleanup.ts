import fs from 'fs';
import path from 'path';
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
        await prisma.productWarehouse.deleteMany({ where: { warehouseId: wid } });
        await prisma.inventory.deleteMany({ where: { warehouseId: wid } });
        await prisma.user.deleteMany({ where: { warehouseId: wid } });
        await prisma.location.deleteMany({ where: { warehouseId: wid } });
        await prisma.warehouse.delete({ where: { id: wid } });
      }

      // 清理合同和货柜相关数据（外键关联 Customer，必须先于 Customer 删除）
      await prisma.containerItem.deleteMany({ where: { container: { customerId: id } } });
      await prisma.containerContract.deleteMany({ where: { container: { customerId: id } } });
      await prisma.contractItem.deleteMany({ where: { contract: { customerId: id } } });
      await prisma.container.deleteMany({ where: { customerId: id } });
      await prisma.contract.deleteMany({ where: { customerId: id } });
      await prisma.businessCustomer.deleteMany({ where: { tenantId: id } });

      await prisma.product.deleteMany({ where: { customerId: id } });
      await prisma.category.deleteMany({ where: { customerId: id } });
      await prisma.customer.delete({ where: { id } });

      // 删除租户数据库文件（含 WAL/SHM 残留）
      const dbDir = path.join(__dirname, '../prisma');
      const dbBase = path.join(dbDir, `tenant_${id}.db`);
      for (const ext of ['', '-wal', '-shm']) {
        const file = dbBase + ext;
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
          console.log(`  已删除租户库文件: ${path.basename(file)}`);
        }
      }

      console.log(`  已彻底删除: ${username} (id=${id})`);
      totalDeleted++;
    } catch (err) {
      console.error(`  删除 ${username} (id=${id}) 失败:`, err);
    }
  }

  // 扫描并清理孤立的租户数据库文件（db 记录已删除但文件残留）
  const dbDir = path.join(__dirname, '../prisma');
  if (fs.existsSync(dbDir)) {
    const existingIds = new Set((await prisma.customer.findMany({ select: { id: true } })).map(c => c.id));
    for (const file of fs.readdirSync(dbDir)) {
      const match = file.match(/^tenant_(\d+)\.db(?:-wal|-shm)?$/);
      if (match) {
        const tenantId = parseInt(match[1]);
        if (!existingIds.has(tenantId)) {
          const fullPath = path.join(dbDir, file);
          fs.unlinkSync(fullPath);
          console.log(`  已清理孤儿文件: ${file}`);
        }
      }
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

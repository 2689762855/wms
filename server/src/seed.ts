import prisma from './utils/prisma';
import bcrypt from 'bcryptjs';

const ADMIN_PASSWORD = 'admin123';

async function seed() {
  console.log('=== 初始化系统 ===\n');

  // 1. 清空所有业务数据（事务保护，失败回滚不留半清空状态）
  console.log('[1/2] 清空数据...');
  await prisma.$transaction(async (tx) => {
    await tx.stockLog.deleteMany();
    await tx.checkItem.deleteMany();
    await tx.checkTask.deleteMany();
    await tx.containerItem.deleteMany();
    await tx.containerContract.deleteMany();
    await tx.contractItem.deleteMany();
    await tx.container.deleteMany();
    await tx.contract.deleteMany();
    await tx.businessCustomer.deleteMany();
    await tx.transferItem.deleteMany();
    await tx.transferOrder.deleteMany();
    await tx.outboundItem.deleteMany();
    await tx.outboundOrder.deleteMany();
    await tx.inboundItem.deleteMany();
    await tx.inboundOrder.deleteMany();
    await tx.inventory.deleteMany();
    await tx.location.deleteMany();
    await tx.customer.deleteMany();
    await tx.user.deleteMany();
    await tx.product.deleteMany();
    await tx.category.deleteMany();
    await tx.warehouse.deleteMany();
  });

  // 2. 创建超管
  console.log('[2/2] 创建超管...');
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await prisma.user.create({
    data: {
      username: 'admin',
      passwordHash: hash,
      role: 'super_admin',
      realName: '系统管理员',
    },
  });

  console.log('\n=== 初始化完成 ===');
  console.log('超管: admin / admin123');
}

seed()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

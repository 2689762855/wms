import prisma from './utils/prisma';
import bcrypt from 'bcryptjs';

const ADMIN_PASSWORD = 'admin123';

async function seed() {
  console.log('=== 初始化系统 ===\n');

  // 1. 清空所有业务数据
  console.log('[1/2] 清空数据...');
  await prisma.stockLog.deleteMany();
  await prisma.checkItem.deleteMany();
  await prisma.checkTask.deleteMany();
  await prisma.transferItem.deleteMany();
  await prisma.transferOrder.deleteMany();
  await prisma.outboundItem.deleteMany();
  await prisma.outboundOrder.deleteMany();
  await prisma.inboundItem.deleteMany();
  await prisma.inboundOrder.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.location.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.warehouse.deleteMany();

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

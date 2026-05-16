import prisma from './utils/prisma';
import bcrypt from 'bcryptjs';

const ADMIN_PASSWORD = 'admin123';

async function seed() {
  console.log('=== 初始化系统数据 ===\n');

  // 1. 清空业务数据
  console.log('[1/8] 清空业务数据...');
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

  // 2. 管理员
  console.log('[2/8] 创建管理员...');
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const admin = await prisma.user.create({
    data: {
      username: 'admin',
      passwordHash: hash,
      role: 'super_admin',
      realName: '系统管理员',
    },
  });
  console.log('  admin / admin123 (超级管理员) ✓');

  // 2.5 创建示例客户
  console.log('[3/8] 创建示例客户...');
  const customerHash = await bcrypt.hash('123456', 10);
  const c1 = await prisma.customer.create({
    data: { username: 'kehua', passwordHash: customerHash, realName: '科华公司', maxWarehouses: 2 },
  });
  const c2 = await prisma.customer.create({
    data: { username: 'hongda', passwordHash: customerHash, realName: '宏大五金', maxWarehouses: 1 },
  });
  console.log(`  客户: ${c1.realName} (kehua/123456), ${c2.realName} (hongda/123456)`);

  // 3. 仓库
  console.log('[4/8] 创建仓库...');
  const wh1 = await prisma.warehouse.create({ data: { name: '原料仓', address: 'A栋1楼' } });
  const wh2 = await prisma.warehouse.create({ data: { name: '成品仓', address: 'B栋2楼' } });
  const whC1 = await prisma.warehouse.create({ data: { name: '科华主仓库', address: 'C栋1楼', customerId: c1.id } });
  const whC2 = await prisma.warehouse.create({ data: { name: '宏大主仓库', address: 'D栋1楼', customerId: c2.id } });
  console.log(`  超管仓库: ${wh1.name}, ${wh2.name}`);
  console.log(`  客户仓库: ${whC1.name}(${c1.realName}), ${whC2.name}(${c2.realName})`);

  // 4. 库位
  console.log('[5/8] 创建库位...');
  const locs = await Promise.all([
    prisma.location.create({ data: { warehouseId: wh1.id, name: 'A区-01架', code: 'LOC-A01' } }),
    prisma.location.create({ data: { warehouseId: wh1.id, name: 'A区-02架', code: 'LOC-A02' } }),
    prisma.location.create({ data: { warehouseId: wh1.id, name: 'B区-01架', code: 'LOC-B01' } }),
    prisma.location.create({ data: { warehouseId: wh2.id, name: '成品区-A', code: 'LOC-CA' } }),
    prisma.location.create({ data: { warehouseId: wh2.id, name: '成品区-B', code: 'LOC-CB' } }),
  ]);
  console.log(`  ${locs.length} 个库位`);

  // 5. 分类和商品
  console.log('[6/8] 创建分类和商品...');
  const cat1 = await prisma.category.create({ data: { name: '铝型材' } });
  const cat1a = await prisma.category.create({ data: { name: '国标铝型材', parentId: cat1.id } });
  const cat1b = await prisma.category.create({ data: { name: '欧标铝型材', parentId: cat1.id } });
  const cat2 = await prisma.category.create({ data: { name: '配件' } });
  const cat2a = await prisma.category.create({ data: { name: '角码', parentId: cat2.id } });

  const products = await Promise.all([
    prisma.product.create({ data: { sku: 'ALU-2020', name: '2020铝型材', spec: '20×20', unit: '米', categoryId: cat1a.id, safetyStock: 100, barcode: 'BAR-2020' } }),
    prisma.product.create({ data: { sku: 'ALU-3030', name: '3030铝型材', spec: '30×30', unit: '米', categoryId: cat1a.id, safetyStock: 80, barcode: 'BAR-3030' } }),
    prisma.product.create({ data: { sku: 'ALU-4040', name: '4040铝型材', spec: '40×40', unit: '米', categoryId: cat1a.id, safetyStock: 60, barcode: 'BAR-4040' } }),
    prisma.product.create({ data: { sku: 'ALU-4080', name: '4080铝型材', spec: '40×80', unit: '米', categoryId: cat1b.id, safetyStock: 50, barcode: 'BAR-4080' } }),
    prisma.product.create({ data: { sku: 'ALU-8080', name: '8080铝型材', spec: '80×80', unit: '米', categoryId: cat1b.id, safetyStock: 30, barcode: 'BAR-8080' } }),
    prisma.product.create({ data: { sku: 'HDW-L', name: 'L型角码', spec: '40×40', unit: '个', categoryId: cat2a.id, safetyStock: 500 } }),
    prisma.product.create({ data: { sku: 'HDW-T', name: 'T型螺母', spec: 'M8', unit: '个', categoryId: cat2a.id, safetyStock: 1000 } }),
  ]);
  console.log(`  ${products.length} 个商品`);

  // 6. 初始库存
  console.log('[7/8] 创建初始库存...');
  await Promise.all([
    prisma.inventory.create({ data: { productId: products[0].id, warehouseId: wh1.id, locationId: locs[0].id, quantity: 500 } }),
    prisma.inventory.create({ data: { productId: products[0].id, warehouseId: wh2.id, locationId: locs[3].id, quantity: 50 } }),
    prisma.inventory.create({ data: { productId: products[1].id, warehouseId: wh1.id, locationId: locs[0].id, quantity: 300 } }),
    prisma.inventory.create({ data: { productId: products[1].id, warehouseId: wh1.id, locationId: locs[1].id, quantity: 200 } }),
    prisma.inventory.create({ data: { productId: products[2].id, warehouseId: wh1.id, locationId: locs[2].id, quantity: 150 } }),
    prisma.inventory.create({ data: { productId: products[2].id, warehouseId: wh2.id, locationId: locs[3].id, quantity: 80 } }),
    prisma.inventory.create({ data: { productId: products[3].id, warehouseId: wh1.id, locationId: locs[1].id, quantity: 100 } }),
    prisma.inventory.create({ data: { productId: products[4].id, warehouseId: wh1.id, locationId: locs[2].id, quantity: 40 } }),
    prisma.inventory.create({ data: { productId: products[5].id, warehouseId: wh1.id, locationId: null, quantity: 2000 } }),
    prisma.inventory.create({ data: { productId: products[5].id, warehouseId: wh2.id, locationId: locs[4].id, quantity: 500 } }),
    prisma.inventory.create({ data: { productId: products[6].id, warehouseId: wh1.id, locationId: null, quantity: 5000 } }),
    prisma.inventory.create({ data: { productId: products[6].id, warehouseId: wh2.id, locationId: locs[4].id, quantity: 1000 } }),
  ]);
  console.log('  12 条库存记录');

  // 7. 客户专属分类和商品
  console.log('[8/8] 创建客户专属商品...');
  const catC1 = await prisma.category.create({ data: { name: '日化用品', customerId: c1.id } });
  const catC2 = await prisma.category.create({ data: { name: '五金标准件', customerId: c2.id } });
  await Promise.all([
    prisma.product.create({ data: { sku: 'KH-YG', name: '牙膏', unit: '支', categoryId: catC1.id, customerId: c1.id, safetyStock: 50 } }),
    prisma.product.create({ data: { sku: 'KH-YS', name: '牙刷', unit: '支', categoryId: catC1.id, customerId: c1.id, safetyStock: 100 } }),
    prisma.product.create({ data: { sku: 'HD-LS', name: 'M8螺丝', spec: 'M8×30', unit: '个', categoryId: catC2.id, customerId: c2.id, safetyStock: 500 } }),
    prisma.product.create({ data: { sku: 'HD-LM', name: 'M8螺母', spec: 'M8', unit: '个', categoryId: catC2.id, customerId: c2.id, safetyStock: 500 } }),
  ]);
  console.log(`  科华: ${catC1.name} / 宏大: ${catC2.name}`);

  // 8. 客户专属操作员
  console.log('[9/9] 创建客户操作员...');
  await prisma.user.create({
    data: { username: 'kehua_op', passwordHash: customerHash, role: 'operator', realName: '科华操作员', warehouseId: whC1.id },
  });
  await prisma.user.create({
    data: { username: 'hongda_op', passwordHash: customerHash, role: 'operator', realName: '宏大操作员', warehouseId: whC2.id },
  });
  console.log('  kehua_op / 123456 (科华操作员)');
  console.log('  hongda_op / 123456 (宏大操作员)');

  console.log('\n=== 初始化完成 ===');
  console.log('超管: admin / admin123');
  console.log('客户: kehua / 123456 (科华公司)');
  console.log('客户: hongda / 123456 (宏大五金)');
}

seed()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

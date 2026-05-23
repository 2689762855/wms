import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({
    where: { safetyStock: { gt: 0 } },
  });

  console.log(`找到 ${products.length} 个设了安全库存的商品`);

  let totalRecords = 0;

  for (const p of products) {
    const whIds = await prisma.inventory.findMany({
      where: { productId: p.id },
      select: { warehouseId: true },
      distinct: ['warehouseId'],
    });

    for (const { warehouseId } of whIds) {
      await prisma.productWarehouse.upsert({
        where: { productId_warehouseId: { productId: p.id, warehouseId } },
        create: { productId: p.id, warehouseId, safetyStock: p.safetyStock },
        update: {}, // 已存在则跳过
      });
      totalRecords++;
    }
  }

  console.log(`已创建 ${totalRecords} 条 ProductWarehouse 记录`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default prisma;

/** 获取某商品在指定仓库的全库位总库存 */
export async function getTotalStock(productId: number, warehouseId: number): Promise<number> {
  const result = await prisma.inventory.aggregate({
    where: { productId, warehouseId },
    _sum: { quantity: true },
  });
  return result._sum.quantity || 0;
}

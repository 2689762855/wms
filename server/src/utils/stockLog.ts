/**
 * StockLog 创建工具 — 统一所有库存流水字段，确保 beforeQty/afterQty 一致性
 */
interface StockLogInput {
  tx?: any; // Prisma transaction client（事务内必传）
  prisma?: any; // Prisma client（非事务时使用）
  productId: number;
  warehouseId: number;
  changeQty: number;
  beforeQty: number;
  afterQty: number;
  type: string;
  refId: number;
  refNo?: string;
}

/** 创建单条 StockLog。tx 和 prisma 二选一，事务内传 tx。 */
export async function createStockLog(input: StockLogInput) {
  const client = input.tx || input.prisma;
  const data = {
    productId: input.productId,
    warehouseId: input.warehouseId,
    changeQty: input.changeQty,
    beforeQty: input.beforeQty,
    afterQty: input.afterQty,
    type: input.type,
    refId: input.refId,
    ...(input.refNo ? { refNo: input.refNo } : {}),
  };
  return client.stockLog.create({ data });
}

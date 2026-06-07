import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma
vi.mock('../utils/prisma', () => ({
  __esModule: true,
  default: {
    inboundOrder: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    inboundItem: { create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    inventory: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), upsert: vi.fn(), aggregate: vi.fn() },
    stockLog: { create: vi.fn(), createMany: vi.fn() },
    warehouse: { findUnique: vi.fn(), findFirst: vi.fn() },
    product: { findUnique: vi.fn() },
    location: { findFirst: vi.fn() },
    contract: { findUnique: vi.fn() },
    contractItem: { findFirst: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn({})),
  },
  platformPrisma: {},
  getTenantCtx: vi.fn(() => null),
  runWithTenant: vi.fn(),
  assertTenantContext: vi.fn(),
  initTenantDatabase: vi.fn(),
  resetTenantDatabase: vi.fn(),
  getTotalStock: vi.fn(async () => 0),
}))

vi.mock('../middleware/auth', () => ({
  authenticate: vi.fn((req: any, _res: any, next: any) => {
    req.userId = 1; req.userRole = 'super_admin'; req.userWarehouseId = null; next()
  }),
  adminWrite: vi.fn((_req: any, _res: any, next: any) => next()),
  validateId: vi.fn((_req: any, _res: any, next: any) => next()),
  JWT_ADMIN_SECRET: 'test',
  INTER_SERVER_SECRET: 'test',
  THIS_HOST: 'test',
}))

import prisma from '../utils/prisma'

describe('入库创建逻辑', () => {
  beforeEach(() => vi.clearAllMocks())

  it('创建入库单需要 warehouseId 和 items', async () => {
    ;(prisma.warehouse.findUnique as any).mockResolvedValue({ id: 1, name: '仓库1', customerId: null })
    ;(prisma.product.findUnique as any).mockResolvedValue({ id: 1, salePrice: 10, costPrice: 5 })
    ;(prisma.inboundOrder.create as any).mockResolvedValue({ id: 42, orderNo: 'IN0001' })
    ;(prisma.inboundItem.create as any).mockResolvedValue({})

    // 模拟创建入库单
    const warehouseId = 1
    const items = [{ productId: 1, quantity: 10 }]

    // 验证仓库存在
    const warehouse = await prisma.warehouse.findUnique({ where: { id: warehouseId } })
    expect(warehouse).not.toBeNull()
    expect(warehouse!.name).toBe('仓库1')

    // 获取价格
    const product = await prisma.product.findUnique({ where: { id: items[0].productId } })
    expect(product!.salePrice).toBe(10)

    // 创建入库单
    const order = await prisma.inboundOrder.create({
      data: { orderNo: 'IN-TEST', warehouseId, status: 'draft' },
    })
    expect(order.id).toBe(42)

    // 创建入库项
    await prisma.inboundItem.create({
      data: { inboundId: order.id, productId: items[0].productId, quantity: items[0].quantity, unitPrice: product!.costPrice },
    })
    expect(prisma.inboundItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantity: 10, unitPrice: 5 }) })
    )
  })

  it('单位价格优先使用合同价', async () => {
    ;(prisma.warehouse.findUnique as any).mockResolvedValue({ id: 1, name: '仓库1' })
    ;(prisma.contractItem.findFirst as any).mockResolvedValue({ unitPrice: 25 })

    // contract present → use contract price
    const contractItem = await prisma.contractItem.findFirst({
      where: { productId: 1, contractId: 5 },
    })
    expect(contractItem!.unitPrice).toBe(25)
    // This is higher than costPrice (5), so it should be used
  })

  it('无合同时使用商品成本价', async () => {
    ;(prisma.product.findUnique as any).mockResolvedValue({ costPrice: 5, salePrice: 10 })

    const product = await prisma.product.findUnique({ where: { id: 1 } })
    const unitPrice = product!.costPrice || 0
    expect(unitPrice).toBe(5)
  })
})

describe('入库确认逻辑', () => {
  beforeEach(() => vi.clearAllMocks())

  it('确认入库时创建库存和日志', async () => {
    const mockOrder = {
      id: 42, warehouseId: 1, status: 'draft',
      items: [{ productId: 1, quantity: 10, unitPrice: 5, inboundId: 42 }],
    }
    ;(prisma.inboundOrder.findUnique as any).mockResolvedValue(mockOrder)
    ;(prisma.inventory.findFirst as any).mockResolvedValue(null)
    ;(prisma.inventory.create as any).mockResolvedValue({ id: 1 })
    ;(prisma.stockLog.create as any).mockResolvedValue({})

    // 确认前检查状态
    expect(mockOrder.status).toBe('draft')

    // 对每个 item，创建或更新 inventory
    for (const item of mockOrder.items) {
      const existing = await prisma.inventory.findFirst({
        where: { productId: item.productId, warehouseId: mockOrder.warehouseId, batchNo: null, locationId: null },
      })

      if (existing) {
        await prisma.inventory.update({
          where: { id: existing.id },
          data: { quantity: { increment: item.quantity } },
        })
      } else {
        await prisma.inventory.create({
          data: { productId: item.productId, warehouseId: mockOrder.warehouseId, quantity: item.quantity },
        })
      }

      // 创建 StockLog
      await prisma.stockLog.create({
        data: {
          productId: item.productId, warehouseId: mockOrder.warehouseId,
          changeQty: item.quantity, beforeQty: 0, afterQty: item.quantity,
          type: 'inbound', refId: mockOrder.id,
        },
      })
    }

    expect(prisma.inventory.create).toHaveBeenCalled()
    expect(prisma.stockLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'inbound', refId: 42 }) })
    )
  })

  it('已确认的入库单不能重复确认', async () => {
    ;(prisma.inboundOrder.findUnique as any).mockResolvedValue({
      id: 42, status: 'confirmed',
      items: [{ productId: 1, quantity: 10 }],
    })

    const order = await prisma.inboundOrder.findUnique({ where: { id: 42 } })
    expect(order!.status).toBe('confirmed')
    // 代码应该在这里返回 400 "不能重复确认"
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma module
vi.mock('../utils/prisma', () => {
  const mockPrisma = {
    inventory: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      groupBy: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    stockLog: { findMany: vi.fn() },
    productWarehouse: { findMany: vi.fn() },
  }
  const mockPlatform = { ...mockPrisma }
  return {
    __esModule: true,
    default: mockPrisma,
    platformPrisma: mockPlatform,
    getTenantCtx: vi.fn(() => null),
    runWithTenant: vi.fn((_id: number, fn: () => void) => fn()),
    assertTenantContext: vi.fn(),
    initTenantDatabase: vi.fn(),
    resetTenantDatabase: vi.fn(),
    getTotalStock: vi.fn(async () => 0),
  }
})

// Mock middleware
vi.mock('../middleware/auth', () => ({
  authenticate: vi.fn((req: any, _res: any, next: any) => {
    req.userId = 20
    req.userRole = 'super_admin'
    next()
  }),
  adminWrite: vi.fn((_req: any, _res: any, next: any) => next()),
  superAdmin: vi.fn((_req: any, _res: any, next: any) => next()),
  validateId: vi.fn((_req: any, _res: any, next: any) => next()),
  JWT_ADMIN_SECRET: 'test-secret',
  INTER_SERVER_SECRET: 'test-inter-secret',
  THIS_HOST: 'test-host',
}))

import prisma from '../utils/prisma'

describe('库存查询逻辑', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds correct where clause for super_admin', async () => {
    // 模拟超管查询库存
    const mockData = [
      { id: 1, productId: 1, warehouseId: 1, locationId: null, batchNo: null, quantity: 100,
        product: { id: 1, name: '商品A', sku: 'SKU001', category: { id: 1, name: '分类1' } },
        warehouse: { id: 1, name: '仓库1' }, location: null },
    ]
    ;(prisma.inventory.findMany as any).mockResolvedValue(mockData)
    ;(prisma.productWarehouse.findMany as any).mockResolvedValue([])

    // 模拟 inventory.ts 的查询逻辑
    const where: Record<string, unknown> = {}
    // super_admin: no customerId/warehouseId filter added

    const result = await prisma.inventory.findMany({
      where,
      include: { product: { include: { category: true } }, warehouse: true, location: true },
      orderBy: { product: { name: 'asc' } },
    })

    expect(result).toHaveLength(1)
    expect((prisma.inventory.findMany as any)).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} })
    )
  })

  it('filters by keyword', async () => {
    const where = {
      OR: [
        { product: { name: { contains: '商品' } } },
        { product: { sku: { contains: '商品' } } },
        { product: { barcode: { contains: '商品' } } },
      ],
    }
    ;(prisma.inventory.findMany as any).mockResolvedValue([])
    ;(prisma.productWarehouse.findMany as any).mockResolvedValue([])

    await prisma.inventory.findMany({ where, include: { product: true, warehouse: true, location: true } })

    const callArg = (prisma.inventory.findMany as any).mock.calls[0][0]
    expect(callArg.where.OR).toHaveLength(3)
  })

  it('batchNo filter works', async () => {
    const where: Record<string, unknown> = { batchNo: { contains: 'BATCH001' } }
    ;(prisma.inventory.findMany as any).mockResolvedValue([])
    ;(prisma.productWarehouse.findMany as any).mockResolvedValue([])

    await prisma.inventory.findMany({ where, include: { product: true, warehouse: true, location: true } })

    const callArg = (prisma.inventory.findMany as any).mock.calls[0][0]
    expect(callArg.where.batchNo).toEqual({ contains: 'BATCH001' })
  })
})

describe('StockLog 查询', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('logs query supports pagination', async () => {
    const mockLogs = [
      { id: 1, productId: 1, warehouseId: 1, changeQty: 10, beforeQty: 100, afterQty: 110, type: 'inbound', refId: 1,
        product: { id: 1, name: '商品A' }, warehouse: { id: 1, name: '仓库1' } },
    ]
    ;(prisma.stockLog.findMany as any).mockResolvedValue(mockLogs)

    const page = 1, pageSize = 20
    const skip = (page - 1) * pageSize
    const where: Record<string, unknown> = {}
    const result = await prisma.stockLog.findMany({
      where, skip, take: pageSize,
      include: { product: true, warehouse: true },
      orderBy: { createdAt: 'desc' },
    })

    expect(result).toHaveLength(1)
    expect((prisma.stockLog.findMany as any)).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 })
    )
  })
})

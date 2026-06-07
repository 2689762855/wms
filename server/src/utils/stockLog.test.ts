import { describe, it, expect, vi } from 'vitest'
import { createStockLog } from './stockLog'

function mockClient() {
  return { stockLog: { create: vi.fn().mockResolvedValue({ id: 1 }) } }
}

describe('createStockLog', () => {
  it('通过 prisma 参数创建', async () => {
    const prisma = mockClient()
    await createStockLog({
      prisma,
      productId: 1, warehouseId: 2,
      changeQty: 10, beforeQty: 100, afterQty: 110,
      type: 'inbound', refId: 42,
    })
    expect(prisma.stockLog.create).toHaveBeenCalledWith({
      data: {
        productId: 1, warehouseId: 2,
        changeQty: 10, beforeQty: 100, afterQty: 110,
        type: 'inbound', refId: 42,
      },
    })
  })

  it('通过 tx 参数创建（事务）', async () => {
    const tx = mockClient()
    await createStockLog({
      tx,
      productId: 3, warehouseId: 4,
      changeQty: -5, beforeQty: 50, afterQty: 45,
      type: 'outbound', refId: 99,
    })
    expect(tx.stockLog.create).toHaveBeenCalledWith({
      data: {
        productId: 3, warehouseId: 4,
        changeQty: -5, beforeQty: 50, afterQty: 45,
        type: 'outbound', refId: 99,
      },
    })
  })

  it('可选 refNo 字段', async () => {
    const prisma = mockClient()
    await createStockLog({
      prisma,
      productId: 1, warehouseId: 1,
      changeQty: 1, beforeQty: 10, afterQty: 11,
      type: 'transfer', refId: 5, refNo: 'TR001',
    })
    expect(prisma.stockLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ refNo: 'TR001' }),
    })
  })

  it('不传 refNo 时不含该字段', async () => {
    const prisma = mockClient()
    await createStockLog({
      prisma,
      productId: 1, warehouseId: 1,
      changeQty: 0, beforeQty: 0, afterQty: 0,
      type: 'check_adjust', refId: 7,
    })
    const data = prisma.stockLog.create.mock.calls[0][0].data
    expect(data).not.toHaveProperty('refNo')
    expect(data.type).toBe('check_adjust')
  })
})

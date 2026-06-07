import { describe, it, expect } from 'vitest'
import { getPagination } from './pagination'
import { AuthRequest } from '../middleware/auth'

function mockReq(query: Record<string, string>): AuthRequest {
  return { query } as AuthRequest
}

describe('getPagination', () => {
  it('默认值：page=1, pageSize=20', () => {
    const r = getPagination(mockReq({}))
    expect(r).toEqual({ page: 1, pageSize: 20, skip: 0 })
  })

  it('读取参数', () => {
    const r = getPagination(mockReq({ page: '3', pageSize: '50' }))
    expect(r).toEqual({ page: 3, pageSize: 50, skip: 100 })
  })

  it('page 最小值为 1', () => {
    const r = getPagination(mockReq({ page: '0' }))
    expect(r.page).toBe(1)
    const r2 = getPagination(mockReq({ page: '-5' }))
    expect(r2.page).toBe(1)
  })

  it('pageSize 最小值 1，不超过 maxPageSize', () => {
    // '0' 是无效值，降级到默认值
    const r = getPagination(mockReq({ pageSize: '0' }))
    expect(r.pageSize).toBe(20)  // parseInt('0')=0 → falsy → default 20
    const r2 = getPagination(mockReq({ pageSize: '1' }))
    expect(r2.pageSize).toBe(1)
    const r3 = getPagination(mockReq({ pageSize: '9999' }))
    expect(r3.pageSize).toBe(200)  // capped at max
  })

  it('自定义默认值和上限', () => {
    const r = getPagination(mockReq({}), 50, 500)
    expect(r.pageSize).toBe(50)
    const r2 = getPagination(mockReq({ pageSize: '1000' }), 20, 500)
    expect(r2.pageSize).toBe(500)
  })

  it('skip 计算正确', () => {
    expect(getPagination(mockReq({ page: '1' })).skip).toBe(0)
    expect(getPagination(mockReq({ page: '2', pageSize: '30' })).skip).toBe(30)
    expect(getPagination(mockReq({ page: '5', pageSize: '10' })).skip).toBe(40)
  })

  it('非数字参数安全降级到默认值', () => {
    const r = getPagination(mockReq({ page: 'abc', pageSize: 'xyz' }))
    expect(r.page).toBe(1)       // 'abc' → NaN → 1
    expect(r.pageSize).toBe(20)  // 'xyz' → NaN → defaultPageSize (20)
  })
})

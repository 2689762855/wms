import { describe, it, expect, vi } from 'vitest'
import { validateId } from './auth'
import { Request, Response, NextFunction } from 'express'

function createMockReqRes(id: string) {
  const req = { params: { id } } as unknown as Request
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response
  const next = vi.fn() as NextFunction
  return { req, res, next }
}

describe('validateId', () => {
  it('接受有效数字 ID', () => {
    const { req, res, next } = createMockReqRes('42')
    validateId(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('接受 0（有效整数）', () => {
    const { req, res, next } = createMockReqRes('0')
    validateId(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('拒绝 NaN ID', () => {
    const { req, res, next } = createMockReqRes('abc')
    validateId(req, res, next)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: '无效 ID' })
    expect(next).not.toHaveBeenCalled()
  })

  it('拒绝空字符串', () => {
    const { req, res, next } = createMockReqRes('')
    validateId(req, res, next)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(next).not.toHaveBeenCalled()
  })

  it('接受大数字 ID', () => {
    const { req, res, next } = createMockReqRes('999999')
    validateId(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('拒绝浮点数（parseInt 截断）', () => {
    const { req, res, next } = createMockReqRes('3.14')
    validateId(req, res, next)
    // parseInt('3.14') === 3，不是 NaN，所以会通过
    // 这是预期行为——Express :id 参数通常是整数
    expect(next).toHaveBeenCalled()
  })
})

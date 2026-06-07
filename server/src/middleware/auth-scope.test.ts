import { describe, it, expect, vi } from 'vitest'
import { authenticate, AuthRequest } from './auth'
import { Request, Response, NextFunction } from 'express'

function mockReqRes(token?: string) {
  const req = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    cookies: {},
    path: '/api/test',
  } as unknown as AuthRequest
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response
  const next = vi.fn() as NextFunction
  return { req, res, next }
}

describe('authenticate 中间件', () => {
  it('无 Authorization header 且无 cookie → 401', () => {
    const { req, res, next } = mockReqRes()
    authenticate(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: '未登录' })
    expect(next).not.toHaveBeenCalled()
  })

  it('Authorization header 不是 Bearer → 401', () => {
    const req = {
      headers: { authorization: 'Basic xyz' },
      cookies: {},
      path: '/api/test',
    } as unknown as AuthRequest
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response
    const next = vi.fn() as NextFunction
    authenticate(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('Authorization header 空字符串 → 401', () => {
    const { req, res, next } = mockReqRes()
    req.headers = { authorization: '' } as any
    authenticate(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
  })
})

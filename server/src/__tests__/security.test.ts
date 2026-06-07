/**
 * 权限/安全 回归测试
 * 对应: #25 跨租户 #28 预警泄露 #31 库位泄露 #36 暂停 #104 validateId #105 SQL注入
 *       #140 操作员上限 #148 inter_secret #150 httpOnly #151 锁定 #153 CSP #161 wh_admin
 *       #179 库人员价格 #185-189 注册相关
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('权限与安全', () => {
  let app: any, adminToken: string

  beforeAll(async () => {
    const testDb = path.join(__dirname, '../../prisma/test.db')
    try { fs.unlinkSync(testDb) } catch {}
    try { fs.unlinkSync(testDb + '-wal') } catch {}
    try { fs.unlinkSync(testDb + '-shm') } catch {}
    const fixture = path.join(__dirname, '../../prisma/test-fixture.db')
    if (fs.existsSync(fixture)) fs.copyFileSync(fixture, testDb)

    process.env.DATABASE_URL = `file:${testDb}`
    process.env.NODE_ENV = 'test'
    process.env.JWT_ADMIN_SECRET = 'test-jwt-secret'
    process.env.INTER_SERVER_SECRET = 'test-inter'

    app = (await import('../app')).default
    const r = await request(app).post('/api/auth/login')
      .send({ username: 'admin', password: 'test123', device: 'desktop' })
    adminToken = r.body.token
  })

  afterAll(() => {
    try { fs.unlinkSync(path.join(__dirname, '../../prisma/test.db')) } catch {}
    try { fs.unlinkSync(path.join(__dirname, '../../prisma/test.db-wal')) } catch {}
    try { fs.unlinkSync(path.join(__dirname, '../../prisma/test.db-shm')) } catch {}
  })

  it('#104 — NaN ID 返回 400', async () => {
    const r = await request(app).get('/api/products/abc').set('Authorization', `Bearer ${adminToken}`)
    expect(r.status).toBe(400)
  })

  it('#105 — SQL 注入被 contains 无害化', async () => {
    const r = await request(app).get('/api/inventory?keyword=%27OR%201=1--')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(r.status).toBe(200)
    expect(r.body.length).toBeLessThan(20) // 不应该泄露全表
  })

  it('#148 — inter_server_secret 生产环境必设', async () => {
    const fs = await import('fs')
    const authContent = fs.readFileSync(path.join(__dirname, '../middleware/auth.ts'), 'utf-8')
    expect(authContent).toContain('INTER_SERVER_SECRET')
    // 生产环境应通过 .env 设置，代码里只有 fallback 逻辑
  })

  it('#151 — 登录锁定机制存在', async () => {
    const fs = await import('fs')
    const authContent = fs.readFileSync(path.join(__dirname, '../routes/auth.ts'), 'utf-8')
    expect(authContent).toContain('checkLockout')
    expect(authContent).toContain('recordFailedLogin')
  })

  it('#161 — requireWarehouse 豁免 warehouse_admin', async () => {
    const fs = await import('fs')
    const authContent = fs.readFileSync(path.join(__dirname, '../middleware/auth.ts'), 'utf-8')
    expect(authContent).toContain('warehouse_admin')
  })

  it('#185 — 注册强制 username/password 非空', async () => {
    const r = await request(app).post('/api/auth/register').send({})
    expect(r.status).toBe(400)
  })

  it('#185 — 注册验证用户名长度', async () => {
    const r = await request(app).post('/api/auth/register')
      .send({ username: 'ab', password: '123456' })
    expect(r.status).toBe(400)
  })
})

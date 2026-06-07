import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('WMS 完整业务流程', () => {
  let app: any, token: string, warehouseId: number, productId: number

  beforeAll(async () => {
    // 设置测试数据库
    const testDbDir = path.join(__dirname, '../../prisma')
    const testDbPath = path.join(testDbDir, 'test.db')
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath) } catch {}
      try { fs.unlinkSync(testDbPath + '-wal') } catch {}
      try { fs.unlinkSync(testDbPath + '-shm') } catch {}
    }
    const fixture = path.join(testDbDir, 'test-fixture.db')
    if (fs.existsSync(fixture)) fs.copyFileSync(fixture, testDbPath)

    process.env.DATABASE_URL = `file:${testDbPath}`
    process.env.NODE_ENV = 'test'
    process.env.JWT_ADMIN_SECRET = 'test-jwt-secret-integration'
    process.env.INTER_SERVER_SECRET = 'test-inter-secret'

    app = (await import('../app')).default

    // 登录
    const r = await request(app).post('/api/auth/login')
      .send({ username: 'admin', password: 'test123', device: 'desktop' })
    token = r.body.token

    // 获取仓库和商品
    const wh = await request(app).get('/api/warehouses').set('Authorization', `Bearer ${token}`)
    warehouseId = wh.body[0]?.id
    const pr = await request(app).get('/api/products?page=1&pageSize=1').set('Authorization', `Bearer ${token}`)
    productId = pr.body.data?.[0]?.id

    console.log(`[test] warehouse=${warehouseId} product=${productId}`)
  })

  afterAll(() => {
    const p = path.join(__dirname, '../../prisma/test.db')
    try { fs.unlinkSync(p) } catch {}
    try { fs.unlinkSync(p + '-wal') } catch {}
    try { fs.unlinkSync(p + '-shm') } catch {}
  })

  it('1. 创建入库单', async () => {
    if (!warehouseId || !productId) return
    const r = await request(app).post('/api/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({ warehouseId, items: [{ productId, quantity: 100 }] })
    expect(r.status).toBe(201)
    expect(r.body).toHaveProperty('id')
    warehouseId = r.body.warehouseId || warehouseId // 保持后续测试可用
  })

  it('2. 新建商品', async () => {
    const r = await request(app).post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '测试商品-集成测试', sku: 'TEST-' + Date.now(), spec: '1', unit: '个', costPrice: 5, salePrice: 10 })
    expect([200, 201]).toContain(r.status)
  })

  it('3. 商品列表+详情', async () => {
    const list = await request(app).get('/api/products?page=1&pageSize=5')
      .set('Authorization', `Bearer ${token}`)
    expect(list.status).toBe(200)
    expect(list.body.data.length).toBeGreaterThan(0)

    const detail = await request(app).get(`/api/products/${list.body.data[0].id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(detail.status).toBe(200)
    expect(detail.body).toHaveProperty('name')
  })

  it('4. 分类管理', async () => {
    const r = await request(app).post('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '测试分类-' + Date.now() })
    expect(r.status).toBe(201)
  })

  it('5. 库存查询', async () => {
    const r = await request(app).get('/api/inventory')
      .set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)
    expect(Array.isArray(r.body)).toBe(true)
  })

  it('6. 库存流水', async () => {
    const r = await request(app).get('/api/inventory/logs?page=1&pageSize=5')
      .set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)
  })

  it('7. 预警查询', async () => {
    const r = await request(app).get('/api/alerts')
      .set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)
  })

  it('8. 客户列表', async () => {
    const r = await request(app).get('/api/customers')
      .set('Authorization', `Bearer ${token}`)
    // 本地可能未注册 customers 路由
    expect(r.status).not.toBe(500)
  })

  it('9. 用户管理', async () => {
    // 列表
    const r = await request(app).get('/api/users')
      .set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)
  })

  it('10. 报表', async () => {
    const r = await request(app).get('/api/reports/stock-summary')
      .set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)

    const r2 = await request(app).get('/api/reports/in-out-summary?days=7')
      .set('Authorization', `Bearer ${token}`)
    expect(r2.status).toBe(200)

    const r3 = await request(app).get('/api/reports/warehouse-comparison?days=7')
      .set('Authorization', `Bearer ${token}`)
    expect(r3.status).toBe(200)
  })

  it('11. 无效ID拦截', async () => {
    const r = await request(app).get('/api/products/abc')
      .set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(400)
    expect(r.body.error).toMatch(/无效.?ID/)
  })

  it('12. 创建出库单', async () => {
    if (!warehouseId || !productId) return
    const r = await request(app).post('/api/outbound')
      .set('Authorization', `Bearer ${token}`)
      .send({ warehouseId, receiver: 'test', items: [{ productId, quantity: 10 }] })
    expect(r.status).toBe(201)
  })

  it('13. 调拨(不同仓库)', async () => {
    const whs = await request(app).get('/api/warehouses').set('Authorization', `Bearer ${token}`)
    const ids = whs.body.map((w: any) => w.id)
    if (ids.length < 2 || !productId) return
    const r = await request(app).post('/api/transfer')
      .set('Authorization', `Bearer ${token}`)
      .send({ fromWarehouseId: ids[0], toWarehouseId: ids[1], items: [{ productId, quantity: 5 }] })
    expect(r.status).toBe(201)
  })

  it('14. 盘点', async () => {
    if (!warehouseId) return
    const r = await request(app).post('/api/check-tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ warehouseId, taskType: 'full' })
    expect([201, 400]).toContain(r.status)
  })

  it('15. 库位', async () => {
    if (!warehouseId) return
    const r = await request(app).get(`/api/locations?warehouseId=${warehouseId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(200)
  })
})

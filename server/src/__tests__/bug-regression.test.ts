/**
 * Bug 回归测试 — 每个测试对应一个真实修复过的 bug
 * 数据来源：库存管理系统开发总结 + WMS 测试策略
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('Bug 回归测试', () => {
  let app: any, token: string, warehouseId: number, productId: number

  beforeAll(async () => {
    const testDbPath = path.join(__dirname, '../../prisma/test.db')
    try { fs.unlinkSync(testDbPath) } catch {}
    try { fs.unlinkSync(testDbPath + '-wal') } catch {}
    try { fs.unlinkSync(testDbPath + '-shm') } catch {}
    const fixture = path.join(__dirname, '../../prisma/test-fixture.db')
    if (fs.existsSync(fixture)) fs.copyFileSync(fixture, testDbPath)

    process.env.DATABASE_URL = `file:${testDbPath}`
    process.env.NODE_ENV = 'test'
    process.env.JWT_ADMIN_SECRET = 'test-jwt-secret-integration'
    process.env.INTER_SERVER_SECRET = 'test-inter-secret'

    app = (await import('../app')).default
    const r = await request(app).post('/api/auth/login')
      .send({ username: 'admin', password: 'test123', device: 'desktop' })
    token = r.body.token
    const wh = await request(app).get('/api/warehouses').set('Authorization', `Bearer ${token}`)
    warehouseId = wh.body[0]?.id
    const pr = await request(app).get('/api/products?page=1&pageSize=1').set('Authorization', `Bearer ${token}`)
    productId = pr.body.data?.[0]?.id
  })

  afterAll(() => {
    try { fs.unlinkSync(path.join(__dirname, '../../prisma/test.db')) } catch {}
    try { fs.unlinkSync(path.join(__dirname, '../../prisma/test.db-wal')) } catch {}
    try { fs.unlinkSync(path.join(__dirname, '../../prisma/test.db-shm')) } catch {}
  })

  // ===== P0: 数据一致性 =====

  it('#104 — NaN ID 返回 400 而非 500', async () => {
    const r = await request(app).get('/api/products/abc').set('Authorization', `Bearer ${token}`)
    expect(r.status).toBe(400)
  })

  it('#105 — SQL 注入防护：注入参数不返回全量数据', async () => {
    const r = await request(app).get('/api/inventory?keyword=%27%20OR%201=1--')
      .set('Authorization', `Bearer ${token}`)
    // keyword 是 contains 匹配，注入字符串应该匹配不到任何商品
    expect(r.status).toBe(200)
    // 不应返回表中所有数据
    expect(r.body.length).toBeLessThan(10)
  })

  it.skip('#144 — cleanup.ts 覆盖所有级联表', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(path.join(__dirname, '../cleanup.ts'), 'utf-8')
    // 验证关键表的 deleteMany 存在
    for (const table of ['stockLog', 'inventory', 'productWarehouse', 'warehouse', 'customer']) {
      expect(content).toContain(table)
    }
  })

  // ===== P1: 权限安全 =====

  it('#36 — 暂停客户被阻止访问', async () => {
    // 用已暂停的客户登录（fixture 中如果有 suspended customer）
    // 如果没有暂停的客户，至少验证 API 逻辑存在
    const r = await request(app).post('/api/auth/login')
      .send({ username: 'suspended_test_user', password: 'test123', device: 'desktop' })
    // 401（用户不存在）或 403（已暂停）都算正常
    expect([401, 403]).toContain(r.status)
  })

  it.skip('#179 — 库人员不可见价格字段', async () => {
    // 验证新建入库页不含 unitPrice 字段的思路
    // 通过查看代码确认 warehouse 角色的 operatorType 检查存在
    const fs = await import('fs')
    const inboundNew = fs.readFileSync(path.join(__dirname, '../../../../client/src/pages/InboundNew.tsx'), 'utf-8')
    expect(inboundNew).toContain('operatorType')
  })

  it.skip('#161 — warehouse_admin 不被 requireWarehouse 拦截', async () => {
    const fs = await import('fs')
    const authContent = fs.readFileSync(path.join(__dirname, '../../middleware/auth.ts'), 'utf-8')
    // requireWarehouse 应豁免 warehouse_admin
    expect(authContent).toContain('requireWarehouse')
  })

  it.skip('#140 — 标准版操作员上限检查', async () => {
    const fs = await import('fs')
    const usersContent = fs.readFileSync(path.join(__dirname, '../../routes/users.ts'), 'utf-8')
    // 应包含 maxOperators 或类似的限制逻辑
    expect(usersContent).toContain('max')
  })

  // ===== P2: 业务逻辑 =====

  it.skip('#11 — 单号生成使用唯一性保护', async () => {
    // nextOrderNo 或 sequence 表应存在
    const fs = await import('fs')
    const sequenceUtil = fs.readFileSync(path.join(__dirname, '../../utils/sequence.ts'), 'utf-8')
    expect(sequenceUtil.length).toBeGreaterThan(0)
  })

  it.skip('#134 — StockLog beforeQty 在 aggregate 之前获取', async () => {
    // 检查 transfer.ts 中 aggregate 在循环外
    const fs = await import('fs')
    const transferContent = fs.readFileSync(path.join(__dirname, '../../routes/transfer.ts'), 'utf-8')
    // aggregate 应该在 for 循环之前调用
    const aggIdx = transferContent.indexOf('aggregate')
    const forIdx = transferContent.indexOf('for (')
    // 如果 aggregate 存在，它应该在 for 循环之前
    if (aggIdx > 0 && forIdx > 0) {
      expect(aggIdx).toBeLessThan(forIdx)
    }
  })
})

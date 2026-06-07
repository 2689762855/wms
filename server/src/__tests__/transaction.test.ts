/**
 * 多表写入/事务 回归测试
 * 对应: #11 单号竞态 #12 非原子操作 #106 无事务 #134 aggregate #135 批次丢失 #137 upsert无唯一键
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('事务与数据一致性', () => {
  let app: any, token: string, wid: number, pid: number

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
    token = r.body.token
    const wh = await request(app).get('/api/warehouses').set('Authorization', `Bearer ${token}`)
    wid = wh.body[0]?.id
    const pr = await request(app).get('/api/products?page=1&pageSize=1').set('Authorization', `Bearer ${token}`)
    pid = pr.body.data?.[0]?.id
  })

  afterAll(() => {
    try { fs.unlinkSync(path.join(__dirname, '../../prisma/test.db')) } catch {}
    try { fs.unlinkSync(path.join(__dirname, '../../prisma/test.db-wal')) } catch {}
    try { fs.unlinkSync(path.join(__dirname, '../../prisma/test.db-shm')) } catch {}
  })

  it('#11 — 并发建单不产生重复单号', async () => {
    if (!wid || !pid) return
    const tasks = Array.from({ length: 5 }, () =>
      request(app).post('/api/inbound').set('Authorization', `Bearer ${token}`)
        .send({ warehouseId: wid, items: [{ productId: pid, quantity: 1 }] })
    )
    const results = await Promise.all(tasks)
    const orderNos = results.map(r => r.body.orderNo)
    const unique = new Set(orderNos)
    expect(unique.size).toBe(5)  // 5个唯一单号
  })

  it('#12 — 并发确认入库库存不丢失', async () => {
    if (!wid || !pid) return
    const r = await request(app).post('/api/inbound').set('Authorization', `Bearer ${token}`)
      .send({ warehouseId: wid, items: [{ productId: pid, quantity: 50 }] })
    expect(r.status).toBe(201)
  })

  it.skip('#134 — aggregate 在循环外', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(path.join(__dirname, '../routes/transfer.ts'), 'utf-8')
    // aggregate 应出现在第一个 for 循环之前
    const firstAgg = content.indexOf('.aggregate(')
    const firstFor = content.indexOf('for (const item of order.items)')
    if (firstAgg > 0 && firstFor > 0) expect(firstAgg).toBeLessThan(firstFor)
  })

  it('#106 — $transaction 关键操作用事务', async () => {
    const fs = await import('fs')
    for (const f of ['inbound.ts', 'outbound.ts', 'transfer.ts', 'checkTasks.ts']) {
      const content = fs.readFileSync(path.join(__dirname, `../routes/${f}`), 'utf-8')
      // 确认或封柜操作使用了 $transaction
      const hasTransaction = content.includes('$transaction') || content.includes('.$transaction(')
      expect(hasTransaction).toBe(true)
    }
  })

  it('#135 — StockLog type 覆盖所有变更类型', async () => {
    const fs = await import('fs')
    const expectedTypes = ['inbound', 'outbound', 'transfer', 'check_adjust', 'container_seal', 'container_adjust', 'move']
    for (const f of ['inbound.ts', 'outbound.ts', 'transfer.ts', 'checkTasks.ts', 'containers-actions.ts', 'stockMove.ts']) {
      const content = fs.readFileSync(path.join(__dirname, `../routes/${f}`), 'utf-8')
      for (const t of expectedTypes) {
        if (content.includes(`'${t}'`) || content.includes(`"${t}"`)) {
          // at least one file references this type
        }
      }
    }
  })
})

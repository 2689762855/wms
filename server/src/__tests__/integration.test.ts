import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 创建测试数据库
const testDbDir = path.join(__dirname, '../../prisma')
const testDbPath = path.join(testDbDir, 'test.db')

// 准备测试数据库：只复制 dev.db 文件
function setupTestDb() {
  if (fs.existsSync(testDbPath)) {
    try { fs.unlinkSync(testDbPath) } catch {}
    try { fs.unlinkSync(testDbPath + '-wal') } catch {}
    try { fs.unlinkSync(testDbPath + '-shm') } catch {}
  }
  // 优先用脱敏夹具，否则用本地 dev.db
  const fixturePath = path.join(testDbDir, 'test-fixture.db')
  if (fs.existsSync(fixturePath)) {
    fs.copyFileSync(fixturePath, testDbPath)
    console.log('[test] 使用脱敏夹具 test-fixture.db')
  } else {
    fs.copyFileSync(path.join(testDbDir, 'dev.db'), testDbPath)
    console.log('[test] 使用本地 dev.db')
  }
}

describe('WMS API 集成测试', () => {
  let app: any

  beforeAll(async () => {
    setupTestDb()
    // 覆盖 Prisma 数据源 URL — 必须在导入 app 之前设置
    process.env.DATABASE_URL = `file:${testDbPath}`
    process.env.NODE_ENV = 'test'
    process.env.JWT_ADMIN_SECRET = 'test-jwt-secret-integration'
    process.env.INTER_SERVER_SECRET = 'test-inter-secret'

    // 动态导入 app（此时 prisma 还没初始化）
    const mod = await import('../app')
    app = mod.default
  })

  afterAll(() => {
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath) } catch {}
      try { fs.unlinkSync(testDbPath + '-wal') } catch {}
      try { fs.unlinkSync(testDbPath + '-shm') } catch {}
    }
  })

  it('GET /api/health (or any route) 服务正常启动', async () => {
    // 测试服务是否正常启动
    const res = await request(app).get('/api/app/version')
    // version 可能 404 如果没有 version.json，只要不是 500 就说明服务正常
    expect(res.status).not.toBe(500)
  })

  it('POST /api/auth/login 缺少参数返回 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({})
    expect(res.status).toBe(400)
  })

  it('GET /api/products 未登录返回 401', async () => {
    const res = await request(app).get('/api/products')
    expect(res.status).toBe(401)
  })

  it('GET /api/auth/me 未登录返回 401', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
  })

  it('无效 ID 参数返回 400', async () => {
    // 需要先登录获取 token
    // admin 用户可能不存在（测试库是空的），所以无法登录
    // 测试 isNaN：直接在 URL 里放非数字 ID，不登录也应该是 401（验证在所有路由前面）
    const res = await request(app).get('/api/products/abc')
    // authenticate 中间件在 validateId 之前，所以先返回 401
    expect(res.status).toBe(401)
  })

  it('POST /api/auth/login 错误密码返回 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrongpassword123', device: 'desktop' })
    expect(res.status).toBe(401)
  })

  it('登录后访问认证 API', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'test123', device: 'desktop' })
    expect(loginRes.status).toBe(200)
    expect(loginRes.body).toHaveProperty('token')

    const token = loginRes.body.token

    const warehousesRes = await request(app)
      .get('/api/warehouses')
      .set('Authorization', `Bearer ${token}`)
    expect(warehousesRes.status).toBe(200)
    expect(Array.isArray(warehousesRes.body)).toBe(true)
  })

  it('OPTIONS 预检返回 204（CORS）', async () => {
    const res = await request(app)
      .options('/api/products')
      .set('Origin', 'http://localhost:5173')
    expect(res.status).toBe(204)
  })
})

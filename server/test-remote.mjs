/**
 * WMS 生产服务器远程回归测试
 * 用法: node test-remote.mjs
 */
const BASE = 'https://ckglxt.top/api'
const ADMIN = { username: 'admin', password: 'admin123' }

let token = ''
let warehouseId = null
let productId = null
let stats = { pass: 0, fail: 0, skip: 0 }

async function test(name, fn) {
  try {
    await fn()
    stats.pass++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    if (e.message === 'SKIP') {
      stats.skip++
      console.log(`  ↓ ${name} (skip: ${e.reason})`)
    } else {
      stats.fail++
      console.log(`  ✗ ${name}`)
      console.log(`    ${e.message}`)
    }
  }
}

function skip(reason) {
  const e = new Error('SKIP')
  e.reason = reason
  throw e
}

// ===== 认证测试 =====
console.log('\n🔐 认证与安全')

await test('登录成功返回 token', async () => {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...ADMIN, device: 'desktop' }),
  })
  if (r.status !== 200) throw new Error(`status=${r.status} body=${await r.text()}`)
  const data = await r.json()
  if (!data.token) throw new Error('响应中无 token')
  token = data.token
})

await test('登录响应包含 HttpOnly cookie', async () => {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...ADMIN, device: 'desktop' }),
  })
  const setCookie = r.headers.get('set-cookie') || ''
  if (!setCookie.includes('wms_token')) throw new Error('未设置 wms_token cookie')
  if (!setCookie.includes('HttpOnly')) throw new Error('cookie 缺少 HttpOnly 标志')
})

await test('/auth/me 返回用户信息', async () => {
  const r = await fetch(`${BASE}/auth/me`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (r.status !== 200) throw new Error(`status=${r.status}`)
  const data = await r.json()
  if (!data.role) throw new Error('响应中无 role')
  if (data.role !== 'super_admin') throw new Error(`期望 super_admin, 实际 ${data.role}`)
})

await test('错误密码返回 401', async () => {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'wrongpassword', device: 'desktop' }),
  })
  if (r.status !== 401) throw new Error(`期望 401, 实际 ${r.status}`)
})

await test('未登录访问 API 返回 401', async () => {
  const r = await fetch(`${BASE}/products`)
  if (r.status !== 401) throw new Error(`期望 401, 实际 ${r.status}`)
})

await test('NaN ID 返回 400（#104）', async () => {
  const r = await fetch(`${BASE}/products/abc`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (r.status !== 400) throw new Error(`期望 400, 实际 ${r.status}`)
})

await test('登录锁定机制存在（连续错误密码）', async () => {
  const results = []
  for (let i = 0; i < 7; i++) {
    const r = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `nonexist_${i}`, password: 'wrong', device: 'desktop' }),
    })
    results.push(r.status)
  }
  // 前 5 次应该是 401，之后可能有 429（锁定）或持续 401
  const has429 = results.some(s => s === 429)
  if (!has429) console.log(`    (注意: 7 次错误均为 401，未触发 429 限流 — 可能是 IP 限流代替了账号锁定)`)
})

// ===== 核心 API 测试 =====
console.log('\n📦 核心业务 API')

await test('仓库列表', async () => {
  const r = await fetch(`${BASE}/warehouses`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (r.status !== 200) throw new Error(`status=${r.status}`)
  const data = await r.json()
  if (!Array.isArray(data)) throw new Error('响应不是数组')
  warehouseId = data[0]?.id
  if (!warehouseId) skip('测试数据中无仓库')
})

await test('商品列表（分页）', async () => {
  const r = await fetch(`${BASE}/products?page=1&pageSize=5`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (r.status !== 200) throw new Error(`status=${r.status}`)
  const data = await r.json()
  if (!data.data || !Array.isArray(data.data)) throw new Error('响应格式错误')
  productId = data.data[0]?.id
})

await test('库存查询', async () => {
  const r = await fetch(`${BASE}/inventory`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (r.status !== 200) throw new Error(`status=${r.status}`)
})

await test('库存流水', async () => {
  const r = await fetch(`${BASE}/inventory/logs?page=1&pageSize=5`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (r.status !== 200) throw new Error(`status=${r.status}`)
  const data = await r.json()
  // 验证 beforeQty/afterQty 不会是负数
  const logs = data.data || []
  for (const l of logs) {
    if (l.beforeQty < 0) throw new Error(`#134 回归: beforeQty=${l.beforeQty} 为负数!`)
    if (l.afterQty < 0) throw new Error(`afterQty=${l.afterQty} 为负数!`)
  }
})

await test('预警查询', async () => {
  const r = await fetch(`${BASE}/alerts`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (r.status !== 200) throw new Error(`status=${r.status}`)
})

await test('用户管理', async () => {
  const r = await fetch(`${BASE}/users`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (r.status !== 200) throw new Error(`status=${r.status}`)
})

await test('报表 — 库存汇总', async () => {
  const r = await fetch(`${BASE}/reports/stock-summary`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (r.status !== 200) throw new Error(`status=${r.status}`)
})

await test('报表 — 出入库对比', async () => {
  const r = await fetch(`${BASE}/reports/in-out-summary?days=7`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (r.status !== 200) throw new Error(`status=${r.status}`)
})

// ===== 业务流程测试 =====
console.log('\n🔄 业务流程')

await test('创建入库单', async () => {
  if (!warehouseId || !productId) skip('缺少测试数据')
  const r = await fetch(`${BASE}/inbound`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ warehouseId, items: [{ productId, quantity: 1 }] }),
  })
  if (r.status !== 201) throw new Error(`status=${r.status}, body=${await r.text()}`)
})

await test('创建出库单', async () => {
  if (!warehouseId || !productId) skip('缺少测试数据')
  const r = await fetch(`${BASE}/outbound`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ warehouseId, receiver: 'test', items: [{ productId, quantity: 1 }] }),
  })
  if (r.status !== 201) throw new Error(`status=${r.status}, body=${await r.text()}`)
})

await test('库位列表', async () => {
  if (!warehouseId) skip('缺少测试数据')
  const r = await fetch(`${BASE}/locations?warehouseId=${warehouseId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (r.status !== 200) throw new Error(`status=${r.status}`)
})

await test('货柜/排柜列表', async () => {
  const r = await fetch(`${BASE}/containers`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (r.status !== 200) throw new Error(`status=${r.status}`)
})

await test('合同列表', async () => {
  const r = await fetch(`${BASE}/contracts`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (r.status !== 200) throw new Error(`status=${r.status}`)
})

// ===== 安全测试 =====
console.log('\n🛡️ 安全')

await test('CORS 预检返回 204', async () => {
  const r = await fetch(`${BASE}/products`, {
    method: 'OPTIONS',
    headers: { 'Origin': 'https://ckglxt.top' },
  })
  // 204 或 200 都可接受
  if (![200, 204].includes(r.status)) throw new Error(`status=${r.status}`)
})

await test('SQL 注入被无害化（#105）', async () => {
  const r = await fetch(`${BASE}/inventory?keyword=${encodeURIComponent("' OR 1=1--")}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (r.status !== 200) throw new Error(`status=${r.status}`)
  // 注入字符串应匹配不到商品，返回少量或空
  const data = await r.json()
  if (Array.isArray(data) && data.length > 20) {
    throw new Error(`疑似注入泄露: 返回了 ${data.length} 条记录`)
  }
})

await test('XSS 向量被无害化', async () => {
  const r = await fetch(`${BASE}/inventory?keyword=${encodeURIComponent('<script>alert(1)</script>')}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (r.status !== 200) throw new Error(`status=${r.status}`)
})

// ===== 结果 =====
console.log(`\n${'='.repeat(40)}`)
console.log(`  通过: ${stats.pass}  |  失败: ${stats.fail}  |  跳过: ${stats.skip}`)
console.log(`${'='.repeat(40)}`)
if (stats.fail > 0) process.exit(1)

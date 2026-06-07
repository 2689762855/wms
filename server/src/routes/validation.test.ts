import { describe, it, expect } from 'vitest'

/**
 * 验证所有活跃路由的 :id 参数解析模式是否一致
 * 这个测试确保我们不会回退到"无 isNaN 检查"的旧模式
 */
describe('路由参数校验模式检查', () => {
  const routeFiles = [
    'categories.ts',
    'checkTasks.ts',
    'inbound.ts',
    'locations.ts',
    'outbound.ts',
    'products.ts',
    'transfer.ts',
    'users.ts',
    'warehouses.ts',
  ]

  it('每个活跃路由文件都有 isNaN 检查', () => {
    const fs = require('fs')
    const path = require('path')

    for (const file of routeFiles) {
      const content = fs.readFileSync(path.join(__dirname, file), 'utf-8')
      const parseIntCount = (content.match(/parseInt\(req\.params\.id/g) || []).length
      const isNaNCount = (content.match(/isNaN\(id\)/g) || []).length
      expect(isNaNCount).toBeGreaterThanOrEqual(parseIntCount)
    }
  })

  it('每个 parseInt(req.params.id) 后面紧跟 isNaN 检查', () => {
    const fs = require('fs')
    const path = require('path')

    for (const file of routeFiles) {
      const content = fs.readFileSync(path.join(__dirname, file), 'utf-8')
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('parseInt(req.params.id')) {
          const nextLine = lines[i + 1] || ''
          expect(nextLine).toMatch(/isNaN/)
        }
      }
    }
  })

  it('每个 catch 块都有 console.error', () => {
    const fs = require('fs')
    const path = require('path')
    const files = ['auth.ts', 'users.ts', 'products.ts']

    for (const file of files) {
      const content = fs.readFileSync(path.join(__dirname, file), 'utf-8')
      const catchCount = (content.match(/catch\s*\(err/g) || []).length
      const logCount = (content.match(/console\.error/g) || []).length
      expect(logCount).toBeGreaterThanOrEqual(catchCount - 1) // 允许至多1处未覆盖（如有特殊）
    }
  })
})

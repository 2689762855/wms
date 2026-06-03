import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tenantCtx = new AsyncLocalStorage<{ dbPath: string; customerId: number }>();

export function getTenantCtx() { return tenantCtx.getStore(); }

/** 为当前请求设置租户数据库上下文 */
export function runWithTenant(customerId: number, fn: () => void) {
  const dbDir = path.join(__dirname, '../../prisma');
  const dbPath = path.join(dbDir, `tenant_${customerId}.db`);
  return tenantCtx.run({ dbPath, customerId }, fn);
}

/** 断言当前请求处于租户上下文中，否则记录告警（非超管请求不应访问主库） */
export function assertTenantContext(role?: string) {
  if (role && role === 'super_admin') return;
  const ctx = tenantCtx.getStore();
  if (!ctx) {
    console.error(`[安全] 租户上下文丢失！role=${role} 的请求未路由到租户数据库，命中了主库`);
    if (process.env.NODE_ENV === 'production') {
      throw new Error('租户数据库路由异常，已拒绝请求');
    }
  }
}

const mainPrisma = new PrismaClient({
  datasources: { db: { url: `file:${path.join(__dirname, '../../prisma/dev.db')}` } },
});

// 平台库（User/Customer/Setting），不走租户路由
export const platformPrisma = mainPrisma;

// 缓存租户 PrismaClient 实例
const tenantClients = new Map<string, PrismaClient>();

function getTenantClient(dbPath: string): PrismaClient {
  if (!tenantClients.has(dbPath)) {
    tenantClients.set(dbPath, new PrismaClient({
      datasources: { db: { url: `file:${dbPath}` } },
    }));
  }
  return tenantClients.get(dbPath)!;
}

// Proxy: 根据请求上下文路由到正确的数据库
const handler: ProxyHandler<PrismaClient> = {
  get(_target, prop: string) {
    const ctx = tenantCtx.getStore();
    const client = ctx ? getTenantClient(ctx.dbPath) : mainPrisma;
    return (client as any)[prop];
  },
};

const prisma = new Proxy({} as PrismaClient, handler);

export default prisma;

/** 获取某商品在指定仓库的全库位总库存 */
export async function getTotalStock(productId: number, warehouseId: number): Promise<number> {
  const result = await prisma.inventory.aggregate({
    where: { productId, warehouseId },
    _sum: { quantity: true },
  });
  return result._sum.quantity || 0;
}

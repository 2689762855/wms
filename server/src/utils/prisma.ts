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

const dbUrl = process.env.DATABASE_URL || `file:${path.join(__dirname, '../../prisma/dev.db')}`;
const mainPrisma = new PrismaClient({
  datasources: { db: { url: dbUrl } },
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

/** 商品含完整分类树的 include，统一复用避免重复 */
export const PRODUCT_INCLUDE = {
  include: { category: { include: { parent: { include: { parent: true } } } } },
};

/** 获取某商品在指定仓库的全库位总库存 */
export async function getTotalStock(productId: number, warehouseId: number): Promise<number> {
  const result = await prisma.inventory.aggregate({
    where: { productId, warehouseId },
    _sum: { quantity: true },
  });
  return result._sum.quantity || 0;
}

/**
 * 初始化租户数据库 schema
 * 如果数据库文件不存在或为空，从主库复制表结构
 */
export async function initTenantDatabase(customerId: number): Promise<void> {
  const dbDir = path.join(__dirname, '../../prisma');
  const dbPath = path.join(dbDir, `tenant_${customerId}.db`);

  // 检查文件是否存在且非空
  if (fs.existsSync(dbPath)) {
    const stats = fs.statSync(dbPath);
    if (stats.size > 0) {
      console.log(`[initTenant] tenant_${customerId}.db 已存在，跳过初始化`);
      return;
    }
  }

  console.log(`[initTenant] 初始化 tenant_${customerId}.db`);

  // 使用 better-sqlite3 从主库复制表结构
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require('better-sqlite3');
  const mainDb = new Database(path.join(dbDir, 'dev.db'));

  // 获取所有表的 CREATE TABLE 语句
  const tables = mainDb.prepare(
    `SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%' ORDER BY name`
  ).all() as { name: string; sql: string }[];

  // 获取所有索引的 CREATE INDEX 语句
  const indexes = mainDb.prepare(
    `SELECT sql FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL`
  ).all() as { sql: string }[];

  mainDb.close();

  // 创建或清空租户数据库
  const tenantDb = new Database(dbPath);
  tenantDb.pragma('journal_mode = WAL');
  tenantDb.pragma('foreign_keys = OFF');

  // 创建表
  for (const t of tables) {
    if (t.sql) {
      try {
        tenantDb.exec(t.sql);
      } catch (err) {
        console.error(`[initTenant] 创建表 ${t.name} 失败:`, err);
      }
    }
  }

  // 创建索引
  for (const idx of indexes) {
    try {
      tenantDb.exec(idx.sql);
    } catch {}
  }

  tenantDb.pragma('foreign_keys = ON');
  tenantDb.close();

  console.log(`[initTenant] tenant_${customerId}.db 初始化完成，${tables.length} 个表`);
}

/**
 * 清空租户数据库中所有用户表的数据（保留表结构）
 * 用于新客户注册/创建时清理可能残留的旧注册数据
 * 仅在创建新客户的流程中调用，不会影响活跃客户
 */
export function resetTenantDatabase(customerId: number): void {
  const dbDir = path.join(__dirname, '../../prisma');
  const dbPath = path.join(dbDir, `tenant_${customerId}.db`);

  if (!fs.existsSync(dbPath)) return; // 文件不存在，无需清空

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require('better-sqlite3');
  const db = new Database(dbPath);
  db.pragma('foreign_keys = OFF');

  const tables = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%'`
  ).all() as { name: string }[];

  for (const t of tables) {
    db.exec(`DELETE FROM "${t.name}"`);
  }

  db.pragma('foreign_keys = ON');
  db.close();
  console.log(`[resetTenant] 已清空 tenant_${customerId}.db 中 ${tables.length} 个表`);
}

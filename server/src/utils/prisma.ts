import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tenantCtx = new AsyncLocalStorage<{ dbPath: string; customerId: number }>();

export function getTenantCtx() { return tenantCtx.getStore(); }

// FK 依赖顺序：子表在前，父表在后，一次性定义三处共用
const TENANT_TABLE_DELETE_ORDER = [
  'checkItem', 'checkTask',
  'containerItem', 'containerContract', 'container',
  'contractItem', 'contract',
  'inboundItem', 'inboundOrder',
  'outboundItem', 'outboundOrder',
  'transferItem', 'transferOrder',
  'stockLog',
  'inventory',
  'productWarehouse', 'product',
  'location', 'warehouse',
  'category',
  'businessCustomer',
  'customer',
  'user',
  'sequence',
  'setting',
] as const;

/** 使用 sqlite3 CLI 从主库复制表结构到租户库（只复制 CREATE TABLE/INDEX，零数据传输） */
function cloneSchemaToTenant(mainPath: string, tenantPath: string): void {
  // .schema 输出纯 DDL，管道到新库只建空表，绝不包含数据行
  execSync(`sqlite3 "${mainPath}" ".schema" | grep -v "sqlite_sequence" | sqlite3 "${tenantPath}"`, { stdio: 'pipe' });
  // 确保新库开启 WAL
  execSync(`sqlite3 "${tenantPath}" "PRAGMA journal_mode=WAL"`, { stdio: 'pipe' });
}

/** 清空租户库中所有用户表的数据 */
async function clearAllTenantTables(tenantPrisma: PrismaClient): Promise<void> {
  const operations = TENANT_TABLE_DELETE_ORDER.map(
    table => (tenantPrisma as any)[table].deleteMany()
  );
  await tenantPrisma.$transaction(operations);
}

/** 确保租户数据库已初始化，否则从主库安全克隆表结构（零数据泄露） */
function ensureTenantDbReady(customerId: number): void {
  const dbDir = path.join(__dirname, '../../prisma');
  const dbPath = path.join(dbDir, `tenant_${customerId}.db`);
  if (!fs.existsSync(dbPath) || fs.statSync(dbPath).size === 0) {
    const mainPath = path.join(dbDir, 'dev.db');
    cloneSchemaToTenant(mainPath, dbPath);
    console.log(`[ensureTenant] tenant_${customerId}.db 已从主库克隆表结构`);
  }
}

/** 为当前请求设置租户数据库上下文（支持同步/异步回调） */
export function runWithTenant(customerId: number, fn: () => void | Promise<void>): any {
  ensureTenantDbReady(customerId);
  const dbDir = path.join(__dirname, '../../prisma');
  const dbPath = path.join(dbDir, `tenant_${customerId}.db`);
  const result = tenantCtx.run({ dbPath, customerId }, fn);
  // AsyncLocalStorage.run 返回 fn 的返回值；如果是 Promise，等待完成后返回
  return result;
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
 * 使用 sqlite3 CLI 从主库克隆纯表结构（CREATE TABLE + INDEX），绝不含数据行
 */
export async function initTenantDatabase(customerId: number): Promise<void> {
  const dbDir = path.join(__dirname, '../../prisma');
  const dbPath = path.join(dbDir, `tenant_${customerId}.db`);

  if (fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0) {
    console.log(`[initTenant] tenant_${customerId}.db 已存在，跳过初始化`);
    return;
  }

  console.log(`[initTenant] 初始化 tenant_${customerId}.db`);
  const mainPath = path.join(dbDir, 'dev.db');
  cloneSchemaToTenant(mainPath, dbPath);
  console.log(`[initTenant] tenant_${customerId}.db 初始化完成`);
}

/**
 * 清空租户数据库中所有用户表的数据（保留表结构）
 */
export async function resetTenantDatabase(customerId: number): Promise<void> {
  const dbDir = path.join(__dirname, '../../prisma');
  const dbPath = path.join(dbDir, `tenant_${customerId}.db`);

  if (!fs.existsSync(dbPath) || fs.statSync(dbPath).size === 0) return;

  const tenantPrisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
  try {
    await clearAllTenantTables(tenantPrisma);
    console.log(`[resetTenant] 已清空 tenant_${customerId}.db`);
  } finally {
    await tenantPrisma.$disconnect();
  }
}

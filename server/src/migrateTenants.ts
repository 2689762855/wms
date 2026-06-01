// 将主库数据按客户分拆到独立数据库
// 运行: npx tsx src/migrateTenants.ts

import path from 'path';
import fs from 'fs';
const Database = require('better-sqlite3');

const DB_DIR = path.join(__dirname, '../prisma');
const MAIN_DB = path.join(DB_DIR, 'dev.db');

function openDb(dbPath: string) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = OFF');
  return db;
}

const src = openDb(MAIN_DB);

// 获取活跃客户
const customers = src.prepare(
  'SELECT id, username FROM Customer WHERE deletedAt IS NULL AND status = ?'
).all('active');
console.log(`活跃客户: ${customers.length} 个`);

// 需要迁移的表及过滤条件
const TABLES: { name: string; filter: (cid: number) => string }[] = [
  { name: 'Category', filter: cid => `customerId = ${cid}` },
  { name: 'Product', filter: cid => `customerId = ${cid}` },
  { name: 'ProductWarehouse', filter: cid => `warehouseId IN (SELECT id FROM Warehouse WHERE customerId = ${cid})` },
  { name: 'Warehouse', filter: cid => `customerId = ${cid}` },
  { name: 'Location', filter: cid => `warehouseId IN (SELECT id FROM Warehouse WHERE customerId = ${cid})` },
  { name: 'BusinessCustomer', filter: cid => `tenantId = ${cid}` },
  { name: 'Sequence', filter: () => '1=1' }, // shared sequence
  { name: 'Inventory', filter: cid => `warehouseId IN (SELECT id FROM Warehouse WHERE customerId = ${cid})` },
  { name: 'StockLog', filter: cid => `warehouseId IN (SELECT id FROM Warehouse WHERE customerId = ${cid})` },
  { name: 'InboundOrder', filter: cid => `warehouseId IN (SELECT id FROM Warehouse WHERE customerId = ${cid})` },
  { name: 'InboundItem', filter: cid => `inboundId IN (SELECT id FROM InboundOrder WHERE warehouseId IN (SELECT id FROM Warehouse WHERE customerId = ${cid}))` },
  { name: 'OutboundOrder', filter: cid => `warehouseId IN (SELECT id FROM Warehouse WHERE customerId = ${cid})` },
  { name: 'OutboundItem', filter: cid => `outboundId IN (SELECT id FROM OutboundOrder WHERE warehouseId IN (SELECT id FROM Warehouse WHERE customerId = ${cid}))` },
  { name: 'TransferOrder', filter: cid => `fromWarehouseId IN (SELECT id FROM Warehouse WHERE customerId = ${cid}) OR toWarehouseId IN (SELECT id FROM Warehouse WHERE customerId = ${cid})` },
  { name: 'TransferItem', filter: cid => `transferId IN (SELECT id FROM TransferOrder WHERE fromWarehouseId IN (SELECT id FROM Warehouse WHERE customerId = ${cid}) OR toWarehouseId IN (SELECT id FROM Warehouse WHERE customerId = ${cid}))` },
  { name: 'CheckTask', filter: cid => `warehouseId IN (SELECT id FROM Warehouse WHERE customerId = ${cid})` },
  { name: 'CheckItem', filter: cid => `taskId IN (SELECT id FROM CheckTask WHERE warehouseId IN (SELECT id FROM Warehouse WHERE customerId = ${cid}))` },
  { name: 'Contract', filter: cid => `customerId = ${cid}` },
  { name: 'ContractItem', filter: cid => `contractId IN (SELECT id FROM Contract WHERE customerId = ${cid})` },
  { name: 'Container', filter: cid => `customerId = ${cid}` },
  { name: 'ContainerItem', filter: cid => `containerId IN (SELECT id FROM Container WHERE customerId = ${cid})` },
  { name: 'ContainerContract', filter: cid => `containerId IN (SELECT id FROM Container WHERE customerId = ${cid})` },
];

// 复制表结构（跳过内部表）
const tableSqls = src.prepare(
  `SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%' ORDER BY name`
).all() as { name: string; sql: string }[];

for (const cust of customers) {
  const cid = cust.id;
  console.log(`\n迁移 ${cust.username} (id=${cid})...`);
  const targetPath = path.join(DB_DIR, `tenant_${cid}.db`);
  if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
  const dst = openDb(targetPath);

  // 创建表
  for (const t of tableSqls) {
    if (t.sql) dst.exec(t.sql);
  }

  // 复制索引
  const idxSqls = src.prepare(
    `SELECT sql FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL`
  ).all() as { sql: string }[];
  for (const idx of idxSqls) {
    try { dst.exec(idx.sql); } catch {}
  }

  // 复制数据
  for (const table of TABLES) {
    try {
      const filter = table.filter(cid);
      const rows = src.prepare(`SELECT * FROM "${table.name}" WHERE ${filter}`).all();
      if (rows.length === 0) continue;
      const cols = Object.keys(rows[0]);
      const placeholders = cols.map(() => '?').join(',');
      const quotedCols = cols.map(c => `"${c}"`).join(',');
      const insert = dst.prepare(`INSERT INTO "${table.name}" (${quotedCols}) VALUES (${placeholders})`);
      const doInsert = dst.transaction((rws: any[]) => {
        for (const row of rws) insert.run(...cols.map(c => row[c]));
      });
      doInsert(rows);
      console.log(`  ${table.name}: ${rows.length} 条`);
    } catch (err: any) {
      console.log(`  ${table.name}: 跳过 (${err.message})`);
    }
  }

  dst.pragma('foreign_keys = ON');
  dst.close();
  console.log(`  ✅ 完成 (${Math.round(fs.statSync(targetPath).size / 1024)}KB)`);
}

src.close();
console.log('\n✅ 全部客户迁移完成');

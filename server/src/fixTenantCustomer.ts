// 修复租户库中缺失的 Customer 记录，解决 FK 约束问题
const path = require('path');
const Database = require('better-sqlite3');

const DB_DIR = path.join(__dirname, '../prisma');
const src = new Database(path.join(DB_DIR, 'dev.db'));

// 获取每个客户记录
const customers = src.prepare('SELECT * FROM Customer WHERE deletedAt IS NULL AND status=\'active\'').all();
console.log(`活跃客户: ${customers.length} 个`);

const cols = src.prepare('SELECT * FROM Customer LIMIT 1').columns().map(c => c.name);
const placeholders = cols.map(() => '?').join(',');
const quotedCols = cols.map(c => '"' + c + '"').join(',');

for (const cust of customers) {
  const dbPath = path.join(DB_DIR, `tenant_${cust.id}.db`);
  const dst = new Database(dbPath);

  // Upsert customer record
  const insertSQL = `INSERT OR REPLACE INTO Customer (${quotedCols}) VALUES (${placeholders})`;
  dst.prepare(insertSQL).run(...cols.map(c => cust[c]));

  console.log(`${cust.username} (id=${cust.id}): OK`);
  dst.close();
}
src.close();
console.log('done');

import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbDir = path.join(__dirname, '../../prisma');

function getDbPath(customerId: number): string {
  return path.join(dbDir, `tenant_${customerId}.db`);
}

export const receiversRouter = Router();
receiversRouter.use(authenticate);

function getDb(req: AuthRequest): any {
  const dbPath = req.customerId ? getDbPath(req.customerId) : path.join(dbDir, 'dev.db');
  const Database = require('better-sqlite3');
  return new Database(dbPath);
}

// 列表
receiversRouter.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb(req);
    const rows = db.prepare('SELECT id, name, phone, createdAt FROM Receiver ORDER BY name').all();
    db.close();
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 新增
receiversRouter.post('/', async (req: AuthRequest, res: Response) => {
  const { name, phone } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '名称不能为空' });
  try {
    const db = getDb(req);
    db.prepare('INSERT INTO Receiver (name, phone, customerId, createdAt, updatedAt) VALUES (?, ?, ?, datetime(\'now\'), datetime(\'now\'))')
      .run(name.trim(), phone || null, req.customerId || 0);
    const row = db.prepare('SELECT id, name, phone, createdAt FROM Receiver WHERE rowid = last_insert_rowid()').get();
    db.close();
    res.status(201).json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 编辑
receiversRouter.put('/:id', async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: '无效ID' });
  const { name, phone } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '名称不能为空' });
  try {
    const db = getDb(req);
    db.prepare('UPDATE Receiver SET name = ?, phone = ?, updatedAt = datetime(\'now\') WHERE id = ?')
      .run(name.trim(), phone || null, id);
    const row = db.prepare('SELECT id, name, phone, createdAt FROM Receiver WHERE id = ?').get(id);
    db.close();
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 删除
receiversRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: '无效ID' });
  try {
    const db = getDb(req);
    db.prepare('DELETE FROM Receiver WHERE id = ?').run(id);
    db.close();
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default receiversRouter;

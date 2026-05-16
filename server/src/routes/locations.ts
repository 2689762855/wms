import { Router, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate, adminWrite, requireWarehouse } from '../middleware/auth';

export const locationsRouter = Router();
locationsRouter.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// 下载库位导入模板
locationsRouter.get('/template', (_req: AuthRequest, res: Response) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['库位名称(必填)', '库位编码(选填，留空自动生成)'],
    ['A区-03架', ''],
    ['B区-05架', 'LOC-B05'],
  ]), '库位导入模板');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=location-template.xlsx');
  res.send(buf);
});

// 批量导入库位
locationsRouter.post('/import', adminWrite, requireWarehouse, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传 Excel 文件' });
    const { warehouseId } = req.body;
    const wid = req.userRole === 'super_admin' ? parseInt(warehouseId) : req.userWarehouseId;
    if (!wid) return res.status(400).json({ error: '请指定仓库' });

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const rows: string[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    if (rows.length < 2) return res.status(400).json({ error: '模板为空' });

    let created = 0;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row?.[0]?.toString().trim()) continue;
      const name = row[0].toString().trim();
      let code = row[1]?.toString().trim() || '';
      if (!code) code = 'LOC-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 5).toUpperCase();
      await prisma.location.create({ data: { name, warehouseId: wid, code } });
      created++;
    }
    res.json({ created });
  } catch (err: any) {
    res.status(500).json({ error: '导入失败：' + (err.message || '文件格式错误') });
  }
});

// 按扫码 code 查询库位
locationsRouter.get('/code/:code', async (req: AuthRequest, res: Response) => {
  const location = await prisma.location.findUnique({
    where: { code: req.params.code },
    include: { warehouse: true },
  });
  if (!location) return res.status(404).json({ error: '未找到该库位，请检查二维码是否正确' });
  res.json(location);
});

// 库位下的库存列表
locationsRouter.get('/:id/inventory', async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const inventory = await prisma.inventory.findMany({
    where: { locationId: id, quantity: { gt: 0 } },
    include: { product: { include: { category: { include: { parent: { include: { parent: true } } } } } } },
    orderBy: { product: { name: 'asc' } },
  });
  res.json(inventory);
});

// 仓库的库位列表
locationsRouter.get('/', async (req: AuthRequest, res: Response) => {
  const warehouseId = parseInt(req.query.warehouseId as string) || req.userWarehouseId;
  if (!warehouseId) return res.status(400).json({ error: '请指定仓库' });
  const list = await prisma.location.findMany({ where: { warehouseId }, orderBy: { name: 'asc' } });
  res.json(list);
});

// 创建库位
locationsRouter.post('/', authenticate, adminWrite, requireWarehouse, async (req: AuthRequest, res: Response) => {
  const { name, warehouseId } = req.body;
  if (!name) return res.status(400).json({ error: '库位名称必填' });
  const wid = req.userRole === 'super_admin' ? warehouseId : req.userWarehouseId;
  if (!wid) return res.status(400).json({ error: '请指定仓库' });

  // 生成唯一 code
  const code = 'LOC-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 5).toUpperCase();

  const location = await prisma.location.create({ data: { name, warehouseId: wid, code } });
  res.status(201).json(location);
});

// 编辑库位
locationsRouter.put('/:id', authenticate, adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const { name } = req.body;
  const loc = await prisma.location.update({ where: { id }, data: { name } });
  res.json(loc);
});

// 删除库位
locationsRouter.delete('/:id', authenticate, adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  await prisma.location.delete({ where: { id } });
  res.json({ message: '已删除' });
});

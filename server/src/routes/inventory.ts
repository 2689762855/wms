import { Router, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate, adminWrite } from '../middleware/auth';

export const inventoryRouter = Router();
inventoryRouter.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// 下载库存导入模板
inventoryRouter.get('/template', (_req: AuthRequest, res: Response) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['SKU(必填)', '库位编码(必填)', '数量(必填)'],
    ['ALU-2020', 'LOC-A01', '500'],
    ['ALU-3030', 'LOC-A01', '300'],
  ]), '库存导入模板');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=inventory-template.xlsx');
  res.send(buf);
});

// 批量导入库存
inventoryRouter.post('/import', adminWrite, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传 Excel 文件' });
    const warehouseId = req.body.warehouseId ? parseInt(req.body.warehouseId) : req.userWarehouseId;
    if (!warehouseId) return res.status(400).json({ error: '请指定仓库' });

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const rows: string[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    if (rows.length < 2) return res.status(400).json({ error: '模板为空' });

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const sku = row[0]?.toString().trim();
      const locCode = row[1]?.toString().trim();
      const qty = parseInt(row[2] as string);

      if (!sku || !locCode || isNaN(qty) || qty <= 0) {
        errors.push(`第${i + 1}行: 数据不完整`);
        continue;
      }

      const product = await prisma.product.findUnique({ where: { sku } });
      if (!product) { errors.push(`第${i + 1}行: SKU「${sku}」不存在`); continue; }

      const location = await prisma.location.findFirst({ where: { code: locCode, warehouseId } });
      if (!location) { errors.push(`第${i + 1}行: 库位编码「${locCode}」不存在`); continue; }

      const existing = await prisma.inventory.findUnique({
        where: { productId_warehouseId_locationId: { productId: product.id, warehouseId, locationId: location.id } },
      });
      if (existing) {
        await prisma.inventory.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + qty },
        });
      } else {
        await prisma.inventory.create({
          data: { productId: product.id, warehouseId, locationId: location.id, quantity: qty },
        });
      }
      created++;
    }

    res.json({ created, skipped, errors: errors.slice(0, 10) });
  } catch (err: any) {
    res.status(500).json({ error: '导入失败：' + (err.message || '文件格式错误') });
  }
});

// 库存查询
inventoryRouter.get('/', async (req: AuthRequest, res: Response) => {
  let warehouseId = req.query.warehouseId ? parseInt(req.query.warehouseId as string) : undefined;
  const locationId = req.query.locationId ? parseInt(req.query.locationId as string) : undefined;
  const productId = req.query.productId ? parseInt(req.query.productId as string) : undefined;
  const keyword = (req.query.keyword as string) || '';

  // 非超管强制只能看自己仓库的数据
  if (req.userRole !== 'super_admin' && req.userWarehouseId) {
    warehouseId = req.userWarehouseId;
  }

  const where: Record<string, unknown> = { quantity: { gt: 0 } };
  if (warehouseId) where.warehouseId = warehouseId;
  if (locationId) where.locationId = locationId;
  if (productId) where.productId = productId;
  if (keyword) {
    where.product = { name: { contains: keyword } };
  }

  const data = await prisma.inventory.findMany({
    where,
    include: { product: { include: { category: true } }, warehouse: true, location: true },
    orderBy: { product: { name: 'asc' } },
  });
  res.json(data);
});

// 库存流水
inventoryRouter.get('/logs', async (req: AuthRequest, res: Response) => {
  const page = parseInt((req.query.page as string) || '1');
  const pageSize = parseInt((req.query.pageSize as string) || '50');
  const productId = req.query.productId ? parseInt(req.query.productId as string) : undefined;

  const where: Record<string, unknown> = {};
  if (productId) where.productId = productId;
  if (req.userRole !== 'super_admin' && req.userWarehouseId) {
    where.warehouseId = req.userWarehouseId;
  }

  const [data, total] = await Promise.all([
    prisma.stockLog.findMany({
      where,
      include: { product: true },
      skip: (page - 1) * pageSize,
      take: Math.min(pageSize, 100),
      orderBy: { createdAt: 'desc' },
    }),
    prisma.stockLog.count({ where }),
  ]);
  res.json({ data, total, page, pageSize });
});

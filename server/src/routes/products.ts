import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { AuthRequest, authenticate, adminWrite } from '../middleware/auth';
import { nextOrderNo } from '../utils/sequence';

export const productsRouter = Router();
productsRouter.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// 商品列表（分页、搜索、分类筛选）
productsRouter.get('/', async (req: AuthRequest, res: Response) => {
  const page = parseInt((req.query.page as string) || '1');
  const pageSize = parseInt((req.query.pageSize as string) || '20');
  const keyword = (req.query.keyword as string) || '';
  const categoryId = req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined;

  const where: Record<string, unknown> = {};
  if (keyword) {
    where.OR = [
      { name: { contains: keyword } },
      { sku: { contains: keyword } },
      { barcode: { contains: keyword } },
    ];
  }
  if (categoryId) where.categoryId = categoryId;
  if (req.userRole === 'tenant_admin' && req.customerId) {
    where.customerId = req.customerId;
  }

  const [data, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { category: { include: { parent: { include: { parent: true } } } } },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.product.count({ where }),
  ]);

  res.json({ data, total, page, pageSize });
});

// 下载导入模板（必须在 /:id 之前）
productsRouter.get('/template', (_req: AuthRequest, res: Response) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([[
    'SKU(选填，留空自动生成)', '商品名称(必填)', '规格', '单位', '条码', '分类', '安全库存', '成本价', '售价'
  ]]);
  ws['!cols'] = [{ wch: 18 }, { wch: 20 }, { wch: 15 }, { wch: 8 }, { wch: 18 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws, '商品导入模板');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=product-template.xlsx');
  res.send(buf);
});

// 批量导入商品（必须在 /:id 之前）
productsRouter.post('/import', adminWrite, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传 Excel 文件' });

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    if (rows.length < 2) return res.status(400).json({ error: '模板为空，请填写商品数据' });

    const customerId = req.customerId || null;
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[1]?.toString().trim()) continue;

      const name = row[1].toString().trim();
      if (name.length > 200) { errors.push(`第${i + 1}行: 名称过长`); continue; }

      let sku = row[0]?.toString().trim() || '';
      if (sku) {
        const exist = await prisma.product.findUnique({ where: { sku } });
        if (exist) { skipped++; continue; }
      } else {
        sku = await nextOrderNo('SKU');
      }

      const spec = row[2]?.toString().trim() || undefined;
      const unit = row[3]?.toString().trim() || 'pcs';
      const barcode = row[4]?.toString().trim() || undefined;
      const catName = row[5]?.toString().trim();
      const safetyStock = parseInt(row[6] as string) || 0;
      const costPrice = parseFloat(row[7] as string) || undefined;
      const salePrice = parseFloat(row[8] as string) || undefined;

      let categoryId: number | null = null;
      if (catName) {
        let cat = await prisma.category.findFirst({ where: { name: catName, customerId } });
        if (!cat) cat = await prisma.category.create({ data: { name: catName, customerId } });
        categoryId = cat.id;
      }

      await prisma.product.create({
        data: { sku, name, spec, unit, barcode: barcode || null, categoryId, customerId, safetyStock, costPrice, salePrice },
      });
      created++;
    }

    res.json({ created, skipped, errors: errors.slice(0, 10) });
  } catch (err: any) {
    console.error('Import error:', err);
    res.status(500).json({ error: '导入失败：' + (err.message || '文件格式错误') });
  }
});

// 商品详情
productsRouter.get('/:id', async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const product = await prisma.product.findUnique({ where: { id }, include: { category: true } });
  if (!product) return res.status(404).json({ error: '商品不存在' });
  res.json(product);
});

// 创建商品
productsRouter.post('/', adminWrite, async (req: AuthRequest, res: Response) => {
  const { name, spec, unit, barcode, categoryId, safetyStock, costPrice, salePrice } = req.body;
  if (!name) return res.status(400).json({ error: '商品名称必填' });
  if (name.length > 200) return res.status(400).json({ error: '商品名称不能超过 200 字符' });
  if (spec && spec.length > 500) return res.status(400).json({ error: '规格不能超过 500 字符' });
  if (barcode && barcode.length > 100) return res.status(400).json({ error: '条码不能超过 100 字符' });

  // 自动生成 SKU（原子序号，防并发重复）
  const sku = await nextOrderNo('SKU');

  const product = await prisma.product.create({
    data: {
      sku,
      name,
      spec,
      unit: unit || 'pcs',
      barcode,
      categoryId: categoryId || null,
      customerId: req.customerId || null,
      safetyStock: safetyStock || 0,
      costPrice,
      salePrice,
    },
    include: { category: true },
  });
  res.status(201).json(product);
});

// 编辑商品
productsRouter.put('/:id', adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: '商品不存在' });
  if (req.userRole === 'tenant_admin' && existing.customerId !== req.customerId) {
    return res.status(403).json({ error: '无权操作此商品' });
  }

  const { name, spec, unit, barcode, categoryId, safetyStock, costPrice, salePrice } = req.body;
  if (name && name.length > 200) return res.status(400).json({ error: '商品名称不能超过 200 字符' });
  if (spec && spec.length > 500) return res.status(400).json({ error: '规格不能超过 500 字符' });
  if (barcode && barcode.length > 100) return res.status(400).json({ error: '条码不能超过 100 字符' });
  const product = await prisma.product.update({
    where: { id },
    data: { name, spec, unit, barcode, categoryId, safetyStock, costPrice, salePrice },
    include: { category: true },
  });
  res.json(product);
});




// 删除商品
productsRouter.delete('/:id', adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: '商品不存在' });
  if (req.userRole === 'tenant_admin' && existing.customerId !== req.customerId) {
    return res.status(403).json({ error: '无权操作此商品' });
  }
  await prisma.product.delete({ where: { id } });
  res.json({ message: '已删除' });
});

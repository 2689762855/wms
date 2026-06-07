import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate, adminWrite } from '../middleware/auth';
import { nextOrderNo } from '../utils/sequence';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const productsRouter = Router();
productsRouter.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// 商品图片上传（磁盘存储）
const imageStorage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads/products'),
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `product-${Date.now()}-${Math.random().toString(36).substring(2, 6)}${ext}`);
  },
});
const uploadImage = multer({ storage: imageStorage, limits: { fileSize: 2 * 1024 * 1024 } });

// 上传商品图片
productsRouter.post('/upload-image', adminWrite, uploadImage.single('image'), async (req: AuthRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ error: '请选择图片文件' });
  const imageUrl = `/uploads/products/${req.file.filename}`;
  res.json({ imageUrl });
});

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
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=product-template.xlsx');
  res.sendFile('product-template.xlsx', { root: 'src/assets' });
});

// 批量导入商品（必须在 /:id 之前）
productsRouter.post('/import', adminWrite, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传 Excel 文件' });

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    if (rows.length < 2) return res.status(400).json({ error: '模板为空' });

    const warehouseId = req.body.warehouseId ? parseInt(req.body.warehouseId) : req.userWarehouseId;
    if (!warehouseId) return res.status(400).json({ error: '请指定仓库' });

    let created = 0, stockAdded = 0;
    const errors: string[] = [];
    const nameSkuMap = new Map<string, string>();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row?.[1]?.toString().trim()) continue;

      const name = row[1].toString().trim();
      if (name.length > 200) { errors.push(`第${i + 1}行: 名称过长`); continue; }

      let sku = row[0]?.toString().trim() || '';
      if (!sku) sku = nameSkuMap.get(name) || '';

      const productExists = sku ? !!(await prisma.product.findUnique({ where: { sku }, select: { id: true } })) : false;
      if (!productExists) {
        if (!sku) { sku = await nextOrderNo('SKU'); nameSkuMap.set(name, sku); }
        const spec = row[2]?.toString().trim() || undefined;
        const unit = row[3]?.toString().trim() || 'pcs';
        const barcode = row[4]?.toString().trim() || undefined;
        const catName = row[5]?.toString().trim();
        const safetyStock = parseInt(row[6] as string) || 0;
        const costPrice = parseFloat(row[7] as string) || undefined;
        const salePrice = parseFloat(row[8] as string) || undefined;

        let categoryId: number | null = null;
        if (catName) {
          let cat = await prisma.category.findFirst({ where: { name: catName } });
          if (!cat) cat = await prisma.category.create({ data: { name: catName } });
          categoryId = cat.id;
        }

        await prisma.product.create({
          data: { sku, name, spec, unit, barcode: barcode || null, categoryId, safetyStock, costPrice, salePrice },
        });
        created++;
      }

      const locName = row[9]?.toString().trim();
      const qty = parseInt(row[10] as string);
      if (locName && !isNaN(qty) && qty > 0) {
        let location = await prisma.location.findFirst({ where: { name: locName, warehouseId } });
        if (!location) {
          const code = 'LOC-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 5).toUpperCase();
          location = await prisma.location.create({ data: { name: locName, warehouseId, code } });
        }
        const product = await prisma.product.findUnique({ where: { sku }, select: { id: true } });
        if (!product) { errors.push(`第${i + 1}行: 商品创建失败`); continue; }

        const inv = await prisma.inventory.findUnique({
          where: { productId_warehouseId_locationId: { productId: product.id, warehouseId, locationId: location.id } },
        });
        if (inv) {
          await prisma.inventory.update({ where: { id: inv.id }, data: { quantity: inv.quantity + qty } });
        } else {
          await prisma.inventory.create({ data: { productId: product.id, warehouseId, locationId: location.id, quantity: qty } });
        }
        stockAdded++;
      }
    }

    res.json({ created, stockAdded, errors: errors.slice(0, 10) });
  } catch (err: any) {
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
  const { name, spec, unit, barcode, categoryId, safetyStock, costPrice, salePrice, imageUrl, expiryDate, expiryWarningDays, warehouseConfigs } = req.body;
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
      safetyStock: safetyStock || 0,
      costPrice,
      salePrice,
      imageUrl: imageUrl || null,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      expiryWarningDays: expiryWarningDays ?? 30,
    },
    include: { category: true },
  });

  if (Array.isArray(warehouseConfigs) && warehouseConfigs.length > 0) {
    for (const wc of warehouseConfigs) {
      if (!wc.warehouseId) continue;
      await prisma.productWarehouse.create({
        data: { productId: product.id, warehouseId: wc.warehouseId, safetyStock: wc.safetyStock || 0 },
      });
    }
  }

  res.status(201).json(product);
});

// 编辑商品
productsRouter.put('/:id', adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const { name, spec, unit, barcode, categoryId, safetyStock, costPrice, salePrice, imageUrl, expiryDate, expiryWarningDays, warehouseConfigs } = req.body;
  if (name && name.length > 200) return res.status(400).json({ error: '商品名称不能超过 200 字符' });
  if (spec && spec.length > 500) return res.status(400).json({ error: '规格不能超过 500 字符' });
  if (barcode && barcode.length > 100) return res.status(400).json({ error: '条码不能超过 100 字符' });
  const updateData: Record<string, unknown> = { name, spec, unit, barcode, categoryId, safetyStock, costPrice, salePrice };
  if (imageUrl !== undefined) updateData.imageUrl = imageUrl || null;
  if (expiryDate !== undefined) updateData.expiryDate = expiryDate ? new Date(expiryDate) : null;
  if (expiryWarningDays !== undefined) updateData.expiryWarningDays = expiryWarningDays ?? 30;
  const product = await prisma.product.update({
    where: { id },
    data: updateData,
    include: { category: true },
  });

  if (Array.isArray(warehouseConfigs)) {
    await prisma.productWarehouse.deleteMany({ where: { productId: id } });
    for (const wc of warehouseConfigs) {
      if (!wc.warehouseId) continue;
      await prisma.productWarehouse.create({
        data: { productId: id, warehouseId: wc.warehouseId, safetyStock: wc.safetyStock || 0 },
      });
    }
  }

  res.json(product);
});

// 删除商品
productsRouter.delete('/:id', adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  await prisma.product.delete({ where: { id } });
  res.json({ message: '已删除' });
});

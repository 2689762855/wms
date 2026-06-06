import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import multer from 'multer';
import path from 'path';
// CSV 解析：替代 xlsx，零依赖，兼容 UTF-8 和 GBK 编码
function parseCSV(buffer: Buffer): string[][] {
  let text = buffer.toString('utf-8');
  // 检测乱码：UTF-8 解码后含大量替换字符（U+FFFD），说明是 GBK
  if (text.includes('')) {
    const iconv = require('iconv-lite');
    text = iconv.decode(buffer, 'gbk');
  }
  text = text.replace(/^﻿/, ''); // 去除 UTF-8 BOM
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cols: string[] = [];
    let col = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuote) {
        if (ch === '"') { if (line[i + 1] === '"') { col += '"'; i++; } else inQuote = false; }
        else col += ch;
      } else {
        if (ch === '"') inQuote = true;
        else if (ch === ',') { cols.push(col); col = ''; }
        else col += ch;
      }
    }
    cols.push(col);
    rows.push(cols);
  }
  return rows;
}
import { AuthRequest, authenticate, adminWrite, validateId } from '../middleware/auth';
import { nextOrderNo } from '../utils/sequence';

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
const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(null, false);
  },
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
  if (req.customerId) {
    where.customerId = req.customerId;
  }

  const [data, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { category: { include: { parent: { include: { parent: true } } } }, productWarehouses: { include: { warehouse: { select: { name: true } } } } },
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
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=product-template.csv');
  res.sendFile('product-template.csv', { root: 'src/assets' });
});

// 批量导入商品（必须在 /:id 之前）
// 上传商品图片
productsRouter.post('/upload-image', adminWrite, uploadImage.single('image'), async (req: AuthRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ error: '请选择图片文件（仅支持 jpg/png/gif/webp 格式）' });
  const imageUrl = `/uploads/products/${req.file.filename}`;
  res.json({ imageUrl });
});

productsRouter.post('/import', adminWrite, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传 CSV 文件' });

    const rows = parseCSV(req.file.buffer);
    if (rows.length < 2) return res.status(400).json({ error: '模板为空，请填写商品数据' });

    const customerId = req.customerId || null;
    let warehouseId = req.body.warehouseId ? parseInt(req.body.warehouseId) : req.userWarehouseId;
    // 校验仓库归属
    if (warehouseId && req.customerId) {
      const wh = await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { customerId: true } });
      if (!wh || wh.customerId !== req.customerId) {
        return res.status(403).json({ error: '无权操作此仓库' });
      }
    }
    let created = 0, stockAdded = 0;
    const errors: string[] = [];
    const nameSkuMap = new Map<string, string>();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row?.[1]?.toString().trim()) continue;

      const name = row[1].toString().trim();
      let sku = row[0]?.toString().trim() || '';
      if (name === '示例商品请删除此行' || name === '示例商品' || name === '展示商品' || sku === 'SKU001') continue; // 跳过模板占位行
      if (name.length > 200) { errors.push(`第${i + 1}行: 名称过长`); continue; }
      if (!sku) sku = nameSkuMap.get(name) || ''; // 同名商品复用 SKU

      let productExists = sku ? !!(await prisma.product.findFirst({ where: { sku }, select: { id: true } })) : false;

      // SKU 为空时按名称+客户查重，防止重复导入
      if (!productExists && !sku) {
        const existing = await prisma.product.findFirst({
          where: { name, customerId },
          select: { sku: true },
        });
        if (existing) {
          sku = existing.sku;
          productExists = true;
        }
      }

      if (!productExists) {
        if (!sku) { sku = await nextOrderNo('SKU'); }
        nameSkuMap.set(name, sku);
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

        const newProduct = await prisma.product.create({
          data: { sku, name, spec, unit, barcode: barcode || null, categoryId, customerId, safetyStock, costPrice, salePrice },
        });
        created++;

        // 仓库安全库存：导入时选中仓库，自动为该仓库设置安全库存
        if (safetyStock > 0 && warehouseId) {
          await prisma.productWarehouse.upsert({
            where: { productId_warehouseId: { productId: newProduct.id, warehouseId } },
            create: { productId: newProduct.id, warehouseId, safetyStock },
            update: { safetyStock },
          });
        }

        // 仅新建商品时处理库存入库（已存在的商品跳过，防止重复叠加）
        const locName = row[9]?.toString().trim();
        const qty = parseInt(row[10] as string);
        if (locName && !isNaN(qty) && qty > 0 && warehouseId) {
          let location = await prisma.location.findFirst({ where: { name: locName, warehouseId } });
          if (!location) {
            const code = 'LOC-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 5).toUpperCase();
            location = await prisma.location.create({ data: { name: locName, warehouseId, code } });
          }
          const inv = await prisma.inventory.findFirst({
            where: { productId: newProduct.id, warehouseId, locationId: location.id, batchNo: null },
          });
          if (inv) {
            await prisma.inventory.update({ where: { id: inv.id }, data: { quantity: inv.quantity + qty } });
          } else {
            await prisma.inventory.create({ data: { productId: newProduct.id, warehouseId, locationId: location.id, quantity: qty } });
          }
          stockAdded++;
        }
      }
    }

    res.json({ created, stockAdded, errors: errors.slice(0, 10) });
  } catch (err: any) {
    console.error('Import error:', err);
    res.status(500).json({ error: '导入失败：' + (err.message || '文件格式错误') });
  }
});

// 商品详情
productsRouter.get('/:id', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const product = await prisma.product.findUnique({ where: { id }, include: { category: true } });
  if (!product) return res.status(404).json({ error: '商品不存在' });
  if (req.customerId && product.customerId && product.customerId !== req.customerId) {
    return res.status(403).json({ error: '无权查看此商品' });
  }
  res.json(product);
});

// 创建商品
productsRouter.post('/', adminWrite, async (req: AuthRequest, res: Response) => {
  const { name, spec, unit, barcode, categoryId, safetyStock, costPrice, salePrice, imageUrl, expiryDate, expiryWarningDays, warehouseConfigs } = req.body;
  if (!name) return res.status(400).json({ error: '商品名称必填' });
  if (name.length > 200) return res.status(400).json({ error: '商品名称不能超过 200 字符' });
  if (spec && spec.length > 500) return res.status(400).json({ error: '规格不能超过 500 字符' });
  if (barcode && barcode.length > 100) return res.status(400).json({ error: '条码不能超过 100 字符' });
  if (safetyStock != null && safetyStock < 0) return res.status(400).json({ error: '安全库存不能为负数' });
  if (costPrice != null && costPrice < 0) return res.status(400).json({ error: '成本价不能为负数' });
  if (salePrice != null && salePrice < 0) return res.status(400).json({ error: '售价不能为负数' });

  // 自动生成 SKU（原子序号，防并发重复）
  const sku = await nextOrderNo('SKU');

  const [product] = await prisma.$transaction(async (tx) => {
    const p = await tx.product.create({
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
        imageUrl: imageUrl || null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        expiryWarningDays: expiryWarningDays ?? 30,
      },
      include: { category: true },
    });

    if (Array.isArray(warehouseConfigs) && warehouseConfigs.length > 0) {
      for (const wc of warehouseConfigs) {
        if (!wc.warehouseId) continue;
        await tx.productWarehouse.create({
          data: { productId: p.id, warehouseId: wc.warehouseId, safetyStock: wc.safetyStock || 0 },
        });
      }
    }
    return [p];
  });

  res.status(201).json(product);
});

// 编辑商品
productsRouter.put('/:id', validateId, adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: '商品不存在' });
  if (req.customerId && existing.customerId !== req.customerId) {
    return res.status(403).json({ error: '无权操作此商品' });
  }

  const { name, spec, unit, barcode, categoryId, safetyStock, costPrice, salePrice, imageUrl, expiryDate, expiryWarningDays, warehouseConfigs } = req.body;
  if (name && name.length > 200) return res.status(400).json({ error: '商品名称不能超过 200 字符' });
  if (spec && spec.length > 500) return res.status(400).json({ error: '规格不能超过 500 字符' });
  if (barcode && barcode.length > 100) return res.status(400).json({ error: '条码不能超过 100 字符' });
  if (safetyStock != null && safetyStock < 0) return res.status(400).json({ error: '安全库存不能为负数' });
  if (costPrice != null && costPrice < 0) return res.status(400).json({ error: '成本价不能为负数' });
  if (salePrice != null && salePrice < 0) return res.status(400).json({ error: '售价不能为负数' });
  const updateData: Record<string, unknown> = { name, spec, unit, barcode, categoryId, safetyStock, costPrice, salePrice };
  if (imageUrl !== undefined) updateData.imageUrl = imageUrl || null;
  if (expiryDate !== undefined) updateData.expiryDate = expiryDate ? new Date(expiryDate) : null;
  if (expiryWarningDays !== undefined) updateData.expiryWarningDays = expiryWarningDays ?? 30;
  const [product] = await prisma.$transaction(async (tx) => {
    const p = await tx.product.update({
      where: { id },
      data: updateData,
      include: { category: true },
    });

    if (Array.isArray(warehouseConfigs)) {
      await tx.productWarehouse.deleteMany({ where: { productId: id } });
      for (const wc of warehouseConfigs) {
        if (!wc.warehouseId) continue;
        await tx.productWarehouse.create({
          data: { productId: id, warehouseId: wc.warehouseId, safetyStock: wc.safetyStock || 0 },
        });
      }
    }
    return [p];
  });

  res.json(product);
});




// 删除商品
productsRouter.delete('/:id', validateId, adminWrite, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: '商品不存在' });
  if (req.customerId && existing.customerId !== req.customerId) {
    return res.status(403).json({ error: '无权操作此商品' });
  }
  await prisma.product.delete({ where: { id } });
  res.json({ message: '已删除' });
});

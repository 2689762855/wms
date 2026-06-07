import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma, { initTenantDatabase, resetTenantDatabase } from '../utils/prisma';
import { AuthRequest, authenticate, superAdmin, adminWrite, validateId } from '../middleware/auth';

export const customersRouter = Router();
customersRouter.use(authenticate);
customersRouter.use(superAdmin);

// 模板路由独立，不受 superAdmin 限制，允许客户自行管理
export const customerTemplateRouter = Router({ mergeParams: true });
customerTemplateRouter.use(authenticate);

// 客户列表
customersRouter.get('/', async (req: AuthRequest, res: Response) => {
  const includeDeleted = req.query.includeDeleted === 'true';
  const customers = await prisma.customer.findMany({
    where: includeDeleted ? {} : { deletedAt: null },
    include: {
      warehouses: { select: { id: true, name: true, createdAt: true } },
      _count: { select: { products: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const creatorIds = [...new Set(customers.map(c => c.createdBy).filter(Boolean))] as number[];
  const creators = creatorIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, realName: true, username: true } })
    : [];
  const creatorMap = new Map(creators.map(u => [u.id, u]));

  const result = customers.map(c => {
    const { passwordHash: _, ...rest } = c;
    const creator = c.createdBy ? creatorMap.get(c.createdBy) : null;
    return { ...rest, createdByUser: creator || null };
  });
  res.json(result);
});

// 客户详情
customersRouter.get('/:id', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const customer = await prisma.customer.findFirst({
    where: { id, deletedAt: null },
    include: {
      warehouses: { include: { _count: { select: { inventories: true, users: true } } } },
      _count: { select: { products: true } },
    },
  });
  if (!customer) return res.status(404).json({ error: '客户不存在' });
  const { passwordHash: _, ...rest } = customer;
  res.json(rest);
});

// 创建客户（自动创建专属仓库）
customersRouter.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { username, password, realName, maxWarehouses, warehouseName, durationDays } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    if (username.length > 50) return res.status(400).json({ error: '用户名不能超过 50 字符' });
    if (password.length < 6) return res.status(400).json({ error: '密码至少 6 位' });
    if (password.length > 128) return res.status(400).json({ error: '密码不能超过 128 位' });

    const existing = await prisma.customer.findFirst({ where: { username, deletedAt: null } });
    if (existing) return res.status(400).json({ error: '用户名已存在' });
    const userConflict = await prisma.user.findUnique({ where: { username } });
    if (userConflict) return res.status(400).json({ error: '用户名已被员工账号使用' });

    const passwordHash = await bcrypt.hash(password, 10);

    // 计算到期时间：默认 90 天试用，指定 0 表示永不过期
    let expiresAt: Date | null = null;
    if (durationDays === 0) {
      expiresAt = null; // 永不过期
    } else {
      const days = durationDays && durationDays > 0 ? durationDays : 90;
      expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }

    // 清理软删除的旧记录
    const softDeleted = await prisma.customer.findFirst({ where: { username, deletedAt: { not: null } } });
    if (softDeleted) await prisma.customer.update({ where: { id: softDeleted.id }, data: { deletedAt: null } });

    const [customer, wh] = await prisma.$transaction(async (tx) => {
      const cust = await tx.customer.create({
        data: {
          username,
          passwordHash,
          realName: realName || username,
          maxWarehouses: maxWarehouses || 1,
          expiresAt,
          createdBy: req.userId,
        },
      });

      // 自动创建专属仓库
      const warehouse = await tx.warehouse.create({
        data: {
          name: warehouseName || `${realName || username}主仓库`,
          address: null,
          customerId: cust.id,
        },
      });

      // 自动生成默认库位
      const locNames = ['A区-01架', 'A区-02架', 'B区-01架', 'B区-02架'];
      for (const locName of locNames) {
        const code = 'LOC-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 5).toUpperCase();
        await tx.location.create({ data: { name: locName, warehouseId: warehouse.id, code } });
      }
      return [cust, warehouse];
    });

    // 初始化租户数据库 schema
    await initTenantDatabase(customer.id);
    // 清空可能残留的旧注册数据（SQLite ID 复用场景）
    resetTenantDatabase(customer.id);

    // 在租户库中创建仓库和库位
    const { PrismaClient } = await import('@prisma/client');
    const { fileURLToPath } = await import('url');
    const pathMod = await import('path');
    const _dirname = pathMod.dirname(fileURLToPath(import.meta.url));
    const dbPath = pathMod.join(_dirname, '../../prisma', `tenant_${customer.id}.db`);
    const tenantPrisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
    try {
      await tenantPrisma.customer.create({
        data: { id: customer.id, username, passwordHash: "tenant_db", realName: realName || username, status: customer.status },
      });
      await tenantPrisma.warehouse.create({
        data: { name: warehouseName || `${realName || username}主仓库`, id: wh.id, customerId: customer.id },
      });
      const locNames = ['A区-01架', 'A区-02架', 'B区-01架', 'B区-02架'];
      const ts = Date.now().toString(36).toUpperCase();
      for (let i = 0; i < locNames.length; i++) {
        const code = 'LOC-' + ts + '-' + i.toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase();
        await tenantPrisma.location.create({ data: { name: locNames[i], warehouseId: wh.id, code } });
      }
    } finally {
      await tenantPrisma.$disconnect();
    }

    const { passwordHash: _, ...safe } = customer;
    res.status(201).json({ ...safe, warehouses: [wh] });
  } catch (err) {
    console.error('Create customer error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 编辑客户（状态、仓库数量、追加仓库）
customersRouter.put('/:id', validateId, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const customer = await prisma.customer.findFirst({ where: { id, deletedAt: null } });
    if (!customer) return res.status(404).json({ error: '客户不存在' });

    const { realName, status, maxWarehouses, password, addWarehouseName } = req.body;

    const data: Record<string, unknown> = {};
    if (realName !== undefined) data.realName = realName;
    if (status !== undefined) {
      if (!['active', 'suspended'].includes(status)) {
        return res.status(400).json({ error: '状态值无效' });
      }
      data.status = status;
    }
    if (maxWarehouses !== undefined) {
      if (maxWarehouses < 1) return res.status(400).json({ error: '仓库数量至少为 1' });
      data.maxWarehouses = maxWarehouses;
    }
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: '密码至少 6 位' });
      if (password.length > 128) return res.status(400).json({ error: '密码不能超过 128 位' });
      data.passwordHash = await bcrypt.hash(password, 10);
    }

    await prisma.customer.update({ where: { id }, data });

    // 追加仓库
    if (addWarehouseName) {
      const count = await prisma.warehouse.count({ where: { customerId: id } });
      const limit = maxWarehouses ?? customer.maxWarehouses;
      if (count >= limit) {
        return res.status(400).json({ error: `仓库数量已达上限 (${limit}个)` });
      }
      await prisma.warehouse.create({ data: { name: addWarehouseName, customerId: id } });
    }

    const updated = await prisma.customer.findUnique({
      where: { id },
      include: { warehouses: { select: { id: true, name: true } } },
    });
    const { passwordHash: _, ...safe } = updated!;
    res.json(safe);
  } catch (err) {
    console.error('Update customer error:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 软删除客户（保留 7 天数据，超管可恢复）
customersRouter.delete('/:id', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  try {
    const customer = await prisma.customer.findFirst({ where: { id, deletedAt: null } });
    if (!customer) return res.status(404).json({ error: '客户不存在' });

    await prisma.customer.update({ where: { id }, data: { deletedAt: new Date() } });

    res.json({ message: '已停用客户，数据保留 7 天后自动清理' });
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: '客户不存在' });
    console.error('Delete customer error:', err);
    res.status(500).json({ error: '删除失败' });
  }
});

// 恢复软删除的客户
customersRouter.put('/:id/restore', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  try {
    const customer = await prisma.customer.findFirst({ where: { id, deletedAt: { not: null } } });
    if (!customer) return res.status(404).json({ error: '客户不存在或未删除' });

    await prisma.customer.update({ where: { id }, data: { deletedAt: null } });

    const { passwordHash: _, ...safe } = customer;
    res.json({ message: '已恢复客户', customer: { ...safe, deletedAt: null } });
  } catch (err) {
    console.error('Restore customer error:', err);
    res.status(500).json({ error: '恢复失败' });
  }
});

// 续费：从当前到期日或今天起延长
customersRouter.put('/:id/renew', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  const { days } = req.body; // 默认 365 天（一年）
  const extendDays = days && days > 0 ? days : 365;

  const customer = await prisma.customer.findFirst({ where: { id, deletedAt: null } });
  if (!customer) return res.status(404).json({ error: '客户不存在' });

  const base = customer.expiresAt && customer.expiresAt > new Date() ? customer.expiresAt : new Date();
  const newExpiresAt = new Date(base.getTime() + extendDays * 24 * 60 * 60 * 1000);

  await prisma.customer.update({
    where: { id },
    data: { expiresAt: newExpiresAt, status: 'active' },
  });

  res.json({ message: `已续费 ${extendDays} 天`, expiresAt: newExpiresAt });
});

// ===== 模板操作（独立路由，不受 superAdmin 限制） =====

// 更新客户报表模板（admin + 客户自己）
customerTemplateRouter.put('/:id/template', adminWrite, validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (req.userRole === 'tenant_admin' && req.customerId !== id) {
    return res.status(403).json({ error: '只能编辑自己的模板' });
  }
  const { template } = req.body;
  if (typeof template !== 'string') return res.status(400).json({ error: '模板内容必填' });
  await prisma.customer.update({ where: { id }, data: { reportTemplate: template } });
  res.json({ message: '模板已保存' });
});

// 获取客户报表模板（仅 admin 可看他人模板，客户只能看自己的）
customerTemplateRouter.get('/:id/template', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (req.userRole === 'tenant_admin' && req.customerId !== id) {
    return res.status(403).json({ error: '无权查看此模板' });
  }
  const customer = await prisma.customer.findUnique({ where: { id }, select: { reportTemplate: true, templatePreset: true, excelPreset: true } });
  if (!customer) return res.status(404).json({ error: '客户不存在' });
  res.json({ template: customer.reportTemplate || null, templatePreset: customer.templatePreset || null, excelPreset: customer.excelPreset || null });
});

// 选择预设模板（admin + 客户自己）
customerTemplateRouter.put('/:id/template-preset', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (req.userRole === 'tenant_admin' && req.customerId !== id) {
    return res.status(403).json({ error: '只能切换自己的模板' });
  }
  const { preset } = req.body; // null = 使用自定义模板
  if (preset !== null && typeof preset !== 'string') return res.status(400).json({ error: '请选择预设模板' });
  await prisma.customer.update({ where: { id }, data: { templatePreset: preset } });
  res.json({ message: '模板已切换' });
});

// 选择 Excel 导出预设（admin + 客户自己）
customerTemplateRouter.put('/:id/excel-preset', validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (req.userRole === 'tenant_admin' && req.customerId !== id) {
    return res.status(403).json({ error: '只能切换自己的模板' });
  }
  const { preset } = req.body; // null = 使用默认
  if (preset !== null && typeof preset !== 'string') return res.status(400).json({ error: '请选择预设模板' });
  await prisma.customer.update({ where: { id }, data: { excelPreset: preset } });
  res.json({ message: 'Excel 模板已切换' });
});

// 更新 Excel 导出模板（admin + 客户自己）
customerTemplateRouter.put('/:id/export-template', adminWrite, validateId, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (req.userRole === 'tenant_admin' && req.customerId !== id) {
    return res.status(403).json({ error: '只能编辑自己的模板' });
  }
  const { exportTemplate } = req.body; // JSON string or null
  if (exportTemplate !== null && typeof exportTemplate !== 'string') {
    return res.status(400).json({ error: '模板格式错误' });
  }
  await prisma.customer.update({ where: { id }, data: { exportTemplate } });
  res.json({ message: 'Excel 模板已保存' });
});

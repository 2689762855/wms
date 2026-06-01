import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';

const DEV_ADMIN_SECRET = 'dev-admin-secret-8a1b9c2d3e4f5a6b7c8d9e0f';
const DEV_INTER_SERVER_SECRET = 'dev-inter-server-shared-key';

const isProduction = process.env.NODE_ENV === 'production';

const JWT_ADMIN_SECRET = process.env.JWT_ADMIN_SECRET || (!isProduction ? DEV_ADMIN_SECRET : '');
const INTER_SERVER_SECRET = process.env.INTER_SERVER_SECRET || (!isProduction ? DEV_INTER_SERVER_SECRET : '');

if (isProduction && !JWT_ADMIN_SECRET) {
  throw new Error('FATAL: JWT_ADMIN_SECRET 环境变量未设置，拒绝启动');
}

// 当前服务器公网域名（用于判断客户归属）
const THIS_HOST = process.env.PUBLIC_HOST || 'localhost:3001';

export { JWT_ADMIN_SECRET, INTER_SERVER_SECRET, THIS_HOST };

export interface AuthRequest extends Request {
  userId?: number;
  userRole?: string;
  userWarehouseId?: number | null;
  customerId?: number;
  operatorType?: string | null;
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }

  try {
    const token = header.split(' ')[1];
    const payload = jwt.verify(token, JWT_ADMIN_SECRET) as {
      userId: number;
      role: string;
      warehouseId?: number | null;
      customerId?: number | null;
    };
    if (!payload.userId) {
      return res.status(401).json({ error: '令牌无效' });
    }
    req.userId = payload.userId;
    req.userRole = payload.role;
    req.userWarehouseId = payload.warehouseId;
    req.customerId = payload.customerId ?? undefined;
    req.operatorType = payload.operatorType ?? null;

    if (payload.role === 'tenant_admin' && payload.customerId) {
      const customer = await prisma.customer.findFirst({
        where: { id: payload.customerId, deletedAt: null },
        select: { status: true },
      });
      if (!customer) {
        return res.status(403).json({ error: '账号已被停用，请联系管理员' });
      }
      if (customer.status === 'suspended') {
        return res.status(403).json({ error: '账号已被暂停，请联系管理员' });
      }
    }

    next();
  } catch (err) {
    if (!(err instanceof jwt.JsonWebTokenError || err instanceof jwt.TokenExpiredError)) {
      console.error('authenticate error:', err);
    }
    return res.status(401).json({ error: '令牌无效或已过期' });
  }
}

export function authorize(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      return res.status(403).json({ error: '无权限' });
    }
    next();
  };
}

export async function adminWrite(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.userRole === 'super_admin' || req.userRole === 'warehouse_admin' || req.userRole === 'tenant_admin') {
    if (req.userRole === 'tenant_admin' && req.customerId) {
      const customer = await prisma.customer.findFirst({ where: { id: req.customerId, deletedAt: null }, select: { status: true } });
      if (customer?.status === 'pending') {
        return res.status(403).json({ error: '账号审核中，仅可查看，无法操作' });
      }
      if (customer?.status === 'suspended') {
        return res.status(403).json({ error: '账号已被暂停，请联系管理员' });
      }
    }
    return next();
  }
  return res.status(403).json({ error: '无权进行此操作' });
}

export function superAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.userRole === 'super_admin') return next();
  return res.status(403).json({ error: '仅超级管理员可操作' });
}

export function requireWarehouse(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.userRole === 'super_admin' || req.userRole === 'tenant_admin') return next();
  if (!req.userWarehouseId) return res.status(403).json({ error: '未分配到任何仓库' });
  next();
}

/** 校验 :id 参数为有效整数 */
export function validateId(req: Request, res: Response, next: NextFunction) {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: '无效 ID' });
  next();
}

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const DEV_ADMIN_SECRET = 'dev-admin-secret-8a1b9c2d3e4f5a6b7c8d9e0f';

const isProduction = process.env.NODE_ENV === 'production';

const JWT_ADMIN_SECRET = process.env.JWT_ADMIN_SECRET || (!isProduction ? DEV_ADMIN_SECRET : '');

if (isProduction && !JWT_ADMIN_SECRET) {
  throw new Error('FATAL: JWT_ADMIN_SECRET 环境变量未设置，拒绝启动');
}

export { JWT_ADMIN_SECRET };

export interface AuthRequest extends Request {
  userId?: number;
  userRole?: string;
  userWarehouseId?: number | null;
  customerId?: number;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
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
    req.customerId = payload.customerId;
    next();
  } catch {
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

export function adminWrite(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.userRole === 'super_admin' || req.userRole === 'warehouse_admin' || req.userRole === 'tenant_admin') return next();
  return res.status(403).json({ error: '无权进行此操作' });
}

export function superAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.userRole === 'super_admin') return next();
  return res.status(403).json({ error: '仅超级管理员可操作' });
}

export function requireWarehouse(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.userRole === 'super_admin') return next();
  if (!req.userWarehouseId) return res.status(403).json({ error: '未分配到任何仓库' });
  next();
}

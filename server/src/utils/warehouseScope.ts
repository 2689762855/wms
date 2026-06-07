import { AuthRequest } from '../middleware/auth';

/** 为查询添加仓库权限过滤（非超管自动限定到自己的仓库） */
export function applyWarehouseScope(req: AuthRequest, where: Record<string, unknown>): Record<string, unknown> {
  if (req.userRole !== 'super_admin' && req.userWarehouseId) {
    where.warehouseId = req.userWarehouseId;
  }
  return where;
}

/** 检查是否有权限操作目标仓库（非超管禁止越权） */
export function checkWarehouseAccess(req: AuthRequest, targetWarehouseId: number): string | null {
  if (req.userRole === 'super_admin') return null;
  if (req.userWarehouseId && targetWarehouseId !== req.userWarehouseId) {
    return '无权操作此仓库';
  }
  return null;
}

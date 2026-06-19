import { AuthRequest } from '../middleware/auth';

export function getPagination(
  req: AuthRequest,
  defaultPageSize = 20,
  maxPageSize = 200,
) {
  const page = Math.max(1, parseInt((req.query.page as string) || '1'));
  const pageSize = Math.min(
    Math.max(1, parseInt((req.query.pageSize as string) || String(defaultPageSize))),
    maxPageSize,
  );
  return { page, pageSize, skip: (page - 1) * pageSize };
}

import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error(err.stack);

  // Prisma 外键约束失败 → 400
  if ((err as any).code === 'P2003') {
    return res.status(400).json({ error: '关联数据不存在，请检查所选内容' });
  }

  // Prisma 其他参数错误 → 400
  if (err.name === 'PrismaClientValidationError' || (err as any).code?.startsWith('P')) {
    return res.status(400).json({ error: '请求参数无效' });
  }

  const message = process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message;
  res.status(500).json({ error: message });
}

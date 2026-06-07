import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error(err.stack);

  // Prisma 参数错误（无效 ID 等）→ 400
  if (err.name === 'PrismaClientValidationError' || (err as any).code?.startsWith('P')) {
    return res.status(400).json({ error: '请求参数无效' });
  }

  const message = process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message;
  res.status(500).json({ error: message });
}

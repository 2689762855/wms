import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error(err.stack);

  const code = (err as any).code;

  // Prisma 已知错误 → 返回有意义的提示
  if (code === 'P2003') {
    return res.status(400).json({ error: '无法删除：该记录被其他数据引用，请先清理关联数据' });
  }
  if (code === 'P2025') {
    return res.status(404).json({ error: '记录不存在或已删除' });
  }
  if (code === 'P2002') {
    return res.status(400).json({ error: '该名称或编号已存在，请更换' });
  }
  if (err.name === 'PrismaClientValidationError' || (code && code.startsWith('P'))) {
    return res.status(400).json({ error: '请求参数无效' });
  }

  const message = process.env.NODE_ENV === 'production' ? '服务器错误' : err.message;
  res.status(500).json({ error: message });
}

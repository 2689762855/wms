import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, authenticate, superAdmin } from '../middleware/auth';

export const settingsRouter = Router();
settingsRouter.use(authenticate);
settingsRouter.use(superAdmin);

// 获取自动审批开关状态
settingsRouter.get('/auto-approve', async (_req: AuthRequest, res: Response) => {
  const setting = await prisma.setting.findUnique({ where: { key: 'autoApproveRegistrations' } });
  res.json({ enabled: setting?.value === 'true' });
});

// 切换自动审批开关
settingsRouter.put('/auto-approve', async (req: AuthRequest, res: Response) => {
  const { enabled } = req.body;
  await prisma.setting.upsert({
    where: { key: 'autoApproveRegistrations' },
    update: { value: String(!!enabled) },
    create: { key: 'autoApproveRegistrations', value: String(!!enabled) },
  });
  res.json({ enabled: !!enabled });
});

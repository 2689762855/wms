import prisma from './utils/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

async function init() {
  console.log('=== 初始化系统 ===\n');

  // 密码来源：CLI 参数 > 环境变量 > 随机生成
  const password = process.argv[2] || process.env.ADMIN_PASSWORD || crypto.randomBytes(8).toString('base64url');
  const hash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: { passwordHash: hash },
    create: {
      username: 'admin',
      passwordHash: hash,
      role: 'super_admin',
      realName: '系统管理员',
    },
  });
  console.log(`管理员: admin / ${password}`);
  console.log('请牢记密码，首次登录后建议修改。');

  await prisma.$disconnect();
}

init().catch((e) => { console.error(e); process.exit(1); });

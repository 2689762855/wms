import prisma from './utils/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

async function init() {
  console.log('=== 初始化系统 ===\n');

  const password = crypto.randomBytes(8).toString('base64url');
  const hash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: { passwordHash: hash },
    create: {
      username: 'admin',
      passwordHash: hash,
      role: 'warehouse_admin',
      realName: '管理员',
    },
  });
  console.log(`默认管理员: admin / ${password}`);
  console.log('请妥善保存此密码，登录后可在系统内修改。');
  console.log('登录后请先创建仓库和商品。');

  await prisma.$disconnect();
}

init().catch((e) => { console.error(e); process.exit(1); });

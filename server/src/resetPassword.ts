// 紧急重置管理员密码
import prisma from './utils/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

async function resetPassword(username: string, newPassword: string) {
  const hash = await bcrypt.hash(newPassword, 10);
  const user = await prisma.user.update({
    where: { username },
    data: { passwordHash: hash },
  });
  console.log(`密码已重置: ${user.username} → ${newPassword}`);
  await prisma.$disconnect();
}

const username = process.argv[2] || 'admin';
const password = process.argv[3] || crypto.randomBytes(8).toString('base64url');
resetPassword(username, password).catch(console.error);

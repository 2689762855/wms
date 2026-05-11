import prisma from './prisma';

/**
 * 原子生成序号（防并发重复）
 * 使用数据库行级锁保证并发安全
 */
export async function nextOrderNo(prefix: string): Promise<string> {
  const today = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const seqName = `${prefix}${today}`;

  const result = await prisma.$transaction(async (tx) => {
    const seq = await tx.sequence.upsert({
      where: { name: seqName },
      update: { nextVal: { increment: 1 } },
      create: { name: seqName, nextVal: 2 }, // 首次使用返回 1
    });
    return seq.nextVal - 1; // 返回当前值（upsert 返回的是更新后的值）
  });

  return `${prefix}${today}${String(result).padStart(4, '0')}`;
}

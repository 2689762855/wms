import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from '../utils/prisma';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const appRouter = Router();

const apkDir = path.resolve(__dirname, '../../apk');
const versionFile = path.join(apkDir, 'version.json');

// GET /api/app/version — 返回最新版本信息
appRouter.get('/version', (_req: Request, res: Response) => {
  try {
    if (!fs.existsSync(versionFile)) {
      res.status(404).json({ error: '版本信息不存在' });
      return;
    }
    const data = JSON.parse(fs.readFileSync(versionFile, 'utf-8'));
    const protocol = _req.get('X-Forwarded-Proto') || _req.protocol;
    const host = _req.get('host') || 'localhost:3001';
    if (data.downloadUrl && data.downloadUrl.startsWith('/')) {
      data.downloadUrl = `${protocol}://${host}${data.downloadUrl}`;
    }
    res.json(data);
  } catch (err) {
    console.error('读取版本信息失败:', err);
    res.status(500).json({ error: '读取版本信息失败' });
  }
});

// GET /api/app/download/latest — 下载最新 APK
appRouter.get('/download/latest', (_req: Request, res: Response) => {
  try {
    if (!fs.existsSync(apkDir)) {
      res.status(404).json({ error: '暂无 APK 文件' });
      return;
    }
    const files = fs.readdirSync(apkDir)
      .filter((f) => f.endsWith('.apk'))
      .sort((a, b) => {
        const getVer = (name: string) => {
          const m = name.match(/v([\d.]+)/);
          if (!m) return 0;
          const parts = m[1].split('.').map(Number);
          return (parts[0] || 0) * 1000000 + (parts[1] || 0) * 1000 + (parts[2] || 0);
        };
        return getVer(b) - getVer(a);
      });
    if (files.length === 0) {
      res.status(404).json({ error: '暂无 APK 文件' });
      return;
    }
    const apkPath = path.join(apkDir, files[0]);
    const stat = fs.statSync(apkPath);
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', `attachment; filename="${files[0]}"`);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(apkPath).pipe(res);
  } catch (err) {
    console.error('APK 下载失败:', err);
    res.status(500).json({ error: '下载失败' });
  }
});

// POST /api/app/download-counter — 记录一次下载（IP 去重 + 机器人过滤）
const downloadIps = new Map<string, number>(); // IP -> 上次下载时间
const BOT_PATTERN = /bot|crawler|spider|slurp|ia_archiver|archive|nmap|scanner|curl|wget|python-requests|go-http-client/i;

appRouter.post('/download-counter', async (req: Request, res: Response) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const ua = req.headers['user-agent'] || '';

    // 过滤机器人
    if (BOT_PATTERN.test(ua)) {
      return res.json({ count: await getDownloadCount(), filtered: true });
    }

    // IP 去重：24 小时内同一 IP 只计一次
    const now = Date.now();
    const lastDownload = downloadIps.get(ip);
    if (lastDownload && now - lastDownload < 24 * 60 * 60 * 1000) {
      return res.json({ count: await getDownloadCount(), deduplicated: true });
    }
    downloadIps.set(ip, now);

    // 清理过期 IP（避免内存泄漏）
    if (downloadIps.size > 10000) {
      const cutoff = now - 24 * 60 * 60 * 1000;
      for (const [key, time] of downloadIps) {
        if (time < cutoff) downloadIps.delete(key);
      }
    }

    const existing = await prisma.setting.findUnique({ where: { key: 'downloadCount' } });
    const count = Number(existing?.value || '0') + 1;
    if (existing) {
      await prisma.setting.update({ where: { key: 'downloadCount' }, data: { value: String(count) } });
    } else {
      await prisma.setting.create({ data: { key: 'downloadCount', value: String(count) } });
    }
    res.json({ count });
  } catch (err) {
    console.error('下载计数失败:', err);
    res.status(500).json({ error: '计数失败' });
  }
});

async function getDownloadCount(): Promise<number> {
  const setting = await prisma.setting.findUnique({ where: { key: 'downloadCount' } });
  return Number(setting?.value || '0');
}

// GET /api/app/download-counter — 查询下载次数
appRouter.get('/download-counter', async (_req: Request, res: Response) => {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: 'downloadCount' } });
    res.json({ count: Number(setting?.value || '0') });
  } catch (err) {
    res.status(500).json({ error: '查询失败' });
  }
});

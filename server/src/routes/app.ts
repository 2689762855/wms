import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', `attachment; filename="${files[0]}"`);
    fs.createReadStream(apkPath).pipe(res);
  } catch (err) {
    console.error('APK 下载失败:', err);
    res.status(500).json({ error: '下载失败' });
  }
});

import axios from 'axios';
import type { AppVersion } from '../types';
import AppUpdate from '../native/AppUpdate';

export async function checkForUpdate(): Promise<{
  hasUpdate: boolean;
  forceUpdate: boolean;
  serverVersion: AppVersion | null;
}> {
  try {
    const [current, server] = await Promise.all([
      AppUpdate.getCurrentVersion(),
      axios.get<AppVersion>('/api/app/version', { timeout: 5000 }),
    ]);
    if (server.data.versionCode > current.versionCode) {
      return {
        hasUpdate: true,
        forceUpdate: server.data.forceUpdate || current.versionCode < server.data.minVersionCode,
        serverVersion: server.data,
      };
    }
    return { hasUpdate: false, forceUpdate: false, serverVersion: null };
  } catch {
    return { hasUpdate: false, forceUpdate: false, serverVersion: null };
  }
}

export async function downloadAndInstall(url: string): Promise<void> {
  const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
  await AppUpdate.downloadAndInstall({ url: fullUrl });
}

import axios from 'axios';
import type { AppVersion } from '../types';
import AppUpdate from '../native/AppUpdate';
import { getServerUrl } from './serverConfig';

const VERSION_CACHE_KEY = 'wms_version_code';

async function getCurrentVersionCode(): Promise<number> {
  try {
    const result = await AppUpdate.getCurrentVersion();
    localStorage.setItem(VERSION_CACHE_KEY, String(result.versionCode));
    return result.versionCode;
  } catch {
    const cached = localStorage.getItem(VERSION_CACHE_KEY);
    return cached ? parseInt(cached, 10) : 0;
  }
}

export function markVersionAsCurrent(versionCode: number) {
  localStorage.setItem(VERSION_CACHE_KEY, String(versionCode));
}

export async function checkForUpdate(): Promise<{
  hasUpdate: boolean;
  forceUpdate: boolean;
  serverVersion: AppVersion | null;
}> {
  try {
    const base = getServerUrl();
    const url = base ? `${base}/api/app/version` : '/api/app/version';

    const [versionCode, server] = await Promise.all([
      getCurrentVersionCode(),
      axios.get<AppVersion>(url, { timeout: 5000 }).catch(() => null),
    ]);

    if (!server || !server.data) {
      return { hasUpdate: false, forceUpdate: false, serverVersion: null };
    }

    if (server.data.versionCode > versionCode) {
      return {
        hasUpdate: true,
        forceUpdate: server.data.forceUpdate || versionCode < server.data.minVersionCode,
        serverVersion: server.data,
      };
    }
    return { hasUpdate: false, forceUpdate: false, serverVersion: null };
  } catch {
    return { hasUpdate: false, forceUpdate: false, serverVersion: null };
  }
}

export async function downloadAndInstall(url: string): Promise<void> {
  if (url.startsWith('http')) {
    await AppUpdate.downloadAndInstall({ url });
    return;
  }
  const base = getServerUrl();
  const fullUrl = base ? `${base}${url}` : `${window.location.origin}${url}`;
  await AppUpdate.downloadAndInstall({ url: fullUrl });
}

const STORAGE_KEY = 'wms_server_url';
// 生产环境默认使用云服务器地址，开发环境使用空字符串（走 Vite 代理）
const DEFAULT_URL = import.meta.env.PROD ? 'https://ckglxt.top' : '';

export function getServerUrl(): string {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_URL;
}

export function setServerUrl(url: string) {
  localStorage.setItem(STORAGE_KEY, url.replace(/\/+$/, ''));
}

export function getDefaultUrl(): string {
  return DEFAULT_URL;
}

const STORAGE_KEY = 'wms_server_url';
// 生产部署时前端和后端在同一域名，使用空字符串表示相对路径。
// 开发时 Vite 代理 /api 到 localhost:3001，也不依赖此地址。
// 移动端 APK 跨设备访问时，用户在登录页手动设置服务器地址。
const DEFAULT_URL = '';

export function getServerUrl(): string {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_URL;
}

export function setServerUrl(url: string) {
  localStorage.setItem(STORAGE_KEY, url.replace(/\/+$/, ''));
}

export function getDefaultUrl(): string {
  return DEFAULT_URL;
}

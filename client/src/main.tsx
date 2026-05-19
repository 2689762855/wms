import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

// Capacitor 平台检测与适配 — 仅原生 APP 环境启用
let isCapacitorApp = false;
try { isCapacitorApp = !!(window as any).Capacitor?.isNativePlatform?.(); } catch {}
if (isCapacitorApp) {
  document.body.classList.add('capacitor-platform');
  document.documentElement.style.setProperty('--status-bar-height', '24px');
  import('@capacitor/status-bar').then(({ StatusBar }) => {
    try { StatusBar.setOverlaysWebView({ overlay: false }); StatusBar.setStyle({ style: 'dark' }); } catch {}
  }).catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// 全局捕获未处理的 Capacitor Promise 异常，防止白屏
window.addEventListener('unhandledrejection', (event) => {
  const msg = event.reason?.message || '';
  if (msg.includes('not implemented on web') || msg.includes('plugin is not')) {
    event.preventDefault();
    console.warn('[Capacitor]', msg);
  }
});

registerSW({ immediate: true })

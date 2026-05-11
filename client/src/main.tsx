import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

// Capacitor 平台检测与适配
const isCapacitor = typeof (window as any).Capacitor !== 'undefined';
if (isCapacitor) {
  document.body.classList.add('capacitor-platform');
  document.documentElement.style.setProperty('--status-bar-height', '24px');
  // 动态导入，避免非 Capacitor 环境崩溃
  import('@capacitor/status-bar').then(({ StatusBar }) => {
    StatusBar.setOverlaysWebView({ overlay: false });
    StatusBar.setStyle({ style: 'dark' });
  }).catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

registerSW({ immediate: true })

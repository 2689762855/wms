import { CapacitorConfig } from '@capacitor/cli';

// 单机版专用配置：不指定 server.url，APK 默认从本地服务器加载
const config: CapacitorConfig = {
  appId: 'com.wms.inventory',
  appName: '库存管理单机版',
  webDir: 'dist',
  server: {
    cleartext: true,
    androidScheme: 'http',
    iosScheme: 'capacitor',
  },
  android: {
    allowMixedContent: true,
  },
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: false,
  },
};

export default config;

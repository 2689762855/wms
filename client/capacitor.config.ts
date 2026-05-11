import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.wms.inventory',
  appName: '库存管理',
  webDir: 'dist',
  server: {
    // 不设置 url，加载本地打包文件；用户在登录页设置服务器地址
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#1677ff',
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: false,
      style: 'DARK',
      backgroundColor: '#1677ff',
    },
  },
};

export default config;

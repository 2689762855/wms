import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.wms.inventory',
  appName: '库存管理',
  webDir: 'dist',
  server: {
    url: 'https://ckglxt.top/login',
    cleartext: false,
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
  android: {
    allowMixedContent: true,
  },
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: false,
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

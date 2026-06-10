import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export interface ProgressData {
  percent: number;
  downloaded: number;
  total: number;
}

export interface AppUpdatePlugin {
  getCurrentVersion(): Promise<{ versionCode: number; versionName: string }>;
  downloadAndInstall(options: { url: string }): Promise<{ success: boolean }>;
  addListener(eventName: 'progress', listenerFunc: (data: ProgressData) => void): Promise<PluginListenerHandle> & PluginListenerHandle;
}

const AppUpdate = registerPlugin<AppUpdatePlugin>('AppUpdate');
export default AppUpdate;

import { registerPlugin } from '@capacitor/core';

export interface AppUpdatePlugin {
  getCurrentVersion(): Promise<{ versionCode: number; versionName: string }>;
  downloadAndInstall(options: { url: string }): Promise<{ success: boolean }>;
}

const AppUpdate = registerPlugin<AppUpdatePlugin>('AppUpdate');
export default AppUpdate;

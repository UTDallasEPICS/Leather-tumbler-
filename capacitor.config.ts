import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.LeatherTumbler.app',
  appName: 'DAVA Leather Tumbler',
  webDir: 'out',
  android: {
    backgroundColor: '#ffffff',
  },
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: 'LIGHT',
      backgroundColor: '#00000000',
    },
  },
};

export default config;

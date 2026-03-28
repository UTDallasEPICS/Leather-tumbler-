import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.LeatherTumbler.app',
  appName: 'Leather Tumbler App',
  webDir: 'out',
  android: {
    backgroundColor: '#1a1a2e',
  },
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',
      backgroundColor: '#00000000',
    },
  },
};

export default config;

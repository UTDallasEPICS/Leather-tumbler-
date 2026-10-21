import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.LeatherTumbler.app',
  appName: 'DAVA Leather Tumbler',
  webDir: 'out',
  android: {
    backgroundColor: '#ffffff',
    // The app is served from https://localhost but talks to the tumbler controller over plain
    // http:// and ws:// on the LAN. Without this the web view blocks those as "mixed content".
    allowMixedContent: true,
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

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.axiom.v1',
  appName: 'AXIOM V1',
  webDir: 'www',
  backgroundColor: '#020711',
  appendUserAgent: ' AXIOMMobile/0.2.0',
  server: {
    url: 'https://axiom-v1.sudeshmehar3.workers.dev',
    cleartext: false,
    androidScheme: 'https',
    errorPath: 'offline.html',
    allowNavigation: [
      'axiom-v1.sudeshmehar3.workers.dev',
      'axiom-v1.firebaseapp.com',
      'accounts.google.com',
      'github.com'
    ]
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false
  },
  ios: {
    contentInset: 'automatic',
    scrollEnabled: true,
    allowsLinkPreview: false
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 300,
      launchAutoHide: true,
      backgroundColor: '#020711',
      showSpinner: false
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#020711',
      overlaysWebView: false
    }
  }
};

export default config;

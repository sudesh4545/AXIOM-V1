import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.axiom.v1',
  appName: 'AXIOM V1',
  webDir: 'www',
  backgroundColor: '#020711',
  server: {
    url: 'https://axiom-v1.sudeshmehar3.workers.dev',
    cleartext: false,
    androidScheme: 'https',
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
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#020711',
      showSpinner: false
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#020711',
      overlaysWebView: false
    }
  }
};

export default config;

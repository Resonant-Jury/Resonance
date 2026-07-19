import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Resonance ships as a remote-URL Capacitor app: the native shell's WebView
 * loads the production Vercel deployment directly, because the Next.js app
 * depends on server features (middleware i18n, API routes, session cookies,
 * firebase-admin) that cannot be statically exported. `webDir` only holds an
 * offline fallback page.
 */
const config: CapacitorConfig = {
  appId: 'com.resonance.stories',
  appName: 'Resonance',
  webDir: 'capacitor-shell',
  server: {
    url: 'https://resonance-world.vercel.app',
    // Domains the WebView may navigate to without breaking out to the
    // system browser (Firebase auth redirect flow included).
    allowNavigation: [
      'resonance-world.vercel.app',
      'resonance-stories.firebaseapp.com',
      'accounts.google.com',
    ],
  },
  ios: {
    contentInset: 'automatic',
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;

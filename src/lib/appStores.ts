/**
 * The apps in the stores, and which store a visitor's device belongs to: the
 * website's download badges (GetTheApp), the /download link its QR code
 * encodes (src/app/download/route.ts) and the iPhone Smart App Banner on the
 * public pages (smartAppBanner).
 */

/** The iOS app's App Store id (App Store Connect → Resonance). */
export const APP_STORE_ID = '6817604797';

export const APP_STORE_URL = `https://apps.apple.com/tw/app/resonance/id${APP_STORE_ID}`;

export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.resonance.stories';

/**
 * Safari's Smart App Banner (`<meta name="apple-itunes-app">`) for a public
 * page — the landing page, a card, a profile: on an iPhone or iPad it offers
 * the app, or once installed opens it at `url` (the app opens a card's or a
 * profile's address on that card or profile). Never on the policy pages (the
 * apps show those in an in-app browser), the sign-in pages or the signed-in
 * app's own pages, where a banner over the editor or a thread only pushes it
 * down.
 */
export function smartAppBanner(url?: string): { appId: string; appArgument?: string } {
  return url ? { appId: APP_STORE_ID, appArgument: url } : { appId: APP_STORE_ID };
}

/** The landing page's download block, where /download sends a computer. */
export const DOWNLOAD_ANCHOR = 'download';

/**
 * What a device can install: `ios` (iPhone, iPad, iPod touch), `android`
 * (phones and tablets), `desktop` (Mac, Windows, Linux, ChromeOS — no store
 * of ours; it gets the QR code), `other` (anything unrecognised, crawlers
 * included — offered both stores).
 */
export type DevicePlatform = 'ios' | 'android' | 'desktop' | 'other';

/**
 * The platform a User-Agent names. iPadOS asks for the desktop site and
 * reports a Mac; only a browser can tell them apart, by touch — pass
 * `navigator.maxTouchPoints` there (a server can't, so an iPad reaching
 * /download is treated as a computer and lands on the download block, which
 * then shows it the App Store).
 */
export function devicePlatform(userAgent: string | null | undefined, maxTouchPoints = 0): DevicePlatform {
  const ua = userAgent ?? '';
  if (/\b(iPhone|iPad|iPod)\b/.test(ua)) return 'ios';
  // Before Linux: every Android UA says Linux too.
  if (/\bAndroid\b/i.test(ua)) return 'android';
  if (/\bMacintosh\b/.test(ua)) return maxTouchPoints > 1 ? 'ios' : 'desktop';
  if (/\b(Windows NT|CrOS|X11|Linux)\b/.test(ua)) return 'desktop';
  return 'other';
}

/**
 * Where /download sends a device: its own store, or the landing page's
 * download block (badges and the QR code) when it has none or is unknown.
 */
export function downloadTarget(platform: DevicePlatform): string {
  if (platform === 'ios') return APP_STORE_URL;
  if (platform === 'android') return PLAY_STORE_URL;
  return `/#${DOWNLOAD_ANCHOR}`;
}

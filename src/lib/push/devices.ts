import { FieldValue, type Firestore } from 'firebase-admin/firestore';

export type DeviceLocale = 'en' | 'zh-TW';

/** The app's UI language as the push speaks it (anything Chinese reads zh-TW; the rest English). */
export function deviceLocale(value: unknown): DeviceLocale {
  return typeof value === 'string' && value.toLowerCase().startsWith('zh') ? 'zh-TW' : 'en';
}

export interface DeviceRegistration {
  token: string;
  platform: 'ios' | 'android';
  locale?: string | null;
  appVersion?: string | null;
  /** What the build does with a push beyond showing it (`chat-push`, see lib/push/chat); unknown values are kept. */
  capabilities?: string[] | null;
  /** The device's IANA time zone (`Asia/Taipei`); one this server doesn't know is stored as null. */
  timeZone?: string | null;
}

/** An IANA zone name's shape: `UTC`, `Asia/Taipei`, `America/Argentina/Buenos_Aires`, `Etc/GMT+8` — never an offset. */
const ZONE_NAME = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/;

/**
 * A time zone as the server keeps it: an IANA name this runtime's time zone
 * data knows (Intl), in its own spelling — else null. Never a reason to
 * refuse a registration: a phone set to a zone we can't place still gets
 * its pushes, just not at its own local hour.
 */
export function timeZoneOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (!name || name.length > 64 || !ZONE_NAME.test(name)) return null;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: name }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/**
 * `devices/{installationId}`: one app install's push token, owned by whoever
 * is signed in on it. Keyed by the install (not the user) so signing in as
 * someone else on the same phone moves the device to them — the previous
 * account stops getting pushes there even if its sign-out never reached us.
 * Clients never touch the collection (no rule matches it); account deletion
 * removes a user's devices with the rest of their records.
 */
export async function registerDevice(db: Firestore, uid: string, installationId: string, input: DeviceRegistration) {
  await db.doc(`devices/${installationId}`).set({
    userId: uid,
    token: input.token,
    platform: input.platform,
    locale: deviceLocale(input.locale),
    appVersion: input.appVersion ?? null,
    capabilities: [...new Set(input.capabilities ?? [])].filter((c) => /^[a-z0-9-]{1,32}$/.test(c)).slice(0, 8),
    timeZone: timeZoneOf(input.timeZone),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await forgetOldestDevices(db, uid);
}

/**
 * How many installs one account keeps pushing to. A reinstall is a new
 * install (its old one lingers until FCM says its token is dead), so a
 * person collects a few; past this the least recently registered go, which
 * bounds what one account can make every push fan out to.
 */
export const MAX_DEVICES = 20;

async function forgetOldestDevices(db: Firestore, uid: string) {
  const mine = await db.collection('devices').where('userId', '==', uid).select('updatedAt').get();
  if (mine.size <= MAX_DEVICES) return;
  const at = (d: (typeof mine.docs)[number]) => {
    const v = d.get('updatedAt') as { toMillis?: () => number } | undefined;
    return typeof v?.toMillis === 'function' ? v.toMillis() : 0;
  };
  const stale = [...mine.docs].sort((a, b) => at(b) - at(a)).slice(MAX_DEVICES);
  const batch = db.batch();
  for (const d of stale) batch.delete(d.ref);
  await batch.commit();
}

/** Sign-out: stop pushing to this install — only if it is still yours (someone else may have signed in since). */
export async function unregisterDevice(db: Firestore, uid: string, installationId: string) {
  const ref = db.doc(`devices/${installationId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.get('userId') === uid) tx.delete(ref);
  });
}

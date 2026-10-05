import { FieldPath, FieldValue, type DocumentData, type Firestore } from 'firebase-admin/firestore';

/**
 * `notificationSettings/{uid}`: which pushes beyond the ones answering the
 * person (resonances, notes, messages — always on) they asked for. Both are
 * off until turned on (explicit opt-in: App Store 4.5.4), and each turn-on
 * records when (`picksConsentAt`, `connectionCardsConsentAt` — the last time
 * consent was given; turning a switch off keeps it, the switch says it's off).
 *
 * Server-only (firestore.rules deny every client access): read and written
 * through GET/PATCH /api/v1/me/notifications, read by the senders
 * (lib/push/picks, lib/push/connectionCards). Purged with the account.
 */
export const NOTIFICATION_SETTINGS = 'notificationSettings';

export interface NotificationSettings {
  /** "Tonight's card": up to three evenings a week, one of their picks (lib/push/picks). */
  picks: boolean;
  /** A new public, named card from someone they're connected with (lib/push/connectionCards). */
  connectionCards: boolean;
}

export type NotificationSwitch = keyof NotificationSettings;
export const NOTIFICATION_SWITCHES: readonly NotificationSwitch[] = ['picks', 'connectionCards'];

/** The switches sent; null or absent leaves one as it is (Kotlin clients send null). */
export type NotificationSettingsPatch = { [K in NotificationSwitch]?: boolean | null };

const CONSENT_AT: Record<NotificationSwitch, string> = {
  picks: 'picksConsentAt',
  connectionCards: 'connectionCardsConsentAt',
};

/** A stored document as the switches it holds: anything but `true` is off (a missing document is both off). */
export function readNotificationSettings(data: DocumentData | undefined): NotificationSettings {
  return { picks: data?.picks === true, connectionCards: data?.connectionCards === true };
}

export async function getNotificationSettings(db: Firestore, uid: string): Promise<NotificationSettings> {
  return readNotificationSettings((await db.doc(`${NOTIFICATION_SETTINGS}/${uid}`).get()).data());
}

/**
 * Change the switches sent, in a transaction: a switch turned on (off before)
 * stamps its consent time; one sent as it already is changes nothing (and
 * nothing at all is written then). Answers the settings as they are now.
 */
export async function updateNotificationSettings(db: Firestore, uid: string, patch: NotificationSettingsPatch): Promise<NotificationSettings> {
  const ref = db.doc(`${NOTIFICATION_SETTINGS}/${uid}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const before = readNotificationSettings(snap.data());
    const after = { ...before };
    const write: Record<string, unknown> = {};
    for (const key of NOTIFICATION_SWITCHES) {
      const want = patch[key];
      if (typeof want !== 'boolean' || want === before[key]) continue;
      after[key] = want;
      if (want) write[CONSENT_AT[key]] = FieldValue.serverTimestamp();
    }
    // Nothing to change (a missing document already reads as both off): nothing written.
    if (!NOTIFICATION_SWITCHES.some((k) => after[k] !== before[k])) return after;
    tx.set(
      ref,
      {
        ...after,
        // A new document says "never consented" out loud rather than by absence.
        ...(snap.exists ? {} : { picksConsentAt: null, connectionCardsConsentAt: null }),
        ...write,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return after;
  });
}

/** Readers fetched per page when a cron walks everyone who turned a switch on. */
const OPTED_IN_PAGE = 500;

/**
 * Everyone who turned `key` on, a page of user ids at a time (document id
 * order: an equality filter and the id order need no composite index).
 */
export async function* optedIn(db: Firestore, key: NotificationSwitch, pageSize = OPTED_IN_PAGE): AsyncGenerator<string[]> {
  let after: string | null = null;
  for (;;) {
    let q = db.collection(NOTIFICATION_SETTINGS).where(key, '==', true).orderBy(FieldPath.documentId()).select().limit(pageSize);
    if (after) q = q.startAfter(after);
    const snap = await q.get();
    if (snap.empty) return;
    yield snap.docs.map((d) => d.id);
    if (snap.size < pageSize) return;
    after = snap.docs[snap.size - 1].id;
  }
}

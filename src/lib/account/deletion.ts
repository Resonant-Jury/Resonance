import type { DocumentReference, Firestore, Query } from 'firebase-admin/firestore';
import { cardPagePaths, landingPagePaths, profilePagePaths } from '@/lib/api/revalidate';
import { HANDLES } from '@/lib/db/firestore/handles';
import { UPLOADS, uploadedKeys } from '@/lib/storage/uploads';
import { DELETION_GRACE_DAYS } from './constants';

export { DELETION_GRACE_DAYS };

/**
 * Account deletion (App Store 5.1.1(v) / Google Play account-deletion policy).
 *
 * Deletion is scheduled, not immediate: the request is recorded in
 * `accountDeletions/{uid}` and the account is purged once `purgeAfter` has
 * passed ({@link DELETION_GRACE_DAYS} days). Signing back in during the grace
 * period shows a banner that cancels it. The daily cron
 * (`/api/cron/purge-accounts`) runs {@link purgeDueAccounts}.
 *
 * `accountDeletions` is admin-only (rules deny all client access) — the
 * request itself must not be forgeable or visible to other users.
 */
export const DELETIONS_COLLECTION = 'accountDeletions';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Firestore `in` queries accept at most 30 values. */
const IN_CHUNK = 30;

export interface AccountDeletion {
  uid: string;
  requestedAt: Date;
  purgeAfter: Date;
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return new Date(0);
}

export async function scheduleAccountDeletion(
  db: Firestore,
  uid: string,
  now: Date = new Date(),
): Promise<AccountDeletion> {
  const deletion = { uid, requestedAt: now, purgeAfter: new Date(now.getTime() + DELETION_GRACE_DAYS * DAY_MS) };
  await db.collection(DELETIONS_COLLECTION).doc(uid).set(deletion);
  // Scheduling revokes every session (each device is signed out within the
  // hour, see revokeSessions), and a signed-out app can't unregister itself:
  // its phone stops buzzing now (signing back in to cancel registers again).
  const devices = await db.collection('devices').where('userId', '==', uid).get();
  if (!devices.empty) {
    const batch = db.batch();
    devices.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return deletion;
}

export async function cancelAccountDeletion(db: Firestore, uid: string): Promise<void> {
  await db.collection(DELETIONS_COLLECTION).doc(uid).delete();
}

export async function getAccountDeletion(db: Firestore, uid: string): Promise<AccountDeletion | null> {
  const snap = await db.collection(DELETIONS_COLLECTION).doc(uid).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  return { uid, requestedAt: toDate(data.requestedAt), purgeAfter: toDate(data.purgeAfter) };
}

export interface PurgeReport {
  /** Documents removed together with all of their subcollections. */
  trees: number;
  /** Single documents removed (records that point at the user). */
  documents: number;
  /**
   * The cached pages that showed the account (logical paths): its published
   * cards, by id and slug, its profile, and the landing page when a public
   * card could be on it. They must be revalidated, or the site would keep
   * serving the deleted writing.
   */
  pages: string[];
}

/**
 * Every place a user's data lives, as (a) document trees owned by the user and
 * (b) queries for records elsewhere that point at the user. Keep in step with
 * `firebase/firestore.rules` — a new collection that stores a uid belongs here.
 *
 * Deliberately kept: other people's cards that responded to this user's cards
 * (their `referenceCardId` dangles and readers resolve it to null, the same
 * as for a deleted card), other users' block lists (a uid is never reused),
 * and reports filed *against* the user (moderation history) — but not the
 * copy of what they wrote that a report kept (`reportEvidence`): that is
 * their writing, and goes with them, as it does with the reporter's account.
 */
async function collectAccountData(db: Firestore, uid: string) {
  const trees: DocumentReference[] = [
    db.collection('users').doc(uid), // profile + bookmarks + blocks
    db.collection('thoughtMaps').doc(uid),
    db.collection('userProfiles').doc(uid),
    db.collection('recommendations').doc(uid),
  ];

  const [cards, conversations, profile] = await Promise.all([
    db.collection('cards').where('authorId', '==', uid).get(),
    db.collection('conversations').where('participants', 'array-contains', uid).get(),
    db.collection('users').doc(uid).get(),
  ]);
  // Only a published card ever had a page someone could have cached; a
  // public one may be on the landing page too.
  const published = cards.docs.filter((d) => d.get('publishedAt') != null);
  const pages = [
    ...published.flatMap((d) => cardPagePaths({ id: d.id, slug: typeof d.get('slug') === 'string' ? d.get('slug') : null })),
    ...profilePagePaths(profile.get('handle')),
    ...landingPagePaths(...published.map((d) => d.data())),
  ];
  cards.forEach((d) => trees.push(d.ref)); // card + its pending edits
  conversations.forEach((d) => trees.push(d.ref)); // conversation + messages

  const queries: Query[] = [
    db.collection('connections').where('userIds', 'array-contains', uid),
    db.collection('invites').where('fromUserId', '==', uid),
    db.collection('invites').where('toUserId', '==', uid),
    db.collection('resonances').where('userId', '==', uid),
    db.collection('notes').where('fromUserId', '==', uid),
    db.collection('notes').where('toUserId', '==', uid),
    db.collection('cardLinks').where('sourceAuthorId', '==', uid),
    db.collection('cardLinks').where('targetAuthorId', '==', uid),
    db.collection('notifications').where('userId', '==', uid),
    db.collection('notifications').where('payload.fromUserId', '==', uid),
    db.collection('quotas').where('userId', '==', uid),
    db.collection('cardVectors').where('authorId', '==', uid),
    db.collection('reports').where('reporterId', '==', uid),
    db.collection('devices').where('userId', '==', uid), // push tokens
    db.collection('rateLimits').where('userId', '==', uid), // API budgets (lib/api/rateLimit)
    db.collection(HANDLES).where('uid', '==', uid), // the pen name's reservation (lib/db/firestore/handles)
    db.collection(UPLOADS).where('ownerId', '==', uid), // whose each stored picture is (lib/storage/uploads)
    db.collection('reportEvidence').where('reporterId', '==', uid),
    db.collection('reportEvidence').where('targetUserId', '==', uid),
    // A pending edit outlives its card when an older app deleted the card
    // straight from the client; the ones that carry their author are found here.
    db.collectionGroup('edits').where('authorId', '==', uid),
  ];
  // Other readers' resonance records on the deleted cards.
  const cardIds = cards.docs.map((d) => d.id);
  for (let i = 0; i < cardIds.length; i += IN_CHUNK) {
    queries.push(db.collection('resonances').where('cardId', 'in', cardIds.slice(i, i + IN_CHUNK)));
  }

  const snaps = await Promise.all(queries.map((q) => q.get()));
  const treePaths = trees.map((r) => r.path);
  const inTree = (path: string) => treePaths.some((t) => path === t || path.startsWith(`${t}/`));
  const singles = new Map<string, DocumentReference>();
  for (const snap of snaps) {
    for (const d of snap.docs) {
      if (!inTree(d.ref.path)) singles.set(d.ref.path, d.ref);
    }
  }
  return { trees, singles: [...singles.values()], pages };
}

/** Remove every Firestore record of `uid` (see {@link collectAccountData}). */
export async function purgeAccountData(db: Firestore, uid: string): Promise<PurgeReport> {
  const { trees, singles, pages } = await collectAccountData(db, uid);
  for (const ref of trees) await db.recursiveDelete(ref);
  const writer = db.bulkWriter();
  for (const ref of singles) void writer.delete(ref);
  await writer.close();
  return { trees: trees.length, documents: singles.length, pages };
}

export interface PurgeDeps {
  db: Firestore;
  /** Removes the sign-in account (firebase-admin `auth.deleteUser`). */
  deleteAuthUser: (uid: string) => Promise<void>;
  /** Removes uploaded files under a key prefix (older keys carry the uid); failures are logged, not fatal. */
  deleteStoragePrefix?: (prefix: string) => Promise<number>;
  /** Removes one uploaded file (the ones `uploads/*` records as the user's); failures are logged, not fatal. */
  deleteStorageObject?: (key: string) => Promise<void>;
  /** Drops cached pages (logical paths, `revalidateLocalized` in the cron); failures are logged, not fatal. */
  revalidate?: (paths: string[]) => unknown;
}

/**
 * Full purge: Firestore data, uploaded images, the auth account, and finally
 * the deletion request itself. Storage is best-effort — orphaned images are
 * unreachable once the records pointing at them are gone, and must not block
 * the account from being deleted.
 */
export async function purgeAccount(deps: PurgeDeps, uid: string): Promise<PurgeReport> {
  // The pictures recorded as theirs go before the records that list them.
  if (deps.deleteStorageObject) {
    for (const key of await uploadedKeys(deps.db, uid)) {
      try {
        await deps.deleteStorageObject(key);
      } catch (err) {
        console.error(`Account purge: storage cleanup failed for ${key}`, err);
      }
    }
  }
  const report = await purgeAccountData(deps.db, uid);
  if (deps.revalidate && report.pages.length) {
    try {
      deps.revalidate(report.pages);
    } catch (err) {
      console.error(`Account purge: revalidating ${uid}'s pages failed`, err);
    }
  }
  if (deps.deleteStoragePrefix) {
    for (const prefix of [`image/${uid}/`, `video/${uid}/`]) {
      try {
        await deps.deleteStoragePrefix(prefix);
      } catch (err) {
        console.error(`Account purge: storage cleanup failed for ${prefix}`, err);
      }
    }
  }
  try {
    await deps.deleteAuthUser(uid);
  } catch (err) {
    if ((err as { code?: string }).code !== 'auth/user-not-found') throw err;
  }
  await cancelAccountDeletion(deps.db, uid);
  return report;
}

/** Purge every account whose grace period has ended. Returns the purged uids. */
export async function purgeDueAccounts(deps: PurgeDeps, now: Date = new Date()): Promise<string[]> {
  const due = await deps.db.collection(DELETIONS_COLLECTION).where('purgeAfter', '<=', now).get();
  const purged: string[] = [];
  for (const d of due.docs) {
    try {
      await purgeAccount(deps, d.id);
      purged.push(d.id);
    } catch (err) {
      // One failure must not stall everyone else's deletion; the request stays
      // in place and tomorrow's run retries it.
      console.error(`Account purge failed for ${d.id}`, err);
    }
  }
  return purged;
}

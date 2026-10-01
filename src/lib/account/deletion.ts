import type { BulkWriter, DocumentReference, Firestore, Query } from 'firebase-admin/firestore';
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
/** Document trees (a card, a conversation) deleted at once within one account. */
const TREE_CONCURRENCY = 16;
/** Accounts purged at once in one run. */
const ACCOUNT_CONCURRENCY = 2;

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
  /**
   * False when the run's time ran out part way (see {@link PurgeOptions}):
   * what was started is gone, the rest — the profile always among it — is
   * left with the request in place for the next run, which collects it anew.
   */
  complete: boolean;
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
 *
 * The trees come in two groups: the many (cards, conversations), deleted
 * first, and the user's own roots — the profile among them — deleted last, so
 * a purge cut short still finds the pen name (its page to revalidate) next
 * time. Only ids and the fields the pages need are read.
 */
async function collectAccountData(db: Firestore, uid: string) {
  const roots: DocumentReference[] = [
    db.collection('thoughtMaps').doc(uid),
    db.collection('userProfiles').doc(uid),
    db.collection('recommendations').doc(uid),
    db.collection('users').doc(uid), // profile + bookmarks + blocks
  ];

  const [cards, conversations, profile] = await Promise.all([
    db.collection('cards').where('authorId', '==', uid).select('slug', 'publishedAt', 'visibility').get(),
    db.collection('conversations').where('participants', 'array-contains', uid).select().get(),
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
  const trees = [
    ...cards.docs.map((d) => d.ref), // card + its pending edits
    ...conversations.docs.map((d) => d.ref), // conversation + messages
  ];

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

  const snaps = await Promise.all(queries.map((q) => q.select().get()));
  const treePaths = new Set([...trees, ...roots].map((r) => r.path));
  // A record inside a tree (a card's pending edit) goes with the tree.
  const inTree = (path: string) => {
    const parts = path.split('/');
    for (let i = 2; i <= parts.length; i += 2) if (treePaths.has(parts.slice(0, i).join('/'))) return true;
    return false;
  };
  const singles = new Map<string, DocumentReference>();
  for (const snap of snaps) {
    for (const d of snap.docs) {
      if (!inTree(d.ref.path)) singles.set(d.ref.path, d.ref);
    }
  }
  return { trees, roots, singles: [...singles.values()], pages };
}

/**
 * Run `work` over `items`, at most `n` at a time, starting none once
 * `stop()` says so. Answers the items never started and every failure.
 */
async function pool<T>(items: T[], n: number, work: (item: T) => Promise<unknown>, stop: () => boolean) {
  const queue = [...items];
  const errors: unknown[] = [];
  const worker = async () => {
    while (queue.length && !stop()) {
      const item = queue.shift()!;
      try {
        await work(item);
      } catch (e) {
        errors.push(e);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, worker));
  return { notStarted: queue, errors };
}

export interface PurgeOptions {
  /** The run's writer, shared by the accounts it purges; one of its own otherwise. */
  writer?: BulkWriter;
  /** Start nothing new past this time (`clock()` ms); see {@link PurgeReport.complete}. */
  deadline?: number;
  clock?: () => number;
}

/**
 * Remove every Firestore record of `uid` (see {@link collectAccountData}):
 * the trees side by side through one BulkWriter, then the records pointing
 * at the user, then the user's own roots. Any delete that fails throws once
 * the rest are done — the request stays, and the next run tries again.
 */
export async function purgeAccountData(db: Firestore, uid: string, opts: PurgeOptions = {}): Promise<PurgeReport> {
  const clock = opts.clock ?? Date.now;
  const late = () => opts.deadline !== undefined && clock() >= opts.deadline;
  const { trees, roots, singles, pages } = await collectAccountData(db, uid);
  const writer = opts.writer ?? db.bulkWriter();
  let failed = 0;
  let complete = false;
  try {
    const first = await pool(trees, TREE_CONCURRENCY, (ref) => db.recursiveDelete(ref, writer), late);
    failed += first.errors.length;
    if (!first.notStarted.length && !late()) {
      const writes = singles.map((ref) => writer.delete(ref).catch(() => void failed++));
      await writer.flush();
      await Promise.all(writes);
      // The profile goes last, once nothing else of the account is left.
      if (!failed) {
        const last = await pool(roots, TREE_CONCURRENCY, (ref) => db.recursiveDelete(ref, writer), late);
        failed += last.errors.length;
        complete = !last.notStarted.length;
      }
    }
  } finally {
    if (opts.writer) await writer.flush();
    else await writer.close();
  }
  if (failed) throw new Error(`Account purge of ${uid}: ${failed} delete(s) failed`);
  return { trees: trees.length + roots.length, documents: singles.length, pages, complete };
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
 * the account from being deleted. A purge the deadline cut short
 * (`complete: false`) still drops the pages it collected, and leaves the
 * rest — storage, sign-in, the request — to the next run.
 */
export async function purgeAccount(deps: PurgeDeps, uid: string, opts: PurgeOptions = {}): Promise<PurgeReport> {
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
  const report = await purgeAccountData(deps.db, uid, opts);
  if (deps.revalidate && report.pages.length) {
    try {
      deps.revalidate(report.pages);
    } catch (err) {
      console.error(`Account purge: revalidating ${uid}'s pages failed`, err);
    }
  }
  if (!report.complete) return report;
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

export interface PurgeRunOptions {
  now?: Date;
  /**
   * How long the run may start work (ms). Past it no account — and no card or
   * conversation within one — is started; what is under way finishes. The
   * cron gives it its maxDuration less a margin.
   */
  budgetMs?: number;
  /** Accounts purged at once. */
  concurrency?: number;
  clock?: () => number;
}

export interface PurgeRun {
  purged: string[];
  /** Failed this time; their requests stay and the next run retries them. */
  failed: string[];
  /** Due, but the run's time ran out first (not started, or cut short); the next run takes them. */
  deferred: string[];
}

/**
 * Purge every account whose grace period has ended, longest overdue first, a
 * few at a time through one BulkWriter, within `budgetMs`.
 */
export async function purgeDueAccounts(deps: PurgeDeps, opts: PurgeRunOptions = {}): Promise<PurgeRun> {
  const clock = opts.clock ?? Date.now;
  const deadline = opts.budgetMs === undefined ? undefined : clock() + opts.budgetMs;
  const late = () => deadline !== undefined && clock() >= deadline;
  const due = await deps.db
    .collection(DELETIONS_COLLECTION)
    .where('purgeAfter', '<=', opts.now ?? new Date())
    .orderBy('purgeAfter')
    .select()
    .get();
  const run: PurgeRun = { purged: [], failed: [], deferred: [] };
  const writer = deps.db.bulkWriter();
  try {
    const { notStarted } = await pool(
      due.docs.map((d) => d.id),
      opts.concurrency ?? ACCOUNT_CONCURRENCY,
      async (uid) => {
        try {
          const report = await purgeAccount(deps, uid, { writer, deadline, clock });
          (report.complete ? run.purged : run.deferred).push(uid);
        } catch (err) {
          // One failure must not stall everyone else's deletion; the request
          // stays in place and tomorrow's run retries it.
          console.error(`Account purge failed for ${uid}`, err);
          run.failed.push(uid);
        }
      },
      late,
    );
    run.deferred.push(...notStarted);
  } finally {
    await writer.close();
  }
  if (run.deferred.length) {
    console.warn(`Account purge: out of time with ${run.deferred.length} account(s) left for the next run`, run.deferred);
  }
  return run;
}

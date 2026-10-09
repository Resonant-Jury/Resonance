import { FieldValue, Timestamp, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import type { RecommendationItem } from '@/lib/db/types';
import { recommendFeed, type FunnelOptions, type FunnelResult } from './funnel';
import { RECOMMENDATIONS, readStored, recommendationDay, type StoredRecommendations } from './stored';

export { readStored, recommendationDay, type StoredRecommendations };

/**
 * Serving the recommended feed apart from building it. `recommendations/{uid}`
 * keeps the reader's latest result; a request answers from it at once and a
 * new day's build runs after the response, one at a time per reader (a lease
 * taken in a transaction), never more than once an hour after a failure.
 * Only a reader with nothing to show waits for a build — a quick one, inside
 * a budget well under the apps' read timeout.
 *
 * Shared by the web route (/api/recommend/feed) and /api/v1/feed/recommended,
 * and the warm-up cron (/api/cron/warm-picks, warmRecommendations), which
 * builds an opted-in reader's picks ahead of the evening's push through the
 * same lease, store and failure path — marked `warm`, and never counted as
 * the reader asking (`askedOn`, see ./stored).
 */

/** How long a build holds the reader's document: longer than the routes' maxDuration, so a lease outlives its build. */
export const LEASE_MS = 90_000;
/** After a failed build, none is tried again for this long; the reader keeps what they had. */
export const FAILURE_COOLDOWN_MS = 60 * 60_000;
/** The most a reader with nothing to show waits for a build (the apps give up reading after 10 s). */
export const INLINE_BUDGET_MS = 6_000;
const POLL_MS = 400;

export type RecommendationStatus = 'fresh' | 'stale';

export interface DailyRecommendations {
  items: RecommendationItem[];
  /** Answered from the stored result rather than built in this request. */
  cached: boolean;
  /** 'fresh': today's picks. 'stale': earlier (or quick, unranked) picks while today's are built — ask again later. */
  status: RecommendationStatus;
  /** Today's full build when one is due, for the route to run after its response (`after()`). */
  refresh: (() => Promise<void>) | null;
  /**
   * Records that the reader asked for their picks today (`askedOn`), for the
   * route to run after its response — null when today's ask is on record
   * already (or this request's own build wrote it). The evening's pick push
   * skips a reader who did.
   */
  asked: (() => Promise<void>) | null;
}

export type BuildFeed = (uid: string, opts: FunnelOptions) => Promise<FunnelResult>;

export interface DailyDeps {
  build?: BuildFeed;
  /** The clock, in ms (tests). */
  now?: () => number;
  /** The inline build's budget (tests). */
  budgetMs?: number;
}

export type ServePlan =
  | { kind: 'fresh' }
  /** Something to show now; `rebuild` when a build may start. */
  | { kind: 'stale'; rebuild: boolean }
  /** Nothing to show and no build may start: one is running (wait for it) or failed within the hour. */
  | { kind: 'wait' }
  | { kind: 'cooldown' }
  /** Nothing to show: build now. */
  | { kind: 'build' };

/** How to answer from what is stored, at `nowMs`. */
export function planServe(stored: StoredRecommendations | null, nowMs: number): ServePlan {
  if (stored?.date === recommendationDay(new Date(nowMs)) && !stored.partial) return { kind: 'fresh' };
  const leased = !!stored && stored.leaseUntil > nowMs;
  const cooling = !!stored && nowMs - stored.failedAt < FAILURE_COOLDOWN_MS;
  if (stored && stored.items.length > 0) return { kind: 'stale', rebuild: !leased && !cooling };
  if (leased) return { kind: 'wait' };
  if (cooling) return { kind: 'cooldown' };
  return { kind: 'build' };
}

const buildDue = (p: ServePlan) => p.kind === 'build' || (p.kind === 'stale' && p.rebuild);

/** Take the reader's build lease if a build is (still) due; false when another request holds it or none is due. */
async function takeLease(ref: DocumentReference, now: () => number): Promise<boolean> {
  return ref.firestore.runTransaction(async (tx) => {
    const t = now();
    if (!buildDue(planServe(readStored((await tx.get(ref)).data()), t))) return false;
    tx.set(ref, { leaseUntil: Timestamp.fromMillis(t + LEASE_MS) }, { merge: true });
    return true;
  });
}

/**
 * Keep a build's result. One the reader asked for records their ask too
 * (`askedOn`); a warm one (the cron's, ahead of them) is marked `warm` and
 * leaves `askedOn` as it was.
 */
function store(ref: DocumentReference, day: string, result: FunnelResult, opts: { warm?: boolean } = {}) {
  return ref.set(
    {
      date: day,
      items: result.items,
      partial: result.partial,
      generatedAt: FieldValue.serverTimestamp(),
      leaseUntil: FieldValue.delete(),
      failedAt: FieldValue.delete(),
      ...(opts.warm ? { warm: true } : { warm: FieldValue.delete(), askedOn: day }),
    },
    { merge: true },
  );
}

/** Note that the reader asked for their picks on `day` (never throws: it only steers the evening's push). */
function markAsked(ref: DocumentReference, day: string): Promise<void> {
  return ref
    .set({ askedOn: day }, { merge: true })
    .then(() => undefined)
    .catch((e) => console.error('[recommend] recording the ask', e));
}

function recordFailure(ref: DocumentReference, now: () => number, e: unknown) {
  console.error('[recommend] build failed', e);
  return ref
    .set({ failedAt: Timestamp.fromMillis(now()), leaseUntil: FieldValue.delete() }, { merge: true })
    .catch((err) => console.error('[recommend] recording the failure', err));
}

/** Today's full build (every LLM step, no fallback), run after a response; never throws. */
async function rebuild(ref: DocumentReference, uid: string, build: BuildFeed, now: () => number): Promise<void> {
  const leased = await takeLease(ref, now).catch((e) => (console.error('[recommend] lease', e), false));
  if (!leased) return;
  const day = recommendationDay(new Date(now()));
  try {
    await store(ref, day, await build(uid, { now }));
  } catch (e) {
    await recordFailure(ref, now, e);
  }
}

/**
 * A build holds this reader's lease while they have nothing to show: wait
 * for its picks, within the budget. The build may be the warm-up cron's,
 * which records no ask, or may fail — so this request's ask (`asked`) goes on
 * record unless the stored picks show it already.
 */
async function waitForBuild(
  ref: DocumentReference,
  now: () => number,
  deadline: number,
  asked: DailyRecommendations['asked'],
): Promise<DailyRecommendations> {
  while (now() + POLL_MS < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const stored = readStored((await ref.get()).data());
    const day = recommendationDay(new Date(now()));
    if (stored?.date === day) {
      const status = stored.partial ? 'stale' : 'fresh';
      return { items: stored.items, cached: true, status, refresh: null, asked: stored.askedOn === day ? null : asked };
    }
    if (!stored || stored.leaseUntil <= now()) break; // released without a result: it failed
  }
  return { items: [], cached: true, status: 'stale', refresh: null, asked };
}

/**
 * The reader's recommended feed for today (see the top of this file). The
 * caller runs `refresh` after its response when it is set.
 */
export async function dailyRecommendations(db: Firestore, uid: string, deps: DailyDeps = {}): Promise<DailyRecommendations> {
  const build = deps.build ?? recommendFeed;
  const now = deps.now ?? Date.now;
  const ref = db.collection(RECOMMENDATIONS).doc(uid);
  const started = now();
  const deadline = started + (deps.budgetMs ?? INLINE_BUDGET_MS);
  const stored = readStored((await ref.get()).data());
  const plan = planServe(stored, started);
  const refresh = () => rebuild(ref, uid, build, now);
  const today = recommendationDay(new Date(started));
  // The ask goes on record once a day, after the response (a build of the reader's own writes it too).
  const asked = stored?.askedOn === today ? null : () => markAsked(ref, today);

  switch (plan.kind) {
    case 'fresh':
      return { items: stored!.items, cached: true, status: 'fresh', refresh: null, asked };
    case 'stale':
      return { items: stored!.items, cached: true, status: 'stale', refresh: plan.rebuild ? refresh : null, asked };
    case 'cooldown':
      return { items: [], cached: true, status: 'stale', refresh: null, asked };
    case 'wait':
      // A build is under way (another request of theirs, or the warm-up's): wait for it.
      return waitForBuild(ref, now, deadline, asked);
    case 'build':
      break;
  }

  // Nothing to show: build now, in a hurry. Old app builds ask once a day,
  // so an empty answer here would be an empty feed until tomorrow.
  if (!(await takeLease(ref, now))) return waitForBuild(ref, now, deadline, asked);
  try {
    const result = await build(uid, { deadline, fallback: true, now });
    await store(ref, recommendationDay(new Date(started)), result);
    return {
      items: result.items,
      cached: false,
      status: result.partial ? 'stale' : 'fresh',
      refresh: result.partial ? refresh : null,
      asked: null,
    };
  } catch (e) {
    await recordFailure(ref, now, e);
    return { items: [], cached: false, status: 'stale', refresh: null, asked };
  }
}

export type WarmOutcome = 'built' | 'skipped' | 'failed';

/**
 * The warm-up cron's build of one reader's picks, ahead of the evening's
 * push: today's full build (every LLM step, no fallback) through the same
 * lease, store and failure path as a reader's own — so it never runs beside
 * one of theirs, and none is tried again within the hour after a failure.
 * `skipped` when no build is due (today's picks are there, a build holds the
 * lease, or one failed within the hour). Stored as `warm`, without `askedOn`:
 * the reader didn't open anything. Never throws.
 */
export async function warmRecommendations(db: Firestore, uid: string, deps: Pick<DailyDeps, 'build' | 'now'> = {}): Promise<WarmOutcome> {
  const build = deps.build ?? recommendFeed;
  const now = deps.now ?? Date.now;
  const ref = db.collection(RECOMMENDATIONS).doc(uid);
  const leased = await takeLease(ref, now).catch((e) => (console.error('[recommend] lease', e), false));
  if (!leased) return 'skipped';
  try {
    await store(ref, recommendationDay(new Date(now())), await build(uid, { now }), { warm: true });
    return 'built';
  } catch (e) {
    await recordFailure(ref, now, e);
    return 'failed';
  }
}

import { FieldValue, Timestamp, type DocumentData, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import type { RecommendationItem } from '@/lib/db/types';
import { recommendFeed, type FunnelOptions, type FunnelResult } from './funnel';

/**
 * Serving the recommended feed apart from building it. `recommendations/{uid}`
 * keeps the reader's latest result; a request answers from it at once and a
 * new day's build runs after the response, one at a time per reader (a lease
 * taken in a transaction), never more than once an hour after a failure.
 * Only a reader with nothing to show waits for a build — a quick one, inside
 * a budget well under the apps' read timeout.
 *
 * Shared by the web route (/api/recommend/feed) and /api/v1/feed/recommended.
 */

/** UTC day key — the feed regenerates at most once per day per user. */
export function recommendationDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

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
}

export type BuildFeed = (uid: string, opts: FunnelOptions) => Promise<FunnelResult>;

export interface DailyDeps {
  build?: BuildFeed;
  /** The clock, in ms (tests). */
  now?: () => number;
  /** The inline build's budget (tests). */
  budgetMs?: number;
}

/** What `recommendations/{uid}` holds, read defensively. */
export interface StoredRecommendations {
  /** The UTC day the items were built on. */
  date: string | null;
  items: RecommendationItem[];
  /** A quick first pass (no LLM ranking): served, but today's full build is still due. */
  partial: boolean;
  /** A build holds the document until then (ms). */
  leaseUntil: number;
  /** The last build failed then (ms). */
  failedAt: number;
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

const millis = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : 0);

export function readStored(data: DocumentData | undefined): StoredRecommendations | null {
  if (!data) return null;
  const items = Array.isArray(data.items)
    ? (data.items as unknown[]).filter(
        (i): i is RecommendationItem =>
          !!i && typeof (i as RecommendationItem).cardId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test((i as RecommendationItem).cardId),
      )
    : [];
  return {
    date: typeof data.date === 'string' ? data.date : null,
    items,
    partial: data.partial === true,
    leaseUntil: millis(data.leaseUntil),
    failedAt: millis(data.failedAt),
  };
}

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

function store(ref: DocumentReference, day: string, result: FunnelResult) {
  return ref.set(
    {
      date: day,
      items: result.items,
      partial: result.partial,
      generatedAt: FieldValue.serverTimestamp(),
      leaseUntil: FieldValue.delete(),
      failedAt: FieldValue.delete(),
    },
    { merge: true },
  );
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

/** Another request is building this reader's first picks: wait for them, within the budget. */
async function waitForBuild(ref: DocumentReference, now: () => number, deadline: number): Promise<DailyRecommendations> {
  while (now() + POLL_MS < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const stored = readStored((await ref.get()).data());
    if (stored?.date === recommendationDay(new Date(now()))) {
      return { items: stored.items, cached: true, status: stored.partial ? 'stale' : 'fresh', refresh: null };
    }
    if (!stored || stored.leaseUntil <= now()) break; // released without a result: it failed
  }
  return { items: [], cached: true, status: 'stale', refresh: null };
}

/**
 * The reader's recommended feed for today (see the top of this file). The
 * caller runs `refresh` after its response when it is set.
 */
export async function dailyRecommendations(db: Firestore, uid: string, deps: DailyDeps = {}): Promise<DailyRecommendations> {
  const build = deps.build ?? recommendFeed;
  const now = deps.now ?? Date.now;
  const ref = db.collection('recommendations').doc(uid);
  const started = now();
  const deadline = started + (deps.budgetMs ?? INLINE_BUDGET_MS);
  const stored = readStored((await ref.get()).data());
  const plan = planServe(stored, started);
  const refresh = () => rebuild(ref, uid, build, now);

  switch (plan.kind) {
    case 'fresh':
      return { items: stored!.items, cached: true, status: 'fresh', refresh: null };
    case 'stale':
      return { items: stored!.items, cached: true, status: 'stale', refresh: plan.rebuild ? refresh : null };
    case 'cooldown':
      return { items: [], cached: true, status: 'stale', refresh: null };
    case 'wait':
      return waitForBuild(ref, now, deadline);
    case 'build':
      break;
  }

  // Nothing to show: build now, in a hurry. Old app builds ask once a day,
  // so an empty answer here would be an empty feed until tomorrow.
  if (!(await takeLease(ref, now))) return waitForBuild(ref, now, deadline);
  try {
    const result = await build(uid, { deadline, fallback: true, now });
    await store(ref, recommendationDay(new Date(started)), result);
    return {
      items: result.items,
      cached: false,
      status: result.partial ? 'stale' : 'fresh',
      refresh: result.partial ? refresh : null,
    };
  } catch (e) {
    await recordFailure(ref, now, e);
    return { items: [], cached: false, status: 'stale', refresh: null };
  }
}

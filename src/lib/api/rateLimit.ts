import type { Firestore } from 'firebase-admin/firestore';
import { ApiFailure, apiError } from './v1/http';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Per-user budgets for the endpoints that cost money (an LLM or image call)
 * or reach other people (a push, a note, a message). Generous for a person
 * writing, tight for a script: they exist to bound what one account can
 * spend or send, not to shape normal use.
 */
export const LIMITS = {
  /** /api/generate-image: an image generation and an AVIF encode each. */
  illustration: { max: 10, windowMs: DAY },
  /** /api/cards/insight and /api/cards/tags: one LLM call each. */
  insight: { max: 60, windowMs: HOUR },
  tags: { max: 60, windowMs: HOUR },
  /** Publishing: a slug LLM call, the index, maybe a bell. */
  publish: { max: 30, windowMs: DAY },
  /**
   * Resonating with a card with one already written: rings the original
   * author once per card, and may connect the two — which taking it back
   * undoes, so a tight budget keeps that from becoming a way to reach anyone.
   */
  resonate: { max: 20, windowMs: DAY },
  /**
   * Links in stories the server fetches for their previews (lib/links/cardLinks),
   * charged per link not already stored, after publishing or saving an edit.
   * Over it, the previews are skipped, never the publish.
   */
  unfurl: { max: 100, windowMs: DAY },
  /** A note rings its recipient's phone. */
  note: { max: 20, windowMs: HOUR },
  /** Messages (only the first of a conversation rings). */
  message: { max: 300, windowMs: HOUR },
  report: { max: 20, windowMs: DAY },
  /** /api/upload: files, and their bytes (see `weight`). */
  upload: { max: 50, windowMs: DAY },
  uploadBytes: { max: 200 * 1024 * 1024, windowMs: DAY },
  /** Accepting a legacy invite rings its sender. */
  invite: { max: 60, windowMs: HOUR },
  /** /api/account/export: reads everything the account ever wrote. */
  export: { max: 20, windowMs: DAY },
} as const satisfies Record<string, { max: number; windowMs: number }>;

export type Bucket = keyof typeof LIMITS;

/**
 * Spend `weight` (default 1) of `uid`'s `bucket`, or throw a 429
 * `rate_limited` ApiFailure when the current window has no room left.
 *
 * One server-only document per user and bucket (`rateLimits/{uid}_{bucket}`,
 * closed to clients by the rules; deleted with the account) holds the
 * window's start and what was spent in it — a fixed window, counted in a
 * transaction so concurrent requests can't both take the last unit.
 */
export async function spend(db: Firestore, uid: string, bucket: Bucket, weight = 1, now = Date.now()): Promise<void> {
  const { max, windowMs } = LIMITS[bucket];
  const ref = db.doc(`rateLimits/${uid}_${bucket}`);
  const allowed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const start = snap.get('windowStart');
    const used = snap.get('used');
    const fresh = typeof start !== 'number' || typeof used !== 'number' || now - start >= windowMs;
    const next = (fresh ? 0 : used) + weight;
    if (next > max) return false;
    tx.set(ref, { userId: uid, bucket, windowStart: fresh ? now : start, used: next });
    return true;
  });
  if (!allowed) throw new ApiFailure('rate_limited', 'Too many requests. Please try again later.');
}

/**
 * spend() for the routes outside /api/v1: the 429 response to return, or
 * null when the request may go ahead.
 */
export async function limited(db: Firestore, uid: string, bucket: Bucket, weight = 1): Promise<Response | null> {
  try {
    await spend(db, uid, bucket, weight);
    return null;
  } catch (e) {
    if (e instanceof ApiFailure) return apiError(e.code, e.message);
    throw e;
  }
}

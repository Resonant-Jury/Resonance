import { Timestamp, type DocumentData } from 'firebase-admin/firestore';
import type { RecommendationItem } from '@/lib/db/types';

/**
 * What `recommendations/{uid}` holds, read without the recommender itself:
 * this module imports nothing that builds picks, so a route that only reads
 * them (the evening's pick push) reaches no LLM and may run anywhere
 * (src/lib/ai/regions.test.ts follows the imports).
 */

export const RECOMMENDATIONS = 'recommendations';

/** UTC day key — the feed regenerates at most once per day per user. */
export function recommendationDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
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
  /**
   * The UTC day the reader last asked for their picks themselves (the feed
   * on the web or in an app) — never set by the warm-up cron's build, so
   * "they opened their picks today" means they did.
   */
  askedOn: string | null;
  /** The stored items were built ahead of the reader by the warm-up cron, not on their request. */
  warm: boolean;
}

const millis = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : 0);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

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
    askedOn: typeof data.askedOn === 'string' && DAY.test(data.askedOn) ? data.askedOn : null,
    warm: data.warm === true,
  };
}

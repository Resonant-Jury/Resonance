import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { FAILURE_COOLDOWN_MS, LEASE_MS, planServe, readStored, recommendationDay, type StoredRecommendations } from './daily';

// How a request answers from `recommendations/{uid}` (the Firestore side —
// the lease transaction, the build after the response — is in
// test/emulator/recommendations.emulator.test.ts).

const NOW = Date.parse('2026-10-01T09:00:00Z');
const TODAY = recommendationDay(new Date(NOW));
const item = { cardId: 'c1', channel: 'insight' as const, reason: 'r', score: 1 };
const stored = (extra: Partial<StoredRecommendations> = {}): StoredRecommendations => ({
  date: '2026-09-30',
  items: [item],
  partial: false,
  leaseUntil: 0,
  failedAt: 0,
  ...extra,
});

describe('planServe', () => {
  it("serves today's picks as they are", () => {
    expect(planServe(stored({ date: TODAY }), NOW)).toEqual({ kind: 'fresh' });
    expect(planServe(stored({ date: TODAY, items: [] }), NOW)).toEqual({ kind: 'fresh' });
  });

  it("serves an earlier day's picks at once, and builds today's after the response", () => {
    expect(planServe(stored(), NOW)).toEqual({ kind: 'stale', rebuild: true });
  });

  it("treats today's quick first pass as not yet today's picks", () => {
    expect(planServe(stored({ date: TODAY, partial: true }), NOW)).toEqual({ kind: 'stale', rebuild: true });
  });

  it('starts no second build while one holds the lease, and a new one once it has lapsed', () => {
    expect(planServe(stored({ leaseUntil: NOW + 1 }), NOW)).toEqual({ kind: 'stale', rebuild: false });
    expect(planServe(stored({ leaseUntil: NOW }), NOW)).toEqual({ kind: 'stale', rebuild: true });
  });

  it('tries nothing again for an hour after a failure', () => {
    expect(planServe(stored({ failedAt: NOW - FAILURE_COOLDOWN_MS + 1 }), NOW)).toEqual({ kind: 'stale', rebuild: false });
    expect(planServe(stored({ failedAt: NOW - FAILURE_COOLDOWN_MS }), NOW)).toEqual({ kind: 'stale', rebuild: true });
  });

  it('builds in the request only for a reader with nothing to show', () => {
    expect(planServe(null, NOW)).toEqual({ kind: 'build' });
    expect(planServe(stored({ items: [] }), NOW)).toEqual({ kind: 'build' });
    expect(planServe(stored({ items: [], leaseUntil: NOW + LEASE_MS }), NOW)).toEqual({ kind: 'wait' });
    expect(planServe(stored({ items: [], failedAt: NOW - 1 }), NOW)).toEqual({ kind: 'cooldown' });
  });
});

describe('readStored', () => {
  it('reads the document defensively, dropping items that are not card ids', () => {
    expect(readStored(undefined)).toBeNull();
    expect(
      readStored({
        date: TODAY,
        items: [item, null, { cardId: 'a/b' }, { cardId: 7 }],
        leaseUntil: Timestamp.fromMillis(NOW),
        failedAt: 'yesterday',
      }),
    ).toEqual({ date: TODAY, items: [item], partial: false, leaseUntil: NOW, failedAt: 0 });
    // A document written before these fields existed: yesterday's picks, no lease, no failure.
    expect(readStored({ date: '2026-09-30', items: [item] })).toEqual(stored());
  });
});

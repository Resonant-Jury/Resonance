import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./profile', () => ({ getOrBuildProfile: vi.fn() }));
vi.mock('./signals', () => ({ getEngagedAuthorIds: vi.fn() }));
vi.mock('./vectorStore', () => ({ getVectorStore: vi.fn() }));
vi.mock('@/lib/ai/openai', () => ({
  chatJSON: vi.fn(),
  rerankModel: () => 'cheap-model',
}));

import { RERANK_TIMEOUT_MS, SELECT_TIMEOUT_MS, recommendFeed } from './funnel';
import { getOrBuildProfile } from './profile';
import { getEngagedAuthorIds } from './signals';
import { getVectorStore } from './vectorStore';
import { chatJSON } from '@/lib/ai/openai';
import type { NearestHit } from './vectorStore/types';

function hit(cardId: string, authorId: string, distance: number, coreInsight = `insight-${cardId}`): NearestHit {
  return {
    record: {
      cardId,
      authorId,
      visibility: 'public',
      channel: 'insight',
      vector: [],
      insightScore: 0.8,
      coreInsight,
      situation: `situation-${cardId}`,
      lifeDomain: 'x',
    },
    distance,
  };
}

const nearest = vi.fn();
const profile = (centroids: number[][] = [[1, 0]]) => ({ uid: 'u1', centroids, summaries: ['my insight'], updatedAt: new Date() });
const timedOut = () => Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getVectorStore).mockReturnValue({
    nearest,
    upsert: vi.fn(),
    deleteByCard: vi.fn(),
    listByAuthor: vi.fn(),
  });
  vi.mocked(getEngagedAuthorIds).mockResolvedValue(new Set());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('recommendFeed', () => {
  it('returns an empty feed when the user has no profile centroids', async () => {
    vi.mocked(getOrBuildProfile).mockResolvedValue(profile([]));
    expect(await recommendFeed('u1')).toEqual({ items: [], partial: false });
    expect(nearest).not.toHaveBeenCalled();
  });

  it('hard-filters retrieval to public cards and excludes the viewer', async () => {
    vi.mocked(getOrBuildProfile).mockResolvedValue(profile());
    nearest.mockResolvedValue([hit('c1', 'a1', 0.1)]);
    vi.mocked(chatJSON)
      .mockResolvedValueOnce({ scores: [{ ref: 'c1', score: 0.9 }] })
      .mockResolvedValueOnce({ picks: [{ ref: 'c1', reason: '因為你也走過' }] });

    await recommendFeed('u1');

    expect(nearest).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'insight',
        filter: { visibility: 'public', excludeAuthorId: 'u1' },
      })
    );
  });

  it('runs the funnel: ANN dedupe → rerank → select, returning picks in order with reasons', async () => {
    vi.mocked(getOrBuildProfile).mockResolvedValue(profile([[1, 0], [0, 1]]));
    // Two centroids return overlapping cards; c1 appears in both (keep best distance).
    nearest
      .mockResolvedValueOnce([hit('c1', 'a1', 0.5), hit('c2', 'a2', 0.2)])
      .mockResolvedValueOnce([hit('c1', 'a1', 0.1), hit('c3', 'a3', 0.4)]);
    vi.mocked(chatJSON)
      .mockResolvedValueOnce({ scores: [{ ref: 'c1', score: 0.3 }, { ref: 'c2', score: 0.9 }, { ref: 'c3', score: 0.5 }] })
      .mockResolvedValueOnce({ picks: [{ ref: 'c2', reason: 'r2' }, { ref: 'c3', reason: 'r3' }, { ref: 'c2', reason: 'again' }] });

    const { items: feed, partial } = await recommendFeed('u1');

    expect(partial).toBe(false);
    expect(feed.map((i) => i.cardId)).toEqual(['c2', 'c3']);
    expect(feed[0].reason).toBe('r2');
    expect(feed.every((i) => i.channel === 'insight')).toBe(true);
  });

  it('boosts cards whose author the reader has resonated with', async () => {
    vi.mocked(getOrBuildProfile).mockResolvedValue(profile());
    vi.mocked(getEngagedAuthorIds).mockResolvedValue(new Set(['a2']));
    nearest.mockResolvedValue([hit('c1', 'a1', 0.1), hit('c2', 'a2', 0.1)]);
    // Equal rerank scores; the boost on a2 should put c2 first.
    vi.mocked(chatJSON)
      .mockResolvedValueOnce({ scores: [{ ref: 'c1', score: 0.5 }, { ref: 'c2', score: 0.5 }] })
      .mockResolvedValueOnce({ picks: [{ ref: 'c1', reason: 'r1' }, { ref: 'c2', reason: 'r2' }] });

    const { items: feed } = await recommendFeed('u1');
    const c2 = feed.find((i) => i.cardId === 'c2')!;
    const c1 = feed.find((i) => i.cardId === 'c1')!;
    expect(c2.score).toBeGreaterThan(c1.score);
  });

  it("reads the reader's own resonances beside the profile, not after the vector search", async () => {
    let engagedAskedFirst = false;
    vi.mocked(getOrBuildProfile).mockImplementation(async () => {
      engagedAskedFirst = vi.mocked(getEngagedAuthorIds).mock.calls.length > 0;
      return profile();
    });
    nearest.mockResolvedValue([hit('c1', 'a1', 0.1)]);
    vi.mocked(chatJSON).mockResolvedValueOnce({ scores: [] }).mockResolvedValueOnce({ picks: [] });

    await recommendFeed('u1');
    expect(engagedAskedFirst).toBe(true);
  });

  it('gives every LLM call a timeout, and asks the rerank for its best 30 only, under a token cap', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    vi.mocked(getOrBuildProfile).mockResolvedValue(profile());
    nearest.mockResolvedValue([hit('c1', 'a1', 0.1)]);
    vi.mocked(chatJSON)
      .mockResolvedValueOnce({ scores: [{ ref: 'c1', score: 0.9 }] })
      .mockResolvedValueOnce({ picks: [{ ref: 'c1', reason: 'r1' }] });

    await recommendFeed('u1');

    expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([RERANK_TIMEOUT_MS, SELECT_TIMEOUT_MS]);
    const [rerankMessages, rerankOpts] = vi.mocked(chatJSON).mock.calls[0];
    expect(rerankMessages[0].content).toContain('at most 30');
    expect(rerankOpts).toEqual({ model: 'cheap-model', signal: expect.any(AbortSignal), maxTokens: expect.any(Number) });
    expect(vi.mocked(chatJSON).mock.calls[1][1]).toEqual({ signal: expect.any(AbortSignal) });
  });

  it('throws when an LLM step fails, so a background build is recorded as failed', async () => {
    vi.mocked(getOrBuildProfile).mockResolvedValue(profile());
    nearest.mockResolvedValue([hit('c1', 'a1', 0.1)]);
    vi.mocked(chatJSON).mockRejectedValueOnce(timedOut());
    await expect(recommendFeed('u1')).rejects.toThrow(/timeout/);
  });

  describe('with a fallback (a reader who has nothing to be shown yet)', () => {
    beforeEach(() => {
      vi.mocked(getOrBuildProfile).mockResolvedValue(profile());
      vi.mocked(getEngagedAuthorIds).mockResolvedValue(new Set(['a3']));
      nearest.mockResolvedValue([hit('c1', 'a1', 0.1), hit('c2', 'a2', 0.3), hit('c3', 'a3', 0.35)]);
      vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('answers in retrieval order, without reasons, when the LLM steps time out', async () => {
      vi.mocked(chatJSON).mockRejectedValue(timedOut());
      const { items, partial } = await recommendFeed('u1', { fallback: true, deadline: Date.now() + 6_000 });
      expect(partial).toBe(true);
      // Closest first (1 − distance), with the resonated author's light boost lifting c3 over c2.
      expect(items.map((i) => [i.cardId, i.reason])).toEqual([['c1', ''], ['c3', ''], ['c2', '']]);
    });

    it("still lets the final pick choose (with reasons) when only the rerank failed", async () => {
      vi.mocked(chatJSON)
        .mockRejectedValueOnce(timedOut())
        .mockResolvedValueOnce({ picks: [{ ref: 'c2', reason: 'r2' }] });
      const { items, partial } = await recommendFeed('u1', { fallback: true });
      expect(items.map((i) => [i.cardId, i.reason])).toEqual([['c2', 'r2']]);
      expect(partial).toBe(true);
    });

    it('skips a step that no longer fits before the deadline, and gives each step only the time left', async () => {
      const timeout = vi.spyOn(AbortSignal, 'timeout');
      let t = 0;
      vi.mocked(chatJSON).mockImplementationOnce(async () => {
        t = 9_000; // the rerank took 9 s of the 10 s budget
        return { scores: [{ ref: 'c2', score: 0.9 }, { ref: 'c1', score: 0.5 }] };
      });

      const { items, partial } = await recommendFeed('u1', { fallback: true, deadline: 10_000, now: () => t });

      expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([10_000]);
      expect(chatJSON).toHaveBeenCalledTimes(1);
      expect(partial).toBe(true);
      expect(items.map((i) => [i.cardId, i.reason])).toEqual([['c2', ''], ['c1', ''], ['c3', '']]);
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./profile', () => ({ getOrBuildProfile: vi.fn() }));
vi.mock('./signals', () => ({ getEngagedAuthorIds: vi.fn() }));
vi.mock('./vectorStore', () => ({ getVectorStore: vi.fn() }));
vi.mock('@/lib/ai/openai', () => ({
  chatJSON: vi.fn(),
  rerankModel: () => 'cheap-model',
}));

import { recommendFeed } from './funnel';
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

describe('recommendFeed', () => {
  it('returns an empty feed when the user has no profile centroids', async () => {
    vi.mocked(getOrBuildProfile).mockResolvedValue({ uid: 'u1', centroids: [], summaries: [], updatedAt: new Date() });
    expect(await recommendFeed('u1')).toEqual([]);
    expect(nearest).not.toHaveBeenCalled();
  });

  it('hard-filters retrieval to public cards and excludes the viewer', async () => {
    vi.mocked(getOrBuildProfile).mockResolvedValue({
      uid: 'u1',
      centroids: [[1, 0]],
      summaries: ['my insight'],
      updatedAt: new Date(),
    });
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
    vi.mocked(getOrBuildProfile).mockResolvedValue({
      uid: 'u1',
      centroids: [[1, 0], [0, 1]],
      summaries: ['my insight'],
      updatedAt: new Date(),
    });
    // Two centroids return overlapping cards; c1 appears in both (keep best distance).
    nearest
      .mockResolvedValueOnce([hit('c1', 'a1', 0.5), hit('c2', 'a2', 0.2)])
      .mockResolvedValueOnce([hit('c1', 'a1', 0.1), hit('c3', 'a3', 0.4)]);
    vi.mocked(chatJSON)
      .mockResolvedValueOnce({ scores: [{ ref: 'c1', score: 0.3 }, { ref: 'c2', score: 0.9 }, { ref: 'c3', score: 0.5 }] })
      .mockResolvedValueOnce({ picks: [{ ref: 'c2', reason: 'r2' }, { ref: 'c3', reason: 'r3' }] });

    const feed = await recommendFeed('u1');

    expect(feed.map((i) => i.cardId)).toEqual(['c2', 'c3']);
    expect(feed[0].reason).toBe('r2');
    expect(feed.every((i) => i.channel === 'insight')).toBe(true);
  });

  it('boosts cards whose author the reader has resonated with', async () => {
    vi.mocked(getOrBuildProfile).mockResolvedValue({
      uid: 'u1',
      centroids: [[1, 0]],
      summaries: [],
      updatedAt: new Date(),
    });
    vi.mocked(getEngagedAuthorIds).mockResolvedValue(new Set(['a2']));
    nearest.mockResolvedValue([hit('c1', 'a1', 0.1), hit('c2', 'a2', 0.1)]);
    // Equal rerank scores; the boost on a2 should put c2 first.
    vi.mocked(chatJSON)
      .mockResolvedValueOnce({ scores: [{ ref: 'c1', score: 0.5 }, { ref: 'c2', score: 0.5 }] })
      .mockResolvedValueOnce({ picks: [{ ref: 'c1', reason: 'r1' }, { ref: 'c2', reason: 'r2' }] });

    const feed = await recommendFeed('u1');
    const c2 = feed.find((i) => i.cardId === 'c2')!;
    const c1 = feed.find((i) => i.cardId === 'c1')!;
    expect(c2.score).toBeGreaterThan(c1.score);
  });
});

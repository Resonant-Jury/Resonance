import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { FirestoreVectorStore } from '@/lib/recommend/vectorStore/firestore';

// GET /api/v1/feed/recommended against the Firestore emulator: the vector
// search's distance direction on real unit vectors.

const PROJECT = 'demo-resonance-api-recommended';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'api-v1-recommended-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
});

describe('the vector search', () => {
  const unit = (v: number[]) => {
    const n = Math.hypot(...v);
    return v.map((x) => x / n);
  };
  const record = (cardId: string, authorId: string, v: number[], visibility: 'public' | 'private' = 'public') => ({
    cardId,
    authorId,
    visibility,
    channel: 'insight' as const,
    vector: unit(v),
    insightScore: 0.8,
    coreInsight: `insight ${cardId}`,
    situation: '',
    lifeDomain: 'x',
  });

  it('ranks by COSINE distance, smaller is closer, as the funnel keeps the smallest', async () => {
    const store = new FirestoreVectorStore(db);
    await store.upsert([
      record('far', 'a3', [-1, 0.2, 0, 0]),
      record('near', 'a1', [1, 0.1, 0, 0]),
      record('mid', 'a2', [1, 1, 0, 0]),
      record('mine', 'reader', [1, 0, 0, 0]),
      record('hidden', 'a4', [1, 0, 0, 0], 'private'),
    ]);
    const query = unit([1, 0, 0, 0]);

    const hits = await store.nearest({ channel: 'insight', vector: query, filter: { visibility: 'public', excludeAuthorId: 'reader' }, limit: 10 });
    expect(hits.map((h) => h.record.cardId)).toEqual(['near', 'mid', 'far']);
    // 1 − cos θ for unit vectors: ~0 for the nearest, ~2 for the opposite.
    expect(hits[0].distance).toBeCloseTo(1 - unit([1, 0.1, 0, 0])[0], 6);
    expect(hits[2].distance).toBeGreaterThan(1.9);
    // The signature comes back, not the stored vector.
    expect(hits[0].record).toMatchObject({ coreInsight: 'insight near', authorId: 'a1', vector: [] });
  });
});

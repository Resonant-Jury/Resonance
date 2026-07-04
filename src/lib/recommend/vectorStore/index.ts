import type { IVectorStore } from './interfaces';
import { FirestoreVectorStore } from './firestore';

let cached: IVectorStore | null = null;

/**
 * Resolve the configured vector backend. Firestore native KNN is the default;
 * `RECO_VECTOR_BACKEND` is the seam where a future Cloudflare Vectorize /
 * pgvector implementation plugs in without touching callers.
 */
export function getVectorStore(): IVectorStore {
  if (cached) return cached;
  const backend = process.env.RECO_VECTOR_BACKEND ?? 'firestore';
  switch (backend) {
    case 'firestore':
      cached = new FirestoreVectorStore();
      return cached;
    default:
      throw new Error(`Unknown RECO_VECTOR_BACKEND: ${backend}`);
  }
}

export type * from './types';
export type * from './interfaces';

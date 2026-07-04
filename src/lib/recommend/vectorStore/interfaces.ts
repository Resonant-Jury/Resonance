import type { AuthorVector, NearestHit, VectorChannel, VectorQuery, VectorRecord } from './types';

/**
 * Storage-agnostic vector index. Firestore native KNN is the current backend
 * ({@link FirestoreVectorStore}); the interface keeps callers (indexCard,
 * funnel) ignorant of the backend so Cloudflare Vectorize / pgvector can drop
 * in later without touching them.
 */
export interface IVectorStore {
  /**
   * Insert or replace the vectors for one or more cards. Implementations key by
   * `(cardId, channel)` so re-indexing an edited card overwrites in place.
   */
  upsert(records: VectorRecord[]): Promise<void>;
  /** Remove every channel's vector for a card (on delete / unpublish). */
  deleteByCard(cardId: string): Promise<void>;
  /** Approximate-nearest-neighbour search within a single channel. */
  nearest(query: VectorQuery): Promise<NearestHit[]>;
  /**
   * Read back one author's own vectors for a channel (all visibilities). Used
   * to build that author's profile — including from their PRIVATE cards, which
   * shape their own recommendations but are never exposed to anyone else.
   */
  listByAuthor(authorId: string, channel: VectorChannel): Promise<AuthorVector[]>;
}

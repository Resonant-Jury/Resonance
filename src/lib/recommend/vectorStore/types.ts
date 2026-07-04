import type { Visibility } from '@/lib/db/types';

/**
 * The two retrieval channels a card is indexed under. `insight` carries the
 * embedding of the core realization; `situation` the lived circumstance. They
 * are searched independently so the feed can lean toward「跟我有同樣領悟的人」
 * vs.「跟我走過同一種坎的人」.
 */
export type VectorChannel = 'insight' | 'situation';

/**
 * One stored vector = one card under one channel. Vectors are server-only; the
 * client never reads this collection (Firestore rules deny it). The denormalized
 * signature fields ride along so the rerank stage can score candidates without
 * a second round-trip to the cards collection.
 */
export interface VectorRecord {
  cardId: string;
  authorId: string;
  /** Mirrors the card's visibility — the hard privacy filter at query time. */
  visibility: Visibility;
  channel: VectorChannel;
  /** Unit-normalized embedding (paired with DOT_PRODUCT distance). */
  vector: number[];
  /** Card-level insight score, denormalized for cheap candidate filtering. */
  insightScore: number;
  /** Trimmed signature for the rerank prompt — no need to re-read the card. */
  coreInsight: string;
  situation: string;
  lifeDomain: string;
}

/** A query against one channel, with hard pre-filters applied before KNN. */
export interface VectorQuery {
  channel: VectorChannel;
  /** Unit-normalized query vector (e.g. a user-profile centroid). */
  vector: number[];
  filter: {
    /** Only return records at this visibility (always `public` for others' feeds). */
    visibility: Visibility;
    /** Drop the viewer's own cards from results (a card never recommends its author to themselves). */
    excludeAuthorId?: string;
  };
  limit: number;
}

/** One of an author's own stored vectors, used to build their profile. */
export interface AuthorVector {
  cardId: string;
  vector: number[];
}

/** A single nearest-neighbour result: the stored record plus its distance. */
export interface NearestHit {
  record: VectorRecord;
  /** DOT_PRODUCT distance from Firestore; smaller = closer for normalized vectors. */
  distance: number;
}

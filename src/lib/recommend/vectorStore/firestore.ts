import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/db/firestore/admin';
import type { Visibility } from '@/lib/db/types';
import type { IVectorStore } from './interfaces';
import type { AuthorVector, NearestHit, VectorChannel, VectorQuery, VectorRecord } from './types';

const COLLECTION = 'cardVectors';
const DISTANCE_FIELD = '__distance';
/**
 * What a hit carries back: the signature, not the 1536-float vector (six
 * centroids × 60 hits would otherwise download megabytes per feed). The
 * distance field must be in the projection or Firestore leaves it out.
 */
const HIT_FIELDS = ['cardId', 'authorId', 'visibility', 'channel', 'insightScore', 'coreInsight', 'situation', 'lifeDomain', DISTANCE_FIELD];

/** Deterministic doc id so re-indexing a card overwrites its vectors in place. */
function docId(cardId: string, channel: VectorChannel): string {
  return `${cardId}__${channel}`;
}

/**
 * Firestore-native KNN backend. Vectors live in the `cardVectors` collection,
 * one doc per `(cardId, channel)`, written with {@link FieldValue.vector}. The
 * `visibility` pre-filter is the privacy boundary — others' feeds only ever see
 * `public` records (see `firebase/firestore.rules`, which deny all client
 * access to this collection).
 *
 * Requires a composite vector index on `(visibility, channel, vector)` — see
 * `firestore.indexes.json` (an index serves every distance measure).
 */
export class FirestoreVectorStore implements IVectorStore {
  /** `firestore` for tests against the emulator; the app's admin database otherwise. */
  constructor(private readonly firestore?: Firestore) {}

  private db(): Firestore {
    return this.firestore ?? getAdminDb();
  }

  async upsert(records: VectorRecord[]): Promise<void> {
    if (records.length === 0) return;
    const batch = this.db().batch();
    for (const r of records) {
      const ref = this.db().collection(COLLECTION).doc(docId(r.cardId, r.channel));
      batch.set(ref, {
        cardId: r.cardId,
        authorId: r.authorId,
        visibility: r.visibility,
        channel: r.channel,
        vector: FieldValue.vector(r.vector),
        insightScore: r.insightScore,
        coreInsight: r.coreInsight,
        situation: r.situation,
        lifeDomain: r.lifeDomain,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }

  async deleteByCard(cardId: string): Promise<void> {
    const snap = await this.db().collection(COLLECTION).where('cardId', '==', cardId).get();
    if (snap.empty) return;
    const batch = this.db().batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  async setVisibility(cardId: string, visibility: Visibility): Promise<void> {
    const snap = await this.db().collection(COLLECTION).where('cardId', '==', cardId).get();
    if (snap.empty) return;
    const batch = this.db().batch();
    snap.docs.forEach((d) => batch.update(d.ref, { visibility, updatedAt: FieldValue.serverTimestamp() }));
    await batch.commit();
  }

  async listByAuthor(authorId: string, channel: VectorChannel): Promise<AuthorVector[]> {
    // `authorId` equality is auto-indexed; the channel filter is applied in code
    // to avoid a second composite index for this owner-scoped read.
    const snap = await this.db().collection(COLLECTION).where('authorId', '==', authorId).get();
    const out: AuthorVector[] = [];
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.channel !== channel) continue;
      const vector = (data.vector?.toArray?.() ?? []) as number[];
      if (vector.length > 0) out.push({ cardId: String(data.cardId), vector });
    }
    return out;
  }

  async nearest(query: VectorQuery): Promise<NearestHit[]> {
    const snap = await this.db()
      .collection(COLLECTION)
      .where('visibility', '==', query.filter.visibility)
      .where('channel', '==', query.channel)
      .select(...HIT_FIELDS)
      .findNearest({
        vectorField: 'vector',
        queryVector: FieldValue.vector(query.vector),
        limit: query.limit,
        // COSINE answers 1 − cos θ: smaller is closer, as the funnel ranks.
        // (DOT_PRODUCT answers the product itself — larger is closer — which
        // the funnel's "keep the smallest" would have turned upside down.)
        distanceMeasure: 'COSINE',
        distanceResultField: DISTANCE_FIELD,
      })
      .get();

    const hits: NearestHit[] = [];
    for (const doc of snap.docs) {
      const data = doc.data();
      // `excludeAuthorId` is applied in code rather than as a `!=` pre-filter so
      // the composite vector index stays equality-only (the author's own cards
      // are few, so over-fetch + drop is cheaper than a second index).
      if (query.filter.excludeAuthorId && data.authorId === query.filter.excludeAuthorId) {
        continue;
      }
      hits.push({
        record: {
          cardId: String(data.cardId),
          authorId: String(data.authorId),
          visibility: data.visibility,
          channel: data.channel,
          // Not fetched (HIT_FIELDS): rerank works off the signature fields.
          vector: [],
          insightScore: Number(data.insightScore ?? 0),
          coreInsight: String(data.coreInsight ?? ''),
          situation: String(data.situation ?? ''),
          lifeDomain: String(data.lifeDomain ?? ''),
        },
        distance: Number(data[DISTANCE_FIELD] ?? 0),
      });
    }
    return hits;
  }
}

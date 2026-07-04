import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/db/firestore/admin';
import type { InsightSignature } from '@/lib/db/types';
import { kmeans } from './math';
import { getVectorStore } from './vectorStore';

/** How many insight directions represent one person. A set of centroids, not one averaged centre. */
const PROFILE_CENTROIDS = 6;
/** Profiles older than this are rebuilt on next request. */
const PROFILE_STALE_MS = 24 * 60 * 60 * 1000;
/** How many of the user's own recent insights/situations feed the LLM text context. */
const PROFILE_SUMMARY_LINES = 12;

export interface UserProfile {
  uid: string;
  /** Centroid vectors over the user's own insight embeddings (the ANN query points). */
  centroids: number[][];
  /** Short lines from the user's own signatures — the text the rerank/select LLM compares against. */
  summaries: string[];
  updatedAt: Date;
}

function profileRef(uid: string) {
  return getAdminDb().collection('userProfiles').doc(uid);
}

/** Read the user's own card signatures (newest first) into compact summary lines. */
async function readOwnSummaries(uid: string): Promise<string[]> {
  const snap = await getAdminDb()
    .collection('cards')
    .where('authorId', '==', uid)
    .orderBy('publishedAt', 'desc')
    .limit(40)
    .get();
  const lines: string[] = [];
  for (const doc of snap.docs) {
    const sig = doc.data().signature as InsightSignature | undefined;
    if (!sig?.coreInsight) continue;
    const situation = sig.situation ? `（${sig.situation}）` : '';
    lines.push(`${sig.coreInsight}${situation}`);
    if (lines.length >= PROFILE_SUMMARY_LINES) break;
  }
  return lines;
}

/**
 * Compute and persist a user's profile: cluster their own insight vectors
 * (drawn from all their cards, **including private ones**) into a small set of
 * centroids, plus collect text summaries for the LLM stages. Private content
 * shapes the owner's own recommendations but never leaks — see the visibility
 * pre-filter at retrieval time.
 */
export async function buildUserProfile(uid: string): Promise<UserProfile> {
  const [vectors, summaries] = await Promise.all([
    getVectorStore().listByAuthor(uid, 'insight'),
    readOwnSummaries(uid),
  ]);
  const centroids = kmeans(
    vectors.map((v) => v.vector),
    PROFILE_CENTROIDS
  );
  const profile: UserProfile = { uid, centroids, summaries, updatedAt: new Date() };

  // Firestore can't store arrays-of-arrays, so centroids are wrapped as maps.
  await profileRef(uid).set({
    centroids: centroids.map((v) => ({ v })),
    summaries,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return profile;
}

/** Return a fresh profile, rebuilding it if missing or stale. */
export async function getOrBuildProfile(uid: string): Promise<UserProfile> {
  const snap = await profileRef(uid).get();
  if (snap.exists) {
    const data = snap.data() ?? {};
    const updatedAt = data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date(0);
    if (Date.now() - updatedAt.getTime() < PROFILE_STALE_MS) {
      const centroids = ((data.centroids ?? []) as { v: number[] }[]).map((c) => c.v);
      return { uid, centroids, summaries: (data.summaries ?? []) as string[], updatedAt };
    }
  }
  return buildUserProfile(uid);
}

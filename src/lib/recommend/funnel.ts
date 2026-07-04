import { chatJSON, rerankModel } from '@/lib/ai/openai';
import type { RecommendationItem } from '@/lib/db/types';
import { getOrBuildProfile } from './profile';
import { buildRerankMessages, parseRerankScores, type RerankCandidate } from './rerank';
import { buildSelectMessages, parseSelection, type SelectCandidate } from './select';
import { getEngagedAuthorIds } from './signals';
import { getVectorStore } from './vectorStore';
import type { NearestHit, VectorChannel } from './vectorStore/types';

// Funnel widths — the whole funnel narrows as it gets more expensive.
const ANN_PER_CENTROID = 60;
const ANN_CANDIDATES = 200;
const RERANK_KEEP = 30;
const SELECT_INPUT = 12;
const LLM_FINAL = 8;

/** Light additive boost for cards whose author the reader has resonated with. */
const RESONANCE_AUTHOR_BOOST = 0.15;
/**
 * Fraction of ANN reach spent on the `situation` channel (same lived
 * experience, possibly *different* insight) — the 共振-vs-同溫層 dial. Kept at 0
 * for v1 (pure insight matching); raising it introduces productive contrast.
 */
const SAME_SITUATION_BLEND = 0;

interface Candidate {
  cardId: string;
  channel: VectorChannel;
  /** Best (smallest) ANN distance seen across centroids. */
  distance: number;
  coreInsight: string;
  situation: string;
  authorId: string;
}

/** Gather ANN hits across every profile centroid for one channel, deduped by card. */
async function annForChannel(
  centroids: number[][],
  channel: VectorChannel,
  uid: string,
  into: Map<string, Candidate>
): Promise<void> {
  const store = getVectorStore();
  const perCentroid: NearestHit[][] = await Promise.all(
    centroids.map((vector) =>
      store.nearest({
        channel,
        vector,
        filter: { visibility: 'public', excludeAuthorId: uid },
        limit: ANN_PER_CENTROID,
      })
    )
  );
  for (const hits of perCentroid) {
    for (const { record, distance } of hits) {
      const existing = into.get(record.cardId);
      if (!existing || distance < existing.distance) {
        into.set(record.cardId, {
          cardId: record.cardId,
          channel,
          distance,
          coreInsight: record.coreInsight,
          situation: record.situation,
          authorId: record.authorId,
        });
      }
    }
  }
}

/**
 * The read-time funnel: ANN (cheap, vector-only) → batch LLM rerank (one cheap
 * call) → strong-model select + reason (a handful of finalists). Returns a
 * ranked feed of {@link RecommendationItem}. Returns `[]` when the user has no
 * profile yet (no indexed cards of their own to match from).
 */
export async function recommendFeed(uid: string): Promise<RecommendationItem[]> {
  const profile = await getOrBuildProfile(uid);
  if (profile.centroids.length === 0) return [];

  // 1. ANN retrieve.
  const dedup = new Map<string, Candidate>();
  await annForChannel(profile.centroids, 'insight', uid, dedup);
  if (SAME_SITUATION_BLEND > 0) {
    await annForChannel(profile.centroids, 'situation', uid, dedup);
  }
  const candidates = [...dedup.values()].sort((a, b) => a.distance - b.distance).slice(0, ANN_CANDIDATES);
  if (candidates.length === 0) return [];

  // 2. Cheap batch rerank + the resonance-author quality signal.
  const engagedAuthors = await getEngagedAuthorIds(uid);
  const rerankInput: RerankCandidate[] = candidates.map((c) => ({
    ref: c.cardId,
    coreInsight: c.coreInsight,
    situation: c.situation,
  }));
  const rerankRaw = await chatJSON(buildRerankMessages(profile.summaries, rerankInput), {
    model: rerankModel(),
  });
  const scores = parseRerankScores(rerankRaw);

  const reranked = candidates
    .map((c) => ({
      candidate: c,
      score: (scores[c.cardId] ?? 0) + (engagedAuthors.has(c.authorId) ? RESONANCE_AUTHOR_BOOST : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, RERANK_KEEP);

  // 3. Strong-model final select + reason — the only expensive call, on finalists.
  const finalists = reranked.slice(0, SELECT_INPUT);
  const selectInput: SelectCandidate[] = finalists.map((r) => ({
    ref: r.candidate.cardId,
    coreInsight: r.candidate.coreInsight,
    situation: r.candidate.situation,
  }));
  const selectRaw = await chatJSON(buildSelectMessages(profile.summaries, selectInput, LLM_FINAL));
  const picks = parseSelection(selectRaw).slice(0, LLM_FINAL);

  const byId = new Map(reranked.map((r) => [r.candidate.cardId, r]));
  const items: RecommendationItem[] = [];
  for (const pick of picks) {
    const r = byId.get(pick.ref);
    if (!r) continue;
    items.push({
      cardId: r.candidate.cardId,
      channel: r.candidate.channel,
      reason: pick.reason,
      score: r.score,
    });
  }
  return items;
}

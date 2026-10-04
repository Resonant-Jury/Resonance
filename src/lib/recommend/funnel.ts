import { chatJSON, rerankModel } from '@/lib/ai/openai';
import type { RecommendationItem } from '@/lib/db/types';
import { getOrBuildProfile } from './profile';
import { buildRerankMessages, parseRerankScores, type RerankCandidate } from './rerank';
import { buildSelectMessages, parseSelection, type SelectCandidate, type Selection } from './select';
import { getEngagedAuthorIds, namedCardIds } from './signals';
import { getVectorStore } from './vectorStore';
import type { NearestHit, VectorChannel } from './vectorStore/types';

// Funnel widths — the whole funnel narrows as it gets more expensive.
const ANN_PER_CENTROID = 60;
const ANN_CANDIDATES = 200;
const RERANK_KEEP = 30;
const SELECT_INPUT = 12;
const LLM_FINAL = 8;

/**
 * Each LLM step's own limit. Together with the reads they stay inside the
 * recommendation routes' maxDuration, so a slow model fails the build (and
 * is recorded) instead of the function being killed mid-way.
 */
export const RERANK_TIMEOUT_MS = 20_000;
export const SELECT_TIMEOUT_MS = 25_000;
/** An LLM step isn't started with less time than this left before the deadline. */
export const MIN_LLM_WINDOW_MS = 1_500;
/**
 * Caps the rerank's reply. It lists at most RERANK_KEEP refs (~20 tokens
 * each); the rest is headroom for a reasoning model's thinking, which counts
 * against the cap too.
 */
const RERANK_MAX_TOKENS = 4_000;

/** Light additive boost for named cards whose author the reader has resonated with (never an anonymous card). */
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
  /** Best (smallest) COSINE distance seen across centroids. */
  distance: number;
  coreInsight: string;
  situation: string;
  authorId: string;
}

export interface FunnelOptions {
  /** When the whole build must be done (ms since epoch): each LLM step gets what is left, or is skipped. */
  deadline?: number;
  /**
   * When an LLM step fails or runs out of time, answer with the order the
   * earlier stages produced (without reasons) instead of throwing — for a
   * reader who has nothing else to be shown.
   */
  fallback?: boolean;
  /** The clock (tests). */
  now?: () => number;
}

export interface FunnelResult {
  items: RecommendationItem[];
  /** An LLM step was skipped or failed: the picks are in retrieval (or rerank) order and carry no reasons. */
  partial: boolean;
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
 * Run one LLM step inside the time left: null when it was skipped or failed
 * and `fallback` allows going on without it; otherwise its failure is thrown.
 */
async function llmStep<T>(
  opts: FunnelOptions,
  limitMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T | null> {
  const now = opts.now ?? Date.now;
  const window = Math.min(limitMs, (opts.deadline ?? Number.POSITIVE_INFINITY) - now());
  if (window < MIN_LLM_WINDOW_MS) {
    if (opts.fallback) return null;
    throw new Error('recommendations: out of time before an LLM step');
  }
  try {
    return await run(AbortSignal.timeout(window));
  } catch (e) {
    if (!opts.fallback) throw e;
    console.warn('[recommend] LLM step skipped', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * The read-time funnel: ANN (cheap, vector-only) → batch LLM rerank (one cheap
 * call) → strong-model select + reason (a handful of finalists). Returns a
 * ranked feed of {@link RecommendationItem}. Returns `[]` when the user has no
 * profile yet (no indexed cards of their own to match from).
 *
 * Every LLM call carries a timeout. With `fallback`, a step that fails or
 * doesn't fit before `deadline` is skipped and the result is `partial`.
 */
export async function recommendFeed(uid: string, opts: FunnelOptions = {}): Promise<FunnelResult> {
  // The reader's own resonances (a light boost) are read beside the profile
  // and the vector queries; losing them only loses the boost.
  const engagedP = getEngagedAuthorIds(uid).catch((e) => {
    console.warn('[recommend] engaged authors', e);
    return new Set<string>();
  });
  const profile = await getOrBuildProfile(uid);
  if (profile.centroids.length === 0) return { items: [], partial: false };

  // 1. ANN retrieve.
  const dedup = new Map<string, Candidate>();
  await annForChannel(profile.centroids, 'insight', uid, dedup);
  if (SAME_SITUATION_BLEND > 0) {
    await annForChannel(profile.centroids, 'situation', uid, dedup);
  }
  const candidates = [...dedup.values()].sort((a, b) => a.distance - b.distance).slice(0, ANN_CANDIDATES);
  if (candidates.length === 0) return { items: [], partial: false };
  const engagedAuthors = await engagedP;
  // The vector records carry every card's author, an anonymous one's too:
  // only a card under its author's name may be lifted for who wrote it, read
  // as it is now (losing the read only loses the boost).
  const byEngaged = candidates.filter((c) => engagedAuthors.has(c.authorId)).map((c) => c.cardId);
  const named = byEngaged.length
    ? await namedCardIds(byEngaged).catch((e) => {
        console.warn('[recommend] named candidates', e);
        return new Set<string>();
      })
    : new Set<string>();
  const boost = (c: Candidate) => (engagedAuthors.has(c.authorId) && named.has(c.cardId) ? RESONANCE_AUTHOR_BOOST : 0);

  // 2. Cheap batch rerank + the resonance-author quality signal.
  const rerankInput: RerankCandidate[] = candidates.map((c) => ({
    ref: c.cardId,
    coreInsight: c.coreInsight,
    situation: c.situation,
  }));
  const scores = await llmStep(opts, RERANK_TIMEOUT_MS, async (signal) =>
    parseRerankScores(
      await chatJSON(buildRerankMessages(profile.summaries, rerankInput, RERANK_KEEP), {
        model: rerankModel(),
        signal,
        maxTokens: RERANK_MAX_TOKENS,
      }),
    ),
  );

  // Without the rerank, cosine similarity (1 − distance) stands in for its score.
  const reranked = candidates
    .map((c) => ({
      candidate: c,
      score: (scores ? (scores[c.cardId] ?? 0) : 1 - c.distance) + boost(c),
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
  const picks: Selection[] | null = await llmStep(opts, SELECT_TIMEOUT_MS, async (signal) =>
    parseSelection(await chatJSON(buildSelectMessages(profile.summaries, selectInput, LLM_FINAL), { signal })),
  );

  const byId = new Map(reranked.map((r) => [r.candidate.cardId, r]));
  const chosen = picks
    ? picks.slice(0, LLM_FINAL)
    : finalists.slice(0, LLM_FINAL).map((r) => ({ ref: r.candidate.cardId, reason: '' }));
  const items: RecommendationItem[] = [];
  for (const pick of chosen) {
    const r = byId.get(pick.ref);
    if (!r) continue;
    byId.delete(pick.ref); // a ref the model repeated counts once
    items.push({
      cardId: r.candidate.cardId,
      channel: r.candidate.channel,
      reason: pick.reason,
      score: r.score,
    });
  }
  return { items, partial: !scores || !picks };
}

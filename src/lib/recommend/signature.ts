import type { InsightSignature } from '@/lib/db/types';
import type { VectorChannel } from './vectorStore/types';

/**
 * Minimum insight score for a card to enter the recommendation candidate pool.
 * Below this the signature is still stored (so the author's own profile and the
 * card page can use it), but the card is never surfaced to other people — the
 * "is this worth recommending" filter, done for free at extraction time.
 */
export const INSIGHT_INDEX_THRESHOLD = 0.45;

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Clamp an arbitrary value into a 0–1 score, defaulting to 0. */
function clamp01(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Coerce the raw LLM JSON (snake_case, possibly partial) into a well-formed
 * {@link InsightSignature}. Tolerant of missing fields so a sloppy model
 * response never throws — downstream {@link isIndexable} handles the empty case.
 */
export function parseSignature(raw: unknown): InsightSignature {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    coreInsight: str(r.core_insight ?? r.coreInsight),
    intent: str(r.intent),
    situation: str(r.situation),
    lifeDomain: str(r.life_domain ?? r.lifeDomain),
    emotionalRegister: str(r.emotional_register ?? r.emotionalRegister),
    insightScore: clamp01(r.insight_score ?? r.insightScore),
  };
}

/**
 * Whether a signature qualifies for the candidate pool: it must carry a real
 * core insight and clear the score threshold.
 */
export function isIndexable(sig: InsightSignature): boolean {
  return sig.coreInsight.length > 0 && sig.insightScore >= INSIGHT_INDEX_THRESHOLD;
}

/**
 * The per-channel text we actually embed — the distilled signature, NOT the raw
 * story. `insight` captures the transferable realization (+ its life domain for
 * disambiguation); `situation` captures the lived experience it arose from.
 * Returns only channels that have content.
 */
export function signatureToChannelTexts(sig: InsightSignature): { channel: VectorChannel; text: string }[] {
  const out: { channel: VectorChannel; text: string }[] = [];
  if (sig.coreInsight) {
    const domain = sig.lifeDomain ? `（${sig.lifeDomain}）` : '';
    out.push({ channel: 'insight', text: `${sig.coreInsight}${domain}` });
  }
  if (sig.situation) {
    out.push({ channel: 'situation', text: sig.situation });
  }
  return out;
}

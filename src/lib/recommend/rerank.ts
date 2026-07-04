import type { ChatMessage } from '@/lib/ai/openai';

/** A candidate presented to the reranker — identified by a stable `ref`. */
export interface RerankCandidate {
  ref: string;
  coreInsight: string;
  situation: string;
}

/**
 * Build the batch-rerank prompt. The whole point of this stage is cost: the
 * candidate signatures are tiny, so a few dozen fit in ONE cheap-model call
 * that scores fit far better than raw vector distance — without producing long
 * output. Returns a JSON object `{ scores: [{ ref, score }] }`.
 */
export function buildRerankMessages(summaries: string[], candidates: RerankCandidate[]): ChatMessage[] {
  const reader = summaries.length > 0 ? summaries.map((s) => `- ${s}`).join('\n') : '（暫無）';
  const items = candidates
    .map((c) => `[${c.ref}] 體悟：${c.coreInsight}${c.situation ? `；情境：${c.situation}` : ''}`)
    .join('\n');
  return [
    {
      role: 'system',
      content: [
        'You rank story cards by how deeply they would RESONATE with a particular reader.',
        "The reader's own insights/experiences are given. For each candidate, judge whether the reader would feel genuine resonance — a shared realization or a shared kind of experience — not mere topical overlap.",
        'Reply with ONLY a JSON object: {"scores":[{"ref":"<ref>","score":<0..1>}]}. Include every candidate exactly once. Higher score = stronger resonance.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `讀者的體悟與經歷：\n${reader}\n\n候選卡片：\n${items}`,
    },
  ];
}

/**
 * Parse the reranker's reply into a `ref → score` map. Tolerant of either
 * `{scores:[{ref,score}]}` or a bare `{ref:score}` object, and of missing /
 * malformed entries (those simply get no score and fall to the bottom).
 */
export function parseRerankScores(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw == null || typeof raw !== 'object') return out;
  const obj = raw as Record<string, unknown>;

  const scores = obj.scores;
  if (Array.isArray(scores)) {
    for (const entry of scores) {
      if (entry && typeof entry === 'object') {
        const e = entry as Record<string, unknown>;
        const ref = e.ref != null ? String(e.ref) : '';
        const score = Number(e.score);
        if (ref && Number.isFinite(score)) out[ref] = clamp01(score);
      }
    }
    return out;
  }

  // Fallback shape: { "<ref>": <score> }
  for (const [ref, value] of Object.entries(obj)) {
    const score = Number(value);
    if (Number.isFinite(score)) out[ref] = clamp01(score);
  }
  return out;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

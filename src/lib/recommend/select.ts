import type { ChatMessage } from '@/lib/ai/openai';

/** A finalist passed to the strong model for the last, expensive judgment. */
export interface SelectCandidate {
  ref: string;
  coreInsight: string;
  situation: string;
}

export interface Selection {
  ref: string;
  /**「為什麼這篇可能對你有共鳴」— one line, addressed to the reader. */
  reason: string;
}

/**
 * Build the final selection prompt. This is the ONLY place the strong model is
 * used per feed, on a handful of finalists: it makes the final call AND writes
 * the resonance reason in one pass, so the per-recommendation LLM cost is a
 * small fixed amount that doesn't grow with the database.
 */
export function buildSelectMessages(
  summaries: string[],
  candidates: SelectCandidate[],
  keep: number
): ChatMessage[] {
  const reader = summaries.length > 0 ? summaries.map((s) => `- ${s}`).join('\n') : '（暫無）';
  const items = candidates
    .map((c) => `[${c.ref}] 體悟：${c.coreInsight}${c.situation ? `；情境：${c.situation}` : ''}`)
    .join('\n');
  return [
    {
      role: 'system',
      content: [
        `You are curating a small, high-quality set of up to ${keep} story cards that will genuinely resonate with one reader.`,
        "You are given the reader's own insights/experiences and a shortlist of candidates.",
        'Pick the ones that would create real resonance — a shared realization, or the same kind of lived experience seen differently — and drop the rest. Quality over quantity; returning fewer is fine.',
        'For each pick, write a warm, specific one-sentence reason addressed to the reader (繁體中文, ≤30 字) explaining why this might resonate. Do not be generic.',
        'Reply with ONLY JSON: {"picks":[{"ref":"<ref>","reason":"<一句話>"}]}, ordered best first.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `讀者的體悟與經歷：\n${reader}\n\n候選卡片：\n${items}`,
    },
  ];
}

/** Parse the strong model's `{picks:[{ref,reason}]}` reply, preserving order. */
export function parseSelection(raw: unknown): Selection[] {
  if (raw == null || typeof raw !== 'object') return [];
  const picks = (raw as Record<string, unknown>).picks;
  if (!Array.isArray(picks)) return [];
  const out: Selection[] = [];
  for (const entry of picks) {
    if (entry && typeof entry === 'object') {
      const e = entry as Record<string, unknown>;
      const ref = e.ref != null ? String(e.ref) : '';
      const reason = typeof e.reason === 'string' ? e.reason.trim() : '';
      if (ref) out.push({ ref, reason });
    }
  }
  return out;
}

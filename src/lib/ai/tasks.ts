/**
 * High-level AI tasks composed from the low-level OpenAI helpers. Server-only.
 */

import type { InsightSignature } from '@/lib/db/types';
import { parseSignature } from '@/lib/recommend/signature';
import { acceptInsight, draftScript, draftUnits, languageInstruction, MIN_DRAFT_UNITS } from './mirror';
import { chat, chatJSON, generateImage, generateImageStream } from './openai';
import { slugify } from './slugify';
import { parseTagList } from './tags';

/**
 * Translate a story title into an English slug *base* (not yet uniqueness-
 * checked). Falls back to a transliteration-free empty string when the title is
 * blank — the caller substitutes a default.
 */
export async function titleToSlugBase(title: string): Promise<string> {
  const clean = title.trim();
  if (!clean) return '';
  const out = await chat([
    {
      role: 'system',
      content:
        'You turn a story title into a short English URL slug phrase. Reply with ONLY 2 to 5 lowercase English words that capture the core meaning, separated by single spaces. No punctuation, no quotes, no explanation.',
    },
    { role: 'user', content: clean },
  ]);
  return slugify(out);
}

export interface SuggestTagsInput {
  title: string;
  story: string;
  /** Tags already on the card — the model must not repeat them. */
  existingTags: string[];
  /** The author's most-used past tags, most frequent first. */
  historyTags: string[];
}

/**
 * Suggest 2–3 tags for a card. The author's historical tags are passed in so
 * the model reuses their existing vocabulary (「家庭」) instead of inventing a
 * near-synonym (「家族」).
 */
export async function suggestStoryTags(input: SuggestTagsInput): Promise<string[]> {
  const text = `${input.title.trim()}\n\n${input.story.trim()}`.trim().slice(0, MAX_STORY_CHARS);
  if (!text) return [];
  const system = [
    'You suggest tags for a personal storytelling card. Read the card text and reply with ONLY 2 to 3 short tags (each 1–4 words), one per line, in the same language as the card. No numbering, no bullets, no # symbols, no explanations.',
    input.historyTags.length > 0
      ? `The author has tagged past cards with (most frequent first): ${input.historyTags.join(', ')}. When one of these fits, reuse it EXACTLY rather than inventing a near-synonym.`
      : '',
    input.existingTags.length > 0
      ? `The card already has these tags — do not repeat them: ${input.existingTags.join(', ')}.`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
  const out = await chat([
    { role: 'system', content: system },
    { role: 'user', content: text },
  ]);
  return parseTagList(out, 3).filter((tag) => !input.existingTags.includes(tag));
}

export interface ExtractSignatureInput {
  title: string;
  story: string;
}

/**
 * Distill a card into its structured "insight signature" — the one expensive
 * LLM call we run at write-time (each card, once, amortized over its whole
 * life). The recommender embeds the signature's `coreInsight` / `situation`
 * rather than the raw text, so pieces that share a *realization* connect even
 * when their wording is far apart. Also scores how much transferable insight
 * the piece carries, which gates whether it enters the candidate pool.
 */
export async function extractInsightSignature(input: ExtractSignatureInput): Promise<InsightSignature> {
  const text = `${input.title.trim()}\n\n${input.story.trim()}`.trim().slice(0, MAX_STORY_CHARS);
  const raw = await chatJSON<Record<string, unknown>>([
    {
      role: 'system',
      content: [
        'You analyze a personal storytelling card and distill its INSIGHT SIGNATURE.',
        'Reply with ONLY a JSON object with these keys (values in the same language as the card, except insight_score):',
        '- core_insight: the single transferable realization at the heart of the piece (one sentence). Capture the *lesson*, not the events.',
        '- intent: why the author wrote it (e.g. to record a turning point, to comfort others, to vent).',
        '- situation: the lived circumstance the insight arose from (one short phrase).',
        '- life_domain: the coarse life area (e.g. 自我認同 / 職涯, 關係, 健康).',
        '- emotional_register: the emotional colour (e.g. 釋懷中帶著不甘).',
        '- insight_score: a number 0..1 — how much genuine, transferable insight the piece carries (a raw diary entry with no realization is low; a hard-won lesson is high).',
        'Focus on the underlying realization so two very different situations that taught the same thing get similar core_insight wording.',
      ].join('\n'),
    },
    { role: 'user', content: text },
  ]);
  return parseSignature(raw);
}

/** The mirror moment waits this long for the model, then shows nothing (the panel never holds publishing for it). */
export const MIRROR_TIMEOUT_MS = 15_000;
/** One sentence of reply; the rest is headroom for a reasoning model's thinking, which counts against the cap too. */
const MIRROR_MAX_TOKENS = 1_500;

/**
 * The pre-publish mirror moment (POST /api/cards/insight): one sentence in
 * the draft's own language handing back what it seems to say — or null, and
 * the panel shows no line, when the draft is too short to read (no model call
 * then), the model finds nothing to reflect, or its answer isn't a line worth
 * showing (lib/ai/mirror: the wrong language, commentary about the draft).
 * Its own small task rather than the recommender's signature, whose fields
 * and examples serve indexing.
 */
export async function mirrorInsight(input: ExtractSignatureInput, opts: { signal?: AbortSignal } = {}): Promise<string | null> {
  if (draftUnits(input.title, input.story) < MIN_DRAFT_UNITS) return null;
  const script = draftScript(input.title, input.story);
  const text = `${input.title.trim()}\n\n${input.story.trim()}`.trim().slice(0, MAX_STORY_CHARS);
  const deadline = AbortSignal.timeout(MIRROR_TIMEOUT_MS);
  const raw = await chatJSON<Record<string, unknown>>(
    [
      {
        role: 'system',
        content: [
          'You are the quiet mirror of a personal storytelling app. Just before an author publishes a draft, you hand back, in ONE short sentence, the realization at the heart of it — the lesson or feeling it seems to carry, not a summary of its events — as a line the author might have written themselves.',
          'Reply with ONLY a JSON object: {"insight": "<the sentence>"} — or {"insight": null}.',
          languageInstruction(script),
          'Keep it short: at most 25 words, or 40 characters in Chinese or Japanese. No quotation marks around it.',
          'Reply {"insight": null} when the draft is too short, unfinished, a test, placeholder text, a list or a plain account of a day with no realization in it. Only reflect what the author actually wrote; never invent a meaning the draft does not hold — when unsure, null.',
          'Never comment on the draft, the author or yourself, never ask for more, never say what is missing: either the sentence, or null.',
        ].join('\n'),
      },
      { role: 'user', content: text },
    ],
    { signal: opts.signal ? AbortSignal.any([deadline, opts.signal]) : deadline, maxTokens: MIRROR_MAX_TOKENS },
  );
  return acceptInsight(raw?.insight, script);
}

// Illustration / doodle style appended to every generated image. Tuned to the
// app's hand-drawn editorial identity.
const STYLE_SUFFIX =
  "Whimsical hand-drawn editorial illustration, playful abstract characters, thick organic outlines, grainy pastel textures, risograph-inspired color palette, children's book aesthetic, doodle-style linework, dreamy surreal environment, soft chalk and crayon shading, friendly and imaginative storytelling scene.";

// Cap how much of the story we send to the concept model. Input tokens are
// cheap, but the opening of a piece carries its emotional core — sending the
// whole thing wastes tokens for no quality gain.
const MAX_STORY_CHARS = 1200;

/**
 * Distill a story into ONE simple, evocative visual concept (an image / metaphor
 * that captures its feeling), kept deliberately sparse so the image model
 * renders a clean composition with a single subject.
 */
export async function storyToImageConcept(story: string): Promise<string> {
  const excerpt = story.trim().slice(0, MAX_STORY_CHARS);
  return chat([
    {
      role: 'system',
      content:
        'You are an art director for a storytelling app. Read the story excerpt and imagine ONE simple, evocative image that captures its emotional essence through metaphor or imagery — not a literal scene. Reply with a single concise English image description under 30 words. Use at most one main subject and a minimal background. Output only the description, no preamble, no style notes.',
    },
    { role: 'user', content: excerpt },
  ]);
}

/**
 * Generate a story illustration: concept (cheap LLM) → styled prompt → image.
 * Returns raw PNG bytes for the caller to persist.
 */
export async function generateStoryImage(story: string): Promise<Uint8Array> {
  const concept = await storyToImageConcept(story);
  const prompt = `${concept}\n\nStyle: ${STYLE_SUFFIX} Keep the composition simple with a single clear subject and minimal background. No text or lettering.`;
  return generateImage(prompt, { size: '1536x1024', quality: 'low' });
}

/**
 * Streaming variant of {@link generateStoryImage}: same concept → prompt →
 * image pipeline, but in-progress previews are forwarded to `onPartial` (as
 * base64 PNG payloads) so the editor can show the illustration taking shape
 * instead of a blind spinner. Resolves to the final image bytes.
 */
export async function generateStoryImageStream(
  story: string,
  onPartial?: (b64: string, index: number) => void,
): Promise<Uint8Array> {
  const concept = await storyToImageConcept(story);
  const prompt = `${concept}\n\nStyle: ${STYLE_SUFFIX} Keep the composition simple with a single clear subject and minimal background. No text or lettering.`;
  return generateImageStream(prompt, { size: '1536x1024', quality: 'low', partialImages: 2 }, onPartial);
}

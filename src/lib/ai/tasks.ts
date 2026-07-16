/**
 * High-level AI tasks composed from the low-level OpenAI helpers. Server-only.
 */

import type { InsightSignature } from '@/lib/db/types';
import { parseSignature } from '@/lib/recommend/signature';
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

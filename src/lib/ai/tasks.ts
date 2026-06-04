/**
 * High-level AI tasks composed from the low-level OpenAI helpers. Server-only.
 */

import { chat, generateImage } from './openai';
import { slugify } from './slugify';

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

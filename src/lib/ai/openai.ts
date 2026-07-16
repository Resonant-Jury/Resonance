/**
 * Low-level OpenAI REST helpers. Server-only (uses OPENAI_API_KEY). We call the
 * REST endpoints with `fetch` directly so the app pulls in no extra SDK weight.
 */

const API_BASE = 'https://api.openai.com/v1';

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  return key;
}

export function llmModel(): string {
  return process.env.OPENAI_LLM_MODEL ?? 'gpt-5.4-mini-2026-03-17';
}

export function imageModel(): string {
  return process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2';
}

export function embedModel(): string {
  return process.env.OPENAI_EMBED_MODEL ?? 'text-embedding-3-small';
}

/** Cheap model used for the recommendation funnel's batch rerank stage. */
export function rerankModel(): string {
  return process.env.OPENAI_RERANK_MODEL ?? 'gpt-5.4-mini-2026-03-17';
}

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

/** Single-turn chat completion; returns the assistant's trimmed text. */
export async function chat(messages: ChatMessage[]): Promise<string> {
  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: llmModel(), messages }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI chat failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return String(data.choices?.[0]?.message?.content ?? '').trim();
}

/**
 * Single-turn completion constrained to a JSON object. Returns the parsed
 * object (or throws if the model emits non-JSON). Used by structured tasks like
 * insight-signature extraction and the funnel's batch rerank.
 */
export async function chatJSON<T = unknown>(
  messages: ChatMessage[],
  opts: { model?: string } = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model ?? llmModel(),
      messages,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI chat failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = String(data.choices?.[0]?.message?.content ?? '').trim();
  return JSON.parse(content) as T;
}

/**
 * Embed one or more texts. Returns **unit-normalized** vectors so the vector
 * store can use DOT_PRODUCT distance (mathematically equivalent to cosine but
 * faster, per the Firestore guidance). Server-only.
 */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await fetch(`${API_BASE}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: embedModel(), input: texts }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI embeddings failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { data?: { embedding?: number[] }[] };
  const rows = data.data ?? [];
  return rows.map((row) => normalizeVector(row.embedding ?? []));
}

/** L2-normalize a vector; a zero vector is returned unchanged. */
function normalizeVector(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum);
  if (norm === 0) return v;
  return v.map((x) => x / norm);
}

export interface ImageStreamOptions {
  size?: string;
  quality?: 'low' | 'medium' | 'high' | 'auto';
  /** How many in-progress previews to emit (0–3). */
  partialImages?: number;
}

/**
 * Generate one image with streaming: the API emits 1–3 in-progress previews
 * (`image_generation.partial_image` SSE events) before the final image. Each
 * partial's base64 payload is handed to `onPartial` as-is (the browser can use
 * it directly in a data URL — no decode/re-encode round trip); the resolved
 * value is the final image's raw bytes, same contract as {@link generateImage}.
 */
export async function generateImageStream(
  prompt: string,
  opts: ImageStreamOptions = {},
  onPartial?: (b64: string, index: number) => void,
): Promise<Uint8Array> {
  const res = await fetch(`${API_BASE}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: imageModel(),
      prompt,
      size: opts.size ?? '1536x1024',
      quality: opts.quality ?? 'low',
      stream: true,
      partial_images: opts.partialImages ?? 2,
    }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`OpenAI image failed: ${res.status} ${await res.text()}`);
  }

  // Minimal SSE parse: events are separated by a blank line; the JSON payload
  // lives on `data:` lines and carries its own `type` discriminator.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalB64: string | undefined;

  const handleEvent = (raw: string) => {
    const data = raw
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('');
    if (!data || data === '[DONE]') return;
    const event = JSON.parse(data) as {
      type?: string;
      b64_json?: string;
      partial_image_index?: number;
    };
    if (event.type === 'image_generation.partial_image' && event.b64_json) {
      onPartial?.(event.b64_json, event.partial_image_index ?? 0);
    } else if (event.type === 'image_generation.completed' && event.b64_json) {
      finalB64 = event.b64_json;
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      handleEvent(raw);
    }
  }
  if (buffer.trim()) handleEvent(buffer);

  if (!finalB64) throw new Error('OpenAI image stream ended without a final image');
  return new Uint8Array(Buffer.from(finalB64, 'base64'));
}

/**
 * Generate one image from a prompt. Returns the raw PNG bytes (decoded from the
 * API's base64 payload) so the caller can stream it straight to storage.
 */
export async function generateImage(
  prompt: string,
  opts: { size?: string; quality?: 'low' | 'medium' | 'high' | 'auto' } = {},
): Promise<Uint8Array> {
  const res = await fetch(`${API_BASE}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: imageModel(),
      prompt,
      size: opts.size ?? '1536x1024',
      quality: opts.quality ?? 'low',
      n: 1,
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI image failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI image returned no data');
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

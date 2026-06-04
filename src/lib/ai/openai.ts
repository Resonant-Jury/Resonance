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

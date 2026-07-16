import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getStorageProvider } from '@/lib/storage';
import { generateStoryImageStream } from '@/lib/ai/tasks';
import { convertToAvif } from '@/lib/storage/image';

export const runtime = 'nodejs';
// Image generation can take up to ~2 minutes for complex prompts.
export const maxDuration = 120;

/** One line of the NDJSON progress stream this route responds with. */
export type GenerateImageEvent =
  | { type: 'partial'; index: number; b64: string }
  | { type: 'done'; publicUrl: string; key: string }
  | { type: 'error' };

/**
 * Generate an illustration from the story body and store it in R2, mirroring the
 * manual-upload flow (`/api/upload`) so the editor can treat both the same way.
 * The browser sends the in-progress story text; we distill it into a visual
 * concept, render it in the app's doodle style, then return the public URL.
 *
 * The response is an NDJSON *stream*: the model's in-progress previews are
 * forwarded as `partial` events (base64 PNG, ready for a data URL) while the
 * final image is still rendering, then a single `done` event carries the stored
 * URL. Errors after the headers are sent surface as an `error` event — the
 * status is already 200 by then, so the client must key off the event type.
 */
export async function POST(req: Request) {
  const user = await requireUser();

  const body = (await req.json().catch(() => null)) as { story?: unknown } | null;
  const story = typeof body?.story === 'string' ? body.story : '';
  if (story.trim().length === 0) {
    return NextResponse.json({ error: 'Story is empty' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: GenerateImageEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const bytes = await generateStoryImageStream(story, (b64, index) => {
          send({ type: 'partial', index, b64 });
        });
        const avifBuffer = await convertToAvif(bytes);
        const stored = await getStorageProvider().uploadObject(
          {
            filename: 'generated.avif',
            contentType: 'image/avif',
            size: avifBuffer.byteLength,
            ownerId: user.id,
            kind: 'image',
          },
          avifBuffer,
        );
        send({ type: 'done', publicUrl: stored.publicUrl, key: stored.key });
      } catch (err) {
        console.error('Image generation failed:', err);
        send({ type: 'error' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}

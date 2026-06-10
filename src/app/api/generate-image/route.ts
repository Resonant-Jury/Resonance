import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getStorageProvider } from '@/lib/storage';
import { generateStoryImage } from '@/lib/ai/tasks';
import { convertToAvif } from '@/lib/storage/image';

export const runtime = 'nodejs';
// Image generation can take up to ~2 minutes for complex prompts.
export const maxDuration = 120;

/**
 * Generate an illustration from the story body and store it in R2, mirroring the
 * manual-upload flow (`/api/upload`) so the editor can treat both the same way.
 * The browser sends the in-progress story text; we distill it into a visual
 * concept, render it in the app's doodle style, then return the public URL.
 */
export async function POST(req: Request) {
  const user = await requireUser();

  const body = (await req.json().catch(() => null)) as { story?: unknown } | null;
  const story = typeof body?.story === 'string' ? body.story : '';
  if (story.trim().length === 0) {
    return NextResponse.json({ error: 'Story is empty' }, { status: 400 });
  }

  let bytes: Uint8Array;
  try {
    bytes = await generateStoryImage(story);
  } catch (err) {
    console.error('Image generation failed:', err);
    return NextResponse.json({ error: 'Generation failed' }, { status: 502 });
  }

  let avifBuffer: Buffer;
  try {
    avifBuffer = await convertToAvif(bytes);
  } catch (err) {
    console.error('AI generated image compression to AVIF failed:', err);
    return NextResponse.json({ error: 'Failed to compress generated image' }, { status: 500 });
  }

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

  return NextResponse.json({ publicUrl: stored.publicUrl, key: stored.key });
}

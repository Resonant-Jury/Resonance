import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getStorageProvider } from '@/lib/storage';
import type { StorageObjectKind } from '@/lib/storage/types';

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const ALLOWED_IMAGES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function POST(req: Request) {
  const user = await requireUser();
  const body = (await req.json().catch(() => null)) as {
    filename?: string;
    contentType?: string;
    size?: number;
    kind?: StorageObjectKind;
  } | null;

  if (!body?.filename || !body.contentType || !body.size) {
    return NextResponse.json({ error: 'Missing upload fields' }, { status: 400 });
  }

  const kind = body.kind ?? 'image';
  if (kind !== 'image') {
    return NextResponse.json({ error: 'Only images are enabled in this phase' }, { status: 400 });
  }

  if (!ALLOWED_IMAGES.has(body.contentType)) {
    return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 });
  }

  if (body.size > MAX_IMAGE_SIZE) {
    return NextResponse.json({ error: 'Image is too large' }, { status: 400 });
  }

  const upload = await getStorageProvider().createPresignedUpload({
    filename: body.filename,
    contentType: body.contentType,
    size: body.size,
    ownerId: user.id,
    kind,
  });

  return NextResponse.json(upload);
}

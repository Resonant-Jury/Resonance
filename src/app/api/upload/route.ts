import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getStorageProvider } from '@/lib/storage';

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const ALLOWED_IMAGES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * Server-side upload proxy. The browser POSTs the file here (multipart/form-data)
 * and we stream it to R2 from the server, so the client never has to open a TLS
 * connection to *.r2.cloudflarestorage.com — which fails for some production
 * networks (ERR_SSL_VERSION_OR_CIPHER_MISMATCH). Returns the public URL.
 */
export async function POST(req: Request) {
  const user = await requireUser();

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }

  if (!ALLOWED_IMAGES.has(file.type)) {
    return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 });
  }

  if (file.size > MAX_IMAGE_SIZE) {
    return NextResponse.json({ error: 'Image is too large' }, { status: 400 });
  }

  const body = new Uint8Array(await file.arrayBuffer());
  const stored = await getStorageProvider().uploadObject(
    {
      filename: file.name,
      contentType: file.type,
      size: file.size,
      ownerId: user.id,
      kind: 'image',
    },
    body
  );

  return NextResponse.json({ publicUrl: stored.publicUrl, key: stored.key });
}

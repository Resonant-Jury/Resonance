import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getStorageProvider } from '@/lib/storage';
import { storeOwned } from '@/lib/storage/uploads';
import { normalizeUpload, UnsupportedImage, type UploadPurpose } from '@/lib/storage/image';
import { UPLOAD_MAX_BYTES, UPLOAD_MAX_FILE_BYTES } from '@/lib/images/limits';
import { limited } from '@/lib/api/rateLimit';
import { getAdminDb } from '@/lib/db/firestore/admin';

export const runtime = 'nodejs';

const tooLarge = () => NextResponse.json({ error: 'Image is too large' }, { status: 413 });

/**
 * Server-side upload proxy. The browser (and the apps) POST the file here as
 * multipart/form-data — `file`, and `purpose=avatar` for a profile photo —
 * and we store it in R2 from the server, so the client never has to open a
 * TLS connection to *.r2.cloudflarestorage.com — which fails for some
 * production networks (ERR_SSL_VERSION_OR_CIPHER_MISMATCH). Returns the
 * public URL.
 *
 * Nothing the client says about the file is trusted: the bytes are decoded
 * and re-encoded (normalizeUpload: upright, scaled to fit — a profile photo
 * to 256 px — metadata such as GPS stripped, WebP), and the stored object's
 * type and extension are the encoder's. Clients still compress first
 * (src/lib/images/compress.ts), which keeps the request small.
 */
export async function POST(req: Request) {
  const user = await requireUser();

  // Refused before the body is read; a body sent without a length is checked once parsed.
  if (Number(req.headers.get('content-length') ?? 0) > UPLOAD_MAX_BYTES) return tooLarge();

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }
  if (file.size > UPLOAD_MAX_FILE_BYTES) return tooLarge();
  const purpose: UploadPurpose = form?.get('purpose') === 'avatar' ? 'avatar' : 'image';

  const db = getAdminDb();
  const refused = (await limited(db, user.id, 'upload')) ?? (await limited(db, user.id, 'uploadBytes', file.size));
  if (refused) return refused;

  let image;
  try {
    image = await normalizeUpload(new Uint8Array(await file.arrayBuffer()), purpose);
  } catch (e) {
    if (e instanceof UnsupportedImage) return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 });
    throw e;
  }

  // The key names no one (an anonymous card's cover is public); whose it is goes on record.
  const stored = await storeOwned(
    db,
    getStorageProvider(),
    {
      filename: `upload.${image.extension}`,
      contentType: image.contentType,
      size: image.data.byteLength,
      ownerId: user.id,
      kind: 'image',
    },
    image.data,
  );

  return NextResponse.json({ publicUrl: stored.publicUrl, key: stored.key });
}

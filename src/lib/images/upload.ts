import { compressImage } from './compress';
import { UPLOAD_MAX_FILE_BYTES } from './limits';

/**
 * A profile photo is stored at 256 px (filled into a square); sending a
 * 1024 px long side keeps that square sharp even from a wide picture.
 */
const AVATAR_SEND_EDGE = 1024;

/** The picture is too big to send, even compressed (an animated GIF, say). */
export class UploadTooLarge extends Error {
  constructor() {
    super('Image is too large');
    this.name = 'UploadTooLarge';
  }
}

/**
 * Shared client upload path for user images: compress in the browser, then
 * send to our own API route, which re-encodes the picture and stores it in R2
 * (the browser never contacts the storage host directly). `purpose: 'avatar'`
 * marks a profile photo, which the server scales to 256 px. Throws
 * UploadTooLarge before sending what the route would refuse (413), and on a
 * non-OK response.
 */
export async function uploadImageFile(
  file: File,
  opts: { purpose?: 'avatar' } = {},
): Promise<{ publicUrl: string; key: string }> {
  const compressed = await compressImage(file, opts.purpose === 'avatar' ? AVATAR_SEND_EDGE : undefined);
  if (compressed.size > UPLOAD_MAX_FILE_BYTES) throw new UploadTooLarge();
  const form = new FormData();
  form.append('file', compressed);
  if (opts.purpose) form.append('purpose', opts.purpose);
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  return (await res.json()) as { publicUrl: string; key: string };
}

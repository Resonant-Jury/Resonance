/**
 * Client-side image compression: downscale + re-encode in the browser before
 * uploading, so a picture of any size reaches /api/upload under its limit and
 * the server (normalizeUpload: JPEG, PNG, WebP or GIF in; an upright WebP of at
 * most 2048 px, no EXIF/GPS, out) only has a small file to finish.
 *
 * Any picture the browser can read is taken — a phone's HEIC (where the
 * browser reads it, as Safari does), AVIF, BMP… — and comes out a format the
 * server takes. Strategy: cap the longest edge at `maxDimension`, encode WebP,
 * stepping the quality (and then the size) down while the file is over
 * `maxBytes`. A browser that can't encode WebP sends JPEG when the picture has
 * no transparency, else PNG. A picture already in a format the server takes,
 * under the limit, that re-encoding wouldn't shrink is sent as it is.
 */

import { UPLOAD_MAX_FILE_BYTES } from './limits';

const MAX_DIMENSION = 2048;
/** WebP qualities tried in turn while the encoded file is over the limit. */
const WEBP_QUALITIES = [0.82, 0.72, 0.6];
const JPEG_QUALITY = 0.85;
/** Past the last quality, the longest edge shrinks by this much per try (a few tries at most). */
const SHRINK = 0.8;
const MIN_DIMENSION = 640;

/** What /api/upload takes (normalizeUpload). */
const SERVER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/** The browser can't read the picture, and the server wouldn't take it as it is (a HEIC in Chrome, say). */
export class UnsupportedImage extends Error {
  constructor() {
    super('Image format not supported');
    this.name = 'UnsupportedImage';
  }
}

/** Scale (w, h) to fit within `max` on the longest edge, never upscaling. */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/** "photo.PNG" → "photo.webp" (keeps names without an extension intact). */
export function replaceExtension(filename: string, ext: string): string {
  const dot = filename.lastIndexOf('.');
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  return `${base}.${ext}`;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Whether any pixel of the drawing is less than opaque (JPEG would lose it). */
function hasTransparency(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  try {
    const { data } = ctx.getImageData(0, 0, w, h);
    for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
    return false;
  } catch {
    return true;
  }
}

/** The picture drawn at `edge` on its longest side, encoded as small as the limit asks. */
async function encode(bitmap: ImageBitmap, edge: number, maxBytes: number): Promise<Blob | null> {
  const { w, h } = fitWithin(bitmap.width, bitmap.height, edge);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, w, h);

  let blob: Blob | null = null;
  for (const quality of WEBP_QUALITIES) {
    blob = await toBlob(canvas, 'image/webp', quality);
    // No WebP encoder here (the blob comes back as PNG, or not at all).
    if (!blob || blob.type !== 'image/webp') {
      blob = null;
      break;
    }
    if (blob.size <= maxBytes) return blob;
  }
  if (blob) return blob;
  return hasTransparency(ctx, w, h) ? toBlob(canvas, 'image/png') : toBlob(canvas, 'image/jpeg', JPEG_QUALITY);
}

/**
 * `maxDimension`: the longest edge to keep (a profile photo needs far less
 * than a cover). `maxBytes`: what the upload may weigh. Throws UnsupportedImage
 * when the browser can't read a picture the server wouldn't take either.
 */
export async function compressImage(file: File, maxDimension = MAX_DIMENSION, maxBytes = UPLOAD_MAX_FILE_BYTES): Promise<File> {
  // GIFs may be animated; canvas would flatten them to one frame (the server
  // turns an animated GIF into an animated WebP).
  if (file.type === 'image/gif') return file;
  const sendable = SERVER_TYPES.has(file.type);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Unreadable here: a format the server takes goes as it is (it decides),
    // anything else can't be used.
    if (sendable) return file;
    throw new UnsupportedImage();
  }

  try {
    let edge = Math.min(maxDimension, Math.max(bitmap.width, bitmap.height));
    let blob = await encode(bitmap, edge, maxBytes);
    // Still too big at the lowest quality: a smaller picture, a few times at most.
    while (blob && blob.size > maxBytes && edge > MIN_DIMENSION) {
      edge = Math.max(MIN_DIMENSION, Math.round(edge * SHRINK));
      blob = await encode(bitmap, edge, maxBytes);
    }
    if (!blob) {
      if (sendable) return file;
      throw new UnsupportedImage();
    }
    const fits = (f: Blob) => f.size <= maxBytes;
    const sameSize = Math.max(bitmap.width, bitmap.height) <= maxDimension;
    // Re-encoding didn't help: the original, when the server takes it as it is.
    if (sendable && sameSize && fits(file) && blob.size >= file.size) return file;

    const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg';
    return new File([blob], replaceExtension(file.name, ext), { type: blob.type });
  } finally {
    bitmap.close();
  }
}

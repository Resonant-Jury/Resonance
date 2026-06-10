/**
 * Client-side image compression: downscale + re-encode in the browser before
 * uploading, so the server only streams bytes to storage instead of paying for
 * a sharp/AVIF encode per upload.
 *
 * Strategy: cap the longest edge at MAX_DIMENSION, then encode to WebP. If the
 * browser can't encode WebP (older Safari), fall back to JPEG only when the
 * source was already JPEG (no alpha to lose); otherwise keep the original
 * file. If recompression doesn't actually shrink the file, keep the original.
 */

const MAX_DIMENSION = 2048;
const WEBP_QUALITY = 0.82;
const JPEG_QUALITY = 0.85;

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

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function compressImage(file: File): Promise<File> {
  // GIFs may be animated; canvas would flatten them to one frame.
  if (file.type === 'image/gif') return file;

  try {
    const bitmap = await createImageBitmap(file);
    const { w, h } = fitWithin(bitmap.width, bitmap.height, MAX_DIMENSION);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    let blob = await toBlob(canvas, 'image/webp', WEBP_QUALITY);
    if (!blob || blob.type !== 'image/webp') {
      // WebP encoding unsupported. JPEG drops transparency, so only fall back
      // when the source was JPEG already.
      if (file.type !== 'image/jpeg') return file;
      blob = await toBlob(canvas, 'image/jpeg', JPEG_QUALITY);
      if (!blob) return file;
    }

    if (blob.size >= file.size) return file;

    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], replaceExtension(file.name, ext), { type: blob.type });
  } catch {
    // Decoding failed (corrupt file, unsupported format) — let the server
    // decide what to do with the original bytes.
    return file;
  }
}

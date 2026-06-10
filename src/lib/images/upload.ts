import { compressImage } from './compress';

/**
 * Shared client upload path for user images: compress in the browser, then
 * send to our own API route, which streams the bytes to R2 (the browser never
 * contacts the storage host directly). Throws on a non-OK response.
 */
export async function uploadImageFile(file: File): Promise<{ publicUrl: string; key: string }> {
  const compressed = await compressImage(file);
  const form = new FormData();
  form.append('file', compressed);
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  return (await res.json()) as { publicUrl: string; key: string };
}

'use client';

import { dominantHue, nearestCardHue } from '@/lib/design/dominantHue';

/** Downscale target — enough pixels for a stable vote, cheap to scan. */
const SAMPLE = 32;

/**
 * Extract a card `accentHue` from a cover image: dominant OKLCH hue snapped to
 * the nearest designed card hue family (see lib/design/dominantHue).
 *
 * Accepts the local File right after upload (no network / CORS involved) or a
 * URL (e.g. the AI-generated illustration on R2 — served with CORS for our
 * origins). Returns null when the image is effectively achromatic or can't be
 * read; callers treat null as "keep the default position-based colour".
 */
export async function extractAccentHue(source: File | Blob | string): Promise<number | null> {
  try {
    const bitmap = await loadBitmap(source);
    if (!bitmap) return null;
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE;
    canvas.height = SAMPLE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, SAMPLE, SAMPLE);
    if ('close' in bitmap) bitmap.close();
    const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);
    const hue = dominantHue(data);
    return hue == null ? null : nearestCardHue(hue);
  } catch {
    return null;
  }
}

async function loadBitmap(source: File | Blob | string): Promise<ImageBitmap | HTMLImageElement | null> {
  if (typeof source !== 'string') {
    return createImageBitmap(source);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = source;
  });
}

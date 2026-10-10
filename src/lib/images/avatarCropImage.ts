'use client';

import { cropOutputSide, cropSourceSize, type CropRect } from './avatarCrop';

/** A picture ready to frame: decoded upright (EXIF applied), first frame only, ≤ 2048 on its long side. */
export interface CropSource {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

/** The picture can't be decoded (not an image, or one the browser can't read). */
export class CropOpenError extends Error {
  constructor() {
    super('Could not open this picture');
    this.name = 'CropOpenError';
  }
}

/**
 * Decodes a chosen or dropped file for the crop modal. createImageBitmap
 * applies the EXIF orientation and takes an animated GIF's first frame; the
 * result is drawn once, scaled down, onto a canvas the modal shows and crops.
 */
export async function loadCropSource(file: Blob): Promise<CropSource> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new CropOpenError();
  }
  try {
    const { width, height } = cropSourceSize(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new CropOpenError();
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    return { canvas, width, height };
  } finally {
    bitmap.close();
  }
}

/** Lets a source go (its pixels can be large). */
export function releaseCropSource(source: CropSource): void {
  source.canvas.width = 0;
  source.canvas.height = 0;
}

/**
 * The framed square as a JPEG (quality 0.9), 256…512 px, drawn on the page's
 * cream first so a transparent picture never turns black.
 */
export async function renderCrop(source: CropSource, rect: CropRect): Promise<Blob> {
  const out = cropOutputSide(rect.side);
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas');
  const cream = getComputedStyle(document.documentElement).getPropertyValue('--color-cream').trim();
  ctx.fillStyle = '#f7f1e6';
  // An oklch() the canvas can't read leaves the fallback in place.
  if (cream) ctx.fillStyle = cream;
  ctx.fillRect(0, 0, out, out);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source.canvas, rect.x, rect.y, rect.side, rect.side, 0, 0, out, out);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode'))), 'image/jpeg', 0.9),
  );
}

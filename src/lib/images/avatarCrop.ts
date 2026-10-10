/**
 * The profile photo's framing (round 5, B7): the picture under the avatar's
 * mask, a circle-ish shape of diameter D in the middle of the crop stage.
 * Pure maths, the same on the web and in both apps (design-b.md §B7).
 *
 * The picture (iw × ih, already upright) is drawn at scale s = sMin × z,
 * where sMin = D / min(iw, ih) makes the short side exactly cover the mask,
 * so the mask is always covered whatever the zoom z ∈ [1, 4]. Its centre sits
 * (ox, oy) stage px from the mask's centre, never so far that the mask shows
 * past the picture's edge. What the mask covers becomes the avatar.
 */

export const CROP_ZOOM_MIN = 1;
export const CROP_ZOOM_MAX = 4;
/** The slider's step. */
export const CROP_ZOOM_STEP = 0.01;
/** A wheel / trackpad notch: z' = z × exp(−deltaY × WHEEL_ZOOM). */
export const WHEEL_ZOOM = 0.002;
/** Keyboard: an arrow moves the picture this far (Shift: KEY_PAN_FAST); + / − zoom by KEY_ZOOM. */
export const KEY_PAN = 8;
export const KEY_PAN_FAST = 32;
export const KEY_ZOOM = 1.1;
/** The stage's side at most, and the mask's inset from it (24 of dimmed picture all round). */
export const CROP_STAGE_MAX = 320;
export const CROP_MASK_INSET = 24;
/** The longest side a picture is decoded to (larger ones are scaled down at load). */
export const CROP_SOURCE_MAX = 2048;
/** The avatar sent: a square this many px at most / at least (the server stores 256). */
export const CROP_OUT_MAX = 512;
export const CROP_OUT_MIN = 256;

export interface CropImage {
  width: number;
  height: number;
}

export interface CropView {
  z: number;
  /** The picture's centre from the mask's centre, in stage px. */
  ox: number;
  oy: number;
}

/** In image pixels: the square the mask covers. */
export interface CropRect {
  x: number;
  y: number;
  side: number;
}

/** The start: unzoomed, centred. */
export const CROP_START: CropView = { z: 1, ox: 0, oy: 0 };

/** The picture's scale (stage px per image px) at zoom z under a mask of diameter d. */
export function cropScale(img: CropImage, d: number, z: number): number {
  return (d / Math.min(img.width, img.height)) * z;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The view brought back inside its bounds: zoom in [1, 4], the mask always covered. */
export function clampView(img: CropImage, d: number, view: CropView): CropView {
  const z = clamp(view.z, CROP_ZOOM_MIN, CROP_ZOOM_MAX);
  const s = cropScale(img, d, z);
  const maxX = Math.max(0, (img.width * s - d) / 2);
  const maxY = Math.max(0, (img.height * s - d) / 2);
  return { z, ox: clamp(view.ox, -maxX, maxX), oy: clamp(view.oy, -maxY, maxY) };
}

/** Moved by (dx, dy) stage px (a drag, an arrow key), then clamped. */
export function panView(img: CropImage, d: number, view: CropView, dx: number, dy: number): CropView {
  return clampView(img, d, { ...view, ox: view.ox + dx, oy: view.oy + dy });
}

/**
 * Zoomed to `z` keeping the picture's point under `anchor` where it is —
 * `anchor` in stage px from the mask's centre: the mask's centre itself for
 * the slider and the keys, the fingers' centroid for a pinch, the pointer for
 * a wheel — then clamped.
 */
export function zoomView(
  img: CropImage,
  d: number,
  view: CropView,
  z: number,
  anchor: { x: number; y: number } = { x: 0, y: 0 },
): CropView {
  const zz = clamp(z, CROP_ZOOM_MIN, CROP_ZOOM_MAX);
  const k = zz / view.z;
  return clampView(img, d, {
    z: zz,
    ox: anchor.x - (anchor.x - view.ox) * k,
    oy: anchor.y - (anchor.y - view.oy) * k,
  });
}

/** The square the mask covers, in image pixels. */
export function cropRect(img: CropImage, d: number, view: CropView): CropRect {
  const s = cropScale(img, d, view.z);
  const side = d / s;
  return {
    x: img.width / 2 - view.ox / s - side / 2,
    y: img.height / 2 - view.oy / s - side / 2,
    side,
  };
}

/** The side of the square sent: the crop's own size, within 256…512. */
export function cropOutputSide(side: number): number {
  return Math.min(CROP_OUT_MAX, Math.max(CROP_OUT_MIN, Math.round(side)));
}

/** A picture's decoded size: its long side at most CROP_SOURCE_MAX, proportions kept. */
export function cropSourceSize(width: number, height: number): CropImage {
  const k = Math.min(1, CROP_SOURCE_MAX / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/** The stage's side for a content width, and the mask's diameter on it. */
export function cropStage(contentWidth: number): { stage: number; mask: number } {
  const stage = Math.max(0, Math.min(CROP_STAGE_MAX, Math.floor(contentWidth)));
  return { stage, mask: Math.max(0, stage - 2 * CROP_MASK_INSET) };
}

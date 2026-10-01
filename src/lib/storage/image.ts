import sharp from 'sharp';

/**
 * Compresses/converts an image buffer to AVIF format.
 * Defaults to quality 80 for a great balance between quality and file size.
 */
export async function convertToAvif(buffer: Uint8Array | Buffer): Promise<Buffer> {
  return sharp(buffer)
    .avif({ quality: 80 })
    .toBuffer();
}

/** What an uploaded picture is for: a story's or cover's image, or a profile photo. */
export type UploadPurpose = 'image' | 'avatar';

/**
 * The most pixels an upload may decode to (all of an animation's frames
 * together): a decompression bomb — a few kilobytes of PNG that unpack to
 * gigabytes — is refused before it is decoded. Clients send at most 2048 px
 * a side, so this is far above anything real.
 */
export const MAX_INPUT_PIXELS = 50_000_000;
/** A story image or cover: at most this many pixels on its long side. */
export const IMAGE_MAX_EDGE = 2048;
/** A profile photo: filled into this square (it is drawn at 30–120 px). */
export const AVATAR_EDGE = 256;

const ACCEPTED = new Set(['jpeg', 'png', 'webp', 'gif']);

/** The bytes are not a picture we take (not decodable, another format, or too many pixels). */
export class UnsupportedImage extends Error {}

export interface NormalizedImage {
  data: Buffer;
  /** What the encoder wrote — never what the client said it sent. */
  contentType: 'image/webp';
  extension: 'webp';
  width: number;
  /** One frame's height, for an animation. */
  height: number;
  animated: boolean;
}

/**
 * Re-encode an uploaded picture so that what is stored is only ever what we
 * wrote: decoded (refusing anything that isn't a JPEG, PNG, WebP or GIF, or
 * decodes to too many pixels), turned upright from its EXIF orientation,
 * scaled down to fit, and written as WebP — with no metadata (EXIF, GPS,
 * camera, ICC) carried over. An animated GIF or WebP stays animated.
 */
export async function normalizeUpload(input: Uint8Array, purpose: UploadPurpose): Promise<NormalizedImage> {
  const open = (animated: boolean) => sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, animated, failOn: 'error' });
  let meta: sharp.Metadata;
  try {
    meta = await open(true).metadata();
  } catch (e) {
    throw new UnsupportedImage(e instanceof Error ? e.message : 'Unreadable image');
  }
  if (!meta.format || !ACCEPTED.has(meta.format)) throw new UnsupportedImage(`Unsupported format: ${meta.format}`);

  const animated = (meta.pages ?? 1) > 1;
  // EXIF orientation is a still photo's; an animation has none to apply.
  let image = animated ? open(true) : open(false).rotate();
  image =
    purpose === 'avatar'
      ? image.resize(AVATAR_EDGE, AVATAR_EDGE, { fit: 'cover', withoutEnlargement: true })
      : image.resize(IMAGE_MAX_EDGE, IMAGE_MAX_EDGE, { fit: 'inside', withoutEnlargement: true });
  try {
    const { data, info } = await image.webp({ quality: animated ? 75 : 82, effort: 4 }).toBuffer({ resolveWithObject: true });
    return {
      data,
      contentType: 'image/webp',
      extension: 'webp',
      width: info.width,
      height: info.pageHeight ?? info.height,
      animated,
    };
  } catch (e) {
    throw new UnsupportedImage(e instanceof Error ? e.message : 'Unreadable image');
  }
}

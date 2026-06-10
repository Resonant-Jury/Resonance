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

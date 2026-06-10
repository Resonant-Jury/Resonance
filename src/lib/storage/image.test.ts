import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { convertToAvif } from './image';

describe('convertToAvif', () => {
  it('should convert a PNG buffer to an AVIF buffer', async () => {
    // Generate a 10x10 red PNG image buffer
    const pngBuffer = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    })
    .png()
    .toBuffer();

    // Convert to AVIF
    const avifBuffer = await convertToAvif(pngBuffer);

    // Verify it is a valid buffer and contains the ftypavif magic bytes
    expect(avifBuffer).toBeInstanceOf(Buffer);
    expect(avifBuffer.length).toBeGreaterThan(0);

    // AVIF container files have 'ftypavif' signature starting at offset 4
    const signature = avifBuffer.toString('ascii', 4, 12);
    expect(signature).toBe('ftypavif');
  });
});

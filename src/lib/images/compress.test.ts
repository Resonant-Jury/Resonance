import { describe, it, expect } from 'vitest';
import { compressImage, fitWithin, replaceExtension } from './compress';

describe('fitWithin', () => {
  it('caps the longest edge and keeps aspect ratio', () => {
    expect(fitWithin(4096, 2048, 2048)).toEqual({ w: 2048, h: 1024 });
    expect(fitWithin(1000, 3000, 2048)).toEqual({ w: 683, h: 2048 });
  });

  it('never upscales small images', () => {
    expect(fitWithin(800, 600, 2048)).toEqual({ w: 800, h: 600 });
  });

  it('never collapses an edge to zero', () => {
    expect(fitWithin(10000, 1, 2048).h).toBe(1);
  });
});

describe('replaceExtension', () => {
  it('swaps the extension', () => {
    expect(replaceExtension('photo.PNG', 'webp')).toBe('photo.webp');
    expect(replaceExtension('a.b.jpeg', 'webp')).toBe('a.b.webp');
  });

  it('appends when there is no extension', () => {
    expect(replaceExtension('photo', 'webp')).toBe('photo.webp');
    expect(replaceExtension('.hidden', 'webp')).toBe('.hidden.webp');
  });
});

describe('compressImage', () => {
  it('passes GIFs through untouched (animation would be flattened)', async () => {
    const gif = new File([new Uint8Array([0x47, 0x49, 0x46])], 'anim.gif', { type: 'image/gif' });
    await expect(compressImage(gif)).resolves.toBe(gif);
  });

  it('returns the original file when decoding fails', async () => {
    const broken = new File([new Uint8Array([0, 1, 2])], 'broken.png', { type: 'image/png' });
    await expect(compressImage(broken)).resolves.toBe(broken);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import type { UploadIntent } from '@/lib/storage';
import { fakeAdminDb } from '../../../../test/fakeAdminDb';

// POST /api/upload with real image bytes: whatever the client sends, what is
// stored is a WebP the server encoded — upright, scaled to fit, with no EXIF
// (GPS included) — typed and named by the encoder, never by the client. An
// animated GIF stays animated; a profile photo is 256 px; a request past
// Vercel's body limit is refused before it is read. The key names no one
// (it is in an anonymous card's public cover URL); whose it is goes on record.

let viewer: { id: string } | null = { id: 'alice' };
vi.mock('@/lib/auth', () => ({ getCurrentUser: async () => viewer }));
const admin = fakeAdminDb({});
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => admin.db }));
const limited = vi.fn(async (..._a: unknown[]) => null as Response | null);
vi.mock('@/lib/api/rateLimit', () => ({ limited: (...a: unknown[]) => limited(...a) }));
const stored: { intent: UploadIntent; body: Uint8Array }[] = [];
vi.mock('@/lib/storage', () => ({
  getStorageProvider: () => ({
    uploadObject: async (intent: UploadIntent, body: Uint8Array) => {
      stored.push({ intent, body });
      return { key: `image/2026-10/k.${intent.filename.split('.').pop()}`, publicUrl: 'https://img.example/k' };
    },
    deleteObject: async () => {},
  }),
}));

const { POST } = await import('./route');

beforeEach(() => {
  viewer = { id: 'alice' };
  stored.length = 0;
  for (const path of Object.keys(admin.docs)) delete admin.docs[path];
  vi.clearAllMocks();
});

function upload(bytes: Uint8Array | Buffer, opts: { name?: string; type?: string; purpose?: string; headers?: Record<string, string> } = {}) {
  const form = new FormData();
  form.append('file', new File([new Uint8Array(bytes)], opts.name ?? 'photo.jpg', { type: opts.type ?? 'image/jpeg' }));
  if (opts.purpose) form.append('purpose', opts.purpose);
  return POST(new Request('http://localhost/api/upload', { method: 'POST', body: form, headers: opts.headers }));
}

const solid = (width: number, height: number, background = '#c44') =>
  sharp({ create: { width, height, channels: 3, background } });

/** Whether EXIF points at a GPS IFD (tag 0x8825, in either byte order). */
const hasGpsIfd = (exif: Buffer) => exif.includes(Buffer.from([0x88, 0x25])) || exif.includes(Buffer.from([0x25, 0x88]));

async function storedImage() {
  expect(stored).toHaveLength(1);
  const { intent, body } = stored[0];
  return { intent, meta: await sharp(body, { animated: true }).metadata() };
}

describe('POST /api/upload', () => {
  it('stores a photo upright as WebP, without its EXIF or GPS, typed and named by the encoder', async () => {
    // 40×20 pixels, EXIF orientation 6 (shown rotated a quarter turn), with a camera and a location.
    const photo = await solid(40, 20)
      .jpeg()
      .withExif({ IFD0: { Make: 'TestCam' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '25/1 2/1 0/1' } })
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const before = await sharp(photo).metadata();
    expect(before.exif?.toString('latin1')).toContain('TestCam');
    expect(hasGpsIfd(before.exif!)).toBe(true);
    expect(before.orientation).toBe(6);

    // The client calls it a PNG named .html: neither reaches storage.
    const res = await upload(photo, { name: 'page.html', type: 'image/png' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ publicUrl: 'https://img.example/k', key: 'image/2026-10/k.webp' });
    expect(admin.docs['uploads/k']).toMatchObject({ ownerId: 'alice', key: 'image/2026-10/k.webp', kind: 'image' });

    const { intent, meta } = await storedImage();
    expect(intent).toMatchObject({ filename: 'upload.webp', contentType: 'image/webp', ownerId: 'alice', kind: 'image' });
    expect(intent.size).toBe(stored[0].body.byteLength);
    expect(meta).toMatchObject({ format: 'webp', width: 20, height: 40 });
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(Buffer.from(stored[0].body).toString('latin1')).not.toContain('TestCam');
  });

  it('turns a PNG into WebP and scales a large one to fit 2048 px', async () => {
    const res = await upload(await solid(3000, 1000).png().toBuffer(), { name: 'shot.png', type: 'image/png' });
    expect(res.status).toBe(200);
    const { meta } = await storedImage();
    expect(meta).toMatchObject({ format: 'webp', width: 2048, height: 683 });
  });

  it('keeps an animated GIF animated, as an animated WebP', async () => {
    const frames = await Promise.all(['#f00', '#0f0', '#00f'].map((c) => solid(60, 40, c).raw().toBuffer()));
    const gif = await sharp(Buffer.concat(frames), { raw: { width: 60, height: 120, channels: 3, pageHeight: 40 } })
      .gif({ delay: [80, 80, 80], loop: 0 })
      .toBuffer();
    const res = await upload(gif, { name: 'loop.gif', type: 'image/gif' });
    expect(res.status).toBe(200);
    const { intent, meta } = await storedImage();
    expect(intent.contentType).toBe('image/webp');
    expect(meta).toMatchObject({ format: 'webp', pages: 3, width: 60, pageHeight: 40, delay: [80, 80, 80], loop: 0 });
  });

  it('fills a profile photo into 256 px', async () => {
    const res = await upload(await solid(1200, 900).jpeg().toBuffer(), { purpose: 'avatar' });
    expect(res.status).toBe(200);
    const { meta } = await storedImage();
    expect(meta).toMatchObject({ format: 'webp', width: 256, height: 256 });
  });

  it('answers 413 to a request past 4 MB before reading it, and to a file past the limit', async () => {
    const res = await POST(
      new Request('http://localhost/api/upload', {
        method: 'POST',
        body: 'never read',
        headers: { 'content-length': String(4 * 1024 * 1024 + 1), 'content-type': 'multipart/form-data; boundary=x' },
      }),
    );
    expect(res.status).toBe(413);

    // Sent without a length (as a stream would be): refused once parsed.
    const big = await upload(new Uint8Array(4 * 1024 * 1024));
    expect(big.status).toBe(413);
    expect(stored).toEqual([]);
    expect(admin.docs).toEqual({});
    expect(limited).not.toHaveBeenCalled();
  });

  it('refuses bytes that are not a picture, another format, or a decompression bomb — storing nothing', async () => {
    const html = new TextEncoder().encode('<!doctype html><script>alert(1)</script>');
    expect((await upload(html, { name: 'x.png', type: 'image/png' })).status).toBe(400);
    const tiff = await solid(10, 10).tiff().toBuffer();
    expect((await upload(tiff, { name: 'x.tiff', type: 'image/tiff' })).status).toBe(400);
    // 80 megapixels of white compress to a few hundred kilobytes of PNG.
    const bomb = await solid(10_000, 8_000, '#fff').png({ compressionLevel: 9 }).toBuffer();
    expect(bomb.byteLength).toBeLessThan(1024 * 1024);
    expect((await upload(bomb, { name: 'x.png', type: 'image/png' })).status).toBe(400);
    expect(stored).toEqual([]);
  });

  it('spends the upload budget, and stores nothing once it is spent', async () => {
    limited.mockResolvedValueOnce(new Response(null, { status: 429 }));
    expect((await upload(await solid(10, 10).jpeg().toBuffer())).status).toBe(429);
    expect(stored).toEqual([]);
  });

  it('answers 401 when nobody is signed in (a client renews its token on a 401, not on a 500)', async () => {
    viewer = null;
    const res = await upload(await solid(10, 10).jpeg().toBuffer());
    expect(res.status).toBe(401);
    expect(stored).toEqual([]);
    expect(limited).not.toHaveBeenCalled();
  });
});

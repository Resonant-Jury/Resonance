import { createHmac } from 'node:crypto';
import zlib from 'node:zlib';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Busy,
  ImageRefused,
  LINK_IMAGE_PATH,
  PROXY_EDGE,
  PROXY_MAX_PIXELS,
  createImageCache,
  createLimiter,
  imageProxyPath,
  mayPass,
  serveLinkImage,
  signImageUrl,
  signingKey,
  sniffImage,
  toPreviewWebp,
  verifyImageSignature,
} from './imageProxy';
import { IMAGE_MAX_BYTES, SafeFetchError, type SafeFetchOptions, type SafeFetchResult } from './safeFetch';
import { LINK_MAX_LENGTH } from './url';

// The picture proxy: who may ask for what (signatures), what it will decode
// (a picture of a kind we take, within limits) and what it sends back (our own
// small WebP, nothing of the stranger's file).

const KEY = Buffer.from('a key for the tests');
const PEM = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----\n';

describe('the signing key', () => {
  it('is LINK_PREVIEW_SECRET when one is set, ahead of the Firebase key', () => {
    expect(signingKey({ LINK_PREVIEW_SECRET: 'shh', FIREBASE_PRIVATE_KEY: PEM }).toString()).toBe('shh');
    expect(signingKey({ LINK_PREVIEW_SECRET: '  shh  ' }).toString()).toBe('shh');
  });

  it('is derived from the Firebase private key otherwise, and is not the key itself', () => {
    const key = signingKey({ FIREBASE_PRIVATE_KEY: PEM });
    expect(key).toHaveLength(32);
    expect(key.equals(signingKey({ FIREBASE_PRIVATE_KEY: PEM }))).toBe(true);
    expect(key.toString()).not.toContain('PRIVATE');
    expect(key.equals(Buffer.from(PEM))).toBe(false);
    // Another account's key signs differently.
    expect(key.equals(signingKey({ FIREBASE_PRIVATE_KEY: PEM.replace('MIIE', 'MIIF') }))).toBe(false);
  });

  it('reads a private key whose new lines are written as \\n (how it sits in an environment variable)', () => {
    expect(signingKey({ FIREBASE_PRIVATE_KEY: PEM.replace(/\n/g, '\\n') }).equals(signingKey({ FIREBASE_PRIVATE_KEY: PEM }))).toBe(true);
  });

  it('ignores a blank setting', () => {
    expect(signingKey({ LINK_PREVIEW_SECRET: '   ', FIREBASE_PRIVATE_KEY: PEM }).equals(signingKey({ FIREBASE_PRIVATE_KEY: PEM }))).toBe(true);
  });

  it('is a fixed development key only where nothing is secret: tests, dev and the emulators', () => {
    const dev = signingKey({});
    expect(dev.length).toBeGreaterThan(16);
    expect(signingKey({ NODE_ENV: 'development' }).equals(dev)).toBe(true);
    expect(signingKey({ NODE_ENV: 'production', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }).equals(dev)).toBe(true);
  });

  it('fails closed in production with no secret at all, rather than sign with a key anyone can read', () => {
    expect(() => signingKey({ NODE_ENV: 'production' })).toThrow(/LINK_PREVIEW_SECRET/);
  });
});

describe('signatures', () => {
  const url = 'https://example.com/cover.jpg';

  it('are base64url HMAC-SHA256 of the URL', () => {
    const signature = signImageUrl(url, KEY);
    expect(signature).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(signature).toBe(createHmac('sha256', KEY).update(url).digest('base64url'));
    expect(signImageUrl(url, KEY)).toBe(signature);
  });

  it('verify for the URL they were made for, and for nothing else', () => {
    const signature = signImageUrl(url, KEY);
    expect(verifyImageSignature(url, signature, KEY)).toBe(true);
    expect(verifyImageSignature('https://example.com/cover.png', signature, KEY)).toBe(false);
    expect(verifyImageSignature('https://example.com/cover.jpg?x=1', signature, KEY)).toBe(false);
    expect(verifyImageSignature('https://evil.example/cover.jpg', signature, KEY)).toBe(false);
    expect(verifyImageSignature(url, signature, Buffer.from('another key'))).toBe(false);
  });

  it('refuse a changed signature, whichever character changed', () => {
    const signature = signImageUrl(url, KEY);
    for (let i = 0; i < signature.length; i++) {
      const flipped = `${signature.slice(0, i)}${signature[i] === 'A' ? 'B' : 'A'}${signature.slice(i + 1)}`;
      expect(verifyImageSignature(url, flipped, KEY), `char ${i}`).toBe(false);
    }
  });

  it('refuse anything that is not shaped like a signature, without throwing', () => {
    for (const bad of ['', 'x', 'a'.repeat(42), 'a'.repeat(44), `${'a'.repeat(42)}=`, `${signImageUrl(url, KEY)} `, '日本語'.repeat(15), '../'.repeat(15), '\u0000'.repeat(43)]) {
      expect(verifyImageSignature(url, bad, KEY), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('the path a preview keeps for its picture', () => {
  it('is a site-relative path with the normalized URL and its signature', () => {
    const path = imageProxyPath('HTTPS://Example.COM/a%20b.png?Q=1')!;
    expect(path.startsWith(`${LINK_IMAGE_PATH}?`)).toBe(true);
    const params = new URL(path, 'https://resonance.channel').searchParams;
    expect(params.get('u')).toBe('https://example.com/a%20b.png?Q=1');
    expect(verifyImageSignature(params.get('u')!, params.get('s')!)).toBe(true);
  });

  it('survives a query string of its own and non-ASCII paths', () => {
    const path = imageProxyPath('https://cdn.example.com/i.php?id=1&size=l&x=中文')!;
    const params = new URL(path, 'https://resonance.channel').searchParams;
    expect(params.get('u')).toBe(new URL('https://cdn.example.com/i.php?id=1&size=l&x=中文').href);
    expect(verifyImageSignature(params.get('u')!, params.get('s')!)).toBe(true);
  });

  it('is nothing for an address that can only be on our own network, and signs an ordinary IP address', () => {
    for (const internal of ['http://127.0.0.1/a.png', 'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.5/a.png', 'http://192.168.1.1/a.png', 'http://2130706433/a.png', 'http://0x7f.1/a.png', 'https://localhost.localhost/a.png', 'https://printer.local/a.png', 'https://db.internal/a.png', 'https://nas.home.arpa/a.png']) {
      expect(imageProxyPath(internal), internal).toBeNull();
    }
    expect(imageProxyPath('http://8.8.8.8/a.png')).not.toBeNull();
    expect(imageProxyPath('https://internal-looking.example.com/a.png')).not.toBeNull();
  });

  it('is nothing for an address the link rules refuse', () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      'file:///etc/passwd',
      'ftp://example.com/a.png',
      'https://user:pw@example.com/a.png',
      'https://example.com@evil.example/a.png',
      'https://example.com:8443/a.png',
      'https://intranet/a.png',
      '//example.com/a.png',
      '/a.png',
      '',
      `https://example.com/${'a'.repeat(LINK_MAX_LENGTH)}`,
    ]) {
      expect(imageProxyPath(bad), bad.slice(0, 40)).toBeNull();
    }
  });
});

describe('recognising a picture by its bytes', () => {
  it('names the formats we take', async () => {
    const base = sharp({ create: { width: 8, height: 8, channels: 3, background: '#c00' } });
    expect(sniffImage(await base.clone().png().toBuffer())).toBe('png');
    expect(sniffImage(await base.clone().jpeg().toBuffer())).toBe('jpeg');
    expect(sniffImage(await base.clone().gif().toBuffer())).toBe('gif');
    expect(sniffImage(await base.clone().webp().toBuffer())).toBe('webp');
    expect(sniffImage(await base.clone().avif().toBuffer())).toBe('avif');
  });

  it('names nothing else: SVG, HTML, PDF, scripts, other picture formats, short and empty input', async () => {
    const text = (s: string) => new TextEncoder().encode(s);
    const tiff = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#c00' } }).tiff().toBuffer();
    for (const bytes of [
      text('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>'),
      text('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>'),
      text('<!doctype html><title>no</title>'),
      text('%PDF-1.7'),
      text('<script>alert(1)</script>'),
      text('GIF'),
      text('RIFF....WAVE'),
      text('\u0089PNG'),
      new Uint8Array([0xff, 0xd8]),
      new Uint8Array(),
      tiff,
    ]) {
      expect(sniffImage(bytes)).toBeNull();
    }
  });
});

/**
 * A PNG that claims `w` × `h` grey pixels, made of zeros: a few kilobytes that
 * would unpack to `w * h` bytes. With `rows` fewer than `h` it holds only that
 * many rows (the header still claims the size, which is all a bomb needs).
 */
function bombPng(w: number, h: number, rows = h): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(w, 0);
  header.writeUInt32BE(h, 4);
  header[8] = 8; // bit depth; grey, no interlace
  const scanlines = Buffer.alloc(rows * (w + 1));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(scanlines, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const solid = (width: number, height: number, background = '#336699') => sharp({ create: { width, height, channels: 3, background } });

describe('the picture we send', () => {
  it('is a WebP no larger than 720 px on its long side, whatever the original', async () => {
    const wide = await toPreviewWebp(await solid(2000, 1000).png().toBuffer());
    expect(sniffImage(wide)).toBe('webp');
    const meta = await sharp(wide).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', PROXY_EDGE, 360]);

    const tall = await sharp(await toPreviewWebp(await solid(500, 3000).jpeg().toBuffer())).metadata();
    expect([tall.width, tall.height]).toEqual([120, PROXY_EDGE]);
  });

  it('never enlarges a small one', async () => {
    const meta = await sharp(await toPreviewWebp(await solid(64, 48).png().toBuffer())).metadata();
    expect([meta.width, meta.height]).toEqual([64, 48]);
  });

  it('stands a photo upright from its EXIF orientation', async () => {
    const photo = await solid(200, 100).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    expect((await sharp(photo).metadata()).orientation).toBe(6);
    const meta = await sharp(await toPreviewWebp(photo)).metadata();
    expect([meta.width, meta.height]).toEqual([100, 200]);
  });

  it('carries no metadata of the original: no EXIF, no profile', async () => {
    const photo = await solid(200, 100).withExif({ IFD0: { Copyright: 'a-name-that-must-not-leak', ImageDescription: 'taken at home' } }).jpeg().toBuffer();
    expect((await sharp(photo).metadata()).exif).toBeDefined();
    const out = await toPreviewWebp(photo);
    const meta = await sharp(out).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(out.toString('latin1')).not.toContain('a-name-that-must-not-leak');
    expect(out.toString('latin1')).not.toContain('taken at home');
  });

  it('is the first frame of an animated GIF or WebP, not an animation', async () => {
    const frames = await Promise.all(['#f00', '#0f0', '#00f'].map((c) => solid(40, 30, c).png().toBuffer()));
    const gif = await sharp(frames, { join: { animated: true } }).gif().toBuffer();
    expect((await sharp(gif, { animated: true }).metadata()).pages).toBe(3);
    const webp = await sharp(frames, { join: { animated: true } }).webp().toBuffer();
    expect((await sharp(webp, { animated: true }).metadata()).pages).toBe(3);

    for (const animation of [gif, webp]) {
      const out = await toPreviewWebp(animation);
      const meta = await sharp(out, { animated: true }).metadata();
      expect(meta.pages ?? 1).toBe(1);
      expect([meta.width, meta.height]).toEqual([40, 30]);
      // The first frame is the red one.
      const { data } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
      expect(data[0]).toBeGreaterThan(200);
      expect(data[1]).toBeLessThan(60);
    }
  });

  it('takes an AVIF', async () => {
    const meta = await sharp(await toPreviewWebp(await solid(64, 64).avif().toBuffer())).metadata();
    expect(meta.format).toBe('webp');
  });

  it('refuses SVG, which a renderer would draw (and could be made to fetch things for)', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><image href="http://169.254.169.254/latest/meta-data/"/><rect width="64" height="64" fill="red"/></svg>';
    await expect(toPreviewWebp(new TextEncoder().encode(svg))).rejects.toBeInstanceOf(ImageRefused);
    await expect(toPreviewWebp(new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>${svg}`))).rejects.toBeInstanceOf(ImageRefused);
  });

  it('refuses what is not a picture, whatever a header claimed: HTML, PDF, text, a TIFF, an empty body', async () => {
    const tiff = await solid(8, 8).tiff().toBuffer();
    for (const bytes of [new TextEncoder().encode('<!doctype html><title>x</title>'), new TextEncoder().encode('%PDF-1.4 ...'), new TextEncoder().encode('just text'), tiff, new Uint8Array()]) {
      await expect(toPreviewWebp(bytes)).rejects.toBeInstanceOf(ImageRefused);
    }
  });

  it('refuses a file that only starts like a picture, and one that was cut off', async () => {
    const png = await solid(300, 200).png().toBuffer();
    await expect(toPreviewWebp(Buffer.concat([png.subarray(0, 8), Buffer.from('not really a png at all, just junk after the magic')]))).rejects.toBeInstanceOf(ImageRefused);
    await expect(toPreviewWebp(png.subarray(0, png.length - 30))).rejects.toBeInstanceOf(ImageRefused);
    const jpeg = await sharp({ create: { width: 600, height: 400, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 128, sigma: 40 } } }).jpeg().toBuffer();
    await expect(toPreviewWebp(jpeg.subarray(0, Math.floor(jpeg.length / 2)))).rejects.toBeInstanceOf(ImageRefused);
  });

  it(`takes a picture of ${PROXY_MAX_PIXELS / 1e6} megapixels or fewer and refuses more`, async () => {
    const meta = await sharp(await toPreviewWebp(bombPng(5000, 5000))).metadata(); // 25 MP of nothing but zeros
    expect([meta.width, meta.height]).toEqual([PROXY_EDGE, PROXY_EDGE]);
    await expect(toPreviewWebp(bombPng(5500, 5500, 4))).rejects.toThrow(/pixel limit/); // 30.25 MP
  });

  it('refuses a picture that would unpack to too many pixels, before decoding it (a pixel bomb)', async () => {
    const bomb = bombPng(8000, 8000); // 64 million pixels in about 60 KB
    expect(bomb.length).toBeLessThan(100 * 1024);
    const before = process.memoryUsage().rss;
    await expect(toPreviewWebp(bomb)).rejects.toThrow(/pixel limit/);
    // Nothing near the 64 MB (let alone the gigabytes of a real one) was ever allocated for it.
    expect(process.memoryUsage().rss - before).toBeLessThan(48 * 1024 * 1024);
    // One claiming nearly a billion pixels, with a few rows to back it up.
    const huge = bombPng(30000, 30000, 4);
    expect(huge.length).toBeLessThan(4096);
    await expect(toPreviewWebp(huge)).rejects.toThrow(/pixel limit/);
  }, 20_000);
});

describe('GET /api/link-image', () => {
  const TARGET = 'https://example.com/cover.png';
  let png: Buffer;
  let fetchImage: ReturnType<typeof vi.fn<(url: string, options: SafeFetchOptions) => Promise<SafeFetchResult>>>;
  let cache: ReturnType<typeof createImageCache>;
  let limiter: ReturnType<typeof createLimiter>;
  let warn: ReturnType<typeof vi.spyOn>;

  const served = (url: string, body: Buffer): SafeFetchResult => ({ url, status: 200, contentType: 'image/png', charset: null, body, truncated: false });

  beforeEach(async () => {
    png = await solid(1600, 900).png().toBuffer();
    fetchImage = vi.fn(async (url: string) => served(url, png));
    cache = createImageCache();
    limiter = createLimiter(3, 16);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  /** The request as `imageProxyPath` spells it, unless `search` says otherwise. */
  const requestFor = (u: string | null, s: string | null, search?: string) => {
    const url = new URL('https://resonance.channel/api/link-image');
    if (search !== undefined) url.search = search;
    else {
      if (u !== null) url.searchParams.set('u', u);
      if (s !== null) url.searchParams.set('s', s);
    }
    return url;
  };
  const serve = (url: URL) => serveLinkImage(url, { fetch: fetchImage, key: KEY, cache, limiter });
  const ask = (u: string | null, s: string | null) => serve(requestFor(u, s));
  const signed = (u: string) => ask(u, signImageUrl(u, KEY));

  async function expectBareNotFound(res: Response) {
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('');
    // No browser, CDN or app keeps a failure: the next view of the preview asks again (backlog 12).
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Content-Type')).toBeNull();
  }

  it('answers a signed URL with our small WebP, cacheable for a long time and unable to be anything else', async () => {
    const res = await signed(TARGET);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/webp');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400, s-maxage=604800, immutable');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Content-Security-Policy')).toBe("default-src 'none'");
    expect(res.headers.get('Set-Cookie')).toBeNull();
    const body = Buffer.from(await res.arrayBuffer());
    expect(res.headers.get('Content-Length')).toBe(String(body.length));
    expect(sniffImage(body)).toBe('webp');
    const meta = await sharp(body).metadata();
    expect([meta.width, meta.height]).toEqual([PROXY_EDGE, 405]);
    // It asked the safe fetcher, for an image, with the 5 MB limit.
    expect(fetchImage).toHaveBeenCalledTimes(1);
    expect(fetchImage).toHaveBeenCalledWith(TARGET, { mode: 'image', maxBytes: IMAGE_MAX_BYTES });
  });

  it('answers the path a preview stores, as it stores it, and as a client library may respell it', async () => {
    const path = imageProxyPath('https://example.com/cover.png?size=l&name=it%27s%20(1)~!*')!;
    // encodeURIComponent leaves these alone; some HTTP libraries escape them, others do not.
    expect(path).toContain('(1)~!*');
    const key = signingKey();
    const stored = await serveLinkImage(new URL(path, 'https://resonance.channel'), { fetch: fetchImage, key, cache, limiter });
    expect(stored.status).toBe(200);
    const respelled = path.replace('(', '%28').replace(')', '%29').replace('~', '%7E').replace('!', '%21').replace('*', '%2A');
    expect(respelled).not.toBe(path);
    const again = await serveLinkImage(new URL(respelled, 'https://resonance.channel'), { fetch: fetchImage, key, cache, limiter });
    expect(again.status).toBe(200);
    expect(fetchImage).toHaveBeenCalledTimes(1);
  });

  it('answers 404, with no word of why, to a request with no signature or no address', async () => {
    await expectBareNotFound(await ask(TARGET, null));
    await expectBareNotFound(await ask(null, signImageUrl(TARGET, KEY)));
    await expectBareNotFound(await ask(null, null));
    await expectBareNotFound(await ask(TARGET, ''));
    expect(fetchImage).not.toHaveBeenCalled();
  });

  it('answers 404 without fetching anything when the signature is not for this address', async () => {
    const signature = signImageUrl(TARGET, KEY);
    await expectBareNotFound(await ask('https://example.com/other.png', signature));
    await expectBareNotFound(await ask('https://evil.example/cover.png', signature));
    await expectBareNotFound(await ask(TARGET, `${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`));
    await expectBareNotFound(await ask(TARGET, signImageUrl(TARGET, Buffer.from('another key'))));
    await expectBareNotFound(await ask(TARGET, 'x'));
    expect(fetchImage).not.toHaveBeenCalled();
  });

  it('is not an open proxy: an address anyone picked, signed or not, is not fetched', async () => {
    for (const target of ['https://example.com/', 'http://169.254.169.254/latest/meta-data/', 'http://localhost/', 'https://internal.example/admin.png']) {
      await expectBareNotFound(await ask(target, 'A'.repeat(43)));
      await expectBareNotFound(await ask(target, signImageUrl(target, Buffer.from('guess'))));
    }
    expect(fetchImage).not.toHaveBeenCalled();
  });

  it('is not fooled by a second address or signature in the same request', async () => {
    const real = signImageUrl(TARGET, KEY);
    const encode = encodeURIComponent;
    await expectBareNotFound(await serve(requestFor(null, null, `?u=${encode('https://evil.example/x.png')}&u=${encode(TARGET)}&s=${real}`)));
    await expectBareNotFound(await serve(requestFor(null, null, `?s=${'A'.repeat(43)}&s=${real}&u=${encode(TARGET)}`)));
    expect(fetchImage).not.toHaveBeenCalled();
  });

  it('does not fetch a signed value that is not a normalized link either (a signer bug is not a way in)', async () => {
    for (const target of [
      'HTTPS://EXAMPLE.COM/a.png',
      'javascript:alert(1)',
      'file:///etc/passwd',
      'https://user:pw@example.com/a.png',
      'https://example.com:8443/a.png',
      'http://2130706433/a.png',
      'https://example.com/a b.png',
      `https://example.com/${'a'.repeat(LINK_MAX_LENGTH)}`,
    ]) {
      await expectBareNotFound(await signed(target));
    }
    expect(fetchImage).not.toHaveBeenCalled();
  });

  it('answers 404 when the fetch is refused or fails, and logs the reason but not the address', async () => {
    const reasons = ['blocked', 'timeout', 'too_large', 'content_type', 'status', 'dns'] as const;
    for (const [i, reason] of reasons.entries()) {
      fetchImage.mockRejectedValueOnce(new SafeFetchError(reason, `why ${reason}`));
      await expectBareNotFound(await signed(`https://example.com/${i}.png`));
    }
    fetchImage.mockRejectedValueOnce(new Error('boom'));
    await expectBareNotFound(await signed('https://example.com/boom.png'));
    expect(warn).toHaveBeenCalledTimes(7);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('example.com');
  });

  it('answers 404 for a body that is not a picture we take, whatever the server called it', async () => {
    const bodies = [
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      Buffer.from('<!doctype html><script>alert(1)</script>'),
      Buffer.from('%PDF-1.5'),
      Buffer.alloc(0),
      bombPng(8000, 8000),
      png.subarray(0, 200),
    ];
    for (const [i, body] of bodies.entries()) {
      const address = `https://example.com/${i}.png`;
      fetchImage.mockResolvedValueOnce(served(address, body));
      await expectBareNotFound(await signed(address));
    }
  });

  it('with the real fetcher, still refuses a signed address on the private network without connecting anywhere', async () => {
    for (const target of ['http://169.254.169.254/latest/meta-data/', 'http://127.0.0.1/a.png', 'http://10.0.0.1/a.png', 'https://localhost.example.localhost/a.png']) {
      const res = await serveLinkImage(requestFor(target, signImageUrl(target, KEY)), { key: KEY, cache, limiter });
      await expectBareNotFound(res);
    }
  });

  describe('asking again', () => {
    it('fetches an address once, however many times and however spelled it is asked for (cache-busting buys nothing)', async () => {
      const signature = signImageUrl(TARGET, KEY);
      const encode = encodeURIComponent;
      const spellings = [
        `?u=${encode(TARGET)}&s=${signature}`,
        `?s=${signature}&u=${encode(TARGET)}`,
        `?u=${encode(TARGET)}&s=${signature}&cachebust=1`,
        `?u=${encode(TARGET)}&s=${signature}&cachebust=2`,
        `?u=${encode(TARGET).replace('%3A', '%3a')}&s=${signature}`,
        `?u=${TARGET.replace(/[a-z]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}&s=${signature}`,
      ];
      for (const search of spellings) {
        const res = await serve(requestFor(null, null, search));
        expect(res.status, search).toBe(200);
        expect(Buffer.from(await res.arrayBuffer()).length).toBeGreaterThan(0);
      }
      expect(fetchImage).toHaveBeenCalledTimes(1);
    });

    it('lets requests that arrive together share one fetch', async () => {
      let release!: () => void;
      fetchImage.mockImplementation(async (url) => {
        await new Promise<void>((resolve) => (release = resolve));
        return served(url, png);
      });
      const all = Promise.all(Array.from({ length: 6 }, () => signed(TARGET)));
      await vi.waitFor(() => expect(fetchImage).toHaveBeenCalledTimes(1));
      release();
      expect((await all).map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
      expect(fetchImage).toHaveBeenCalledTimes(1);
    });

    it('remembers a failure too, so a broken or hostile address is not tried again at every request', async () => {
      fetchImage.mockRejectedValue(new SafeFetchError('timeout'));
      for (let i = 0; i < 4; i++) await expectBareNotFound(await signed(TARGET));
      expect(fetchImage).toHaveBeenCalledTimes(1);
    });

    it('forgets a picture after a while, a refusal sooner, and a failure that may pass within seconds', async () => {
      let now = 1_000_000;
      cache = createImageCache({ pictureMs: 600_000, failureMs: 300_000, retryMs: 15_000, now: () => now });
      const REFUSED = 'https://example.com/page.html';
      const SLOW = 'https://example.com/slow.png';
      await signed(TARGET);
      fetchImage.mockRejectedValueOnce(new SafeFetchError('content_type', 'text/html'));
      await signed(REFUSED);
      fetchImage.mockRejectedValueOnce(new SafeFetchError('timeout'));
      expect((await signed(SLOW)).status).toBe(404);
      expect(fetchImage).toHaveBeenCalledTimes(3);

      now += 14_000; // a thread asking again at once still costs no fetch
      await signed(SLOW);
      expect(fetchImage).toHaveBeenCalledTimes(3);

      now += 2_000; // the passing failure is forgotten: the next view gets the picture
      expect((await signed(SLOW)).status).toBe(200);
      await signed(REFUSED);
      await signed(TARGET);
      expect(fetchImage).toHaveBeenCalledTimes(4);

      now += 285_000; // the refusal has expired, the picture has not
      await signed(TARGET);
      expect(fetchImage).toHaveBeenCalledTimes(4);
      expect((await signed(REFUSED)).status).toBe(200);
      expect(fetchImage).toHaveBeenCalledTimes(5);

      now += 600_000;
      await signed(TARGET);
      expect(fetchImage).toHaveBeenCalledTimes(6);
    });

    it('tells a failure that may pass from a refusal the address would earn again', () => {
      for (const reason of ['timeout', 'network', 'dns', 'status'] as const) expect(mayPass(new SafeFetchError(reason)), reason).toBe(true);
      for (const reason of ['blocked', 'bad_url', 'content_type', 'too_large', 'encoding', 'redirects'] as const) {
        expect(mayPass(new SafeFetchError(reason)), reason).toBe(false);
      }
      expect(mayPass(new ImageRefused('not a picture we take'))).toBe(false);
      expect(mayPass(new Error('boom'))).toBe(true);
    });

    it('keeps no more than it is allowed to, dropping the oldest', async () => {
      cache = createImageCache({ max: 3 });
      for (let i = 0; i < 5; i++) await signed(`https://example.com/${i}.png`);
      expect(cache.size).toBe(3);
      expect(fetchImage).toHaveBeenCalledTimes(5);
      await signed('https://example.com/4.png'); // still held
      expect(fetchImage).toHaveBeenCalledTimes(5);
      await signed('https://example.com/0.png'); // dropped long ago
      expect(fetchImage).toHaveBeenCalledTimes(6);
    });

    it('never remembers a request for what it did not sign', async () => {
      await ask(TARGET, 'A'.repeat(43));
      expect(cache.size).toBe(0);
    });
  });

  describe('how many at once', () => {
    it('answers 503 and invites a retry, remembering nothing, when too many pictures are already being fetched and decoded', async () => {
      limiter = createLimiter(1, 0);
      let release!: () => void;
      fetchImage.mockImplementationOnce(async (url) => {
        await new Promise<void>((resolve) => (release = resolve));
        return served(url, png);
      });
      const first = signed('https://example.com/first.png');
      await vi.waitFor(() => expect(fetchImage).toHaveBeenCalledTimes(1));

      const busy = await signed('https://example.com/second.png');
      expect(busy.status).toBe(503);
      expect(busy.headers.get('Retry-After')).toBe('5');
      expect(busy.headers.get('Cache-Control')).toBe('no-store');
      expect(await busy.text()).toBe('');

      release();
      expect((await first).status).toBe(200);
      // The busy answer was not a verdict on the picture: asked again, it is fetched.
      expect((await signed('https://example.com/second.png')).status).toBe(200);
      expect(fetchImage).toHaveBeenCalledTimes(2);
    });
  });
});

describe('createLimiter', () => {
  const gate = () => {
    let open!: () => void;
    const opened = new Promise<void>((resolve) => (open = resolve));
    return { open, opened };
  };

  it('runs up to its limit at once, queues the next in order, and refuses beyond the queue', async () => {
    const limiter = createLimiter(2, 1);
    const log: string[] = [];
    const a = gate();
    const b = gate();
    const c = gate();
    const job = (name: string, g: ReturnType<typeof gate>) => limiter.run(async () => {
      log.push(`start ${name}`);
      await g.opened;
      log.push(`end ${name}`);
      return name;
    });
    const ra = job('a', a);
    const rb = job('b', b);
    const rc = job('c', c);
    await Promise.resolve();
    expect(log).toEqual(['start a', 'start b']);
    await expect(job('d', gate())).rejects.toBeInstanceOf(Busy);

    a.open();
    expect(await ra).toBe('a');
    await vi.waitFor(() => expect(log).toContain('start c'));
    expect(log.indexOf('start c')).toBeGreaterThan(log.indexOf('end a'));
    b.open();
    c.open();
    expect(await Promise.all([rb, rc])).toEqual(['b', 'c']);
  });

  it('frees its place when a job fails, and goes back to full capacity when everything has finished', async () => {
    const limiter = createLimiter(1, 1);
    await expect(limiter.run(async () => {
      throw new Error('broke');
    })).rejects.toThrow('broke');
    const g = gate();
    const first = limiter.run(() => g.opened);
    const second = limiter.run(async () => 'queued');
    await expect(limiter.run(async () => 'too many')).rejects.toBeInstanceOf(Busy);
    g.open();
    await first;
    expect(await second).toBe('queued');
    // Everything has run: it takes one at a time and queues one again.
    const g2 = gate();
    const again = limiter.run(() => g2.opened);
    const queued = limiter.run(async () => 'ok');
    await expect(limiter.run(async () => 'too many')).rejects.toBeInstanceOf(Busy);
    g2.open();
    await again;
    expect(await queued).toBe('ok');
  });
});

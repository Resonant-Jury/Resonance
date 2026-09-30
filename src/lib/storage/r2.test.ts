import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PutObjectCommand } from '@aws-sdk/client-s3';

const send = vi.fn();
vi.mock('@aws-sdk/client-s3', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@aws-sdk/client-s3')>()),
  S3Client: class {
    send = send;
  },
}));

const { IMMUTABLE, R2StorageProvider } = await import('./r2');

// What /api/upload and /api/generate-image store: both go through uploadObject.

beforeAll(() => {
  vi.stubEnv('R2_ENDPOINT', 'https://r2.example');
  vi.stubEnv('R2_ACCESS_KEY_ID', 'id');
  vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secret');
  vi.stubEnv('R2_BUCKET', 'bucket');
  vi.stubEnv('R2_PUBLIC_BASE', 'https://img.example/');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('R2StorageProvider.uploadObject', () => {
  it('stores each image under a fresh key, cacheable for good', async () => {
    send.mockResolvedValue({});
    const bytes = new Uint8Array([1, 2, 3]);
    const stored = await new R2StorageProvider().uploadObject(
      { filename: 'generated.avif', contentType: 'image/avif', size: 3, ownerId: 'alice', kind: 'image' },
      bytes,
    );

    const input = (send.mock.calls[0][0] as PutObjectCommand).input;
    expect(input).toMatchObject({ Bucket: 'bucket', ContentType: 'image/avif', ContentLength: 3, CacheControl: IMMUTABLE });
    expect(IMMUTABLE).toBe('public, max-age=31536000, immutable');
    expect(input.Key).toMatch(/^image\/alice\/\d{4}-\d{2}\/[0-9a-f-]{36}\.avif$/);
    expect(stored.publicUrl).toBe(`https://img.example/${input.Key}`);
  });
});

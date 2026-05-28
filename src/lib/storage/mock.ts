import type { IStorageProvider } from './interfaces';
import type { PresignedUpload, UploadIntent } from './types';

export class MockStorageProvider implements IStorageProvider {
  async createPresignedUpload(intent: UploadIntent): Promise<PresignedUpload> {
    const key = `mock/${intent.ownerId}/${crypto.randomUUID()}-${intent.filename}`;
    return {
      key,
      uploadUrl: `/api/upload/mock?key=${encodeURIComponent(key)}`,
      publicUrl: `/cover.webp`,
      headers: { 'content-type': intent.contentType },
      expiresAt: new Date(Date.now() + 300_000),
    };
  }

  getPublicUrl(): string {
    return '/cover.webp';
  }

  async deleteObject(): Promise<void> {}
}

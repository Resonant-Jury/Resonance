import type { PresignedUpload, StoredObject, UploadIntent } from './types';

export interface IStorageProvider {
  createPresignedUpload(intent: UploadIntent): Promise<PresignedUpload>;
  /**
   * Server-side upload: the route reads the file bytes and we PUT them to the
   * bucket directly, so the browser never has to reach the storage host. This
   * is the path that sidesteps the production TLS failure browsers hit talking
   * to *.r2.cloudflarestorage.com.
   */
  uploadObject(intent: UploadIntent, body: Uint8Array): Promise<StoredObject>;
  getPublicUrl(key: string): string;
  deleteObject(key: string): Promise<void>;
}

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
  /**
   * An object's bytes, read through the storage API (not its public URL);
   * null when there is no such object. Throws past `maxBytes`.
   */
  getObject(key: string, maxBytes: number): Promise<Uint8Array | null>;
  deleteObject(key: string): Promise<void>;
  /** Copy an object to a new key, its type and caching with it (scripts/backfills/rekeyImages). */
  copyObject(fromKey: string, toKey: string): Promise<void>;
  /** Delete every object under `prefix` (e.g. `image/{uid}/`); returns how many. */
  deletePrefix(prefix: string): Promise<number>;
}

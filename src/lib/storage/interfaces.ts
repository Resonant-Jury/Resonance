import type { PresignedUpload, UploadIntent } from './types';

export interface IStorageProvider {
  createPresignedUpload(intent: UploadIntent): Promise<PresignedUpload>;
  getPublicUrl(key: string): string;
  deleteObject(key: string): Promise<void>;
}

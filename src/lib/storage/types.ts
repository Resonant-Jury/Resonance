export type StorageObjectKind = 'image' | 'video';

export interface StorageObject {
  key: string;
  url: string;
  contentType: string;
  size: number;
  kind: StorageObjectKind;
}

export interface UploadIntent {
  filename: string;
  contentType: string;
  size: number;
  ownerId: string;
  kind: StorageObjectKind;
}

export interface PresignedUpload {
  key: string;
  uploadUrl: string;
  publicUrl: string;
  headers: Record<string, string>;
  expiresAt: Date;
}

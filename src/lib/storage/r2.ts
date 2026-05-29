import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { IStorageProvider } from './interfaces';
import type { PresignedUpload, UploadIntent } from './types';

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for R2 storage`);
  return value;
}

function extension(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  return ext ? `.${ext}` : '';
}

export class R2StorageProvider implements IStorageProvider {
  private client = new S3Client({
    region: 'auto',
    endpoint: env('R2_ENDPOINT'),
    forcePathStyle: true,
    credentials: {
      accessKeyId: env('R2_ACCESS_KEY_ID'),
      secretAccessKey: env('R2_SECRET_ACCESS_KEY'),
    },
  });

  private bucket = env('R2_BUCKET');
  private publicBase = env('R2_PUBLIC_BASE').replace(/\/$/, '');

  async createPresignedUpload(intent: UploadIntent): Promise<PresignedUpload> {
    const now = new Date();
    const key = [
      intent.kind,
      intent.ownerId,
      `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
      `${crypto.randomUUID()}${extension(intent.filename)}`,
    ].join('/');
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: intent.contentType,
      ContentLength: intent.size,
    });
    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: 300 });
    return {
      key,
      uploadUrl,
      publicUrl: this.getPublicUrl(key),
      headers: { 'content-type': intent.contentType },
      expiresAt: new Date(Date.now() + 300_000),
    };
  }

  getPublicUrl(key: string): string {
    return `${this.publicBase}/${key}`;
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

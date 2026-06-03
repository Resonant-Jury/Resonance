import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { IStorageProvider } from './interfaces';
import type { PresignedUpload, StoredObject, UploadIntent } from './types';

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
    // R2 does not support the AWS SDK v3 default flexible-checksum trailer; left
    // on, the SDK embeds a bogus crc32 (computed over an empty body at presign
    // time) and rejects/garbles uploads. Only send a checksum when required.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: env('R2_ACCESS_KEY_ID'),
      secretAccessKey: env('R2_SECRET_ACCESS_KEY'),
    },
  });

  private bucket = env('R2_BUCKET');
  private publicBase = env('R2_PUBLIC_BASE').replace(/\/$/, '');

  private buildKey(intent: UploadIntent): string {
    const now = new Date();
    return [
      intent.kind,
      intent.ownerId,
      `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
      `${crypto.randomUUID()}${extension(intent.filename)}`,
    ].join('/');
  }

  async uploadObject(intent: UploadIntent, body: Uint8Array): Promise<StoredObject> {
    const key = this.buildKey(intent);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: intent.contentType,
        ContentLength: body.byteLength,
      })
    );
    return { key, publicUrl: this.getPublicUrl(key) };
  }

  async createPresignedUpload(intent: UploadIntent): Promise<PresignedUpload> {
    const key = this.buildKey(intent);
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

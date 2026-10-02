import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { IStorageProvider } from './interfaces';
import type { StoredObject, UploadIntent } from './types';

/**
 * Whose each stored picture is. A storage key names no one
 * (`{kind}/{yyyy-mm}/{uuid}.{ext}`, see r2.ts) — it is in every cover's
 * public URL, an anonymous card's too — so ownership lives here instead, in
 * server-only `uploads/{uuid}`: what the account purge deletes a person's
 * pictures by. (Keys from before carry the owner's uid as their second
 * segment, and are still purged by that prefix.)
 */
export const UPLOADS = 'uploads';

/** An upload record's id: its key's file name without the extension (a fresh UUID). */
export function uploadId(key: string): string {
  const name = key.split('/').pop() ?? key;
  return name.replace(/\.[^.]*$/, '') || name;
}

export async function recordUpload(db: Firestore, ownerId: string, stored: StoredObject, kind: string): Promise<void> {
  await db.collection(UPLOADS).doc(uploadId(stored.key)).set({
    ownerId,
    key: stored.key,
    kind,
    createdAt: FieldValue.serverTimestamp(),
  });
}

/** The keys of every picture `uid` stored (by its record). */
export async function uploadedKeys(db: Firestore, uid: string): Promise<string[]> {
  const snap = await db.collection(UPLOADS).where('ownerId', '==', uid).select('key').get();
  return snap.docs.map((d) => d.get('key')).filter((k): k is string => typeof k === 'string' && k.length > 0);
}

/**
 * Store a picture and record whose it is. Should the record fail, the
 * picture is removed again (best effort) rather than left behind with no
 * owner the purge could find.
 */
export async function storeOwned(
  db: Firestore,
  storage: Pick<IStorageProvider, 'uploadObject' | 'deleteObject'>,
  intent: UploadIntent,
  body: Uint8Array,
): Promise<StoredObject> {
  const stored = await storage.uploadObject(intent, body);
  try {
    await recordUpload(db, intent.ownerId, stored, intent.kind);
  } catch (e) {
    await storage.deleteObject(stored.key).catch(() => {});
    throw e;
  }
  return stored;
}

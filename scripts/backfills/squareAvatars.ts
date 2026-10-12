import type { Firestore } from 'firebase-admin/firestore';
import sharp from 'sharp';
import { storageKeyOf } from '../../src/lib/storage/publicUrl';
import { normalizeUpload } from '../../src/lib/storage/image';
import { storeOwned } from '../../src/lib/storage/uploads';
import type { IStorageProvider } from '../../src/lib/storage/interfaces';

/** Where a new square photo is stored (and removed again should its record fail). */
export type AvatarStorage = Pick<IStorageProvider, 'uploadObject' | 'deleteObject'>;

/** A stored picture's bytes by its public URL; null when there is none. */
export type ReadPicture = (url: string) => Promise<Uint8Array | null>;

/**
 * Profile photos set before a photo was cut square on the way in (the apps' framing, the upload's
 * `purpose=avatar` → `fit: cover`) keep the proportions they were taken in, and a client that fits a
 * photo by its own proportions drew such a one stretched past its avatar (iOS's, until the photo
 * took its room first). Each of our stored photos that isn't square is cut square here exactly as a
 * new one is (normalizeUpload 'avatar': upright, the middle, 256 px, WebP — what the web's
 * `object-fit: cover` has been showing), stored under a fresh key on record as its owner's, and the
 * profile points at it — so every build already installed draws it right, no release needed.
 *
 * Only `users/{uid}.avatarUrl` names a profile photo (lists, bells and the API read it from there).
 * The old picture is left where it was: nothing names it any more, its record or key still finds it
 * for the account purge, and the profile can be pointed back at it. A photo elsewhere (a sign-in
 * provider's) is left alone, and so is one that can't be read. A profile written to after it was
 * read here is not overwritten — it is reported, and the next run takes it. Idempotent: a square
 * photo is left as it is; with `apply: false` it only reports.
 */
export async function squareAvatars(
  db: Firestore,
  storage: AvatarStorage | null,
  opts: { apply: boolean; publicBases: readonly string[]; read: ReadPicture; log?: (line: string) => void },
) {
  const log = opts.log ?? console.log;
  if (opts.apply && !storage) throw new Error('square-avatars --apply needs the storage (R2 credentials)');
  const users = await db.collection('users').select('avatarUrl').get();
  const report = { users: users.size, photos: 0, notOurs: 0, unreadable: 0, square: 0, squared: 0, notWritten: 0 };
  const plan: { doc: (typeof users.docs)[number]; url: string; width: number; height: number; bytes: Uint8Array }[] = [];

  for (const doc of users.docs) {
    const url = doc.get('avatarUrl');
    if (typeof url !== 'string' || !url) continue;
    report.photos++;
    if (!storageKeyOf(url, opts.publicBases)) {
      report.notOurs++;
      continue;
    }
    const bytes = await opts.read(url).catch(() => null);
    const meta = bytes ? await sharp(bytes).metadata().catch(() => null) : null;
    if (!bytes || !meta?.width || !meta.height) {
      report.unreadable++;
      log(`  ${doc.ref.path}: unreadable ${url}`);
      continue;
    }
    // As it shows: an EXIF rotation of a quarter turn swaps the sides.
    const turned = (meta.orientation ?? 1) >= 5;
    const width = turned ? meta.height : meta.width;
    const height = turned ? meta.width : meta.pageHeight ?? meta.height;
    if (Math.abs(width - height) <= 1) {
      report.square++;
      continue;
    }
    plan.push({ doc, url, width, height, bytes });
  }

  log(`users: ${report.users}, with a photo: ${report.photos} (elsewhere: ${report.notOurs}, unreadable: ${report.unreadable}, square: ${report.square})`);
  log(`not square: ${plan.length}`);
  for (const p of plan) log(`  ${p.doc.ref.path}: ${p.width}×${p.height} ${p.url}`);
  if (!opts.apply || !plan.length) return report;

  const notWritten: string[] = [];
  for (const { doc, bytes } of plan) {
    const image = await normalizeUpload(bytes, 'avatar');
    const stored = await storeOwned(
      db,
      storage!,
      { filename: `avatar.${image.extension}`, contentType: image.contentType, size: image.data.byteLength, ownerId: doc.id, kind: 'image' },
      image.data,
    );
    try {
      // Only if nobody wrote to the profile since it was read: a photo changed meanwhile stays the person's.
      await doc.ref.update({ avatarUrl: stored.publicUrl }, { lastUpdateTime: doc.updateTime });
      report.squared++;
      log(`  ${doc.ref.path} → ${stored.publicUrl}`);
    } catch (e) {
      const err = e as { code?: number; message?: string };
      notWritten.push(`${doc.ref.path} (${err.code === 9 ? 'changed while this ran' : err.message ?? 'failed'})`);
    }
  }
  report.notWritten = notWritten.length;
  log(`squared ${report.squared} photo(s)`);
  if (notWritten.length) log(`not written — run again:\n  ${notWritten.join('\n  ')}`);
  return report;
}

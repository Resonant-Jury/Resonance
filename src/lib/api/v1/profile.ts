import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import type { AuthUser } from '@/lib/auth/types';
import { ApiFailure } from './http';
import { getMe } from './service';
import type { CreateProfileInput, MeBody, UpdateProfileInput } from './schemas';

// Profile writes for the apps. The web writes users/{uid} straight from the
// client and checks a pen name is free with a query beforehand; here the
// check and the write share one transaction, so two people can't take the
// same name at once.

/** Whether `handle` is taken by anyone but `uid` (read inside `tx` when given). */
async function takenByOther(db: Firestore, uid: string, handle: string, tx?: Transaction): Promise<boolean> {
  const q = db.collection('users').where('handleLower', '==', handle.toLowerCase()).limit(2);
  const snap = tx ? await tx.get(q) : await q.get();
  return snap.docs.some((d) => d.id !== uid);
}

export async function handleAvailable(db: Firestore, uid: string, handle: string): Promise<boolean> {
  return !(await takenByOther(db, uid, handle));
}

/**
 * Onboarding (the web's signup profile step, createCurrentUserProfile): the
 * same fields and defaults. Idempotent — an account that already has a
 * profile gets it back unchanged, so a retried request is harmless.
 */
export async function createProfile(db: Firestore, user: AuthUser, input: CreateProfileInput): Promise<{ me: MeBody; created: boolean }> {
  const ref = db.doc(`users/${user.id}`);
  const created = await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return false;
    if (await takenByOther(db, user.id, input.handle, tx)) throw new ApiFailure('conflict', 'That pen name is taken.');
    const avatarSeed = String(Math.abs([...user.id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)));
    tx.set(ref, {
      handle: input.handle,
      handleLower: input.handle.toLowerCase(),
      bio: '',
      region: input.region,
      primaryLocale: input.primaryLocale,
      autoTranslateTo: input.primaryLocale === 'zh-TW' ? ['en'] : ['zh-TW'],
      verified: user.emailVerified,
      phoneHash: '',
      avatarSeed,
      initials: input.handle.slice(0, 2).toUpperCase(),
      accentColor: 'oklch(88% 0.08 55)',
      joinedAt: FieldValue.serverTimestamp(),
      handleChangedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
  return { me: await getMe(db, user.id), created };
}

/**
 * The settings page's profile fields (updateProfile on the web). Only the
 * fields sent change; a new pen name must be free (case-insensitively) and
 * stamps handleChangedAt, like the web. Returns the previous pen name when it
 * changed, so the caller can refresh the old profile page too.
 */
export async function updateProfile(db: Firestore, uid: string, input: UpdateProfileInput): Promise<{ me: MeBody; previousHandle: string | null }> {
  const ref = db.doc(`users/${uid}`);
  const previousHandle = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ApiFailure('not_found', 'This account has no profile yet.');
    const current = String(snap.get('handle') ?? '');
    const patch: Record<string, unknown> = {};
    let renamed: string | null = null;
    if (input.handle != null && input.handle !== current) {
      if (await takenByOther(db, uid, input.handle, tx)) throw new ApiFailure('conflict', 'That pen name is taken.');
      patch.handle = input.handle;
      patch.handleLower = input.handle.toLowerCase();
      patch.handleChangedAt = FieldValue.serverTimestamp();
      renamed = current;
    }
    if (input.bio != null) patch.bio = input.bio;
    if (input.region != null) patch.region = input.region;
    if (input.primaryLocale != null) patch.primaryLocale = input.primaryLocale;
    if (Object.keys(patch).length) tx.update(ref, patch);
    return renamed;
  });
  return { me: await getMe(db, uid), previousHandle };
}

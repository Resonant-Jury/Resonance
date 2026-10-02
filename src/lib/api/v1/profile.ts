import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { AuthUser } from '@/lib/auth/types';
import { handleKey, handleRef, handleTakenByOther, reservable, reserveHandle } from '@/lib/db/firestore/handles';
import { ApiFailure } from './http';
import { getMe } from './service';
import type { CreateProfileInput, MeBody, UpdateProfileInput } from './schemas';

// Profile writes, for the web and the apps alike. A pen name is reserved in
// the same transaction as the profile that takes it (handles/{name}, see
// lib/db/firestore/handles), so two people can't take the same name at once.

const taken = () => new ApiFailure('conflict', 'That pen name is taken.');

export async function handleAvailable(db: Firestore, uid: string, handle: string): Promise<boolean> {
  if (!reservable(handleKey(handle))) return false;
  return !(await handleTakenByOther(db, uid, handle));
}

/**
 * Onboarding (the web's signup profile step, createCurrentUserProfile): the
 * same fields and defaults. Idempotent — an account that already has a
 * profile gets it back unchanged, so a retried request is harmless.
 */
export async function createProfile(db: Firestore, user: AuthUser, input: CreateProfileInput): Promise<{ me: MeBody; created: boolean }> {
  const ref = db.doc(`users/${user.id}`);
  const created = await db.runTransaction(async (tx) => {
    const [existing, isTaken] = await Promise.all([tx.get(ref), handleTakenByOther(db, user.id, input.handle, tx)]);
    if (existing.exists) return false;
    if (isTaken) throw taken();
    const avatarSeed = String(Math.abs([...user.id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)));
    tx.set(ref, {
      handle: input.handle,
      handleLower: handleKey(input.handle),
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
    reserveHandle(db, tx, user.id, input.handle);
    return true;
  });
  return { me: await getMe(db, user.id), created };
}

/**
 * The settings page's profile fields (updateProfile on the web). Only the
 * fields sent change; a new pen name must be free (case-insensitively) and
 * stamps handleChangedAt, like the web. A rename moves the reservation: the
 * new name's is written and the old one's released (a change of case keeps
 * the same reservation, with the name as now written). Returns the previous
 * pen name when it changed, so the caller can refresh the old profile page too.
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
      const oldKey = handleKey(current);
      const [isTaken, oldReservation] = await Promise.all([
        handleTakenByOther(db, uid, input.handle, tx),
        oldKey && reservable(oldKey) && oldKey !== handleKey(input.handle) ? tx.get(handleRef(db, current)) : null,
      ]);
      if (isTaken) throw taken();
      patch.handle = input.handle;
      patch.handleLower = handleKey(input.handle);
      patch.handleChangedAt = FieldValue.serverTimestamp();
      renamed = current;
      // Release the old name — only ever this account's own reservation.
      if (oldReservation?.exists && oldReservation.get('uid') === uid) tx.delete(oldReservation.ref);
      reserveHandle(db, tx, uid, input.handle);
    }
    if (input.bio != null) patch.bio = input.bio;
    if (input.region != null) patch.region = input.region;
    if (input.primaryLocale != null) patch.primaryLocale = input.primaryLocale;
    if (Object.keys(patch).length) tx.update(ref, patch);
    return renamed;
  });
  return { me: await getMe(db, uid), previousHandle };
}

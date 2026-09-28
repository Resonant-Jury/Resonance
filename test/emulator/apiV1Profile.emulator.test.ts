import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { ApiFailure } from '@/lib/api/v1/http';
import { createProfile, handleAvailable, updateProfile } from '@/lib/api/v1/profile';
import { reportCard } from '@/lib/api/v1/safety';
import { CreateProfileRequest, UpdateProfileRequest } from '@/lib/api/v1/schemas';
import type { AuthUser } from '@/lib/auth/types';

// Profile and report writes through the v1 API against the Firestore
// emulator: the onboarding and settings writes the web makes from the
// client, the pen-name uniqueness the web only checks before writing, and
// reports on anonymous cards (whose author only the server knows).

const PROJECT = 'demo-resonance-api-profile';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'api-v1-profile-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  await db.doc('users/bob').set({ handle: 'Bob', handleLower: 'bob', initials: 'BO', accentColor: 'oklch(90% 0.05 60)', bio: 'hi', region: 'TW', primaryLocale: 'zh-TW' });
});

const newcomer: AuthUser = { id: 'nina', email: 'nina@example.com', phoneNumber: null, emailVerified: true };

async function failure(p: Promise<unknown>): Promise<ApiFailure> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(ApiFailure);
  return e as ApiFailure;
}

describe('createProfile', () => {
  it("writes the web signup's profile, with its defaults", async () => {
    const { me, created } = await createProfile(db, newcomer, { handle: '小夜', region: 'TW', primaryLocale: 'zh-TW' });
    expect(created).toBe(true);
    expect(me).toMatchObject({ id: 'nina', handle: '小夜', initials: '小夜', bio: null, region: 'TW', primaryLocale: 'zh-TW' });
    expect(me.handleChangedAt).toMatch(/^\d{4}-/);
    const doc = (await db.doc('users/nina').get()).data()!;
    expect(doc).toMatchObject({ handleLower: '小夜', autoTranslateTo: ['en'], verified: true, phoneHash: '', accentColor: 'oklch(88% 0.08 55)' });
    expect(doc.avatarSeed).toBe(String([...'nina'].reduce((s, c) => s + c.charCodeAt(0), 0)));
  });

  it('refuses a pen name someone has, whatever its case', async () => {
    const e = await failure(createProfile(db, newcomer, { handle: 'BOB', region: 'TW', primaryLocale: 'en' }));
    expect(e.code).toBe('conflict');
    expect((await db.doc('users/nina').get()).exists).toBe(false);
  });

  it('hands an existing profile back unchanged (a retried request is harmless)', async () => {
    await createProfile(db, newcomer, { handle: 'nina', region: 'TW', primaryLocale: 'en' });
    const again = await createProfile(db, newcomer, { handle: 'other', region: 'JP', primaryLocale: 'zh-TW' });
    expect(again.created).toBe(false);
    expect(again.me.handle).toBe('nina');
  });

  it('gives a contested name to exactly one of two simultaneous sign-ups', async () => {
    const other: AuthUser = { ...newcomer, id: 'omar' };
    const results = await Promise.allSettled([
      createProfile(db, newcomer, { handle: 'dawn', region: 'TW', primaryLocale: 'en' }),
      createProfile(db, other, { handle: 'Dawn', region: 'TW', primaryLocale: 'en' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await db.collection('users').where('handleLower', '==', 'dawn').get()).size).toBe(1);
  });
});

describe('updateProfile', () => {
  it('changes only the fields sent', async () => {
    const { me, previousHandle } = await updateProfile(db, 'bob', { bio: '新的一句話' });
    expect(previousHandle).toBeNull();
    expect(me).toMatchObject({ handle: 'Bob', bio: '新的一句話', region: 'TW', primaryLocale: 'zh-TW' });
  });

  it('renames: stamps handleChangedAt and reports the old name', async () => {
    const { me, previousHandle } = await updateProfile(db, 'bob', { handle: 'Robert' });
    expect(previousHandle).toBe('Bob');
    expect(me.handle).toBe('Robert');
    const doc = (await db.doc('users/bob').get()).data()!;
    expect(doc.handleLower).toBe('robert');
    expect(doc.handleChangedAt).toBeDefined();
  });

  it("keeps one's own name free (a case change is a rename, not a conflict)", async () => {
    expect(await handleAvailable(db, 'bob', 'BOB')).toBe(true);
    expect((await updateProfile(db, 'bob', { handle: 'BOB' })).me.handle).toBe('BOB');
  });

  it("refuses someone else's name and leaves the profile as it was", async () => {
    await db.doc('users/carol').set({ handle: 'carol', handleLower: 'carol' });
    expect(await handleAvailable(db, 'bob', 'Carol')).toBe(false);
    expect((await failure(updateProfile(db, 'bob', { handle: 'Carol', bio: 'x' }))).code).toBe('conflict');
    expect((await db.doc('users/bob').get()).get('bio')).toBe('hi');
  });

  it('is not_found before onboarding', async () => {
    expect((await failure(updateProfile(db, 'nina', { bio: 'x' }))).code).toBe('not_found');
  });
});

describe('profile requests', () => {
  it("hold the web's limits and never a path in a pen name", () => {
    expect(CreateProfileRequest.safeParse({ handle: ' a ', region: 'TW', primaryLocale: 'en' }).success).toBe(false);
    expect(CreateProfileRequest.safeParse({ handle: 'x'.repeat(21), region: 'TW', primaryLocale: 'en' }).success).toBe(false);
    expect(CreateProfileRequest.safeParse({ handle: 'a/b', region: 'TW', primaryLocale: 'en' }).success).toBe(false);
    expect(CreateProfileRequest.safeParse({ handle: '小夜', region: 'TW', primaryLocale: 'fr' }).success).toBe(false);
    expect(UpdateProfileRequest.parse({ handle: null, bio: '  ', region: null })).toEqual({ handle: null, bio: '', region: null });
    expect(UpdateProfileRequest.safeParse({ bio: 'x'.repeat(81) }).success).toBe(false);
  });
});

describe('reportCard', () => {
  const report = (id: string) => db.doc(`reports/${id}`).get().then((s) => s.data()!);

  it("fills in an anonymous card's author, which the app never sees", async () => {
    await db.doc('cards/anon').set({ authorId: 'bob', visibility: 'public', anonymous: true, slug: 'a-quiet-night', publishedAt: new Date() });
    const id = await reportCard(db, 'nina', 'a-quiet-night', { reason: 'harassment', detail: '不舒服' });
    expect(await report(id)).toMatchObject({
      reporterId: 'nina',
      targetType: 'card',
      targetId: 'anon',
      targetUserId: 'bob',
      reason: 'harassment',
      detail: '不舒服',
      status: 'open',
    });
  });

  it("is not_found for a card the reporter can't see, and refuses one's own", async () => {
    await db.doc('cards/secret').set({ authorId: 'bob', visibility: 'private', publishedAt: null });
    expect((await failure(reportCard(db, 'nina', 'secret', { reason: 'spam' }))).code).toBe('not_found');
    expect((await failure(reportCard(db, 'bob', 'secret', { reason: 'spam' }))).code).toBe('invalid_request');
    expect((await db.collection('reports').get()).size).toBe(0);
  });
});

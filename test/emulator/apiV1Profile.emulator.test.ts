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
  it("writes the web signup's profile, with its defaults — unverified, even with a verified sign-in email", async () => {
    const { me, created } = await createProfile(db, newcomer, { handle: '小夜', region: 'TW', primaryLocale: 'zh-TW' });
    expect(created).toBe(true);
    expect(me).toMatchObject({ id: 'nina', handle: '小夜', initials: '小夜', bio: null, region: 'TW', primaryLocale: 'zh-TW' });
    expect(me.handleChangedAt).toMatch(/^\d{4}-/);
    const doc = (await db.doc('users/nina').get()).data()!;
    expect(doc).toMatchObject({ handleLower: '小夜', autoTranslateTo: ['en'], verified: false, phoneHash: '', accentColor: 'oklch(88% 0.08 55)' });
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

  // A profile made before onboarding asked for a pen name can reach no one
  // (hasPenName): the web sends it back to onboarding, which names it here.
  it('names a profile that has none, reserving the name, and keeps the rest of it', async () => {
    await db.doc('users/nina').set({ handle: '', bio: 'already here', accentColor: 'oklch(80% 0.1 200)', avatarSeed: '7', region: 'JP', primaryLocale: 'en' });
    const { me, created, named } = await createProfile(db, newcomer, { handle: '小夜', region: 'TW', primaryLocale: 'zh-TW' });
    expect({ created, named }).toEqual({ created: false, named: true });
    expect(me).toMatchObject({ handle: '小夜', initials: '小夜', bio: 'already here', region: 'TW', primaryLocale: 'zh-TW' });
    expect(me.handleChangedAt).toMatch(/^\d{4}-/);
    const doc = (await db.doc('users/nina').get()).data()!;
    expect(doc).toMatchObject({ handleLower: '小夜', accentColor: 'oklch(80% 0.1 200)', avatarSeed: '7' });
    expect((await db.doc('handles/小夜').get()).get('uid')).toBe('nina');
    // Named now: it comes back unchanged from here on.
    expect(await createProfile(db, newcomer, { handle: 'other', region: 'JP', primaryLocale: 'en' })).toMatchObject({ created: false, named: false, me: { handle: '小夜' } });
  });

  it('keeps initials a nameless profile already had, and still refuses a name someone has', async () => {
    await db.doc('users/nina').set({ initials: 'NN' });
    expect((await failure(createProfile(db, newcomer, { handle: 'bob', region: 'TW', primaryLocale: 'en' }))).code).toBe('conflict');
    expect((await db.doc('users/nina').get()).data()).toEqual({ initials: 'NN' });
    expect((await createProfile(db, newcomer, { handle: 'nina', region: 'TW', primaryLocale: 'en' })).me).toMatchObject({ handle: 'nina', initials: 'NN' });
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

// A pen name is one person's because a document says so: handles/{name,
// lower-cased}, written in the profile write's own transaction. Names taken
// before reservations existed (Bob here) have none yet, and still count.
describe('pen-name reservations', () => {
  const reservation = (key: string) => db.doc(`handles/${key}`).get().then((s) => (s.exists ? s.data() : null));

  it('are written with the profile that takes the name', async () => {
    await createProfile(db, newcomer, { handle: '小夜', region: 'TW', primaryLocale: 'zh-TW' });
    expect(await reservation('小夜')).toMatchObject({ uid: 'nina', handle: '小夜' });
  });

  it("make a name someone else's even with no profile going by it", async () => {
    await db.doc('handles/dawn').set({ uid: 'omar', handle: 'Dawn' });
    expect((await failure(createProfile(db, newcomer, { handle: 'DAWN', region: 'TW', primaryLocale: 'en' }))).code).toBe('conflict');
    expect(await handleAvailable(db, 'nina', 'dawn')).toBe(false);
    expect(await handleAvailable(db, 'omar', 'dawn')).toBe(true);
  });

  it('move with a rename: the new name is reserved, the old one freed for anyone', async () => {
    await createProfile(db, newcomer, { handle: 'nina', region: 'TW', primaryLocale: 'en' });
    await updateProfile(db, 'nina', { handle: 'Nightingale' });
    expect(await reservation('nina')).toBeNull();
    expect(await reservation('nightingale')).toMatchObject({ uid: 'nina', handle: 'Nightingale' });
    expect(await handleAvailable(db, 'omar', 'nina')).toBe(true);
  });

  it('stay one reservation through a change of case, with the name as now written', async () => {
    await createProfile(db, newcomer, { handle: 'nina', region: 'TW', primaryLocale: 'en' });
    await updateProfile(db, 'nina', { handle: 'NINA' });
    expect(await reservation('nina')).toMatchObject({ uid: 'nina', handle: 'NINA' });
  });

  it("reserve an older account's name on its first rename, and never free another's reservation", async () => {
    // Bob's name predates reservations; someone else's reservation sits on it (old duplicate data).
    await db.doc('handles/bob').set({ uid: 'zed', handle: 'bob' });
    await updateProfile(db, 'bob', { handle: 'Robert' });
    expect(await reservation('robert')).toMatchObject({ uid: 'bob' });
    expect(await reservation('bob')).toMatchObject({ uid: 'zed' });
  });

  it('give a contested rename to exactly one of two people', async () => {
    await db.doc('users/omar').set({ handle: 'omar', handleLower: 'omar' });
    const results = await Promise.allSettled([
      updateProfile(db, 'bob', { handle: 'Morning' }),
      updateProfile(db, 'omar', { handle: 'morning' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await db.collection('users').where('handleLower', '==', 'morning').get()).size).toBe(1);
    expect(await reservation('morning')).not.toBeNull();
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
    // Nothing that can't be its reservation's document id.
    expect(CreateProfileRequest.safeParse({ handle: '..', region: 'TW', primaryLocale: 'en' }).success).toBe(false);
    expect(CreateProfileRequest.safeParse({ handle: '__Ab__', region: 'TW', primaryLocale: 'en' }).success).toBe(false);
    expect(CreateProfileRequest.safeParse({ handle: '...', region: 'TW', primaryLocale: 'en' }).success).toBe(true);
  });

  it("say a name that can't be reserved is not free", async () => {
    expect(await handleAvailable(db, 'nina', '..')).toBe(false);
    expect(await handleAvailable(db, 'nina', '__x__')).toBe(false);
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

  it('keeps the card as it read when reported: deleting or editing it later erases no evidence', async () => {
    await db.doc('cards/anon').set({
      authorId: 'bob', visibility: 'public', anonymous: true, slug: 'a-quiet-night', publishedAt: new Date(),
      thoughtCore: '一句狠話', story: '整段的人身攻擊', tags: ['x'], media: { type: 'image', url: 'https://img.example/c.webp', label: 'c' },
    });
    const id = await reportCard(db, 'nina', 'anon', { reason: 'harassment' });
    await db.doc('cards/anon').delete();
    const evidence = (await db.doc(`reportEvidence/${id}`).get()).data()!;
    expect(evidence).toMatchObject({
      reportId: id,
      reporterId: 'nina',
      targetUserId: 'bob',
      targetType: 'card',
      card: { id: 'anon', thoughtCore: '一句狠話', story: '整段的人身攻擊', anonymous: true, authorHandle: 'Bob', media: { url: 'https://img.example/c.webp' } },
    });
    expect(evidence.capturedAt).toBeDefined();
  });

  it("is not_found for a card the reporter can't see, and refuses one's own", async () => {
    await db.doc('cards/secret').set({ authorId: 'bob', visibility: 'private', publishedAt: null });
    expect((await failure(reportCard(db, 'nina', 'secret', { reason: 'spam' }))).code).toBe('not_found');
    expect((await failure(reportCard(db, 'bob', 'secret', { reason: 'spam' }))).code).toBe('invalid_request');
    expect((await db.collection('reports').get()).size).toBe(0);
  });
});

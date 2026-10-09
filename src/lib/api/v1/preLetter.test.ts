import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import en from '@/messages/en.json';
import zhTW from '@/messages/zh-TW.json';
import { fakeAdminDb } from '@/../test/fakeAdminDb';
import { ANONYMOUS_VISIBILITY_MESSAGE } from '@/lib/db/firestore/cardContent';
import { NoteLimitReached } from './conversations';
import { ApiFailure } from './http';
import { letterReadsAsConnection, refusalForPreLetterBuild } from './preLetter';

// What the app builds made before letters (iOS ≤ 6, Android ≤ 7) still get
// from the server, and no one else does: a letter waiting for their answer
// read as a connection, and two refusals in words they can show, in their
// app's language. The routes' side is apiV1PreLetter.emulator.test.ts.

const OLD_IOS = 'Resonance/2.0.0 (iOS 18.5; build 6)';
const OLD_ANDROID = 'Resonance/2.0.0 (Android 15; build 7)';
const NEW_ANDROID = 'Resonance/2.0.0 (Android 16; build 8)';
const request = (headers: Record<string, string> = {}) => new Request('http://localhost/api/v1/notes', { method: 'POST', headers });
const at = (iso: string) => Timestamp.fromDate(new Date(iso));

describe('letterReadsAsConnection', () => {
  const snapshot = async (docs: Record<string, Record<string, unknown>>) => {
    const fake = fakeAdminDb(docs);
    return { fake, convo: await fake.db.doc('conversations/alice_bob').get() };
  };
  const letter = { participants: ['alice', 'bob'], request: { from: 'alice', cardId: 'walk', count: 1 } };

  it("is their letter, waiting for the viewer's answer — asking their side of the block only then", async () => {
    const { fake, convo } = await snapshot({ 'conversations/alice_bob': letter });
    expect(await letterReadsAsConnection(fake.db, 'bob', 'alice', convo)).toBe(true);
    expect(fake.reads).toEqual(['conversations/alice_bob', 'users/alice/blocks/bob']);
  });

  it("is never its writer's, nor anyone's without a letter, asking nothing more", async () => {
    const cases: Record<string, Record<string, unknown>>[] = [
      { 'conversations/alice_bob': letter },
      { 'conversations/alice_bob': { participants: ['alice', 'bob'] } },
      {},
    ];
    for (const docs of cases) {
      const { fake, convo } = await snapshot(docs);
      expect(await letterReadsAsConnection(fake.db, 'alice', 'bob', convo)).toBe(false);
      expect(fake.reads).toEqual(['conversations/alice_bob']);
    }
    const { fake, convo } = await snapshot({ 'conversations/alice_bob': letter });
    expect(await letterReadsAsConnection(fake.db, 'alice', 'alice', convo)).toBe(false);
    // A request no one can read as a letter (no writer) is none.
    const odd = await snapshot({ 'conversations/alice_bob': { request: { count: 2 } } });
    expect(await letterReadsAsConnection(odd.fake.db, 'bob', 'alice', odd.convo)).toBe(false);
  });

  it('is never across their block of the viewer', async () => {
    const { fake, convo } = await snapshot({ 'conversations/alice_bob': letter, 'users/alice/blocks/bob': { blockedUid: 'bob' } });
    expect(await letterReadsAsConnection(fake.db, 'bob', 'alice', convo)).toBe(false);
  });
});

describe('refusalForPreLetterBuild', () => {
  const limit = () => new NoteLimitReached();
  const audience = () => new ApiFailure('invalid_request', ANONYMOUS_VISIBILITY_MESSAGE);

  it('leaves every refusal as it is for the web and every build after letters, reading nothing', async () => {
    const agents: Record<string, string>[] = [{}, { 'User-Agent': NEW_ANDROID }, { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)' }];
    for (const headers of agents) {
      const fake = fakeAdminDb({});
      for (const e of [limit(), audience()]) expect(await refusalForPreLetterBuild(fake.db, 'alice', request(headers), e)).toBe(e);
      expect(fake.reads).toEqual([]);
    }
  });

  it("tells a build before letters of the note limit with a 403 — in the language its app registered on this platform, newest first", async () => {
    const fake = fakeAdminDb({
      'devices/a': { userId: 'alice', platform: 'android', locale: 'en', updatedAt: at('2026-09-01T00:00:00Z') },
      'devices/b': { userId: 'alice', platform: 'android', locale: 'zh-TW', updatedAt: at('2026-10-01T00:00:00Z') },
      // Newer, but another platform's install: it says nothing of this one.
      'devices/c': { userId: 'alice', platform: 'ios', locale: 'en', updatedAt: at('2026-10-09T00:00:00Z') },
      'devices/d': { userId: 'bob', platform: 'android', locale: 'en', updatedAt: at('2026-10-09T00:00:00Z') },
    });
    const e = await refusalForPreLetterBuild(fake.db, 'alice', request({ 'User-Agent': OLD_ANDROID, 'Accept-Language': 'en' }), limit());
    expect(e).toBeInstanceOf(ApiFailure);
    expect(e).toMatchObject({ code: 'forbidden', message: zhTW.card.note.waitForReply });
  });

  it("else takes the request's language (iOS sends the system's), else the profile's, else English", async () => {
    const asked = fakeAdminDb({ 'users/alice': { primaryLocale: 'en' } });
    expect(await refusalForPreLetterBuild(asked.db, 'alice', request({ 'User-Agent': OLD_IOS, 'Accept-Language': 'zh-Hant-TW,en;q=0.8' }), limit()))
      .toMatchObject({ code: 'forbidden', message: zhTW.card.note.waitForReply });
    // The profile is read only when nothing else says.
    expect(asked.reads).toEqual(['devices?userId==alice']);
    const profile = fakeAdminDb({ 'users/alice': { primaryLocale: 'zh-TW' } });
    expect(await refusalForPreLetterBuild(profile.db, 'alice', request({ 'User-Agent': OLD_ANDROID }), limit()))
      .toMatchObject({ code: 'forbidden', message: zhTW.card.note.waitForReply });
    const none = fakeAdminDb({ 'users/alice': {} });
    expect(await refusalForPreLetterBuild(none.db, 'alice', request({ 'User-Agent': OLD_ANDROID }), limit()))
      .toMatchObject({ code: 'forbidden', message: en.card.note.waitForReply });
  });

  it("still refuses with its 403 when the language can't be read — in the language asked for, else English", async () => {
    const down = { collection: () => { throw new Error('unavailable'); }, doc: () => { throw new Error('unavailable'); } } as unknown as Parameters<typeof refusalForPreLetterBuild>[0];
    expect(await refusalForPreLetterBuild(down, 'alice', request({ 'User-Agent': OLD_IOS, 'Accept-Language': 'zh-Hant-TW' }), limit()))
      .toMatchObject({ code: 'forbidden', message: zhTW.card.note.waitForReply });
    expect(await refusalForPreLetterBuild(down, 'alice', request({ 'User-Agent': OLD_ANDROID }), audience()))
      .toMatchObject({ code: 'invalid_request', message: en.write.publishPanel.anonymousVisibility });
  });

  it('says an anonymous card is public or only for its author in the same way, still a 400', async () => {
    const fake = fakeAdminDb({ 'devices/a': { userId: 'alice', platform: 'ios', locale: 'zh-TW', updatedAt: at('2026-10-01T00:00:00Z') } });
    expect(await refusalForPreLetterBuild(fake.db, 'alice', request({ 'User-Agent': OLD_IOS }), audience()))
      .toMatchObject({ code: 'invalid_request', message: zhTW.write.publishPanel.anonymousVisibility });
  });

  it("leaves a build before letters' every other refusal as it is — another conflict, or another 400 — reading nothing", async () => {
    const fake = fakeAdminDb({});
    for (const e of [
      new ApiFailure('conflict', 'Wait for them to reply.'),
      new ApiFailure('blocked', 'You cannot send a note to this person.'),
      new ApiFailure('invalid_request', 'A card needs a title before it is published.'),
      new Error('boom'),
    ]) {
      expect(await refusalForPreLetterBuild(fake.db, 'alice', request({ 'User-Agent': OLD_IOS }), e)).toBe(e);
    }
    expect(fake.reads).toEqual([]);
  });
});

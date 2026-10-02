import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ApiFailure } from '@/lib/api/v1/http';
import { createReport, MESSAGE_CONTEXT } from '@/lib/api/v1/safety';
import { CreateReportRequest } from '@/lib/api/v1/schemas';

// POST /api/v1/reports against the Firestore emulator: a person or a message
// reported through the server, which keeps what was reported as it read then
// (reportEvidence) — so deleting the conversation or the profile afterwards
// erases no evidence — and re-checks what the rules checked for a client.

const PROJECT = 'demo-resonance-api-reports';
let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  app = initializeApp({ projectId: PROJECT }, 'api-v1-reports-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

const PAIR = 'alice_bob';
const at = (s: number) => Timestamp.fromMillis(1_700_000_000_000 + s * 1000);

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  await Promise.all([
    db.doc('users/alice').set({ handle: 'alice', handleLower: 'alice' }),
    db.doc('users/bob').set({ handle: 'Bob', handleLower: 'bob', bio: '我會一直找你', avatarUrl: 'https://img.example/b.webp', region: 'TW' }),
    db.doc(`conversations/${PAIR}`).set({ participants: ['alice', 'bob'], lastMessage: null, unread: { alice: 0, bob: 0 } }),
  ]);
  // 25 messages, oldest first: Bob's are the odd ones.
  const batch = db.batch();
  for (let i = 0; i < 25; i++) {
    batch.set(db.doc(`conversations/${PAIR}/messages/m${String(i).padStart(2, '0')}`), {
      senderId: i % 2 ? 'bob' : 'alice',
      text: `message ${i}`,
      sentAt: at(i),
      ...(i === 21 ? { cardRef: 'c1' } : {}),
    });
  }
  await batch.commit();
});

async function failure(p: Promise<unknown>): Promise<ApiFailure> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(ApiFailure);
  return e as ApiFailure;
}

const data = (path: string) => db.doc(path).get().then((s) => s.data());

describe('createReport: a message', () => {
  it('files the report against its sender, and keeps it with the messages before it as they read', async () => {
    const id = await createReport(db, 'alice', { targetType: 'message', targetId: 'm23', conversationId: PAIR, reason: 'harassment', detail: '一直傳' });
    expect(await data(`reports/${id}`)).toMatchObject({
      reporterId: 'alice',
      targetType: 'message',
      targetId: 'm23',
      targetUserId: 'bob',
      contextId: PAIR,
      reason: 'harassment',
      detail: '一直傳',
      status: 'open',
    });

    // Bob deletes the whole conversation (either participant may): the evidence stays.
    await db.recursiveDelete(db.doc(`conversations/${PAIR}`));
    const evidence = (await data(`reportEvidence/${id}`))!;
    expect(evidence).toMatchObject({ reportId: id, reporterId: 'alice', targetUserId: 'bob', senderHandle: 'Bob' });
    expect(evidence.message).toMatchObject({ id: 'm23', senderId: 'bob', text: 'message 23' });
    const context = evidence.context as { id: string; text: string; cardRef?: string }[];
    expect(context).toHaveLength(MESSAGE_CONTEXT);
    expect(context.at(0)!.id).toBe('m03');
    expect(context.at(-1)!.id).toBe('m22');
    expect(context.find((m) => m.id === 'm21')!.cardRef).toBe('c1');
  });

  it('reports a whole conversation (the web thread menu) against the other person, with its latest messages', async () => {
    const id = await createReport(db, 'alice', { targetType: 'message', targetId: PAIR, conversationId: PAIR, reason: 'spam' });
    expect(await data(`reports/${id}`)).toMatchObject({ targetId: PAIR, targetUserId: 'bob', contextId: PAIR });
    const evidence = (await data(`reportEvidence/${id}`))!;
    expect(evidence.message).toBeNull();
    const context = evidence.context as { id: string }[];
    expect(context).toHaveLength(MESSAGE_CONTEXT);
    expect(context.at(-1)!.id).toBe('m24');
  });

  it("is not_found outside the reporter's own conversations, and refuses their own message", async () => {
    await db.doc('conversations/bob_carol').set({ participants: ['bob', 'carol'] });
    await db.doc('conversations/bob_carol/messages/x1').set({ senderId: 'bob', text: 'hi carol', sentAt: at(1) });
    expect((await failure(createReport(db, 'alice', { targetType: 'message', targetId: 'x1', conversationId: 'bob_carol', reason: 'spam' }))).code).toBe('not_found');
    expect((await failure(createReport(db, 'alice', { targetType: 'message', targetId: 'gone', conversationId: PAIR, reason: 'spam' }))).code).toBe('not_found');
    expect((await failure(createReport(db, 'alice', { targetType: 'message', targetId: 'm02', conversationId: PAIR, reason: 'spam' }))).code).toBe('invalid_request');
    expect((await failure(createReport(db, 'alice', { targetType: 'message', targetId: 'm23', reason: 'spam' }))).code).toBe('invalid_request');
    expect((await db.collection('reports').get()).size).toBe(0);
    expect((await db.collection('reportEvidence').get()).size).toBe(0);
  });
});

describe('createReport: a person', () => {
  it('files the report against them and keeps their profile as it read', async () => {
    const id = await createReport(db, 'alice', { targetType: 'user', targetId: 'bob', reason: 'harassment' });
    expect(await data(`reports/${id}`)).toMatchObject({ targetType: 'user', targetId: 'bob', targetUserId: 'bob', detail: '' });
    await db.doc('users/bob').update({ bio: '' });
    expect((await data(`reportEvidence/${id}`))!.profile).toEqual({
      handle: 'Bob',
      bio: '我會一直找你',
      avatarUrl: 'https://img.example/b.webp',
      region: 'TW',
    });
  });

  it('refuses reporting yourself, and is not_found for nobody', async () => {
    expect((await failure(createReport(db, 'alice', { targetType: 'user', targetId: 'alice', reason: 'spam' }))).code).toBe('invalid_request');
    expect((await failure(createReport(db, 'alice', { targetType: 'user', targetId: 'nobody', reason: 'spam' }))).code).toBe('not_found');
  });
});

describe('the request', () => {
  it('takes a person or a message only, by id (never a path), with a known reason', () => {
    expect(CreateReportRequest.safeParse({ targetType: 'user', targetId: 'bob', reason: 'spam' }).success).toBe(true);
    expect(CreateReportRequest.safeParse({ targetType: 'message', targetId: 'm1', conversationId: PAIR, reason: 'other', detail: null }).success).toBe(true);
    expect(CreateReportRequest.safeParse({ targetType: 'card', targetId: 'c1', reason: 'spam' }).success).toBe(false);
    expect(CreateReportRequest.safeParse({ targetType: 'user', targetId: 'bob/blocks/alice', reason: 'spam' }).success).toBe(false);
    expect(CreateReportRequest.safeParse({ targetType: 'user', targetId: 'bob', reason: 'boring' }).success).toBe(false);
    expect(CreateReportRequest.safeParse({ targetType: 'user', targetId: 'bob', reason: 'spam', detail: 'x'.repeat(1001) }).success).toBe(false);
  });
});

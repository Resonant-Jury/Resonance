import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  setLogLevel,
  type Firestore,
} from 'firebase/firestore';

// firestore.rules against the real emulator. Alice and Bob are connected;
// Carol is a stranger. Each test seeds what it needs with rules disabled, then
// asserts what a signed-in client may and may not do.

let env: RulesTestEnvironment;
const PAIR = 'alice_bob'; // sorted connection / conversation id

function as(uid: string): Firestore {
  return env.authenticatedContext(uid).firestore() as unknown as Firestore;
}

async function seed(fn: (db: Firestore) => Promise<void>) {
  await env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore() as unknown as Firestore));
}

async function seedConnection() {
  await seed(async (db) => {
    await setDoc(doc(db, 'connections', PAIR), { userIds: ['alice', 'bob'], establishedAt: new Date() });
    await setDoc(doc(db, 'conversations', PAIR), {
      participants: ['alice', 'bob'],
      lastMessage: null,
      unread: { alice: 0, bob: 0 },
    });
  });
}

async function block(blocker: string, blocked: string) {
  await seed(async (db) => {
    await setDoc(doc(db, 'users', blocker, 'blocks', blocked), { blockedUid: blocked, createdAt: new Date() });
  });
}

beforeAll(async () => {
  // Denied writes are the point of most cases here; keep the SDK from logging each one.
  setLogLevel('silent');
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-resonance-rules',
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../firebase/firestore.rules'), 'utf8'),
      host,
      port: Number(port),
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

describe('block list (users/{uid}/blocks)', () => {
  it('lets the owner block, list and unblock', async () => {
    const db = as('alice');
    const ref = doc(db, 'users', 'alice', 'blocks', 'bob');
    await assertSucceeds(setDoc(ref, { blockedUid: 'bob', createdAt: serverTimestamp() }));
    await assertSucceeds(getDocs(collection(db, 'users', 'alice', 'blocks')));
    await assertSucceeds(deleteDoc(ref));
  });

  it('keeps the list private — the blocked person cannot see it', async () => {
    await block('alice', 'bob');
    await assertFails(getDoc(doc(as('bob'), 'users', 'alice', 'blocks', 'bob')));
    await assertFails(getDocs(collection(as('bob'), 'users', 'alice', 'blocks')));
  });

  it('refuses blocking yourself, writing someone else\'s list, or forged fields', async () => {
    await assertFails(
      setDoc(doc(as('alice'), 'users', 'alice', 'blocks', 'alice'), {
        blockedUid: 'alice',
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(
      setDoc(doc(as('carol'), 'users', 'alice', 'blocks', 'bob'), {
        blockedUid: 'bob',
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(
      setDoc(doc(as('alice'), 'users', 'alice', 'blocks', 'bob'), {
        blockedUid: 'carol',
        createdAt: serverTimestamp(),
      }),
    );
  });
});

describe('a block refuses contact in both directions', () => {
  // Each case is checked from both sides: blocked → blocker and blocker → blocked.
  const directions = [
    { name: 'blocked person reaching the blocker', blocker: 'alice', actor: 'bob', target: 'alice' },
    { name: 'blocker reaching the blocked person', blocker: 'alice', actor: 'alice', target: 'bob' },
  ];

  for (const d of directions) {
    describe(d.name, () => {
      beforeEach(async () => {
        await block(d.blocker, d.blocker === 'alice' ? 'bob' : 'alice');
      });

      it('cannot create a connection', async () => {
        await assertFails(
          setDoc(doc(as(d.actor), 'connections', PAIR), { userIds: ['alice', 'bob'], establishedAt: new Date() }),
        );
      });

      it('cannot send a message in an existing conversation', async () => {
        await seedConnection();
        await assertFails(
          addDoc(collection(as(d.actor), 'conversations', PAIR, 'messages'), {
            senderId: d.actor,
            text: 'hi',
            sentAt: new Date(),
          }),
        );
      });

      it('cannot send an invite, a note, or a notification', async () => {
        const db = as(d.actor);
        await assertFails(
          addDoc(collection(db, 'invites'), { fromUserId: d.actor, toUserId: d.target, status: 'pending' }),
        );
        await assertFails(
          addDoc(collection(db, 'notes'), {
            fromUserId: d.actor,
            toUserId: d.target,
            cardId: 'c1',
            text: 'hello',
            readAt: null,
          }),
        );
        await assertFails(
          addDoc(collection(db, 'notifications'), {
            userId: d.target,
            type: 'note',
            payload: { fromUserId: d.actor },
            readAt: null,
          }),
        );
      });
    });
  }

  it('control: without a block the same contact is allowed', async () => {
    await seedConnection();
    const db = as('bob');
    await assertSucceeds(
      addDoc(collection(db, 'conversations', PAIR, 'messages'), { senderId: 'bob', text: 'hi', sentAt: new Date() }),
    );
    await assertSucceeds(
      addDoc(collection(db, 'invites'), { fromUserId: 'bob', toUserId: 'carol', status: 'pending' }),
    );
    await assertSucceeds(
      addDoc(collection(db, 'notifications'), {
        userId: 'alice',
        type: 'note',
        payload: { fromUserId: 'bob' },
        readAt: null,
      }),
    );
  });

  it('does not affect third parties', async () => {
    await block('alice', 'bob');
    await assertSucceeds(
      addDoc(collection(as('carol'), 'notes'), {
        fromUserId: 'carol',
        toUserId: 'alice',
        cardId: 'c1',
        text: 'hello',
        readAt: null,
      }),
    );
  });
});

describe('ending a connection', () => {
  it('lets either participant delete it, never an outsider', async () => {
    await seedConnection();
    await assertFails(deleteDoc(doc(as('carol'), 'connections', PAIR)));
    await assertSucceeds(deleteDoc(doc(as('bob'), 'connections', PAIR)));
  });
});

describe('reports', () => {
  const valid = {
    reporterId: 'alice',
    targetType: 'card',
    targetId: 'card-1',
    targetUserId: 'bob',
    reason: 'harassment',
    detail: 'Personal attack in the second paragraph.',
    createdAt: serverTimestamp(),
    status: 'open',
  };

  it('accepts a well-formed report (with or without context)', async () => {
    await assertSucceeds(addDoc(collection(as('alice'), 'reports'), valid));
    await assertSucceeds(
      addDoc(collection(as('alice'), 'reports'), {
        ...valid,
        targetType: 'message',
        targetId: 'm1',
        contextId: PAIR,
      }),
    );
  });

  it('is write-only: nobody, including the reporter, can read reports back', async () => {
    let id = '';
    await seed(async (db) => {
      id = (await addDoc(collection(db, 'reports'), { ...valid, createdAt: new Date() })).id;
    });
    await assertFails(getDoc(doc(as('alice'), 'reports', id)));
    await assertFails(getDocs(collection(as('bob'), 'reports')));
  });

  it('refuses forged, malformed or self-directed reports', async () => {
    const db = as('alice');
    const bad = [
      { ...valid, reporterId: 'carol' },
      { ...valid, reason: 'boring' },
      { ...valid, targetType: 'tag' },
      { ...valid, targetUserId: 'alice' },
      { ...valid, detail: 'x'.repeat(1001) },
      { ...valid, status: 'resolved' },
      { ...valid, createdAt: new Date('2020-01-01') },
      { ...valid, extra: true },
    ];
    for (const data of bad) await assertFails(addDoc(collection(db, 'reports'), data));
  });
});

describe('account deletion requests', () => {
  it('are invisible and unwritable from the client', async () => {
    await assertFails(getDoc(doc(as('alice'), 'accountDeletions', 'alice')));
    await assertFails(setDoc(doc(as('alice'), 'accountDeletions', 'alice'), { purgeAfter: new Date() }));
  });
});

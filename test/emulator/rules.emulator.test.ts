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
  deleteField,
  doc,
  documentId,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  setLogLevel,
  updateDoc,
  where,
  writeBatch,
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

function anonymous(): Firestore {
  return env.unauthenticatedContext().firestore() as unknown as Firestore;
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
      unread: { alice: 0, bob: 2 },
    });
  });
}

async function seedProfiles() {
  await seed(async (db) => {
    for (const uid of ['alice', 'bob', 'carol']) {
      await setDoc(doc(db, 'users', uid), { handle: uid, handleLower: uid, bio: '', verified: false, hintsSeen: {} });
    }
  });
}

async function block(blocker: string, blocked: string) {
  await seed(async (db) => {
    await setDoc(doc(db, 'users', blocker, 'blocks', blocked), { blockedUid: blocked, createdAt: new Date() });
  });
}

/** A pending legacy invite from `from` to `to`. */
async function seedInvite(from = 'bob', to = 'alice', status = 'pending', id = 'i1') {
  await seed(async (db) => {
    await setDoc(doc(db, 'invites', id), { fromUserId: from, toUserId: to, message: 'hi', status });
  });
}

/**
 * What the web's acceptInvite wrote from the browser until the server took it
 * over (POST /api/v1/invites/{id}/accept): accept the invite, create the
 * connection (naming the invite) and ring the sender's bell, in one
 * transaction. An old tab may still try it; the rules refuse every part.
 */
function acceptInvite(db: Firestore, uid: string, opts: { inviteId?: string; other?: string; handle?: string; connect?: boolean } = {}) {
  const inviteId = opts.inviteId ?? 'i1';
  const other = opts.other ?? 'bob';
  return runTransaction(db, async (tx) => {
    const invite = doc(db, 'invites', inviteId);
    await tx.get(invite);
    tx.update(invite, { status: 'accepted' });
    if (opts.connect !== false) {
      tx.set(doc(db, 'connections', uid < other ? `${uid}_${other}` : `${other}_${uid}`), {
        userIds: [uid, other].sort(),
        establishedAt: serverTimestamp(),
        inviteId,
      });
    }
    tx.set(doc(collection(db, 'notifications')), {
      userId: other,
      type: 'invite_accepted',
      payload: { inviteId, fromUserId: uid, fromHandle: opts.handle ?? uid },
      readAt: null,
      createdAt: serverTimestamp(),
    });
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

describe('connection pair reads', () => {
  it('lets either person ask for their own pair even when it does not exist (blocking checks it)', async () => {
    await seedProfiles();
    const mine = await getDoc(doc(as('alice'), 'connections', 'alice_carol'));
    if (mine.exists()) throw new Error('no connection expected');
    await assertSucceeds(getDoc(doc(as('carol'), 'connections', 'alice_carol')));
  });

  it("refuses anyone else's pair, existing or not", async () => {
    await seedProfiles();
    await seed(async (db) => {
      await setDoc(doc(db, 'connections', 'alice_bob'), { userIds: ['alice', 'bob'], establishedAt: new Date() });
    });
    await assertFails(getDoc(doc(as('carol'), 'connections', 'alice_bob')));
    await assertFails(getDoc(doc(as('carol'), 'connections', 'alice_dora')));
    await assertSucceeds(getDoc(doc(as('bob'), 'connections', 'alice_bob')));
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
        await seedProfiles();
        await block(d.blocker, d.blocker === 'alice' ? 'bob' : 'alice');
      });

      it('cannot answer a card with a resonance draft', async () => {
        await seed(async (db) => {
          await setDoc(doc(db, 'cards', 'orig'), publishedCard(d.target));
        });
        await assertFails(setDoc(doc(collection(as(d.actor), 'cards')), draft(d.actor, { referenceCardId: 'orig' })));
      });

      // The writer keeps their own block list: a draft refused only across a
      // block would tell them who wrote the card. Answering one reaches no one
      // (the server's reach reads the blocks).
      it('can answer an anonymous card all the same, as anyone may', async () => {
        await seed(async (db) => {
          await setDoc(doc(db, 'cards', 'masked'), publishedCard(d.target, { anonymous: true }));
          await setDoc(doc(db, 'cards', 'maskedConn'), publishedCard(d.target, { anonymous: true, visibility: 'connections' }));
        });
        await assertSucceeds(setDoc(doc(collection(as(d.actor), 'cards')), draft(d.actor, { referenceCardId: 'masked' })));
        await assertSucceeds(setDoc(doc(collection(as(d.actor), 'cards')), draft(d.actor, { referenceCardId: 'masked', anonymous: true })));
        // Visibility still holds: a connections-only card needs the connection (a block ended it).
        await assertFails(setDoc(doc(collection(as(d.actor), 'cards')), draft(d.actor, { referenceCardId: 'maskedConn' })));
      });
    });
  }

  it("answers a stranger's anonymous card the same with or without a block", async () => {
    await seedProfiles();
    await seed(async (db) => {
      await setDoc(doc(db, 'cards', 'masked'), publishedCard('bob', { anonymous: true }));
      await setDoc(doc(db, 'cards', 'named'), publishedCard('bob'));
    });
    // Carol blocks one guess after another; the anonymous card answers alike for each.
    for (const guess of ['alice', 'bob']) {
      await block('carol', guess);
      await assertSucceeds(setDoc(doc(collection(as('carol'), 'cards')), draft('carol', { referenceCardId: 'masked' })));
      await seed(async (db) => {
        await deleteDoc(doc(db, 'users', 'carol', 'blocks', guess));
      });
    }
    // A named card keeps every block behaviour.
    await block('carol', 'bob');
    await assertFails(setDoc(doc(collection(as('carol'), 'cards')), draft('carol', { referenceCardId: 'named' })));
  });

  it('control: without a block the same contact is allowed', async () => {
    await seedProfiles();
    await seed(async (db) => {
      await setDoc(doc(db, 'cards', 'orig'), publishedCard('bob'));
    });
    await assertSucceeds(setDoc(doc(collection(as('alice'), 'cards')), draft('alice', { referenceCardId: 'orig' })));
  });

  it('does not affect third parties', async () => {
    await seedProfiles();
    await block('alice', 'bob');
    await seed(async (db) => {
      await setDoc(doc(db, 'cards', 'orig'), publishedCard('alice'));
    });
    await assertSucceeds(setDoc(doc(collection(as('carol'), 'cards')), draft('carol', { referenceCardId: 'orig' })));
  });
});

describe('ending a connection', () => {
  it('lets either participant delete it, never an outsider', async () => {
    await seedConnection();
    await assertFails(deleteDoc(doc(as('carol'), 'connections', PAIR)));
    await assertSucceeds(deleteDoc(doc(as('bob'), 'connections', PAIR)));
  });
});

describe('connections are made by the server only', () => {
  beforeEach(seedProfiles);

  it('refuses a stranger connecting themselves to anyone', async () => {
    await assertFails(
      setDoc(doc(as('carol'), 'connections', 'alice_carol'), { userIds: ['alice', 'carol'], establishedAt: serverTimestamp() }),
    );
  });

  it("refuses even the invite's recipient answering it from the browser — accepting is the server's now", async () => {
    await seedInvite('bob', 'alice');
    await assertFails(acceptInvite(as('alice'), 'alice'));
    // Any one part of it alone: the connection naming the invite, the invite marked accepted.
    await assertFails(acceptInvite(as('alice'), 'alice', { connect: false }));
    await assertFails(
      setDoc(doc(as('alice'), 'connections', PAIR), { userIds: ['alice', 'bob'], establishedAt: serverTimestamp(), inviteId: 'i1' }),
    );
    await assertFails(updateDoc(doc(as('alice'), 'invites', 'i1'), { status: 'accepted' }));
    const conn = await getDoc(doc(as('alice'), 'connections', PAIR)).catch(() => null);
    if (conn?.exists()) throw new Error('no connection expected');
  });

  it('refuses rewriting a connection (the unused muted flag included)', async () => {
    await seedConnection();
    await assertFails(updateDoc(doc(as('alice'), 'connections', PAIR), { muted: [{ by: 'alice' }] }));
  });
});

describe('conversations and messages are written by the server', () => {
  beforeEach(seedConnection);

  it('refuses opening a conversation or sending a message from the client', async () => {
    await assertFails(
      setDoc(doc(as('alice'), 'conversations', 'alice_carol'), {
        participants: ['alice', 'carol'], lastMessage: null, unread: { alice: 0, carol: 0 },
      }),
    );
    await assertFails(
      addDoc(collection(as('bob'), 'conversations', PAIR, 'messages'), { senderId: 'bob', text: 'hi', sentAt: serverTimestamp() }),
    );
  });

  it('lets a participant zero their own unread counter — and nothing else', async () => {
    const convo = doc(as('bob'), 'conversations', PAIR);
    // Hiding the other side's unread messages (Bob has 2).
    await assertFails(updateDoc(doc(as('alice'), 'conversations', PAIR), { 'unread.bob': 0 }));
    await assertSucceeds(updateDoc(convo, { 'unread.bob': 0 }));
    // Someone else's counter, a number other than zero, the preview, the order.
    await assertFails(updateDoc(convo, { 'unread.alice': increment(5) }));
    await assertFails(updateDoc(convo, { 'unread.bob': 7 }));
    await assertFails(updateDoc(convo, { lastMessage: { text: 'forged', senderId: 'alice', sentAt: serverTimestamp() } }));
    await assertFails(updateDoc(convo, { updatedAt: new Date('2099-01-01') }));
    await assertFails(updateDoc(doc(as('carol'), 'conversations', PAIR), { 'unread.carol': 0 }));
  });

  it('lets either participant delete the whole thread in batches', async () => {
    await seed(async (db) => {
      for (let i = 0; i < 30; i++) {
        await setDoc(doc(db, 'conversations', PAIR, 'messages', `m${i}`), { senderId: 'alice', text: `${i}`, sentAt: new Date() });
      }
    });
    const db = as('bob');
    const msgs = await getDocs(collection(db, 'conversations', PAIR, 'messages'));
    const batch = writeBatch(db);
    for (const m of msgs.docs) batch.delete(m.ref);
    await assertSucceeds(batch.commit());
    await assertSucceeds(deleteDoc(doc(db, 'conversations', PAIR)));
    await assertFails(getDocs(collection(as('carol'), 'conversations', PAIR, 'messages')));
  });
});

describe("a letter's request is the server's (POST /api/v1/notes)", () => {
  // Alice left Bob a note; they aren't connected, so it waits for his answer.
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'conversations', PAIR), {
        participants: ['alice', 'bob'],
        lastMessage: { text: 'a letter', senderId: 'alice', sentAt: new Date() },
        unread: { alice: 0, bob: 1 },
        request: { from: 'alice', cardId: 'c1', at: new Date(), count: 1 },
      });
      await setDoc(doc(db, 'conversations', PAIR, 'messages', 'n1'), { senderId: 'alice', text: 'a letter', sentAt: new Date(), cardRef: 'c1', kind: 'note' });
    });
  });

  it('refuses every client write of it — clearing, counting, forging — by either participant, and a conversation opened with one', async () => {
    for (const [uid, other] of [['alice', 'bob'], ['bob', 'alice']]) {
      const convo = doc(as(uid), 'conversations', PAIR);
      await assertFails(updateDoc(convo, { request: deleteField() }));
      await assertFails(updateDoc(convo, { 'request.count': 0 }));
      await assertFails(updateDoc(convo, { 'request.from': other }));
      await assertFails(updateDoc(convo, { request: { from: other, cardId: 'c1', at: serverTimestamp(), count: 1 } }));
      // Not even beside what a participant may change.
      await assertFails(updateDoc(convo, { [`unread.${uid}`]: 0, request: deleteField() }));
    }
    await assertFails(
      setDoc(doc(as('carol'), 'conversations', 'bob_carol'), {
        participants: ['bob', 'carol'], lastMessage: null, unread: { bob: 0, carol: 0 },
        request: { from: 'carol', cardId: 'c1', at: serverTimestamp(), count: 1 },
      }),
    );
    // Zeroing your own unread still works beside it.
    await assertSucceeds(updateDoc(doc(as('bob'), 'conversations', PAIR), { 'unread.bob': 0 }));
  });

  // The count that holds a writer to three notes lives in letters/*, where a
  // deleted thread can't reach it: so either may delete the thread again.
  for (const [who, what] of [['alice', 'withdraws it'], ['bob', 'declines it']] as const) {
    it(`lets either participant delete a thread holding a letter: ${who} ${what}, messages and all`, async () => {
      const db = as(who);
      await assertSucceeds(deleteDoc(doc(db, 'conversations', PAIR, 'messages', 'n1')));
      await assertSucceeds(deleteDoc(doc(db, 'conversations', PAIR)));
    });
  }

  it('keeps a thread from everyone else', async () => {
    await assertFails(deleteDoc(doc(as('carol'), 'conversations', PAIR, 'messages', 'n1')));
    await assertFails(deleteDoc(doc(as('carol'), 'conversations', PAIR)));
  });
});

describe("letters/* (how many notes someone has left unanswered) are the server's alone", () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'letters', 'alice_bob'), { from: 'alice', to: 'bob', count: 3, cardId: 'c1', at: new Date() });
    });
  });

  it('no one reads, lists, resets, forges or deletes one — neither its writer nor the one it counts notes to', async () => {
    for (const uid of ['alice', 'bob', 'carol']) {
      const db = as(uid);
      await assertFails(getDoc(doc(db, 'letters', 'alice_bob')));
      await assertFails(getDocs(query(collection(db, 'letters'), where('from', '==', 'alice'))));
      await assertFails(getDocs(query(collection(db, 'letters'), where('to', '==', uid))));
      await assertFails(updateDoc(doc(db, 'letters', 'alice_bob'), { count: 0 }));
      await assertFails(deleteDoc(doc(db, 'letters', 'alice_bob')));
      await assertFails(setDoc(doc(db, 'letters', `${uid}_carol`), { from: uid, to: 'carol', count: 0 }));
    }
  });
});

describe('notifications', () => {
  beforeEach(seedProfiles);

  it('refuses every bell the server writes (resonance, note, message, card link, invite)', async () => {
    await seedConnection();
    const db = as('bob');
    for (const type of ['resonance', 'note', 'message', 'card_link', 'invite', 'resonance_summary']) {
      await assertFails(
        addDoc(collection(db, 'notifications'), {
          userId: 'alice',
          type,
          payload: { fromUserId: 'bob', fromHandle: 'bob', cardId: 'c1' },
          readAt: null,
          createdAt: serverTimestamp(),
        }),
      );
    }
  });

  it('refuses "invite accepted" too — the server rings it when it accepts the invite', async () => {
    await seedInvite('bob', 'alice');
    // Alone, and inside a transaction that really accepts that invite, with the real pen name.
    await assertFails(
      addDoc(collection(as('alice'), 'notifications'), {
        userId: 'bob',
        type: 'invite_accepted',
        payload: { inviteId: 'i1', fromUserId: 'alice', fromHandle: 'alice' },
        readAt: null,
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(acceptInvite(as('alice'), 'alice'));
  });

  it('lets only the recipient read their bell and mark it read', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'notifications', 'n1'), {
        userId: 'alice', type: 'note', payload: { fromUserId: 'bob', fromHandle: 'bob' }, readAt: null, createdAt: new Date(),
      });
    });
    await assertSucceeds(getDoc(doc(as('alice'), 'notifications', 'n1')));
    await assertFails(getDoc(doc(as('bob'), 'notifications', 'n1')));
    await assertFails(updateDoc(doc(as('bob'), 'notifications', 'n1'), { readAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('alice'), 'notifications', 'n1'), { 'payload.fromHandle': 'x' }));
    // Read now — not a date of one's choosing, nor anything else in its place.
    await assertFails(updateDoc(doc(as('alice'), 'notifications', 'n1'), { readAt: new Date('2099-01-01') }));
    await assertFails(updateDoc(doc(as('alice'), 'notifications', 'n1'), { readAt: 'x'.repeat(5000) }));
    await assertSucceeds(updateDoc(doc(as('alice'), 'notifications', 'n1'), { readAt: serverTimestamp() }));
  });
});

describe('profiles (users/{uid})', () => {
  beforeEach(seedProfiles);

  it('are created by the server only — never with a self-asserted pen name or badge', async () => {
    await assertFails(
      setDoc(doc(as('dave'), 'users', 'dave'), { handle: 'dave', handleLower: 'dave', phoneHash: '', verified: true }),
    );
    await assertFails(
      setDoc(doc(as('dave'), 'users', 'dave'), { handle: 'dave', handleLower: 'dave', phoneHash: '' }),
    );
  });

  it('keep the pen name and the badge out of the client\'s reach', async () => {
    const me = doc(as('alice'), 'users', 'alice');
    await assertFails(updateDoc(me, { handle: 'bob', handleLower: 'bob' }));
    await assertFails(updateDoc(me, { handleLower: 'bob' }));
    await assertFails(updateDoc(me, { handleChangedAt: serverTimestamp() }));
    await assertFails(updateDoc(me, { verified: true }));
  });

  it('let the owner edit the fields that name no one else, within limits', async () => {
    const me = doc(as('alice'), 'users', 'alice');
    await assertSucceeds(updateDoc(me, { bio: 'hello', region: 'TW', primaryLocale: 'en', autoTranslateTo: ['zh-TW'] }));
    await assertSucceeds(updateDoc(me, { avatarUrl: 'https://img.example/a.avif' }));
    // The web's syncHintCount and the apps' HintService: a dotted count.
    await assertSucceeds(updateDoc(me, { 'hintsSeen.editor': 2 }));
    await assertFails(updateDoc(me, { bio: 'x'.repeat(81) }));
    await assertFails(updateDoc(me, { primaryLocale: 'fr' }));
    await assertFails(updateDoc(me, { avatarUrl: 'javascript:alert(1)' }));
    await assertFails(updateDoc(doc(as('bob'), 'users', 'alice'), { bio: 'not mine' }));
  });

  it("hold the fields everyone downloads to their size: a hint's count, the translation languages", async () => {
    const me = doc(as('alice'), 'users', 'alice');
    await assertFails(updateDoc(me, { 'hintsSeen.editor': 'x'.repeat(100_000) }));
    await assertFails(updateDoc(me, { 'hintsSeen.editor': { nested: true } }));
    await assertFails(updateDoc(me, { 'hintsSeen.editor': 9999 }));
    await assertFails(updateDoc(me, { autoTranslateTo: ['x'.repeat(10_000)] }));
    await assertFails(updateDoc(me, { autoTranslateTo: ['en', 'fr'] }));
  });

  it('take an avatar only from our own storage once its host is configured', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'config', 'storage'), { host: 'img.resonance.test' });
    });
    const me = doc(as('alice'), 'users', 'alice');
    await assertSucceeds(updateDoc(me, { avatarUrl: 'https://img.resonance.test/image/2026-10/a.webp' }));
    // A tracking pixel elsewhere, or a host that only starts like ours.
    await assertFails(updateDoc(me, { avatarUrl: 'https://tracker.example/p.gif' }));
    await assertFails(updateDoc(me, { avatarUrl: 'https://img.resonance.test.evil.example/p.gif' }));
  });

  it('take an avatar from a former storage host during a move — and from no third host', async () => {
    const me = doc(as('alice'), 'users', 'alice');
    // Without formerHosts (as before any move), the old host is not ours.
    await seed(async (db) => {
      await setDoc(doc(db, 'config', 'storage'), { host: 'img.resonance.test' });
    });
    await assertFails(updateDoc(me, { avatarUrl: 'https://pub-0123.r2.dev/image/2026-09/a.webp' }));

    await seed(async (db) => {
      await setDoc(doc(db, 'config', 'storage'), { host: 'img.resonance.test', formerHosts: ['pub-0123.r2.dev'] });
    });
    await assertSucceeds(updateDoc(me, { avatarUrl: 'https://img.resonance.test/image/2026-10/a.webp' }));
    await assertSucceeds(updateDoc(me, { avatarUrl: 'https://pub-0123.r2.dev/image/2026-09/a.webp' }));
    await assertFails(updateDoc(me, { avatarUrl: 'https://tracker.example/p.gif' }));
    await assertFails(updateDoc(me, { avatarUrl: 'https://pub-0123.r2.dev.evil.example/p.gif' }));
  });

  it('stay readable by anyone, signed in or not — a page at a time, never the whole directory', async () => {
    await assertSucceeds(getDoc(doc(anonymous(), 'users', 'alice')));
    await assertSucceeds(getDocs(query(collection(anonymous(), 'users'), where('handleLower', '==', 'alice'), limit(1))));
    // Bylines by id, 30 at most (getUsersByIds).
    await assertSucceeds(getDocs(query(collection(anonymous(), 'users'), where(documentId(), 'in', ['alice', 'bob']), limit(2))));
    await assertFails(getDocs(collection(anonymous(), 'users')));
    await assertFails(getDocs(query(collection(as('carol'), 'users'), where(documentId(), 'in', ['alice', 'bob']))));
    await assertFails(getDocs(query(collection(as('carol'), 'users'), limit(31))));
  });
});

describe('pen-name reservations (handles/{name})', () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'handles', 'alice'), { uid: 'alice', handle: 'Alice' });
    });
  });

  it('can be looked up by anyone, one name at a time', async () => {
    await assertSucceeds(getDoc(doc(anonymous(), 'handles', 'alice')));
    await assertSucceeds(getDoc(doc(as('carol'), 'handles', 'nobody-yet')));
    await assertFails(getDocs(collection(as('carol'), 'handles')));
  });

  it('are written by the server alone — no one takes, moves or frees a name from the client', async () => {
    await assertFails(setDoc(doc(as('carol'), 'handles', 'carol'), { uid: 'carol', handle: 'carol' }));
    await assertFails(setDoc(doc(as('carol'), 'handles', 'alice'), { uid: 'carol', handle: 'alice' }));
    await assertFails(updateDoc(doc(as('alice'), 'handles', 'alice'), { handle: 'ALICE' }));
    await assertFails(deleteDoc(doc(as('alice'), 'handles', 'alice')));
  });
});

// Card fixtures. A draft as the web, iOS and Android create it.
function draft(authorId: string, extra: Record<string, unknown> = {}) {
  return {
    authorId, thoughtCore: 'A title', story: 'A story', tags: ['one'], visibility: 'public', anonymous: false,
    originalLocale: 'zh-TW', translations: {}, publishedAt: null, readCount: 0, resonanceCount: 0, inviteCount: 0,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra,
  };
}

function publishedCard(authorId: string, extra: Record<string, unknown> = {}) {
  return {
    authorId, thoughtCore: 't', story: 's', tags: [], readCount: 0, resonanceCount: 0, inviteCount: 0,
    visibility: 'public', anonymous: false, publishedAt: new Date('2026-09-01T08:00:00Z'), slug: 'a-title', ...extra,
  };
}

describe('cards: what the author may write', () => {
  it('creates a draft exactly as the web and the apps do', async () => {
    const db = as('alice');
    await assertSucceeds(setDoc(doc(collection(db, 'cards')), draft('alice')));
    // iOS/Android: a cover with its hue, no counters beyond zero.
    await assertSucceeds(
      setDoc(doc(collection(db, 'cards')), draft('alice', {
        media: { type: 'image', url: 'https://img.example/c.avif', label: 'IMG_0001.jpeg' },
        accentHue: 55,
      })),
    );
  });

  it('refuses a draft that is already published, slugged, someone else\'s, back-dated or counted', async () => {
    const db = as('alice');
    const bad = [
      draft('alice', { publishedAt: new Date('2099-01-01') }),
      draft('alice', { publishedAt: serverTimestamp() }),
      draft('alice', { slug: 'someone-elses-story' }),
      draft('bob'),
      draft('alice', { createdAt: new Date('2020-01-01') }),
      draft('alice', { readCount: 5 }),
      draft('alice', { resonanceCount: 1 }),
      draft('alice', { verified: true }),
      draft('alice', { visibility: 'everyone' }),
      draft('alice', { translations: { en: { thoughtCore: 'x', story: 'y' } } }),
      draft('alice', { media: { type: 'image', url: 'javascript:alert(1)' } }),
      // Sizes: everyone who reads the card downloads all of it.
      draft('alice', { thoughtCore: 'x'.repeat(201) }),
      draft('alice', { story: 'x'.repeat(200_001) }),
      draft('alice', { tags: Array.from({ length: 31 }, (_, i) => `t${i}`) }),
      draft('alice', { tags: ['x'.repeat(1001)] }),
      draft('alice', { tags: [{ not: 'a tag' }] }),
      draft('alice', { media: { type: 'image', url: 'https://img.example/c.avif', label: 'x'.repeat(201) } }),
      draft('alice', { accentHue: 9999 }),
      draft('alice', { updatedAt: new Date('2099-01-01') }),
    ];
    for (const data of bad) await assertFails(setDoc(doc(collection(db, 'cards')), data));
  });

  it('counts a title as JavaScript does (UTF-16 units, not bytes): 200 Chinese characters fit, 101 emoji do not', async () => {
    const db = as('alice');
    await assertSucceeds(setDoc(doc(collection(db, 'cards')), draft('alice', { thoughtCore: '共'.repeat(200) })));
    await assertSucceeds(setDoc(doc(collection(db, 'cards')), draft('alice', { thoughtCore: '😀'.repeat(100) })));
    await assertFails(setDoc(doc(collection(db, 'cards')), draft('alice', { thoughtCore: '😀'.repeat(101) })));
    await assertFails(setDoc(doc(collection(db, 'cards')), draft('alice', { thoughtCore: '共'.repeat(201) })));
  });

  it("takes a cover only from our own storage once its host is configured — and leaves an older card's alone", async () => {
    const ID = 'bbbbbbbbbbbbbbbbbbbb';
    await seed(async (db) => {
      await setDoc(doc(db, 'config', 'storage'), { host: 'img.resonance.test' });
      await setDoc(doc(db, 'cards', ID), {
        ...draft('alice'), createdAt: new Date(), updatedAt: new Date(),
        media: { type: 'image', url: 'https://legacy.example/old.jpg', label: 'old' },
      });
    });
    const db = as('alice');
    await assertSucceeds(setDoc(doc(collection(db, 'cards')), draft('alice', { media: { type: 'image', url: 'https://img.resonance.test/image/2026-10/c.webp', label: 'c' } })));
    await assertFails(setDoc(doc(collection(db, 'cards')), draft('alice', { media: { type: 'image', url: 'https://tracker.example/p.gif', label: 'p' } })));
    // Its legacy cover unchanged, the card stays editable; a new cover must be ours.
    await assertSucceeds(setDoc(doc(db, 'cards', ID), { thoughtCore: 'Edited', updatedAt: serverTimestamp() }, { merge: true }));
    await assertFails(setDoc(doc(db, 'cards', ID), { media: { type: 'image', url: 'https://tracker.example/p.gif' }, updatedAt: serverTimestamp() }, { merge: true }));
  });

  it('takes a cover from a former storage host during a move, in a draft and in a pending edit — and from no third host', async () => {
    const ID = 'cccccccccccccccccccc';
    const FORMER = 'https://pub-0123.r2.dev/image/2026-09/c.webp';
    const cover = (url: string) => ({ type: 'image', url, label: 'c' });
    await seed(async (db) => {
      await setDoc(doc(db, 'config', 'storage'), { host: 'img.resonance.test', formerHosts: ['pub-0123.r2.dev', 'old.example'] });
      await setDoc(doc(db, 'cards', ID), publishedCard('alice', { media: cover(FORMER) }));
    });
    const db = as('alice');
    await assertSucceeds(setDoc(doc(collection(db, 'cards')), draft('alice', { media: cover('https://img.resonance.test/image/2026-10/c.webp') })));
    await assertSucceeds(setDoc(doc(collection(db, 'cards')), draft('alice', { media: cover(FORMER) })));
    await assertFails(setDoc(doc(collection(db, 'cards')), draft('alice', { media: cover('https://tracker.example/p.gif') })));
    // A pending edit of a published card, its cover still on the old host (autosaved as a whole copy).
    const edit = doc(db, 'cards', ID, 'edits', 'current');
    const working = { thoughtCore: 'Revised', story: 'Still writing', tags: ['a'], visibility: 'public', anonymous: false, updatedAt: serverTimestamp() };
    await assertSucceeds(setDoc(edit, { ...working, media: cover(FORMER) }));
    await assertFails(setDoc(edit, { ...working, media: cover('https://tracker.example/p.gif') }));
  });

  it('refuses a hand-picked document id (slugs and ids share the card URL)', async () => {
    await assertFails(setDoc(doc(as('alice'), 'cards', 'my-story'), draft('alice')));
    await assertFails(setDoc(doc(as('alice'), 'cards', '!aaaaaaaaaaaaaaaaaaa'), draft('alice')));
  });

  it('lets a resonance answer only a card its author can read', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'cards', 'pub'), publishedCard('bob'));
      await setDoc(doc(db, 'cards', 'priv'), publishedCard('bob', { visibility: 'private' }));
      await setDoc(doc(db, 'cards', 'bobdraft'), publishedCard('bob', { publishedAt: null }));
    });
    const db = as('alice');
    await assertSucceeds(setDoc(doc(collection(db, 'cards')), draft('alice', { referenceCardId: 'pub' })));
    await assertFails(setDoc(doc(collection(db, 'cards')), draft('alice', { referenceCardId: 'priv' })));
    await assertFails(setDoc(doc(collection(db, 'cards')), draft('alice', { referenceCardId: 'bobdraft' })));
    await assertFails(setDoc(doc(collection(db, 'cards')), draft('alice', { referenceCardId: 'missing' })));
  });

  describe('updates', () => {
    const ID = 'aaaaaaaaaaaaaaaaaaaa';
    beforeEach(async () => {
      await seed(async (db) => {
        await setDoc(doc(db, 'cards', ID), { ...publishedCard('alice', { referenceCardId: 'orig', readCount: 3 }), accentHue: null });
        await setDoc(doc(db, 'cards', 'draft1'), publishedCard('alice', { publishedAt: null, slug: null }));
        await setDoc(doc(db, 'cards', 'plain'), publishedCard('alice'));
      });
    });

    it('lets the author edit the content, as the web and the apps write it', async () => {
      const db = as('alice');
      const ref = doc(db, 'cards', 'draft1');
      // Web updateCardDraft / iOS / Android update: merge with a server stamp.
      await assertSucceeds(setDoc(ref, { thoughtCore: 'New', story: 'Longer', tags: ['a', 'b'], visibility: 'private', anonymous: true, updatedAt: serverTimestamp() }, { merge: true }));
      await assertSucceeds(setDoc(ref, { media: { type: 'image', url: 'https://img.example/x.avif', label: 'x' }, accentHue: 120, updatedAt: serverTimestamp() }, { merge: true }));
      // A removed cover: media deleted, hue nulled.
      await assertSucceeds(setDoc(ref, { media: deleteField(), accentHue: null, updatedAt: serverTimestamp() }, { merge: true }));
      // The card box's 轉為公開／私人 and applying a pending edit on a published card (older builds).
      await assertSucceeds(setDoc(doc(db, 'cards', 'plain'), { visibility: 'private', updatedAt: serverTimestamp() }, { merge: true }));
      await assertSucceeds(setDoc(doc(db, 'cards', ID), { thoughtCore: 'Edited', story: 'Edited', updatedAt: serverTimestamp() }, { merge: true }));
    });

    // A published resonance may be why two people are connected: hiding or
    // deleting it takes that back, and only the server does (PATCH / DELETE
    // /api/v1/cards/{id}, edits/apply). A client doing it would keep the
    // connection with nothing left standing under the original.
    it("leaves a published resonance's byline, visibility and deletion to the server", async () => {
      await seed(async (db) => {
        await setDoc(doc(db, 'cards', 'draftAnswer'), publishedCard('alice', { publishedAt: null, slug: null, referenceCardId: 'orig' }));
      });
      const db = as('alice');
      const answer = doc(db, 'cards', ID);
      await assertFails(updateDoc(answer, { visibility: 'private', updatedAt: serverTimestamp() }));
      await assertFails(updateDoc(answer, { visibility: 'connections', updatedAt: serverTimestamp() }));
      await assertFails(updateDoc(answer, { anonymous: true, updatedAt: serverTimestamp() }));
      await assertFails(deleteDoc(answer));
      // Its words stay the author's; the editors write the two back unchanged.
      await assertSucceeds(setDoc(answer, { story: 'Edited', visibility: 'public', anonymous: false, updatedAt: serverTimestamp() }, { merge: true }));
      // A draft answer never reached anyone, and a card answering nothing is no reason for anything.
      await assertSucceeds(updateDoc(doc(db, 'cards', 'draftAnswer'), { visibility: 'private', anonymous: true, updatedAt: serverTimestamp() }));
      await assertSucceeds(deleteDoc(doc(db, 'cards', 'draftAnswer')));
      await assertSucceeds(updateDoc(doc(db, 'cards', 'plain'), { anonymous: true, updatedAt: serverTimestamp() }));
      await assertFails(deleteDoc(doc(as('bob'), 'cards', 'draft1')));
    });

    // Deleting a published card deletes the notes left on it, which only the
    // server reaches (DELETE /api/v1/cards/{id}, which the web and both apps
    // call): a client delete would leave them in their writers' backups until
    // the author's account goes — and their going then would say whose card it was.
    it('lets the author delete a draft, never a published card: that is the server\'s', async () => {
      await seed(async (db) => {
        await setDoc(doc(db, 'cards', 'masked'), publishedCard('alice', { anonymous: true }));
        await setDoc(doc(db, 'cards', 'unlisted'), publishedCard('alice', { visibility: 'private' }));
      });
      const db = as('alice');
      for (const id of ['plain', 'masked', 'unlisted', ID]) await assertFails(deleteDoc(doc(db, 'cards', id)));
      await assertFails(deleteDoc(doc(as('bob'), 'cards', 'draft1')));
      await assertSucceeds(deleteDoc(doc(db, 'cards', 'draft1')));
    });

    it('never lets the client publish, re-date, re-slug, re-attribute or re-point a card', async () => {
      const db = as('alice');
      await assertFails(updateDoc(doc(db, 'cards', 'draft1'), { publishedAt: serverTimestamp() }));
      await assertFails(updateDoc(doc(db, 'cards', ID), { publishedAt: new Date('2099-01-01') }));
      await assertFails(updateDoc(doc(db, 'cards', ID), { publishedAt: 'zzz' }));
      await assertFails(updateDoc(doc(db, 'cards', ID), { publishedAt: null }));
      await assertFails(updateDoc(doc(db, 'cards', ID), { slug: 'someone-elses-story' }));
      await assertFails(updateDoc(doc(db, 'cards', ID), { authorId: 'bob' }));
      await assertFails(updateDoc(doc(db, 'cards', ID), { referenceCardId: 'other' }));
      await assertFails(updateDoc(doc(db, 'cards', ID), { readCount: 99 }));
      await assertFails(updateDoc(doc(db, 'cards', ID), { translations: { en: {} } }));
      await assertFails(updateDoc(doc(db, 'cards', ID), { visibility: 'everyone' }));
      await assertFails(updateDoc(doc(db, 'cards', ID), { media: { type: 'image', url: 'http://tracker.example/p.gif' } }));
      await assertFails(updateDoc(doc(as('bob'), 'cards', ID), { thoughtCore: 'not mine' }));
    });

    it("keeps a card's link previews the server's: the author edits around them, never writes them", async () => {
      const previews = { linkPreviews: [{ url: 'https://example.com/a', title: 'A' }], linkPreviewsFor: ['https://example.com/a'] };
      await seed(async (db) => {
        await updateDoc(doc(db, 'cards', ID), previews);
      });
      const db = as('alice');
      const ref = doc(db, 'cards', ID);
      // The editors' merge writes leave a server-only field alone, so they keep working on a card holding one.
      await assertSucceeds(setDoc(ref, { thoughtCore: 'Edited', story: 'https://example.com/b', updatedAt: serverTimestamp() }, { merge: true }));
      await assertSucceeds(getDoc(ref));
      // But no client can forge, change or remove them.
      await assertFails(updateDoc(ref, { linkPreviews: [{ url: 'https://evil.example/', title: 'Trust me', image: '/api/link-image?u=x&s=y' }] }));
      await assertFails(updateDoc(ref, { linkPreviewsFor: [] }));
      await assertFails(updateDoc(ref, { linkPreviews: deleteField() }));
      await assertFails(setDoc(doc(collection(db, 'cards')), draft('alice', previews)));
      await assertFails(setDoc(doc(collection(db, 'cards')), draft('alice', { linkPreviews: [] })));
    });

    it('keeps the pending-edit buffer owner-only', async () => {
      await assertSucceeds(setDoc(doc(as('alice'), 'cards', ID, 'edits', 'current'), { thoughtCore: 'wip', updatedAt: serverTimestamp() }));
      await assertFails(getDoc(doc(as('bob'), 'cards', ID, 'edits', 'current')));
      await assertFails(setDoc(doc(as('bob'), 'cards', ID, 'edits', 'current'), { thoughtCore: 'x' }));
    });

    // The whole working copy, as each client writes it (a full replace).
    const working = {
      thoughtCore: 'Revised', story: 'Still writing', tags: ['a'], visibility: 'public', anonymous: false,
      media: { type: 'image', url: 'https://img.example/x.avif', label: '' }, updatedAt: serverTimestamp(),
    };

    it("takes a working copy as the web (naming its author) and the apps (an older build: no author, a null hue) write it", async () => {
      const ref = doc(as('alice'), 'cards', ID, 'edits', 'current');
      await assertSucceeds(setDoc(ref, { ...working, accentHue: 55, authorId: 'alice' }));
      await assertSucceeds(setDoc(ref, { ...working, accentHue: null }));
    });

    it("holds a working copy to a card's own fields and limits", async () => {
      const ref = doc(as('alice'), 'cards', ID, 'edits', 'current');
      const bad = [
        { ...working, publishedAt: serverTimestamp() },
        { ...working, slug: 'elsewhere' },
        { ...working, authorId: 'bob' },
        { ...working, story: 'x'.repeat(200_001) },
        { ...working, tags: ['x'.repeat(1001)] },
        { ...working, visibility: 'everyone' },
        { ...working, media: { type: 'image', url: 'http://tracker.example/p.gif' } },
        { ...working, updatedAt: new Date('2099-01-01') },
      ];
      for (const data of bad) await assertFails(setDoc(ref, data));
      await assertFails(setDoc(doc(as('alice'), 'cards', ID, 'edits', 'other'), working));
    });

    // An anonymous card is public or private: one for connections only would
    // vanish for a reader who blocked its author (blocking ends the
    // connection), naming them.
    describe('anonymous and for connections only', () => {
      const OLD = 'oooooooooooooooooooo';
      beforeEach(async () => {
        await seed(async (db) => {
          await setDoc(doc(db, 'cards', 'anonPub'), publishedCard('alice', { anonymous: true }));
          await setDoc(doc(db, 'cards', 'namedConn'), publishedCard('alice', { visibility: 'connections' }));
          // From before the rule: left as it is.
          await setDoc(doc(db, 'cards', OLD), publishedCard('alice', { anonymous: true, visibility: 'connections' }));
        });
      });

      it('is no new draft', async () => {
        const db = as('alice');
        await assertFails(setDoc(doc(collection(db, 'cards')), draft('alice', { anonymous: true, visibility: 'connections' })));
        await assertSucceeds(setDoc(doc(collection(db, 'cards')), draft('alice', { anonymous: true, visibility: 'public' })));
        await assertSucceeds(setDoc(doc(collection(db, 'cards')), draft('alice', { anonymous: true, visibility: 'private' })));
        await assertSucceeds(setDoc(doc(collection(db, 'cards')), draft('alice', { anonymous: false, visibility: 'connections' })));
      });

      it('is what no update makes a card — by its byline, its visibility or both', async () => {
        const db = as('alice');
        await assertFails(updateDoc(doc(db, 'cards', 'anonPub'), { visibility: 'connections', updatedAt: serverTimestamp() }));
        await assertFails(updateDoc(doc(db, 'cards', 'namedConn'), { anonymous: true, updatedAt: serverTimestamp() }));
        await assertFails(updateDoc(doc(db, 'cards', ID), { anonymous: true, visibility: 'connections', updatedAt: serverTimestamp() }));
        // The other way round, and anything else, as before.
        await assertSucceeds(updateDoc(doc(db, 'cards', 'anonPub'), { visibility: 'private', updatedAt: serverTimestamp() }));
        await assertSucceeds(updateDoc(doc(db, 'cards', 'namedConn'), { story: 'more', updatedAt: serverTimestamp() }));
      });

      // The app builds before letters (iOS ≤ 6, Android ≤ 7) can't pick
      // "connections" but keep a web draft's, and save their anonymous switch
      // beside it. Refused, that save failed silently and the draft was
      // published under its author's name; saved, publishing refuses it in
      // words the app shows (apiV1PreLetter.emulator.test.ts).
      it("may be an unpublished draft's, which its author alone reads — and is still what nothing published becomes", async () => {
        const DRAFT = 'dddddddddddddddddddd';
        await seed(async (db) => {
          await setDoc(doc(db, 'cards', DRAFT), draft('alice', { visibility: 'connections' }));
          await setDoc(doc(db, 'cards', 'anonDraft'), draft('alice', { anonymous: true }));
        });
        await seedConnection();
        const db = as('alice');
        const ref = doc(db, 'cards', DRAFT);
        // The old apps' draft save (iOS DraftService.update, Android's twin): every field as it is, merged, stamped.
        await assertSucceeds(setDoc(ref, {
          thoughtCore: 'A title', story: 'A story', tags: ['one'], visibility: 'connections', anonymous: true,
          media: deleteField(), accentHue: null, updatedAt: serverTimestamp(),
        }, { merge: true }));
        await assertSucceeds(updateDoc(doc(db, 'cards', 'anonDraft'), { visibility: 'connections', updatedAt: serverTimestamp() }));
        await assertSucceeds(getDoc(ref));
        // No one else reads or answers a draft — Bob, connected to her, no more than anyone.
        await assertFails(getDoc(doc(as('bob'), 'cards', DRAFT)));
        await assertFails(setDoc(doc(collection(as('bob'), 'cards')), draft('bob', { referenceCardId: DRAFT })));
        // No client publishes it; its author takes it out again either way.
        await assertFails(updateDoc(ref, { publishedAt: serverTimestamp() }));
        await assertSucceeds(updateDoc(ref, { visibility: 'private', updatedAt: serverTimestamp() }));
        // A published card still never becomes one, by its own update or its pending edit (the old apps' path).
        await assertFails(updateDoc(doc(db, 'cards', 'namedConn'), { anonymous: true, updatedAt: serverTimestamp() }));
        await assertFails(setDoc(doc(db, 'cards', 'namedConn', 'edits', 'current'), {
          thoughtCore: 'Revised', story: 'Still writing', tags: ['a'], visibility: 'connections', anonymous: true, updatedAt: serverTimestamp(),
        }));
      });

      it('keeps an older card that already is editable in everything else, and lets it out either way', async () => {
        const db = as('alice');
        const old = doc(db, 'cards', OLD);
        await assertSucceeds(setDoc(old, { thoughtCore: 'Edited', story: 'Edited', updatedAt: serverTimestamp() }, { merge: true }));
        // The editors write the two fields back as they are: no change.
        await assertSucceeds(setDoc(old, { visibility: 'connections', anonymous: true, story: 'Again', updatedAt: serverTimestamp() }, { merge: true }));
        await assertSucceeds(updateDoc(old, { visibility: 'public', updatedAt: serverTimestamp() }));
        await assertFails(updateDoc(old, { visibility: 'connections', updatedAt: serverTimestamp() }));
      });

      it('keeps an older one its author\'s alone: no one answers it, connected to them or not', async () => {
        await seedConnection();
        // Bob is connected to Alice: her named card for connections he may answer, the anonymous one he may not.
        await assertSucceeds(setDoc(doc(collection(as('bob'), 'cards')), draft('bob', { referenceCardId: 'namedConn' })));
        await assertFails(setDoc(doc(collection(as('bob'), 'cards')), draft('bob', { referenceCardId: OLD })));
        await assertFails(setDoc(doc(collection(as('carol'), 'cards')), draft('carol', { referenceCardId: OLD })));
        await assertSucceeds(setDoc(doc(collection(as('alice'), 'cards')), draft('alice', { referenceCardId: OLD })));
      });

      it("is no pending edit's outcome — unless the card already is, and the edit keeps it", async () => {
        const db = as('alice');
        const edit = (id: string) => doc(db, 'cards', id, 'edits', 'current');
        const copy = { thoughtCore: 'Revised', story: 'Still writing', tags: ['a'], updatedAt: serverTimestamp() };
        await assertFails(setDoc(edit('anonPub'), { ...copy, visibility: 'connections', anonymous: true }));
        await assertFails(setDoc(edit('namedConn'), { ...copy, visibility: 'connections', anonymous: true }));
        // No visibility in the copy: applying it keeps the card's (connections).
        await assertFails(setDoc(edit('namedConn'), { ...copy, anonymous: true }));
        await assertSucceeds(setDoc(edit('namedConn'), { ...copy, visibility: 'connections', anonymous: false }));
        await assertSucceeds(setDoc(edit('anonPub'), { ...copy, visibility: 'private', anonymous: true }));
        await assertSucceeds(setDoc(edit(OLD), { ...copy, visibility: 'connections', anonymous: true }));
        await assertSucceeds(setDoc(edit(OLD), { ...copy, anonymous: true }));
      });
    });

    it("lets its author clear a working copy whose card is gone, when it names them", async () => {
      await seed(async (db) => {
        await setDoc(doc(db, 'cards', 'gone', 'edits', 'current'), { thoughtCore: 'orphan', authorId: 'alice' });
        await setDoc(doc(db, 'cards', 'gone2', 'edits', 'current'), { thoughtCore: 'orphan' });
      });
      await assertFails(deleteDoc(doc(as('bob'), 'cards', 'gone', 'edits', 'current')));
      await assertSucceeds(deleteDoc(doc(as('alice'), 'cards', 'gone', 'edits', 'current')));
      // Unnamed, it is the purge's and the cleanup script's.
      await assertFails(deleteDoc(doc(as('alice'), 'cards', 'gone2', 'edits', 'current')));
    });
  });
});

describe('closed legacy write paths', () => {
  beforeEach(seedProfiles);

  it('refuses client-written notes (the server sends them)', async () => {
    await assertFails(
      addDoc(collection(as('carol'), 'notes'), { fromUserId: 'carol', toUserId: 'alice', cardId: 'c1', text: 'hello', readAt: null }),
    );
  });

  it('lets a note\'s recipient read it and mark it read, and nothing else', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'notes', 'n1'), { fromUserId: 'carol', toUserId: 'alice', cardId: 'c1', text: 'hi', readAt: null, createdAt: new Date() });
    });
    await assertSucceeds(getDoc(doc(as('alice'), 'notes', 'n1')));
    await assertSucceeds(getDocs(query(collection(as('alice'), 'notes'), where('toUserId', '==', 'alice'))));
    // Its sender never reads it back: a note to an anonymous card names the author it went to.
    await assertFails(getDoc(doc(as('carol'), 'notes', 'n1')));
    await assertFails(getDocs(query(collection(as('carol'), 'notes'), where('fromUserId', '==', 'carol'))));
    await assertFails(getDoc(doc(as('bob'), 'notes', 'n1')));
    await assertFails(updateDoc(doc(as('alice'), 'notes', 'n1'), { text: 'rewritten' }));
    await assertSucceeds(updateDoc(doc(as('alice'), 'notes', 'n1'), { readAt: serverTimestamp() }));
  });

  it("keeps card links to the server: they name both cards' authors, an anonymous card's too", async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'cards', 'mine'), publishedCard('carol'));
      await setDoc(doc(db, 'cards', 'target'), publishedCard('alice', { anonymous: true }));
      await setDoc(doc(db, 'cardLinks', 'old_target'), {
        sourceCardId: 'old', sourceAuthorId: 'carol', targetCardId: 'target', targetAuthorId: 'alice', createdAt: new Date(),
      });
    });
    await assertFails(
      setDoc(doc(as('carol'), 'cardLinks', 'mine_target'), {
        sourceCardId: 'mine', sourceAuthorId: 'carol', targetCardId: 'target', targetAuthorId: 'bob', createdAt: serverTimestamp(),
      }),
    );
    // Listing the links into a card (or into someone's cards) would name its anonymous author.
    await assertFails(getDocs(query(collection(anonymous(), 'cardLinks'), where('targetCardId', '==', 'target'))));
    await assertFails(getDocs(query(collection(as('bob'), 'cardLinks'), where('targetAuthorId', '==', 'alice'))));
    await assertFails(getDoc(doc(as('alice'), 'cardLinks', 'old_target')));
    await assertFails(deleteDoc(doc(as('carol'), 'cardLinks', 'old_target')));
  });

  it('refuses writing resonance records, quotas and rate limits', async () => {
    await assertFails(setDoc(doc(as('alice'), 'resonances', 'c1_alice'), { cardId: 'c1', userId: 'alice' }));
    await assertFails(setDoc(doc(as('alice'), 'quotas', 'alice_2026-09-30'), { userId: 'alice', inviteCount: 0 }));
    await assertFails(getDoc(doc(as('alice'), 'rateLimits', 'alice_notes')));
    await assertFails(setDoc(doc(as('alice'), 'rateLimits', 'alice_notes'), { count: 0 }));
  });
});

describe('reports', () => {
  // What the apps' older builds still write for a person or a message (a
  // card goes through the server, which knows an anonymous card's author).
  const valid = {
    reporterId: 'alice',
    targetType: 'user',
    targetId: 'bob',
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
      { ...valid, targetUserId: 'x'.repeat(129) },
      { ...valid, targetUserId: '' },
      // A card report from the client: the server's alone now (with what it kept of the card).
      { ...valid, targetType: 'card', targetId: 'card-1' },
    ];
    for (const data of bad) await assertFails(addDoc(collection(db, 'reports'), data));
  });

  it("keeps what a report was about to the server: no one reads or writes its evidence", async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'reportEvidence', 'r1'), { reporterId: 'alice', targetUserId: 'bob', card: { story: 's' } });
    });
    await assertFails(getDoc(doc(as('alice'), 'reportEvidence', 'r1')));
    await assertFails(getDoc(doc(as('bob'), 'reportEvidence', 'r1')));
    await assertFails(setDoc(doc(as('bob'), 'reportEvidence', 'r1'), { card: null }));
    await assertFails(deleteDoc(doc(as('bob'), 'reportEvidence', 'r1')));
  });
});

describe('server-only records', () => {
  it("who stored which picture, and the storage's configuration, are the server's alone", async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'uploads', 'u1'), { ownerId: 'alice', key: 'image/2026-10/u1.webp' });
      await setDoc(doc(db, 'config', 'storage'), { host: 'img.resonance.test' });
    });
    await assertFails(getDoc(doc(as('carol'), 'uploads', 'u1')));
    await assertFails(getDocs(query(collection(as('carol'), 'uploads'), where('ownerId', '==', 'alice'))));
    await assertFails(setDoc(doc(as('alice'), 'uploads', 'u2'), { ownerId: 'alice', key: 'x' }));
    await assertFails(getDoc(doc(as('alice'), 'config', 'storage')));
    await assertFails(setDoc(doc(as('alice'), 'config', 'storage'), { host: 'tracker.example' }));
  });

  // A person's push switches (and when they agreed), and what was pushed to
  // them: the server's alone, the person's own included — the switches change
  // through PATCH /api/v1/me/notifications only.
  it("push switches and push logs are the server's alone, their owner's too", async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'notificationSettings', 'alice'), { picks: true, connectionCards: false, picksConsentAt: null });
      await setDoc(doc(db, 'pickPushes', 'alice'), { recent: [{ cardId: 'c1' }], sentAt: [] });
      await setDoc(doc(db, 'connectionCardPushes', 'alice'), { day: '2026-10-05', cards: ['c1'] });
    });
    for (const name of ['notificationSettings', 'pickPushes', 'connectionCardPushes']) {
      for (const uid of ['alice', 'bob']) {
        await assertFails(getDoc(doc(as(uid), name, 'alice')));
        await assertFails(setDoc(doc(as(uid), name, 'alice'), { picks: true, cards: [] }));
        await assertFails(deleteDoc(doc(as(uid), name, 'alice')));
      }
      await assertFails(setDoc(doc(as('alice'), name, 'carol-new'), { picks: true }));
      await assertFails(getDocs(collection(as('alice'), name)));
    }
  });

  // Why two people are connected names which card of whose made it — a
  // resonance its writer may have made anonymous since. Neither of them reads it.
  it("why two people are connected is the server's alone, theirs included", async () => {
    await seedConnection();
    await seed(async (db) => {
      await setDoc(doc(db, 'connectionOrigins', PAIR), {
        userIds: ['alice', 'bob'],
        reasons: { resonance_alice_mine: { kind: 'resonance', by: 'alice', cardId: 'mine', originalId: 'orig' } },
        resonanceCards: ['mine'],
      });
    });
    for (const uid of ['alice', 'bob', 'carol']) {
      await assertFails(getDoc(doc(as(uid), 'connectionOrigins', PAIR)));
      await assertFails(getDocs(query(collection(as(uid), 'connectionOrigins'), where('userIds', 'array-contains', uid))));
      await assertFails(setDoc(doc(as(uid), 'connectionOrigins', PAIR), { userIds: ['alice', 'bob'], reasons: { legacy: {} } }));
      await assertFails(deleteDoc(doc(as(uid), 'connectionOrigins', PAIR)));
    }
  });
});

describe('bookmarks (users/{uid}/bookmarks/{cardId})', () => {
  it('are their owner\'s, written exactly as the web and the apps write them', async () => {
    const mine = doc(as('alice'), 'users', 'alice', 'bookmarks', 'c1');
    await assertSucceeds(setDoc(mine, { cardId: 'c1', createdAt: serverTimestamp() }));
    await assertSucceeds(getDocs(collection(as('alice'), 'users', 'alice', 'bookmarks')));
    await assertFails(getDocs(collection(as('bob'), 'users', 'alice', 'bookmarks')));
    await assertFails(setDoc(doc(as('bob'), 'users', 'alice', 'bookmarks', 'c2'), { cardId: 'c2', createdAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(mine));
  });

  it('hold nothing but the card they mark', async () => {
    const db = as('alice');
    await assertFails(setDoc(doc(db, 'users', 'alice', 'bookmarks', 'c1'), { cardId: 'c1', createdAt: serverTimestamp(), note: 'x'.repeat(100_000) }));
    await assertFails(setDoc(doc(db, 'users', 'alice', 'bookmarks', 'c1'), { cardId: 'other', createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, 'users', 'alice', 'bookmarks', 'c1'), { cardId: 'c1', createdAt: new Date('2099-01-01') }));
  });
});

describe('thought maps (thoughtMaps/{uid}/…)', () => {
  const node = (cardId: string) => ({ cardId, x: 12.5, y: -40, groupId: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });

  it("take the web's and the apps' writes: placing, moving and filing cards, arrows with words, regions", async () => {
    const db = as('alice');
    const n = doc(db, 'thoughtMaps', 'alice', 'nodes', 'c1');
    await assertSucceeds(setDoc(n, node('c1')));
    await assertSucceeds(updateDoc(n, { x: 1, y: 2, groupId: 'g1', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(n, { groupId: null, updatedAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(db, 'thoughtMaps', 'alice', 'edges', 'c1_c2'), { sourceCardId: 'c1', targetCardId: 'c2', label: '', createdAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(db, 'thoughtMaps', 'alice', 'edges', 'c1_c2'), { label: 'because' }));
    const g = doc(db, 'thoughtMaps', 'alice', 'groups', 'g1');
    await assertSucceeds(setDoc(g, { title: 'Grief', hue: 55, x: 0, y: 0, w: 320, h: 240, createdAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(g, { x: 10, y: 20 }));
    await assertSucceeds(updateDoc(g, { w: 400, h: 300 }));
    await assertSucceeds(updateDoc(g, { title: 'Grief, later' }));
    await assertSucceeds(getDocs(collection(db, 'thoughtMaps', 'alice', 'nodes')));
    await assertSucceeds(deleteDoc(g));
    // Placing a card again, drawing an arrow again: a whole set over what is there.
    await assertSucceeds(setDoc(n, { ...node('c1'), x: 300 }));
    await assertSucceeds(setDoc(doc(db, 'thoughtMaps', 'alice', 'edges', 'c1_c2'), { sourceCardId: 'c1', targetCardId: 'c2', label: '', createdAt: serverTimestamp() }));
  });

  it("are no one else's to read or write", async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'thoughtMaps', 'alice', 'nodes', 'c1'), { cardId: 'c1', x: 0, y: 0, groupId: null });
    });
    await assertFails(getDocs(collection(as('bob'), 'thoughtMaps', 'alice', 'nodes')));
    await assertFails(setDoc(doc(as('bob'), 'thoughtMaps', 'alice', 'nodes', 'c2'), node('c2')));
    await assertFails(deleteDoc(doc(as('bob'), 'thoughtMaps', 'alice', 'nodes', 'c1')));
  });

  it('hold each piece to its own fields and sizes', async () => {
    const db = as('alice');
    await assertFails(setDoc(doc(db, 'thoughtMaps', 'alice', 'nodes', 'c1'), { ...node('c1'), blob: 'x'.repeat(100_000) }));
    await assertFails(setDoc(doc(db, 'thoughtMaps', 'alice', 'nodes', 'c1'), { ...node('c1'), x: 'left' }));
    await assertFails(setDoc(doc(db, 'thoughtMaps', 'alice', 'nodes', 'c1'), node('c2')));
    await assertFails(setDoc(doc(db, 'thoughtMaps', 'alice', 'edges', 'c1_c2'), { sourceCardId: 'c1', targetCardId: 'c2', label: 'x'.repeat(501), createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, 'thoughtMaps', 'alice', 'edges', 'whatever'), { sourceCardId: 'c1', targetCardId: 'c2', label: '', createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, 'thoughtMaps', 'alice', 'groups', 'g1'), { title: 'x'.repeat(501), hue: 55, x: 0, y: 0, w: 1, h: 1, createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, 'thoughtMaps', 'alice', 'groups', 'g1'), { title: 't', hue: 55, x: 0, y: 0, w: 1, h: 1, color: 'red', createdAt: serverTimestamp() }));
    // Placed again, a node is still the card it was; an arrow still joins the same two.
    await assertSucceeds(setDoc(doc(db, 'thoughtMaps', 'alice', 'nodes', 'c1'), node('c1')));
    await assertFails(setDoc(doc(db, 'thoughtMaps', 'alice', 'nodes', 'c1'), node('c9')));
    await assertFails(setDoc(doc(db, 'thoughtMaps', 'alice', 'nodes', 'c1'), { ...node('c1'), createdAt: new Date(0) }));
    await assertSucceeds(setDoc(doc(db, 'thoughtMaps', 'alice', 'edges', 'c1_c2'), { sourceCardId: 'c1', targetCardId: 'c2', label: '', createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, 'thoughtMaps', 'alice', 'edges', 'c1_c2'), { sourceCardId: 'c1', targetCardId: 'c3', label: '', createdAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, 'thoughtMaps', 'alice', 'edges', 'c1_c2'), { label: 'x'.repeat(501) }));
    // Nothing else lives under a map, and the map document itself is never written.
    await assertFails(setDoc(doc(db, 'thoughtMaps', 'alice', 'stash', 's1'), { anything: true }));
    await assertFails(setDoc(doc(db, 'thoughtMaps', 'alice'), { anything: true }));
  });
});

describe('account deletion requests', () => {
  it('are invisible and unwritable from the client', async () => {
    await assertFails(getDoc(doc(as('alice'), 'accountDeletions', 'alice')));
    await assertFails(setDoc(doc(as('alice'), 'accountDeletions', 'alice'), { purgeAfter: new Date() }));
  });
});

describe('legacy invites', () => {
  it('can no longer be sent, nor their bell rung, by anyone', async () => {
    await assertFails(addDoc(collection(as('bob'), 'invites'), { fromUserId: 'bob', toUserId: 'carol', status: 'pending' }));
    await seedInvite();
    await assertFails(
      addDoc(collection(as('bob'), 'notifications'), {
        userId: 'alice',
        type: 'invite',
        payload: { fromUserId: 'bob', inviteId: 'i1' },
        readAt: null,
      }),
    );
  });

  it('are declined by their recipient only, and withdrawn by either side, while pending — accepted by the server alone', async () => {
    await seedInvite();
    await assertFails(updateDoc(doc(as('bob'), 'invites', 'i1'), { status: 'accepted' }));
    await assertFails(updateDoc(doc(as('carol'), 'invites', 'i1'), { status: 'withdrawn' }));
    // Its recipient accepts through POST /api/v1/invites/{id}/accept, never by writing the status.
    await assertFails(updateDoc(doc(as('alice'), 'invites', 'i1'), { status: 'accepted' }));
    await assertSucceeds(updateDoc(doc(as('alice'), 'invites', 'i1'), { status: 'declined' }));
    // Closed: nothing reopens or re-answers it.
    await assertFails(updateDoc(doc(as('alice'), 'invites', 'i1'), { status: 'pending' }));
    await assertFails(updateDoc(doc(as('bob'), 'invites', 'i1'), { status: 'withdrawn' }));

    await seedInvite();
    await assertSucceeds(updateDoc(doc(as('bob'), 'invites', 'i1'), { status: 'withdrawn' }));
    await seedInvite();
    await assertSucceeds(updateDoc(doc(as('alice'), 'invites', 'i1'), { status: 'withdrawn' })); // a block does this
  });
});

describe('push devices', () => {
  it('are the API\'s alone: no client reads a token or registers one, even its own', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'devices', 'alice-phone-1'), { userId: 'alice', token: 't', platform: 'ios', locale: 'en' });
    });
    await assertFails(getDoc(doc(as('alice'), 'devices', 'alice-phone-1')));
    await assertFails(getDocs(query(collection(as('alice'), 'devices'), where('userId', '==', 'alice'))));
    await assertFails(setDoc(doc(as('bob'), 'devices', 'bob-phone-1'), { userId: 'bob', token: 't', platform: 'ios', locale: 'en' }));
  });
});

describe('cards: who can read which', () => {
  // Bob's four cards: a public one, a private one, one for connections, and a
  // draft (drafts start as visibility "public" — publishing is what shows them).
  const published = new Date('2026-09-01T08:00:00Z');
  const card = (extra: Record<string, unknown>) => ({
    authorId: 'bob', thoughtCore: 't', story: 's', tags: [], readCount: 0, resonanceCount: 0, inviteCount: 0,
    visibility: 'public', anonymous: false, publishedAt: published, ...extra,
  });
  beforeEach(async () => {
    await seedConnection();
    await seed(async (db) => {
      await setDoc(doc(db, 'cards', 'pub'), card({ referenceCardId: 'orig' }));
      await setDoc(doc(db, 'cards', 'priv'), card({ visibility: 'private' }));
      await setDoc(doc(db, 'cards', 'conn'), card({ visibility: 'connections' }));
      await setDoc(doc(db, 'cards', 'draft'), card({ publishedAt: null }));
      // Published anonymously: its document names Bob, so only Bob reads it here.
      await setDoc(doc(db, 'cards', 'anon'), card({ anonymous: true }));
      await setDoc(doc(db, 'cards', 'anonconn'), card({ anonymous: true, visibility: 'connections' }));
    });
  });

  const feed = (db: Firestore) =>
    query(collection(db, 'cards'), where('visibility', '==', 'public'), where('anonymous', '==', false), where('publishedAt', '!=', null), orderBy('publishedAt', 'desc'), limit(12));

  it('opens a published card to whoever it is for, and a draft to no one but its author', async () => {
    const carol = as('carol');
    await assertSucceeds(getDoc(doc(carol, 'cards', 'pub')));
    await assertFails(getDoc(doc(carol, 'cards', 'priv')));
    await assertFails(getDoc(doc(carol, 'cards', 'conn')));
    await assertFails(getDoc(doc(carol, 'cards', 'draft')));
    await assertSucceeds(getDoc(doc(as('alice'), 'cards', 'conn')));
    await assertFails(getDoc(doc(as('alice'), 'cards', 'draft')));
    await assertFails(getDoc(doc(anonymous(), 'cards', 'draft')));
    await assertSucceeds(getDoc(doc(as('bob'), 'cards', 'draft')));
  });

  it("opens an anonymous card to its author alone: its document names them (the server hands it to everyone else)", async () => {
    await assertFails(getDoc(doc(as('carol'), 'cards', 'anon')));
    await assertFails(getDoc(doc(anonymous(), 'cards', 'anon')));
    // Connected to its author or not.
    await assertFails(getDoc(doc(as('alice'), 'cards', 'anonconn')));
    await assertSucceeds(getDoc(doc(as('bob'), 'cards', 'anon')));
    await assertSucceeds(getDoc(doc(as('bob'), 'cards', 'anonconn')));
  });

  it("won't list public cards without leaving the anonymous ones out (an older page's query)", async () => {
    const unfiltered = (db: Firestore) =>
      query(collection(db, 'cards'), where('visibility', '==', 'public'), where('publishedAt', '!=', null), orderBy('publishedAt', 'desc'), limit(12));
    await assertFails(getDocs(unfiltered(as('carol'))));
    await assertFails(getDocs(unfiltered(anonymous())));
    await assertFails(getDocs(query(collection(as('carol'), 'cards'), where('visibility', '==', 'public'), where('anonymous', '==', true), where('publishedAt', '!=', null))));
    const listed = await getDocs(feed(as('carol')));
    if (listed.docs.some((d) => d.id.startsWith('anon'))) throw new Error('an anonymous card was listed');
  });

  it('still lets anyone answer an anonymous card with a resonance (it names no one to them)', async () => {
    await assertSucceeds(setDoc(doc(collection(as('carol'), 'cards')), draft('carol', { referenceCardId: 'anon' })));
  });

  it("won't list someone else's cards beyond the published public ones", async () => {
    const carol = as('carol');
    await assertFails(getDocs(collection(carol, 'cards')));
    await assertFails(getDocs(query(collection(carol, 'cards'), where('visibility', '==', 'private'))));
    await assertFails(getDocs(query(collection(carol, 'cards'), where('authorId', '==', 'bob'))));
    // Public alone isn't enough: that would include drafts.
    await assertFails(getDocs(query(collection(carol, 'cards'), where('visibility', '==', 'public'))));
    await assertFails(getDocs(collection(anonymous(), 'cards')));
  });

  it("still runs every query the site and the apps make", async () => {
    const carol = as('carol');
    // The latest feed, signed in or not.
    await assertSucceeds(getDocs(feed(carol)));
    await assertSucceeds(getDocs(feed(anonymous())));
    // A profile's public cards.
    await assertSucceeds(getDocs(query(collection(carol, 'cards'), where('authorId', '==', 'bob'), where('visibility', '==', 'public'),
      where('anonymous', '==', false), where('publishedAt', '!=', null), orderBy('publishedAt', 'desc'), limit(40))));
    // A card's resonances.
    await assertSucceeds(getDocs(query(collection(carol, 'cards'), where('referenceCardId', '==', 'orig'), where('visibility', '==', 'public'),
      where('anonymous', '==', false), where('publishedAt', '!=', null), orderBy('publishedAt', 'desc'))));
    // Your own card box (anonymous cards and all), your resonance to a card, whether you've written anything.
    const bob = as('bob');
    const mine = await getDocs(query(collection(bob, 'cards'), where('authorId', '==', 'bob')));
    if (mine.size !== 6) throw new Error(`expected all 6 of bob's cards, got ${mine.size}`);
    await assertSucceeds(getDocs(query(collection(bob, 'cards'), where('authorId', '==', 'bob'), where('referenceCardId', '==', 'orig'), limit(1))));
  });
});

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
    });
  }

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
    await assertSucceeds(updateDoc(me, { 'hintsSeen.editor': 2 }));
    await assertFails(updateDoc(me, { bio: 'x'.repeat(81) }));
    await assertFails(updateDoc(me, { primaryLocale: 'fr' }));
    await assertFails(updateDoc(me, { avatarUrl: 'javascript:alert(1)' }));
    await assertFails(updateDoc(doc(as('bob'), 'users', 'alice'), { bio: 'not mine' }));
  });

  it('stay readable by anyone, signed in or not', async () => {
    await assertSucceeds(getDoc(doc(anonymous(), 'users', 'alice')));
    await assertSucceeds(getDocs(query(collection(anonymous(), 'users'), where('handleLower', '==', 'alice'), limit(1))));
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
    ];
    for (const data of bad) await assertFails(setDoc(doc(collection(db, 'cards')), data));
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
      // The card box's 轉為公開／私人 and applying a pending edit on a published card.
      await assertSucceeds(setDoc(doc(db, 'cards', ID), { visibility: 'private', updatedAt: serverTimestamp() }, { merge: true }));
      await assertSucceeds(setDoc(doc(db, 'cards', ID), { thoughtCore: 'Edited', story: 'Edited', updatedAt: serverTimestamp() }, { merge: true }));
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

    it('keeps the pending-edit buffer owner-only', async () => {
      await assertSucceeds(setDoc(doc(as('alice'), 'cards', ID, 'edits', 'current'), { thoughtCore: 'wip', updatedAt: serverTimestamp() }));
      await assertFails(getDoc(doc(as('bob'), 'cards', ID, 'edits', 'current')));
      await assertFails(setDoc(doc(as('bob'), 'cards', ID, 'edits', 'current'), { thoughtCore: 'x' }));
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

  it('lets a note\'s recipient mark it read, and nothing else', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'notes', 'n1'), { fromUserId: 'carol', toUserId: 'alice', cardId: 'c1', text: 'hi', readAt: null, createdAt: new Date() });
    });
    await assertSucceeds(getDoc(doc(as('carol'), 'notes', 'n1')));
    await assertFails(getDoc(doc(as('bob'), 'notes', 'n1')));
    await assertFails(updateDoc(doc(as('alice'), 'notes', 'n1'), { text: 'rewritten' }));
    await assertSucceeds(updateDoc(doc(as('alice'), 'notes', 'n1'), { readAt: serverTimestamp() }));
  });

  it('refuses card links from the client (nothing creates them any more), but lets their author remove one', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'cards', 'mine'), publishedCard('carol'));
      await setDoc(doc(db, 'cards', 'target'), publishedCard('alice'));
      await setDoc(doc(db, 'cardLinks', 'old_target'), {
        sourceCardId: 'old', sourceAuthorId: 'carol', targetCardId: 'target', targetAuthorId: 'alice', createdAt: new Date(),
      });
    });
    await assertFails(
      setDoc(doc(as('carol'), 'cardLinks', 'mine_target'), {
        sourceCardId: 'mine', sourceAuthorId: 'carol', targetCardId: 'target', targetAuthorId: 'bob', createdAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(getDocs(query(collection(anonymous(), 'cardLinks'), where('targetCardId', '==', 'target'))));
    await assertFails(deleteDoc(doc(as('alice'), 'cardLinks', 'old_target')));
    await assertSucceeds(deleteDoc(doc(as('carol'), 'cardLinks', 'old_target')));
  });

  it('refuses writing resonance records, quotas and rate limits', async () => {
    await assertFails(setDoc(doc(as('alice'), 'resonances', 'c1_alice'), { cardId: 'c1', userId: 'alice' }));
    await assertFails(setDoc(doc(as('alice'), 'quotas', 'alice_2026-09-30'), { userId: 'alice', inviteCount: 0 }));
    await assertFails(getDoc(doc(as('alice'), 'rateLimits', 'alice_notes')));
    await assertFails(setDoc(doc(as('alice'), 'rateLimits', 'alice_notes'), { count: 0 }));
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
    visibility: 'public', publishedAt: published, ...extra,
  });
  beforeEach(async () => {
    await seedConnection();
    await seed(async (db) => {
      await setDoc(doc(db, 'cards', 'pub'), card({ referenceCardId: 'orig' }));
      await setDoc(doc(db, 'cards', 'priv'), card({ visibility: 'private' }));
      await setDoc(doc(db, 'cards', 'conn'), card({ visibility: 'connections' }));
      await setDoc(doc(db, 'cards', 'draft'), card({ publishedAt: null }));
    });
  });

  const feed = (db: Firestore) =>
    query(collection(db, 'cards'), where('visibility', '==', 'public'), where('publishedAt', '!=', null), orderBy('publishedAt', 'desc'), limit(12));

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
      where('publishedAt', '!=', null), orderBy('publishedAt', 'desc'), limit(40))));
    // A card's resonances.
    await assertSucceeds(getDocs(query(collection(carol, 'cards'), where('referenceCardId', '==', 'orig'), where('visibility', '==', 'public'),
      where('publishedAt', '!=', null), orderBy('publishedAt', 'desc'))));
    // Your own card box, your resonance to a card, whether you've written anything.
    const bob = as('bob');
    const mine = await getDocs(query(collection(bob, 'cards'), where('authorId', '==', 'bob')));
    if (mine.size !== 4) throw new Error(`expected all 4 of bob's cards, got ${mine.size}`);
    await assertSucceeds(getDocs(query(collection(bob, 'cards'), where('authorId', '==', 'bob'), where('referenceCardId', '==', 'orig'), limit(1))));
  });
});

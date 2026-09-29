/**
 * Seed the local Firebase emulators with a small, known world for manual and
 * browser testing (`npm run emulators`, then `npx tsx scripts/seed-emulator.ts`).
 *
 * Two connected people (Alice, Bob) with cards, a conversation, a
 * stranger (Carol), and a newcomer with no cards yet (Dora — the write
 * page's first-card guide shows for her). The accounts exist only in the Auth emulator of the
 * `demo-resonance` project; the password below is a local test value.
 * In the browser (dev:emulator), sign in from devtools with:
 *   await window.__emulatorSignIn('alice@resonance.test')
 */
import { emulatorEnv, EMULATOR_PROJECT_ID } from './emulator-env.mjs';

export const SEED_PASSWORD = 'resonance-emulator-pw';

export const SEED_USERS = [
  { uid: 'alice', handle: 'alice', email: 'alice@resonance.test', accent: 'oklch(88% 0.08 55)' },
  { uid: 'bob', handle: 'bob', email: 'bob@resonance.test', accent: 'oklch(90% 0.06 140)' },
  { uid: 'carol', handle: 'carol', email: 'carol@resonance.test', accent: 'oklch(90% 0.05 290)' },
  { uid: 'dora', handle: 'dora', email: 'dora@resonance.test', accent: 'oklch(90% 0.05 215)' },
] as const;

async function main() {
  Object.assign(process.env, emulatorEnv);
  const { initializeApp } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const { getFirestore, Timestamp } = await import('firebase-admin/firestore');

  const app = initializeApp({ projectId: EMULATOR_PROJECT_ID }, 'seed');
  const auth = getAuth(app);
  const db = getFirestore(app);
  const now = Date.now();
  const at = (minutesAgo: number) => Timestamp.fromMillis(now - minutesAgo * 60_000);

  for (const u of SEED_USERS) {
    await auth.deleteUser(u.uid).catch(() => {});
    await auth.createUser({ uid: u.uid, email: u.email, password: SEED_PASSWORD, emailVerified: true });
    await db.doc(`users/${u.uid}`).set({
      handle: u.handle,
      handleLower: u.handle,
      bio: `${u.handle} 的測試帳號`,
      region: 'TW',
      primaryLocale: 'zh-TW',
      autoTranslateTo: ['en'],
      verified: true,
      phoneHash: '',
      avatarSeed: String(u.handle.charCodeAt(0) * 7),
      initials: u.handle.slice(0, 2).toUpperCase(),
      accentColor: u.accent,
      joinedAt: at(60 * 24 * 30),
      handleChangedAt: at(60 * 24 * 30),
    });
  }

  const card = (id: string, authorId: string, thoughtCore: string, story: string, minutesAgo: number, hue: number) =>
    db.doc(`cards/${id}`).set({
      authorId,
      slug: id,
      thoughtCore,
      story,
      tags: ['日常', '散步'],
      originalLocale: 'zh-TW',
      translations: {},
      visibility: 'public',
      publishedAt: at(minutesAgo),
      readCount: 0,
      resonanceCount: 0,
      inviteCount: 0,
      accentHue: hue,
    });

  await card(
    'rain-walk',
    'bob',
    '一場雨後的散步',
    '雨停的時候，巷口的積水映出整排路燈。\n\n我突然想起小時候，也是這樣踩著水窪回家。',
    30,
    215,
  );
  await card(
    'first-coffee',
    'bob',
    '第一杯自己沖的咖啡',
    '水溫太高，粉也磨得太細，但那是第一次覺得早晨是屬於自己的。',
    90,
    55,
  );
  await card(
    'letter',
    'alice',
    '寫給十年前的自己',
    '你以為的失敗，後來都變成了轉彎的地方。',
    120,
    18,
  );
  await card('carol-note', 'carol', '陌生人的一句話', '在車站有人對我說辛苦了，那天就被接住了。', 200, 140);
  // Every kind of content a story can hold, for checking readers (web and apps) side by side.
  await card(
    'rich-story',
    'alice',
    '搬家後的第一個安靜夜晚',
    [
      '箱子堆滿了客廳，我坐在地上，第一次覺得**安靜是屬於自己的**。窗外有人在*慢慢地*收衣服。',
      '## 那些帶不走的東西',
      '有些東西在打包的時候就決定留下了：舊沙發、一面有裂痕的鏡子，還有 [一篇讀過很多次的文章](https://example.com/essay)。',
      '> 你不是失去了一個家，\n> 你是多了一個可以回去的地方。',
      '\u00A0',
      '### 清單',
      '- 把書按照顏色排好\n- 在窗台放一盆薄荷\n- 寫信給十年前的自己',
      '1. 先睡一覺\n2. 再說',
      '延伸閱讀：',
      '[一場雨後的散步](/card/rain-walk)',
      '也可以看看 [第一杯自己沖的咖啡](/card/first-coffee) 這張，寫得很溫柔。',
      '---',
      'The quiet after moving out felt like mine — *finally*.',
    ].join('\n\n'),
    45,
    290,
  );

  // alice resonated with bob's walk, and keeps a draft.
  await db.doc('cards/alice-reply').set({
    authorId: 'alice', slug: 'alice-reply', thoughtCore: '我也在雨裡走過', story: '讀完那篇散步，我想起高中放學的那條路。',
    tags: ['回應'], originalLocale: 'zh-TW', translations: {}, visibility: 'public', publishedAt: at(25),
    readCount: 0, resonanceCount: 0, inviteCount: 0, accentHue: 140, referenceCardId: 'rain-walk',
  });
  await db.doc('cards/alice-draft').set({
    authorId: 'alice', thoughtCore: '還沒寫完的清晨', story: '五點的街道很安靜，', tags: [], originalLocale: 'zh-TW',
    translations: {}, visibility: 'public', publishedAt: null, updatedAt: at(15), readCount: 0, resonanceCount: 0, inviteCount: 0,
  });

  // alice's thought map: a region holding two of her cards, bob's walk she resonated with, one labelled arrow.
  const map = db.doc('thoughtMaps/alice');
  const node = (cardId: string, x: number, y: number, groupId: string | null) =>
    map.collection('nodes').doc(cardId).set({ cardId, x, y, groupId, createdAt: at(60), updatedAt: at(60) });
  await map.collection('groups').doc('g-memory').set({ title: '回憶', hue: 88, x: -40, y: -70, w: 560, h: 300, createdAt: at(60) });
  await node('letter', 0, 0, 'g-memory');
  await node('rich-story', 272, 20, 'g-memory');
  await node('rain-walk', 130, 330, null);
  await map.collection('edges').doc('rain-walk_letter').set({ sourceCardId: 'rain-walk', targetCardId: 'letter', label: '後來', createdAt: at(60) });

  await db.doc('connections/alice_bob').set({ userIds: ['alice', 'bob'], establishedAt: at(60 * 24) });
  await db.doc('conversations/alice_bob').set({
    participants: ['alice', 'bob'],
    createdAt: at(60),
    updatedAt: at(10),
    lastMessage: { text: '那篇雨後散步寫得好好', senderId: 'alice', sentAt: at(10) },
    unread: { alice: 0, bob: 1 },
  });
  await db.doc('conversations/alice_bob/messages/m1').set({ senderId: 'bob', text: '嗨，謝謝你的共振！', sentAt: at(20) });
  await db
    .doc('conversations/alice_bob/messages/m2')
    .set({ senderId: 'alice', text: '那篇雨後散步寫得好好', sentAt: at(10) });

  // alice's notifications: one of each kind the apps route (unread first).
  const notify = (id: string, type: string, payload: Record<string, unknown>, minutesAgo: number, read = false) =>
    db.doc(`notifications/${id}`).set({ userId: 'alice', type, payload, readAt: read ? at(minutesAgo - 1) : null, createdAt: at(minutesAgo) });
  await notify('n-note', 'note', { fromUserId: 'bob', fromHandle: 'bob', preview: '你的信讓我想起我自己的十年前。', cardId: 'letter' }, 5);
  await notify('n-resonance', 'resonance', { fromUserId: 'bob', fromHandle: 'bob', cardId: 'letter' }, 40);
  await notify('n-link', 'card_link', { fromUserId: 'carol', fromHandle: 'carol', cardId: 'carol-note' }, 90, true);

  console.log(`Seeded ${SEED_USERS.length} users into ${EMULATOR_PROJECT_ID}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

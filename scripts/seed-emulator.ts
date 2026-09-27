/**
 * Seed the local Firebase emulators with a small, known world for manual and
 * browser testing (`npm run emulators`, then `npx tsx scripts/seed-emulator.ts`).
 *
 * Two connected people (Alice, Bob) with cards, a conversation, and a
 * stranger (Carol). The accounts exist only in the Auth emulator of the
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

  console.log(`Seeded ${SEED_USERS.length} users into ${EMULATOR_PROJECT_ID}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

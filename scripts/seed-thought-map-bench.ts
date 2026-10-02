/**
 * A heavy thought map for alice, to feel (and measure) the native maps at
 * scale: 100 cards on a 10×10 grid (260×210 apart), 12 regions of 8, ~140
 * arrows (60 with words, some both ways). Run after seed-emulator.ts, against
 * the emulators only; seed-emulator.ts puts alice's small map back (and removes the hundred cards).
 *
 *   npx tsx scripts/seed-thought-map-bench.ts
 */
import { EMULATOR_PROJECT_ID } from './emulator-env.mjs';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';

async function main() {
  const { initializeApp } = await import('firebase-admin/app');
  const { getFirestore, Timestamp } = await import('firebase-admin/firestore');
  const db = getFirestore(initializeApp({ projectId: EMULATOR_PROJECT_ID }));
  const now = Timestamp.now();
  const map = db.doc('thoughtMaps/alice');
  const hues = [55, 290, 140, 88, 215, 18];
  const words = ['後來', '因為', '想起', '同一天', '所以', 'then', 'because'];

  // Clear alice's map first.
  for (const c of ['nodes', 'edges', 'groups']) {
    const snap = await map.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }

  let batch = db.batch();
  let ops = 0;
  const flush = async () => {
    if (ops) await batch.commit();
    batch = db.batch();
    ops = 0;
  };
  const add = async (ref: FirebaseFirestore.DocumentReference, data: Record<string, unknown>) => {
    batch.set(ref, data);
    if (++ops >= 400) await flush();
  };

  const ids: string[] = [];
  for (let i = 0; i < 100; i++) {
    const id = `bench-${String(i + 1).padStart(3, '0')}`;
    ids.push(id);
    const row = Math.floor(i / 10), col = i % 10;
    await add(db.doc(`cards/${id}`), {
      authorId: 'alice', slug: id, thoughtCore: `第 ${i + 1} 張：${['清晨', '雨', '搬家', '信', '咖啡'][i % 5]}的片段`,
      story: '一段用來測試地圖效能的文字，長度大約兩三行，讓節點的摘要有東西可以排。'.repeat(1 + (i % 3)),
      tags: ['測試', ['日常', '散步', '回憶'][i % 3]], originalLocale: 'zh-TW', translations: {}, visibility: 'public',
      publishedAt: Timestamp.fromMillis(now.toMillis() - (i + 1) * 60_000), readCount: 0, resonanceCount: 0, inviteCount: 0,
      accentHue: hues[i % hues.length], anonymous: false,
    });
    await add(map.collection('nodes').doc(id), { cardId: id, x: col * 260, y: row * 210, groupId: null, createdAt: now, updatedAt: now });
  }
  // 12 regions, each around 8 cards (a 4×2 block), filed by majority.
  for (let g = 0; g < 12; g++) {
    const r0 = Math.floor(g / 2) * 2 - (g >= 10 ? 2 : 0), c0 = (g % 2) * 5;
    const gid = `bench-g${g + 1}`;
    await add(map.collection('groups').doc(gid), {
      title: `分類 ${g + 1}`, hue: [88, 215, 290, 140, 55, 18][g % 6],
      x: c0 * 260 - 20, y: r0 * 210 - 50, w: 4 * 260 + 12, h: 2 * 210 + 60, createdAt: now,
    });
    for (let r = r0; r < r0 + 2; r++) for (let c = c0; c < c0 + 4; c++) {
      const i = r * 10 + c;
      if (i < 100 && g < 10) {
        batch.update(map.collection('nodes').doc(ids[i]), { groupId: gid });
        ops++;
      }
    }
  }
  await flush();
  // ~140 arrows: each card to its right neighbour, every third also down, some back again.
  let n = 0;
  for (let i = 0; i < 100 && n < 140; i++) {
    const targets = [i % 10 < 9 ? i + 1 : null, i % 3 === 0 && i + 10 < 100 ? i + 10 : null].filter((t): t is number => t != null);
    for (const t of targets) {
      const label = n % 7 < 3 ? words[n % words.length] : '';
      await add(map.collection('edges').doc(`${ids[i]}_${ids[t]}`), { sourceCardId: ids[i], targetCardId: ids[t], label, createdAt: now });
      if (n % 23 === 0) await add(map.collection('edges').doc(`${ids[t]}_${ids[i]}`), { sourceCardId: ids[t], targetCardId: ids[i], label: '', createdAt: now });
      n++;
    }
  }
  await flush();
  console.log(`Bench map for alice: 100 cards, 12 regions, ${n}+ arrows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

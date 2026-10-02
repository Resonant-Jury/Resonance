import { randomUUID } from 'node:crypto';
import { FieldValue, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore';
import { storageKeyOf } from '../../src/lib/storage/publicUrl';
import { UPLOADS, uploadId } from '../../src/lib/storage/uploads';

/**
 * Pictures stored before keys stopped naming their owner live at
 * `{kind}/{uid}/{yyyy-mm}/{uuid}.{ext}` — and an anonymous card's cover (or a
 * picture in its story) then names its author in its public URL. This gives
 * each such picture of an anonymous card (and of its pending edit) a copy
 * under a key that names no one (`{kind}/{yyyy-mm}/{uuid}.{ext}`), records
 * whose it is (uploads/{uuid}, which the account purge goes by), and points
 * the card at the copy.
 *
 * The old object stays (pages cached before still show it) until a run with
 * `deleteOld` — a day or so later, once no cached page can still point there
 * — removes every old copy its records name. Re-running is harmless: a card
 * already moved has nothing left to move.
 */
export interface Storage {
  copyObject(fromKey: string, toKey: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
}

/** A key that still carries its owner: `{kind}/{owner}/{yyyy-mm}/{file}`. */
const OWNED_KEY = /^(image|video)\/([^/]+)\/(\d{4}-\d{2})\/([^/]+)$/;

/** Every URL of our storage a card's content holds: its cover, and the pictures (and links) in its story. */
function storedUrls(data: Record<string, unknown> | undefined, publicBase: string): string[] {
  if (!data) return [];
  const urls = new Set<string>();
  const media = data.media as { url?: unknown } | undefined;
  if (typeof media?.url === 'string') urls.add(media.url);
  const story = typeof data.story === 'string' ? data.story : '';
  const base = publicBase.replace(/\/+$/, '');
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const m of story.matchAll(new RegExp(`${escaped}/[^\\s)"'<>]+`, 'g'))) urls.add(m[0]);
  return [...urls].filter((u) => OWNED_KEY.test(storageKeyOf(u, publicBase) ?? ''));
}

/** `data` with every old URL replaced by its new one (cover and story). */
function rewrite(data: Record<string, unknown>, moved: Map<string, string>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const media = data.media as { url?: unknown } | undefined;
  if (typeof media?.url === 'string' && moved.has(media.url)) patch['media.url'] = moved.get(media.url);
  if (typeof data.story === 'string') {
    let story = data.story;
    for (const [from, to] of moved) story = story.split(from).join(to);
    if (story !== data.story) patch.story = story;
  }
  return patch;
}

export async function rekeyAnonymousImages(
  db: Firestore,
  storage: Storage | null,
  opts: { apply: boolean; deleteOld?: boolean; publicBase: string; log?: (line: string) => void },
) {
  const log = opts.log ?? console.log;
  const base = opts.publicBase.replace(/\/+$/, '');
  const cards = await db.collection('cards').where('anonymous', '==', true).get();
  const edits = cards.docs.length ? await db.getAll(...cards.docs.map((d) => d.ref.collection('edits').doc('current'))) : [];
  const editOf = new Map(edits.map((e) => [e.ref.parent.parent!.id, e]));

  // Old URL → new URL, once per picture however many documents show it.
  const moved = new Map<string, string>();
  const plan: { doc: DocumentSnapshot; urls: string[] }[] = [];
  for (const card of cards.docs) {
    for (const doc of [card, editOf.get(card.id)]) {
      if (!doc?.exists) continue;
      const urls = storedUrls(doc.data(), base);
      if (urls.length) plan.push({ doc, urls });
    }
  }
  const pictures = [...new Set(plan.flatMap((p) => p.urls))];
  log(`anonymous cards: ${cards.size}; documents naming their author in a picture's URL: ${plan.length}; pictures: ${pictures.length}`);
  if (!opts.apply) {
    for (const p of plan.slice(0, 20)) log(`  ${p.doc.ref.path}: ${p.urls.length}`);
    return { cards: cards.size, documents: plan.length, pictures: pictures.length, moved: 0, deleted: 0 };
  }
  if (!storage) throw new Error('Moving pictures needs the storage (R2 credentials)');

  for (const url of pictures) {
    const key = storageKeyOf(url, base)!;
    const [, kind, owner, month, file] = OWNED_KEY.exec(key)!;
    const ext = file.includes('.') ? file.slice(file.lastIndexOf('.')) : '';
    const next = `${kind}/${month}/${randomUUID()}${ext}`;
    await storage.copyObject(key, next);
    await db.collection(UPLOADS).doc(uploadId(next)).set({ ownerId: owner, key: next, kind, rekeyedFrom: key, createdAt: FieldValue.serverTimestamp() });
    moved.set(url, `${base}/${next}`);
  }
  for (const { doc } of plan) {
    const patch = rewrite(doc.data()!, moved);
    if (Object.keys(patch).length) await doc.ref.update(patch);
  }
  log(`moved ${moved.size} picture(s) in ${plan.length} document(s)`);

  // The old copies of pictures moved in this or an earlier run (their records say which).
  let deleted = 0;
  if (opts.deleteOld) {
    const old = await db.collection(UPLOADS).where('rekeyedFrom', '>', '').get();
    for (const d of old.docs) {
      if (d.get('oldDeletedAt')) continue;
      await storage.deleteObject(String(d.get('rekeyedFrom')));
      await d.ref.update({ oldDeletedAt: FieldValue.serverTimestamp() });
      deleted++;
    }
    log(`deleted ${deleted} old copie(s)`);
  } else if (moved.size) {
    log('old copies kept (cached pages may still show them): run again with --delete-old in a day or so');
  }
  return { cards: cards.size, documents: plan.length, pictures: pictures.length, moved: moved.size, deleted };
}

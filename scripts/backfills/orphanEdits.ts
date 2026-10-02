import type { DocumentReference, Firestore } from 'firebase-admin/firestore';

/**
 * Pending edits (cards/{id}/edits/current) and what can be left of them.
 *
 *  - An edit whose card is gone: older app builds delete a card straight
 *    from the client, which leaves its subcollection behind — unpublished
 *    writing nobody can read or delete any more. Deleted here.
 *  - An edit without its author's uid (written before the clients named it):
 *    given the uid of its card's author, so the account purge can find it
 *    should its card later go the same way.
 *
 * Idempotent; with `apply: false` it only counts.
 */
export async function cleanUpEdits(db: Firestore, opts: { apply: boolean; log?: (line: string) => void }) {
  const log = opts.log ?? console.log;
  const edits = await db.collectionGroup('edits').get();
  const cards = edits.docs.map((d) => d.ref.parent.parent).filter((r): r is DocumentReference => !!r);
  const parents = cards.length ? await db.getAll(...cards) : [];
  const card = new Map(parents.map((s) => [s.ref.path, s]));

  const orphans: DocumentReference[] = [];
  const unnamed: { ref: DocumentReference; authorId: string }[] = [];
  for (const d of edits.docs) {
    const parent = d.ref.parent.parent;
    const snap = parent ? card.get(parent.path) : undefined;
    if (!snap?.exists) orphans.push(d.ref);
    else if (typeof d.get('authorId') !== 'string' && typeof snap.get('authorId') === 'string') {
      unnamed.push({ ref: d.ref, authorId: snap.get('authorId') });
    }
  }
  log(`pending edits: ${edits.size}; whose card is gone: ${orphans.length}; without their author: ${unnamed.length}`);
  for (const ref of orphans.slice(0, 20)) log(`  orphan ${ref.path}`);
  if (orphans.length > 20) log(`  … and ${orphans.length - 20} more`);
  if (opts.apply) {
    const writer = db.bulkWriter();
    for (const ref of orphans) void writer.delete(ref);
    for (const { ref, authorId } of unnamed) void writer.update(ref, { authorId });
    await writer.close();
    log(`deleted ${orphans.length}, named ${unnamed.length}`);
  }
  return { edits: edits.size, orphans: orphans.length, unnamed: unnamed.length };
}

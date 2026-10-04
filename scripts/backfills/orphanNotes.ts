import { FieldPath, type DocumentReference, type Firestore } from 'firebase-admin/firestore';

const PAGE = 500;
/** Cards read at once (getAll). */
const CARDS_AT_ONCE = 100;

export interface OrphanNotesReport {
  notes: number;
  /** Notes whose card no longer exists: deleted (or that would be, without `apply`). */
  orphans: number;
  /** Notes naming no card at all: reported, never deleted — nothing says whose they are to judge. */
  malformed: number;
  deleted: number;
}

/**
 * Notes (`notes/*`) whose card is gone. Deleting a card deletes its notes
 * (DELETE /api/v1/cards/{id}), but older app builds deleted cards straight
 * from the client, and a clean-up that failed after the card went left them
 * behind: words about a card nobody can open, still in their writers'
 * backups — where the day they vanish, with an account's purge, would point
 * at whose card it was. Delivered and withheld notes alike; a note's message
 * in a thread (`kind: 'note'`) is the conversation's and stays.
 *
 * Idempotent; with `apply: false` it only counts.
 */
export async function deleteOrphanNotes(
  db: Firestore,
  opts: { apply: boolean; log?: (line: string) => void },
): Promise<OrphanNotesReport> {
  const log = opts.log ?? console.log;
  const rows: { ref: DocumentReference; cardId: string }[] = [];
  let notes = 0;
  let malformed = 0;
  let after: string | null = null;
  for (;;) {
    let page = db.collection('notes').orderBy(FieldPath.documentId()).select('cardId').limit(PAGE);
    if (after) page = page.startAfter(after);
    const snap = await page.get();
    notes += snap.size;
    for (const d of snap.docs) {
      const cardId = d.get('cardId');
      if (typeof cardId === 'string' && cardId && !cardId.includes('/')) rows.push({ ref: d.ref, cardId });
      else malformed += 1;
    }
    if (snap.size < PAGE) break;
    after = snap.docs[snap.size - 1].id;
  }

  const ids = [...new Set(rows.map((r) => r.cardId))];
  const present = new Set<string>();
  for (let i = 0; i < ids.length; i += CARDS_AT_ONCE) {
    const cards = await db.getAll(...ids.slice(i, i + CARDS_AT_ONCE).map((id) => db.doc(`cards/${id}`)), { fieldMask: [] });
    for (const c of cards) if (c.exists) present.add(c.id);
  }
  const orphans = rows.filter((r) => !present.has(r.cardId));
  log(`notes: ${notes}; whose card is gone: ${orphans.length}; naming no card: ${malformed}`);
  const gone = [...new Set(orphans.map((r) => r.cardId))];
  for (const id of gone.slice(0, 20)) log(`  card ${id}: ${orphans.filter((r) => r.cardId === id).length} note(s)`);
  if (gone.length > 20) log(`  … and ${gone.length - 20} more cards`);
  if (!opts.apply || !orphans.length) return { notes, orphans: orphans.length, malformed, deleted: 0 };

  const writer = db.bulkWriter();
  for (const r of orphans) void writer.delete(r.ref);
  await writer.close();
  log(`deleted ${orphans.length} note(s)`);
  return { notes, orphans: orphans.length, malformed, deleted: orphans.length };
}

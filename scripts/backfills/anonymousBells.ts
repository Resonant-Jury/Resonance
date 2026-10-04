import { FieldPath, type DocumentReference, type Firestore } from 'firebase-admin/firestore';

/** The bells that answer for a card's author: a note left on it, a resonance with it. */
const TYPES = ['note', 'resonance'] as const;
const PAGE = 500;
/** Cards read at once (getAll). */
const CARDS_AT_ONCE = 100;

/**
 * Bells of a note or a resonance on an anonymous card get
 * `payload.anonymous: true`, as the server writes them now (sendNote,
 * reachOriginal): with it, the bell lists and their pushes open the card —
 * never a thread with whoever wrote the note or resonance, whose unread count
 * there would tell them, as it dropped, that the card was the one opening it.
 * Rows on named cards, or on cards gone, are left as they are; only that
 * one field is written (never readAt, pushedAt or createdAt).
 *
 * Idempotent; with `apply: false` it only counts.
 */
export async function backfillAnonymousBells(db: Firestore, opts: { apply: boolean; log?: (line: string) => void }) {
  const log = opts.log ?? console.log;
  const rows: { ref: DocumentReference; cardId: string }[] = [];
  let scanned = 0;
  for (const type of TYPES) {
    let after: string | null = null;
    for (;;) {
      let page = db.collection('notifications').where('type', '==', type).orderBy(FieldPath.documentId()).select('payload').limit(PAGE);
      if (after) page = page.startAfter(after);
      const snap = await page.get();
      scanned += snap.size;
      for (const d of snap.docs) {
        const payload = d.get('payload');
        const cardId = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).cardId : null;
        if ((payload as Record<string, unknown> | null)?.anonymous === true) continue;
        if (typeof cardId === 'string' && cardId && !cardId.includes('/')) rows.push({ ref: d.ref, cardId });
      }
      if (snap.size < PAGE) break;
      after = snap.docs[snap.size - 1].id;
    }
  }
  const ids = [...new Set(rows.map((r) => r.cardId))];
  const masked = new Set<string>();
  for (let i = 0; i < ids.length; i += CARDS_AT_ONCE) {
    const cards = await db.getAll(...ids.slice(i, i + CARDS_AT_ONCE).map((id) => db.doc(`cards/${id}`)), { fieldMask: ['anonymous'] });
    for (const c of cards) if (c.exists && c.get('anonymous') === true) masked.add(c.id);
  }
  const marks = rows.filter((r) => masked.has(r.cardId));
  log(`note and resonance bells: ${scanned}, on an anonymous card and not saying so: ${marks.length}`);
  if (!opts.apply || !marks.length) return { scanned, marked: 0, missing: marks.length };

  const writer = db.bulkWriter();
  for (const r of marks) void writer.update(r.ref, new FieldPath('payload', 'anonymous'), true);
  await writer.close();
  log(`marked ${marks.length} bell(s)`);
  return { scanned, marked: marks.length, missing: marks.length };
}

import type { Firestore } from 'firebase-admin/firestore';

/**
 * Every card gets a boolean `anonymous`. The browser's public lists (the
 * feed, a profile's cards, a card's resonances) ask for `anonymous == false`
 * — the rules list nothing else, since an anonymous card's document names
 * its author — and a card without the field would drop out of all of them.
 * Cards published through the server get it at publish time; older ones (and
 * drafts written by clients that never set it) get `false` here: a card that
 * never said it was anonymous never was.
 *
 * Idempotent; with `apply: false` it only counts.
 */
export async function backfillAnonymous(db: Firestore, opts: { apply: boolean; log?: (line: string) => void }) {
  const log = opts.log ?? console.log;
  const snap = await db.collection('cards').select('anonymous').get();
  const missing = snap.docs.filter((d) => typeof d.get('anonymous') !== 'boolean');
  log(`cards: ${snap.size}, without a boolean \`anonymous\`: ${missing.length}`);
  for (const d of missing.slice(0, 20)) log(`  ${d.id} (${JSON.stringify(d.get('anonymous') ?? null)})`);
  if (missing.length > 20) log(`  … and ${missing.length - 20} more`);
  if (!opts.apply || !missing.length) return { cards: snap.size, updated: 0, missing: missing.length };

  const writer = db.bulkWriter();
  // Anything but `true` has always been shown with its byline (the readers test `=== true`).
  for (const d of missing) void writer.update(d.ref, { anonymous: false });
  await writer.close();
  log(`updated ${missing.length} card(s)`);
  return { cards: snap.size, updated: missing.length, missing: missing.length };
}

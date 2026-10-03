import type { Firestore } from 'firebase-admin/firestore';
import { unfurlCardLinks } from '../../src/lib/links/cardLinks';
import { createPreviewMemo, type PreviewFetch } from '../../src/lib/links/preview';
import { standaloneLinks } from '../../src/lib/links/storyLinks';

/**
 * Cards published before stories had link previews (or whose story changed
 * without going through publish or apply — older app builds wrote it
 * directly) get them now: every published card whose standalone links
 * (`standaloneLinks`) are not the ones its `linkPreviewsFor` names — none
 * yet, or others — is unfurled as a save would unfurl it
 * (`unfurlCardLinks`), two cards at a time, sharing one memory of what each
 * link said. Nobody's `unfurl` budget is charged (the owner runs this), and,
 * as after a save, no card's `updatedAt` or `excerptAt` moves.
 *
 * Idempotent: a card done (its links tried, whether or not their pages said
 * anything) is not a candidate again until its links change. With
 * `apply: false` it only counts. Pictures are signed with the running
 * process's key (imageProxy `signingKey`): run it with the deployment's own
 * LINK_PREVIEW_SECRET / FIREBASE_PRIVATE_KEY, or the pictures 404.
 */
export async function backfillLinkPreviews(
  db: Firestore,
  opts: { apply: boolean; log?: (line: string) => void; fetch?: PreviewFetch; concurrency?: number },
) {
  const log = opts.log ?? console.log;
  const snap = await db.collection('cards').where('publishedAt', '!=', null).select('story', 'linkPreviewsFor').get();
  const candidates = snap.docs
    .map((doc) => ({ id: doc.id, links: standaloneLinks(String(doc.get('story') ?? '')), storedFor: doc.get('linkPreviewsFor') }))
    .filter(({ links, storedFor }) => !sameLinks(links, Array.isArray(storedFor) ? storedFor : []));
  const links = candidates.reduce((n, c) => n + c.links.length, 0);
  log(`published cards: ${snap.size}, whose previews are not for the links they hold: ${candidates.length} (${links} link(s))`);
  const report = { cards: snap.size, candidates: candidates.length, links, written: 0, previews: 0 };
  if (!opts.apply || !candidates.length) return report;

  const memo = createPreviewMemo({ max: 2000 });
  let next = 0;
  const worker = async () => {
    while (next < candidates.length) {
      const { id } = candidates[next++];
      try {
        const result = await unfurlCardLinks(db, id, { fetch: opts.fetch, memo, charge: false });
        if (result.written) report.written++;
        report.previews += result.previews;
      } catch (e) {
        log(`  ${id}: failed (${e instanceof Error ? e.message : String(e)}); the next run takes it`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 2, candidates.length) }, worker));
  log(`wrote ${report.written} card(s), holding ${report.previews} preview(s) in all`);
  return report;
}

function sameLinks(a: string[], b: unknown[]): boolean {
  return a.length === b.length && a.every((link, i) => link === b[i]);
}

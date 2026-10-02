import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { storageKeyOf } from '../../src/lib/storage/publicUrl';

/**
 * Pictures stored before the storage moved to a new host name a former
 * public base (R2_FORMER_PUBLIC_BASES) in their URLs. The bucket is the same
 * and both hosts serve every key, so nothing is copied: each such URL is
 * rewritten to the same key under R2_PUBLIC_BASE, wherever one is kept —
 *
 *  - users/{uid}: the profile photo (avatarUrl)
 *  - cards/{id}: the cover (media.url) and the pictures in the story
 *  - cards/{id}/edits/current: the pending edit's cover and story
 *
 * Nothing else keeps one: lists, the API, share images and bells read the
 * cover and the photo from these documents (a list's stored excerpt leaves
 * pictures out), uploads/* records keys rather than URLs, and nothing writes
 * a card's `translations`. Left as they are on purpose: reportEvidence/* —
 * the copy of what was reported, kept as it was then.
 *
 * Only the URLs change: no updatedAt, excerptAt or anything else a list or a
 * cache goes by, so no card moves in a feed or reads as edited. A document
 * written to after it was read here (an author saving a draft meanwhile) is
 * not overwritten — it is reported, and the next run takes it. Idempotent: a
 * URL already on R2_PUBLIC_BASE is left alone; with `apply: false` it only
 * counts.
 */
export async function rehostImages(
  db: Firestore,
  opts: { apply: boolean; publicBase: string; formerBases: readonly string[]; log?: (line: string) => void },
) {
  const log = opts.log ?? console.log;
  const base = opts.publicBase.replace(/\/+$/, '');
  const former = [...new Set(opts.formerBases.map((b) => b.replace(/\/+$/, '')))].filter((b) => b && b !== base);
  if (!former.length) throw new Error('R2_FORMER_PUBLIC_BASES is not set: there is no former host to move pictures from');

  /** `url` under R2_PUBLIC_BASE when it is one of our pictures on a former base, else null. */
  const rehosted = (url: string): string | null => {
    if (storageKeyOf(url, base)) return null;
    const key = storageKeyOf(url, former);
    return key ? `${base}/${key}` : null;
  };
  // A URL on a former base inside Markdown runs to whitespace, a bracket or a quote (as rekey-images reads them).
  const escaped = former.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const inStory = new RegExp(`(?:${escaped.join('|')})/[^\\s)"'<>]+`, 'g');
  const pictures = new Set<string>();

  /** What to write to one document: its URL fields (by field path) and its story, rewritten. */
  function patchOf(urls: Record<string, unknown>, story?: unknown): Record<string, string> {
    const patch: Record<string, string> = {};
    for (const [path, value] of Object.entries(urls)) {
      const url = typeof value === 'string' ? rehosted(value) : null;
      if (!url) continue;
      pictures.add(value as string);
      patch[path] = url;
    }
    if (typeof story === 'string') {
      const next = story.replace(inStory, (url) => {
        const moved = rehosted(url);
        if (moved) pictures.add(url);
        return moved ?? url;
      });
      if (next !== story) patch.story = next;
    }
    return patch;
  }

  const [users, cards, edits] = await Promise.all([
    db.collection('users').select('avatarUrl').get(),
    db.collection('cards').select('media', 'story').get(),
    db.collectionGroup('edits').select('media', 'story').get(),
  ]);
  const kinds = { users, cards, edits };
  const plan: { kind: keyof typeof kinds; doc: QueryDocumentSnapshot; patch: Record<string, string> }[] = [
    ...users.docs.map((doc) => ({ kind: 'users' as const, doc, patch: patchOf({ avatarUrl: doc.get('avatarUrl') }) })),
    ...cards.docs.map((doc) => ({ kind: 'cards' as const, doc, patch: patchOf({ 'media.url': doc.get('media.url') }, doc.get('story')) })),
    ...edits.docs.map((doc) => ({ kind: 'edits' as const, doc, patch: patchOf({ 'media.url': doc.get('media.url') }, doc.get('story')) })),
  ].filter((p) => Object.keys(p.patch).length);

  const tally = (kind: keyof typeof kinds) => ({ read: kinds[kind].size, rewritten: plan.filter((p) => p.kind === kind).length });
  const report = { users: tally('users'), cards: tally('cards'), edits: tally('edits'), pictures: pictures.size, notWritten: 0 };
  log(`moving pictures from ${former.join(', ')} to ${base}`);
  for (const kind of ['users', 'cards', 'edits'] as const) {
    log(`${kind}: ${report[kind].read}, naming a former host: ${report[kind].rewritten}`);
  }
  log(`pictures: ${pictures.size}`);
  for (const p of plan.slice(0, 20)) log(`  ${p.doc.ref.path}: ${Object.keys(p.patch).join(', ')}`);
  if (plan.length > 20) log(`  … and ${plan.length - 20} more`);
  if (!opts.apply || !plan.length) return report;

  const writer = db.bulkWriter();
  const notWritten: string[] = [];
  for (const { doc, patch } of plan) {
    // Only if nobody wrote to it since it was read: a newer draft must not get its older story back.
    writer
      .update(doc.ref, patch, { lastUpdateTime: doc.updateTime })
      .catch((e: { code?: number; message?: string }) =>
        void notWritten.push(`${doc.ref.path} (${e.code === 9 ? 'changed while this ran' : e.message ?? 'failed'})`),
      );
  }
  await writer.close();
  report.notWritten = notWritten.length;
  log(`rewrote ${plan.length - notWritten.length} document(s)`);
  if (notWritten.length) log(`not written — run again:\n  ${notWritten.join('\n  ')}`);
  return report;
}

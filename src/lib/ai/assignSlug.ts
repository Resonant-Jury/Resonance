import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { ensureUniqueSlug, slugify } from './slugify';
import { titleToSlugBase } from './tasks';

/**
 * Give a published card its English URL slug and persist it: the LLM's
 * translation of the title, made collision-free with the author's handle and
 * then a numeric suffix. Idempotent — an existing slug is returned as-is so
 * the public URL stays stable across re-publishes. Shared by /api/cards/slug
 * (the web editor) and the v1 publish endpoint (the apps); `slugBase` is
 * injectable so tests need no LLM.
 */
export async function assignSlug(
  db: Firestore,
  cardId: string,
  slugBase: (title: string) => Promise<string> = titleToSlugBase,
): Promise<string> {
  const ref = db.collection('cards').doc(cardId);
  const data = (await ref.get()).data() ?? {};
  if (typeof data.slug === 'string' && data.slug) return data.slug;

  const base = await slugBase(String(data.thoughtCore ?? ''));
  // Leak checklist (ux §6): an anonymous card's public URL must not embed the
  // author's handle — collisions fall straight through to the numeric suffix.
  let handle = '';
  if (data.anonymous !== true) {
    const author = await db.collection('users').doc(String(data.authorId ?? '')).get();
    handle = slugify(String(author.data()?.handle ?? ''));
  }

  const slug = await ensureUniqueSlug(base, handle, async (candidate) => {
    const dupes = await db.collection('cards').where('slug', '==', candidate).limit(1).get();
    return dupes.docs.some((d) => d.id !== cardId);
  });

  await ref.set({ slug, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return slug;
}

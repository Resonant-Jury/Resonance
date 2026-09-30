import { Timestamp, type Firestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';

/**
 * Which of several cards sharing a slug the slug names: the published one
 * that took it first. Slugs are unique by construction (assignSlug), but
 * older clients could write one themselves — so a later copy, a draft
 * included, can never take over someone's URL or its share preview.
 */
export function slugHolder<T extends Pick<QueryDocumentSnapshot, 'id' | 'get'>>(docs: T[]): T | null {
  const rank = (d: T) => {
    const at = d.get('publishedAt');
    return at instanceof Timestamp ? at.toMillis() : Number.POSITIVE_INFINITY;
  };
  return [...docs].sort((a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : 1))[0] ?? null;
}

/**
 * The card a URL segment names — by its slug, else by its document id — as
 * a snapshot, or null. Shared by every server-side resolver (the card page's
 * metadata, /api/cards/resolve, the v1 card reads) so they always agree.
 */
export async function cardByKey(db: Firestore, key: string) {
  if (!key || key.includes('/')) return null;
  const bySlug = await db.collection('cards').where('slug', '==', key).limit(10).get();
  const holder = slugHolder(bySlug.docs);
  if (holder) return holder;
  const byId = await db.collection('cards').doc(key).get();
  return byId.exists ? byId : null;
}

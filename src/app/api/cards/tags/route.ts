import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { suggestStoryTags } from '@/lib/ai/tasks';
import { topTags } from '@/lib/ai/tags';

export const runtime = 'nodejs';

// How many of the author's cards to sample for tag history, and how many
// top-frequency tags from them reach the model. Firestore has no server-side
// aggregation over array fields, so we pull the (projected) tags arrays and
// rank them here — `select('tags')` keeps the payload to a few bytes per card.
const HISTORY_CARDS_LIMIT = 200;
const HISTORY_TAGS_LIMIT = 20;

/**
 * Suggest 2–3 tags for the card being written. The draft may be unsaved, so the
 * editor sends title/story/tags in the body (same shape of reasoning as
 * /api/generate-image). The author's past tags are read server-side and fed to
 * the LLM so suggestions match their existing vocabulary.
 */
export async function POST(req: Request) {
  const user = await requireUser();

  const body = (await req.json().catch(() => null)) as {
    thoughtCore?: unknown;
    story?: unknown;
    tags?: unknown;
  } | null;
  const title = typeof body?.thoughtCore === 'string' ? body.thoughtCore : '';
  const story = typeof body?.story === 'string' ? body.story : '';
  const existingTags = Array.isArray(body?.tags)
    ? body.tags.filter((t): t is string => typeof t === 'string')
    : [];
  if (!title.trim() && !story.trim()) {
    return NextResponse.json({ error: 'Nothing to tag' }, { status: 400 });
  }

  // Single-field index on authorId suffices — no orderBy, so no composite
  // index to deploy. Frequency ranking replaces recency ordering.
  const snap = await getAdminDb()
    .collection('cards')
    .where('authorId', '==', user.id)
    .select('tags')
    .limit(HISTORY_CARDS_LIMIT)
    .get();
  const historyTags = topTags(
    snap.docs.map((d) => {
      const tags = d.data().tags as unknown;
      return Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string') : [];
    }),
    HISTORY_TAGS_LIMIT,
  );

  const tags = await suggestStoryTags({ title, story, existingTags, historyTags });
  return NextResponse.json({ tags });
}

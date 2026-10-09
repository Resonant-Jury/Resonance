import { NextResponse, after } from 'next/server';
import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { publishCard } from '@/lib/api/v1/publish';
import { CardIdParam } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { ringAfter } from '@/lib/push/ring';
import { announceNewCard } from '@/lib/push/connectionCards';
import { spend } from '@/lib/api/rateLimit';
import { indexCard } from '@/lib/recommend/indexCard';
import { cardPagePaths, revalidateLocalized } from '@/lib/api/revalidate';
import { unfurlCardLinks } from '@/lib/links/cardLinks';

export const dynamic = 'force-dynamic';
// The slug's LLM call is waited for 8 s at most (SLUG_WAIT_MS), then finished
// after the response beside the story's link previews (15 s at most,
// STORY_UNFURL_DEADLINE_MS), followed by the page cache; the recommendation
// index runs alongside, and so — on a first publish, once the slug is in —
// does the push to the author's connections who asked (a few seconds).
export const maxDuration = 60;

/** POST /api/v1/cards/{id}/publish — publish your card (see publishCard). */
export const POST = withUser(async (user, _req, ctx: RouteContext<'key'>) => {
  const id = parse(CardIdParam, await routeParam(ctx, 'key'));
  const db = getAdminDb();
  await spend(db, user.id, 'publish');
  const { notificationId, pendingSlug, ...result } = await publishCard(db, user.id, id);
  ringAfter(db, notificationId);
  // Same grace notes as the web editor: never awaited by the writer, never failing the publish.
  after(() =>
    Promise.all([
      (async () => {
        const [slug] = await Promise.all([
          // A slug that came late (the answer said null) is written once this resolves.
          result.slug ?? (pendingSlug ? pendingSlug : null),
          unfurlCardLinks(db, id).catch((e) => console.error('[api/v1] unfurl', e)),
        ]);
        // After both, so the cached page is rendered with its slug and its link previews.
        revalidateLocalized(cardPagePaths({ id, slug }));
      })(),
      indexCard(id).catch((e) => console.error('[api/v1] index', e)),
      // The first time only: the author's connections who asked hear of it, once its slug is settled.
      result.firstPublish ? announceNewCard(db, id, result.slug ?? pendingSlug) : null,
    ]),
  );
  return NextResponse.json(result);
});

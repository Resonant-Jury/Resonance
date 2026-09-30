import { NextResponse, after } from 'next/server';
import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { publishCard } from '@/lib/api/v1/publish';
import { CardIdParam } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { ringAfter } from '@/lib/push/ring';
import { spend } from '@/lib/api/rateLimit';
import { indexCard } from '@/lib/recommend/indexCard';
import { cardPagePaths, revalidateLocalized } from '@/lib/api/revalidate';

export const dynamic = 'force-dynamic';
// The slug's LLM call is waited for 8 s at most (SLUG_WAIT_MS), then finished
// after the response, followed by the recommendation index.
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
        // A slug that came late (the answer said null) is written once this resolves.
        const slug = result.slug ?? (pendingSlug ? await pendingSlug : null);
        revalidateLocalized(cardPagePaths({ id, slug }));
      })(),
      indexCard(id).catch((e) => console.error('[api/v1] index', e)),
    ]),
  );
  return NextResponse.json(result);
});

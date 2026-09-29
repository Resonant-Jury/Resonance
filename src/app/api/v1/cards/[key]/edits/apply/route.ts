import { NextResponse, after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { applyCardEdit } from '@/lib/api/v1/edits';
import { CardIdParam } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { indexCard } from '@/lib/recommend/indexCard';
import { routing } from '@/i18n/routing';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** POST /api/v1/cards/{id}/edits/apply — apply your pending edit to a published card (see applyCardEdit). */
export const POST = withUser(async (user, _req, ctx: RouteContext<'key'>) => {
  const id = parse(CardIdParam, await routeParam(ctx, 'key'));
  const result = await applyCardEdit(getAdminDb(), user.id, id);
  if (result.applied) {
    after(async () => {
      // The web editor's grace notes after "save changes": the card page's cache, then the recommendation index.
      for (const locale of routing.locales) revalidatePath(`/${locale}/card/${result.slug ?? id}`);
      await indexCard(id).catch((e) => console.error('[api/v1] index', e));
    });
  }
  return NextResponse.json(result);
});

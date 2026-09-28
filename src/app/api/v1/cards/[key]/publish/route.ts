import { NextResponse, after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { publishCard } from '@/lib/api/v1/publish';
import { CardIdParam } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { indexCard } from '@/lib/recommend/indexCard';
import { routing } from '@/i18n/routing';

export const dynamic = 'force-dynamic';
// The slug's LLM call runs inside the request; the recommendation index after it.
export const maxDuration = 60;

/** POST /api/v1/cards/{id}/publish — publish your card (see publishCard). */
export const POST = withUser(async (user, _req, ctx: RouteContext<'key'>) => {
  const id = parse(CardIdParam, await routeParam(ctx, 'key'));
  const result = await publishCard(getAdminDb(), user.id, id);
  after(async () => {
    // Same grace notes as the web editor: never awaited by the writer, never failing the publish.
    for (const locale of routing.locales) revalidatePath(`/${locale}/card/${result.slug ?? id}`);
    await indexCard(id).catch((e) => console.error('[api/v1] index', e));
  });
  return NextResponse.json(result);
});

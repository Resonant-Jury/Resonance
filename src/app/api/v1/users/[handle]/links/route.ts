import { NextResponse } from 'next/server';
import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { getProfileLinks } from '@/lib/api/v1/reads';
import { HandleParam } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';

export const dynamic = 'force-dynamic';

/** GET /api/v1/users/{handle}/links — cards by others that link to theirs. */
export const GET = withUser(async (user, _req, ctx: RouteContext<'handle'>) => {
  const handle = parse(HandleParam, await routeParam(ctx, 'handle'));
  return NextResponse.json(await getProfileLinks(getAdminDb(), user.id, handle));
});

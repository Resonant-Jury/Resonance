import { NextResponse } from 'next/server';
import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { getProfile } from '@/lib/api/v1/reads';
import { HandleParam } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';

export const dynamic = 'force-dynamic';

/** GET /api/v1/users/{handle} — a person's public profile, as the viewer sees it. */
export const GET = withUser(async (user, _req, ctx: RouteContext<'handle'>) => {
  const handle = parse(HandleParam, await routeParam(ctx, 'handle'));
  return NextResponse.json(await getProfile(getAdminDb(), user.id, handle));
});

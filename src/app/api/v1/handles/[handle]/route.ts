import { NextResponse } from 'next/server';
import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { handleAvailable } from '@/lib/api/v1/profile';
import { HandleParam } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';

export const dynamic = 'force-dynamic';

/** GET /api/v1/handles/{handle} — whether a pen name is free (onboarding and rename, as you type). */
export const GET = withUser(async (user, _req, ctx: RouteContext<'handle'>) => {
  const handle = parse(HandleParam, await routeParam(ctx, 'handle'));
  return NextResponse.json({ handle, available: await handleAvailable(getAdminDb(), user.id, handle) });
});

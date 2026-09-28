import { NextResponse } from 'next/server';
import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { reportCard } from '@/lib/api/v1/safety';
import { CardKey, ReportCardRequest } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';

export const dynamic = 'force-dynamic';

/** POST /api/v1/cards/{key}/report — report a card, anonymous ones included. */
export const POST = withUser(async (user, req, ctx: RouteContext<'key'>) => {
  const key = parse(CardKey, await routeParam(ctx, 'key'));
  const input = parse(ReportCardRequest, await req.json().catch(() => null));
  return NextResponse.json({ id: await reportCard(getAdminDb(), user.id, key, input) }, { status: 201 });
});

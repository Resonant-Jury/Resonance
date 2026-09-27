import { NextResponse } from 'next/server';
import { withUser } from '@/lib/api/v1/http';
import { getMe } from '@/lib/api/v1/service';
import { getAdminDb } from '@/lib/db/firestore/admin';

export const dynamic = 'force-dynamic';

/** GET /api/v1/me — the signed-in account (see openapi/v1/openapi.json). */
export const GET = withUser(async (user) => NextResponse.json(await getMe(getAdminDb(), user.id)));

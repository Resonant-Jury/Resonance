import { NextResponse } from 'next/server';
import { ApiFailure, parse, withUser } from '@/lib/api/v1/http';
import { createReport } from '@/lib/api/v1/safety';
import { CreateReportRequest } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { spend } from '@/lib/api/rateLimit';

export const dynamic = 'force-dynamic';

/** POST /api/v1/reports — report a person or a message (see createReport). */
export const POST = withUser(async (user, req) => {
  const body = await req.json().catch(() => {
    throw new ApiFailure('invalid_request', 'The body must be JSON.');
  });
  const input = parse(CreateReportRequest, body);
  const db = getAdminDb();
  await spend(db, user.id, 'report');
  return NextResponse.json({ id: await createReport(db, user.id, input) }, { status: 201 });
});

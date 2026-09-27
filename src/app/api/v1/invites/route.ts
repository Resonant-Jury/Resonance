import { NextResponse } from 'next/server';
import { ApiFailure, parse, withUser } from '@/lib/api/v1/http';
import { CreateInviteRequest } from '@/lib/api/v1/schemas';
import { createInvite } from '@/lib/api/v1/service';
import { getAdminDb } from '@/lib/db/firestore/admin';

/** POST /api/v1/invites — invite someone to connect (see openapi/v1/openapi.json). */
export const POST = withUser(async (user, req) => {
  const body = await req.json().catch(() => {
    throw new ApiFailure('invalid_request', 'The body must be JSON.');
  });
  const id = await createInvite(getAdminDb(), user.id, parse(CreateInviteRequest, body));
  return NextResponse.json({ id }, { status: 201 });
});

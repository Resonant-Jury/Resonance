import { NextResponse } from 'next/server';
import { ApiFailure, parse, withUser } from '@/lib/api/v1/http';
import { sendMessage } from '@/lib/api/v1/conversations';
import { SendMessageRequest } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { ringAfter } from '@/lib/push/ring';
import { spend } from '@/lib/api/rateLimit';

export const dynamic = 'force-dynamic';

/** POST /api/v1/messages — message someone you're connected with (see sendMessage). */
export const POST = withUser(async (user, req) => {
  const body = await req.json().catch(() => {
    throw new ApiFailure('invalid_request', 'The body must be JSON.');
  });
  const input = parse(SendMessageRequest, body);
  const db = getAdminDb();
  await spend(db, user.id, 'message');
  const { notificationId, ...sent } = await sendMessage(db, user.id, input);
  ringAfter(db, notificationId);
  return NextResponse.json(sent, { status: 201 });
});

import { NextResponse } from 'next/server';
import { ApiFailure, parse, withUser } from '@/lib/api/v1/http';
import { sendNote } from '@/lib/api/v1/conversations';
import { SendNoteRequest } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { ringAfter } from '@/lib/push/ring';
import { spend } from '@/lib/api/rateLimit';

export const dynamic = 'force-dynamic';

/** POST /api/v1/notes — send a note to a card's author (see sendNote). */
export const POST = withUser(async (user, req) => {
  const body = await req.json().catch(() => {
    throw new ApiFailure('invalid_request', 'The body must be JSON.');
  });
  const input = parse(SendNoteRequest, body);
  const db = getAdminDb();
  await spend(db, user.id, 'note');
  const { id, notificationId } = await sendNote(db, user.id, input);
  ringAfter(db, notificationId);
  return NextResponse.json({ id }, { status: 201 });
});

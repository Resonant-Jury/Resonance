import { NextResponse } from 'next/server';
import { ApiFailure, parse, withUser } from '@/lib/api/v1/http';
import { sendNote } from '@/lib/api/v1/conversations';
import { afterNoteSent } from '@/lib/api/v1/afterMessage';
import { SendNoteRequest } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { ringAfter } from '@/lib/push/ring';
import { spend } from '@/lib/api/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/notes — send a note to a card's author (see sendNote). After
 * the response the author's phone rings once: through the chat push when the
 * note went into the two people's thread, through its bell row when the card
 * is anonymous (no thread). Answers 201 with the note's id, also when
 * `clientId` named one already left — and that resend rings no one.
 */
export const POST = withUser(async (user, req) => {
  const body = await req.json().catch(() => {
    throw new ApiFailure('invalid_request', 'The body must be JSON.');
  });
  const input = parse(SendNoteRequest, body);
  const db = getAdminDb();
  await spend(db, user.id, 'note');
  const { id, notificationId, push, duplicate } = await sendNote(db, user.id, input);
  if (!duplicate) {
    if (push) afterNoteSent(db, push);
    else ringAfter(db, notificationId);
  }
  return NextResponse.json({ id }, { status: 201 });
});

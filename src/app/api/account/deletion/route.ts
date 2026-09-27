import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getAdminAuth } from '@/lib/auth/firebase/server';
import { getAdminDb } from '@/lib/db/firestore/admin';
import {
  cancelAccountDeletion,
  getAccountDeletion,
  scheduleAccountDeletion,
  type AccountDeletion,
} from '@/lib/account/deletion';

function unauthorized() {
  return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
}

function body(deletion: AccountDeletion | null) {
  return {
    deletion: deletion
      ? { requestedAt: deletion.requestedAt.toISOString(), purgeAfter: deletion.purgeAfter.toISOString() }
      : null,
  };
}

/** Whether the signed-in account is scheduled for deletion (drives the undo banner). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  return NextResponse.json(body(await getAccountDeletion(getAdminDb(), user.id)));
}

/**
 * Schedule deletion. Refresh tokens are revoked so every other device is
 * signed out too; signing back in within the grace period can still cancel.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const deletion = await scheduleAccountDeletion(getAdminDb(), user.id);
  await getAdminAuth().revokeRefreshTokens(user.id);
  return NextResponse.json(body(deletion));
}

/** Cancel a scheduled deletion. */
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  await cancelAccountDeletion(getAdminDb(), user.id);
  return NextResponse.json(body(null));
}

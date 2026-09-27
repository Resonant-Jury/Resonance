import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { exportAccountData } from '@/lib/account/export';

/** Download everything the signed-in user wrote, as one JSON file. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const data = await exportAccountData(getAdminDb(), user.id);
  const day = data.exportedAt.slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="resonance-backup-${day}.json"`,
      'cache-control': 'no-store',
    },
  });
}

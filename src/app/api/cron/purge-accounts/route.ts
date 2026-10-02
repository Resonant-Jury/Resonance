import { NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/auth/firebase/server';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { getStorageProvider } from '@/lib/storage';
import { purgeDueAccounts } from '@/lib/account/deletion';
import { revalidateLocalized } from '@/lib/api/revalidate';

export const maxDuration = 300;

/**
 * Daily purge of accounts whose deletion grace period has ended (scheduled in
 * vercel.json). Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; any
 * other caller is refused, and so is every caller when the secret is unset.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const purged = await purgeDueAccounts({
    db: getAdminDb(),
    deleteAuthUser: (uid) => getAdminAuth().deleteUser(uid),
    deleteStoragePrefix: (prefix) => getStorageProvider().deletePrefix(prefix),
    deleteStorageObject: (key) => getStorageProvider().deleteObject(key),
    // The deleted writing must not live on in cached card and profile pages.
    revalidate: revalidateLocalized,
  });
  return NextResponse.json({ purged: purged.length });
}

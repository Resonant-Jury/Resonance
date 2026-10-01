import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { exportAccountJson } from '@/lib/account/export';
import { limited } from '@/lib/api/rateLimit';

/**
 * Download everything the signed-in user wrote, as one JSON file — streamed
 * as it is read (lib/account/export), so a large backup is neither held in
 * memory nor cut off by the limit on a buffered response. A failure before
 * the first piece is a 500; one part way through aborts the download, which
 * the browser reports as failed (never a truncated file it takes for whole).
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const db = getAdminDb();
  const tooMany = await limited(db, user.id, 'export');
  if (tooMany) return tooMany;

  const now = new Date();
  const pieces = exportAccountJson(db, user.id, now);
  const first = await pieces.next();
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      if (!first.done) controller.enqueue(encoder.encode(first.value));
    },
    async pull(controller) {
      try {
        const next = await pieces.next();
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(next.value));
      } catch (e) {
        console.error('[account/export]', e);
        controller.error(e);
      }
    },
    async cancel() {
      await pieces.return(undefined);
    },
  });
  return new NextResponse(body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="resonance-backup-${now.toISOString().slice(0, 10)}.json"`,
      'cache-control': 'no-store',
    },
  });
}

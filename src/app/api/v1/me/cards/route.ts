import { parse, withUser } from '@/lib/api/v1/http';
import { getCardBox } from '@/lib/api/v1/reads';
import { CardBoxQuery } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { OWN, cachedJson } from '@/lib/api/v1/cache';

export const dynamic = 'force-dynamic';

/** GET /api/v1/me/cards?tab= — one shelf of the viewer's card box. */
export const GET = withUser(async (user, req) => {
  const { tab } = parse(CardBoxQuery, Object.fromEntries(new URL(req.url).searchParams));
  return cachedJson(req, await getCardBox(getAdminDb(), user.id, tab), OWN);
});

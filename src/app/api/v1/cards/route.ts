import { parse, withUser } from '@/lib/api/v1/http';
import { getCardsByKeys } from '@/lib/api/v1/reads';
import { CardKeysQuery } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { BRIEF, cachedJson } from '@/lib/api/v1/cache';

export const dynamic = 'force-dynamic';

/** GET /api/v1/cards?keys=a,b,c — summaries of several cards (slugs or ids) at once, in the order asked. */
export const GET = withUser(async (user, req) => {
  const { keys } = parse(CardKeysQuery, Object.fromEntries(new URL(req.url).searchParams));
  return cachedJson(req, await getCardsByKeys(getAdminDb(), user.id, keys), BRIEF);
});

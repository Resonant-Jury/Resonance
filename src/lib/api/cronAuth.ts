/**
 * Whether a request is Vercel Cron's: `Authorization: Bearer $CRON_SECRET`.
 * With the secret unset nobody is (a cron route never runs for a guess).
 */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
}

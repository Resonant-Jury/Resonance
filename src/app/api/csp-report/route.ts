import { MAX_REPORT_BODY, admit, trimReports } from '@/lib/api/cspReport';

export const runtime = 'nodejs';

/**
 * POST /api/csp-report — where browsers send what the report-only
 * Content-Security-Policy (src/lib/api/securityHeaders) would have blocked.
 * Each report is logged as a trimmed line (`[csp] …`): the directive, what
 * was blocked and where, as origins and paths only — no query strings, no
 * script samples, no referrer, nothing about who sent it. Anyone can post
 * here, so nothing is stored and logging is capped: each distinct violation
 * once a minute, at most 30 lines a minute per instance. Always 204.
 */
export async function POST(req: Request) {
  const done = () => new Response(null, { status: 204 });
  if (Number(req.headers.get('content-length') ?? 0) > MAX_REPORT_BODY) return done();
  const text = await req.text().catch(() => '');
  if (!text || text.length > MAX_REPORT_BODY) return done();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return done();
  }
  const now = Date.now();
  for (const report of trimReports(payload)) {
    if (!report.directive) continue;
    if (admit(`${report.directive} ${report.blocked} ${report.document}`, now)) {
      console.warn('[csp]', JSON.stringify(report));
    }
  }
  return done();
}

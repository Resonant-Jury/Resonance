/**
 * What /api/csp-report keeps of a Content-Security-Policy report, and how
 * often it logs one (see the route).
 */

export const MAX_REPORT_BODY = 32 * 1024;
const WINDOW_MS = 60_000;
const MAX_LINES = 30;
const MAX_FIELD = 200;

let windowStart = 0;
let lines = 0;
const seen = new Set<string>();

/** What is kept of one report. */
export interface TrimmedReport {
  directive: string;
  blocked: string;
  document: string;
  source?: string;
  line?: number;
  column?: number;
  disposition?: string;
}

/**
 * A URL as its origin and path — no query or fragment; `data:`/`blob:` as
 * the scheme; a keyword (`inline`, `eval`) as it is. A page's path may name
 * a card or a person, so one of our pages keeps only its first two segments
 * (which page it was: `/en/card/…`); a script or other asset keeps its path.
 */
function place(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return value.replace(/[?#].*$/, '').slice(0, 40);
  }
  if (url.protocol === 'data:' || url.protocol === 'blob:') return url.protocol.slice(0, -1);
  const parts = url.pathname.split('/').filter(Boolean);
  const page = !/\.[A-Za-z0-9]{1,8}$/.test(url.pathname) && parts[0] !== '_next';
  const keep = page ? 2 : parts.length;
  const path = `/${parts.slice(0, keep).join('/')}${parts.length > keep ? '/…' : ''}`;
  return `${url.origin}${path}`.slice(0, MAX_FIELD);
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/**
 * Both report shapes: `report-uri`'s `{"csp-report": {…}}` (kebab-case) and
 * the Reporting API's `[{ type: "csp-violation", body: {…} }]` (camelCase).
 */
export function trimReports(payload: unknown): TrimmedReport[] {
  const raw: Record<string, unknown>[] = [];
  if (Array.isArray(payload)) {
    for (const r of payload.slice(0, 20)) {
      if (r && typeof r === 'object' && (r as { type?: unknown }).type === 'csp-violation') {
        const body = (r as { body?: unknown }).body;
        if (body && typeof body === 'object') raw.push(body as Record<string, unknown>);
      }
    }
  } else if (payload && typeof payload === 'object' && 'csp-report' in payload) {
    const body = (payload as { 'csp-report'?: unknown })['csp-report'];
    if (body && typeof body === 'object') raw.push(body as Record<string, unknown>);
  }
  return raw.map((r) => {
    const directive = String(r['effective-directive'] ?? r.effectiveDirective ?? r['violated-directive'] ?? '')
      .split(' ')[0]
      .slice(0, 40);
    const report: TrimmedReport = {
      directive,
      blocked: place(r['blocked-uri'] ?? r.blockedURL),
      document: place(r['document-uri'] ?? r.documentURL),
    };
    const source = place(r['source-file'] ?? r.sourceFile);
    if (source) report.source = source;
    const line = num(r['line-number'] ?? r.lineNumber);
    if (line !== undefined) report.line = line;
    const column = num(r['column-number'] ?? r.columnNumber);
    if (column !== undefined) report.column = column;
    const disposition = r.disposition;
    if (typeof disposition === 'string') report.disposition = disposition.slice(0, 20);
    return report;
  });
}

/** Whether this instance may log `key` now (each once a window, a few lines a window). */
export function admit(key: string, now: number): boolean {
  if (now - windowStart >= WINDOW_MS) {
    windowStart = now;
    lines = 0;
    seen.clear();
  }
  if (seen.has(key) || lines >= MAX_LINES) return false;
  seen.add(key);
  lines++;
  return true;
}


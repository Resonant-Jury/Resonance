import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Where browsers report what the report-only CSP would have blocked: a
// trimmed line in the logs — origins and page types, never a query string,
// a script sample or anything about the sender — capped so a flood of posts
// can't flood the logs. Always 204, whatever arrives.

const { POST } = await import('./route');

const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
let minute = 0;
beforeEach(() => {
  warn.mockClear();
  vi.useFakeTimers({ toFake: ['Date'] });
  // Each test starts in a minute of its own: the per-minute budget is fresh.
  minute += 2;
  vi.setSystemTime(minute * 60_000);
});
afterEach(() => vi.useRealTimers());

const post = (body: string, type = 'application/csp-report', headers: Record<string, string> = {}) =>
  POST(new Request('http://localhost/api/csp-report', { method: 'POST', body, headers: { 'content-type': type, ...headers } }));
const logged = () => warn.mock.calls.map(([tag, line]) => (expect(tag).toBe('[csp]'), JSON.parse(line as string)));

const legacy = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    'csp-report': {
      'document-uri': 'https://resonance.example/en/card/a-walk-at-dawn?ref=share#story',
      referrer: 'https://elsewhere.example/someone?email=me@example.com',
      'violated-directive': 'script-src-elem',
      'effective-directive': 'script-src-elem',
      'original-policy': "default-src 'self'; report-uri /api/csp-report",
      'blocked-uri': 'https://cdn.tracker.example/t.js?uid=12345',
      'status-code': 200,
      'script-sample': 'self.__next_f.push([1,"a story"])',
      'source-file': 'https://resonance.example/_next/static/chunks/app/page-abc.js?v=1',
      'line-number': 12,
      'column-number': 34,
      disposition: 'report',
      ...extra,
    },
  });

describe('POST /api/csp-report', () => {
  it('logs the directive, what was blocked and the page type — no query, sample, referrer or policy', async () => {
    const res = await post(legacy());
    expect(res.status).toBe(204);
    expect(logged()).toEqual([
      {
        directive: 'script-src-elem',
        blocked: 'https://cdn.tracker.example/t.js',
        document: 'https://resonance.example/en/card/…',
        source: 'https://resonance.example/_next/static/chunks/app/page-abc.js',
        line: 12,
        column: 34,
        disposition: 'report',
      },
    ]);
    const line = warn.mock.calls[0][1] as string;
    for (const secret of ['a-walk-at-dawn', 'ref=share', 'email', 'uid=12345', '__next_f', 'original', "default-src"]) {
      expect(line).not.toContain(secret);
    }
  });

  it("reads the Reporting API's shape too, and keywords and data: as they are", async () => {
    const body = JSON.stringify([
      {
        type: 'csp-violation',
        url: 'https://resonance.example/zh-TW/u/someone',
        body: {
          documentURL: 'https://resonance.example/zh-TW/u/someone',
          effectiveDirective: 'img-src',
          blockedURL: 'data:image/png;base64,AAAA',
          disposition: 'report',
        },
      },
      { type: 'csp-violation', body: { documentURL: 'https://resonance.example/en/home', effectiveDirective: 'script-src', blockedURL: 'eval' } },
      { type: 'deprecation', body: { id: 'x' } },
    ]);
    expect((await post(body, 'application/reports+json')).status).toBe(204);
    expect(logged()).toEqual([
      { directive: 'img-src', blocked: 'data', document: 'https://resonance.example/zh-TW/u/…', disposition: 'report' },
      { directive: 'script-src', blocked: 'eval', document: 'https://resonance.example/en/home' },
    ]);
  });

  it('logs each violation once a minute, and at most 30 lines a minute', async () => {
    for (let i = 0; i < 3; i++) await post(legacy());
    expect(warn).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 40; i++) await post(legacy({ 'blocked-uri': `https://host${i}.example/x.js` }));
    expect(warn).toHaveBeenCalledTimes(30);

    vi.setSystemTime((minute + 1) * 60_000 + 1);
    await post(legacy());
    expect(warn).toHaveBeenCalledTimes(31);
  });

  it('answers 204 to anything else, logging nothing', async () => {
    for (const res of [
      await post('not json'),
      await post(''),
      await post(JSON.stringify({ hello: 'world' })),
      await post(JSON.stringify({ 'csp-report': 'nope' })),
      await post(legacy(), 'application/csp-report', { 'content-length': String(64 * 1024) }),
      await post(`${legacy().slice(0, -2)}, "padding": "${'x'.repeat(40 * 1024)}"}}`),
    ]) {
      expect(res.status).toBe(204);
    }
    expect(warn).not.toHaveBeenCalled();
  });
});

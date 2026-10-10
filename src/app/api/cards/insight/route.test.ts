import { beforeEach, describe, expect, it, vi } from 'vitest';

// POST /api/cards/insight — the publish panel's mirror moment: signed in only,
// the author's `insight` budget spent only when there is a draft to read, and
// always an answer the panel can draw (a line, or null for none) — never an
// error that holds up publishing. The line's own rules: lib/ai/mirror.test.ts.

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => ({}) }));
const limited = vi.fn();
vi.mock('@/lib/api/rateLimit', () => ({ limited: (...a: unknown[]) => limited(...a) }));
const mirrorInsight = vi.fn();
vi.mock('@/lib/ai/tasks', () => ({ mirrorInsight: (...a: unknown[]) => mirrorInsight(...a) }));

const { POST } = await import('./route');
const { DRAFT_READ_CHARS } = await import('@/lib/ai/mirror');
const { CARD_LIMITS } = await import('@/lib/db/firestore/cardContent');
const post = (body: unknown) =>
  POST(new Request('http://localhost/api/cards/insight', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));

const STORY = 'The water was too hot and the grind too fine, but it was the first morning that felt like mine.';

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'alice' });
  limited.mockResolvedValue(null);
});

describe('POST /api/cards/insight', () => {
  it("answers the draft's line", async () => {
    mirrorInsight.mockResolvedValueOnce('A morning can be yours');
    const res = await post({ thoughtCore: 'Mine', story: STORY });
    expect(await res.json()).toEqual({ coreInsight: 'A morning can be yours' });
    expect(mirrorInsight).toHaveBeenCalledWith({ title: 'Mine', story: STORY });
    expect(limited).toHaveBeenCalledWith(expect.anything(), 'alice', 'insight');
  });

  it('answers null — no line — for a draft too short to read, spending nothing and asking no model', async () => {
    for (const body of [{}, { story: '' }, { thoughtCore: 'Tired', story: 'Long day.' }, { story: '一行字而已' }]) {
      expect(await (await post(body)).json()).toEqual({ coreInsight: null });
    }
    expect(limited).not.toHaveBeenCalled();
    expect(mirrorInsight).not.toHaveBeenCalled();
  });

  it('reads only the start of a long draft, cut before anything measures it — a flood of `[` answers at once, spending nothing', async () => {
    const started = performance.now();
    const res = await post({ thoughtCore: '['.repeat(200_000), story: '['.repeat(1_000_000) });
    expect(await res.json()).toEqual({ coreInsight: null });
    expect(performance.now() - started).toBeLessThan(1_000);
    expect(limited).not.toHaveBeenCalled();
    expect(mirrorInsight).not.toHaveBeenCalled();
  });

  it("hands the model only the start of a long draft: a title's length, and the story's first characters", async () => {
    mirrorInsight.mockResolvedValueOnce('A morning can be yours');
    await post({ thoughtCore: 'T'.repeat(5_000), story: STORY.repeat(1_000) });
    const [{ title, story }] = mirrorInsight.mock.calls[0] as [{ title: string; story: string }];
    expect(title).toHaveLength(CARD_LIMITS.title);
    expect(story).toBe(STORY.repeat(1_000).slice(0, DRAFT_READ_CHARS));
  });

  it('answers null when the model has nothing to say or fails, and 401 signed out', async () => {
    mirrorInsight.mockResolvedValueOnce(null);
    expect(await (await post({ story: STORY })).json()).toEqual({ coreInsight: null });
    mirrorInsight.mockRejectedValueOnce(new Error('timeout'));
    expect(await (await post({ story: STORY })).json()).toEqual({ coreInsight: null });
    getCurrentUser.mockResolvedValueOnce(null);
    expect((await post({ story: STORY })).status).toBe(401);
  });
});

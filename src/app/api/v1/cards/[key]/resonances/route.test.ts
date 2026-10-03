import { beforeEach, describe, expect, it, vi } from 'vitest';

// The resonance routes around their service (apiV1Resonate covers the
// transaction): what they read from the request, the caller's budget, the
// original author's bell rung after the response, and the chosen card's
// pages — whose seed names the card it answers — revalidated in every
// locale after the response, only when something changed. Neither the bell
// row nor the page list leaves the server.

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => ({}) }));
const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
let afterWork: Promise<unknown>[] = [];
vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: (fn: () => unknown) => void afterWork.push(Promise.resolve().then(fn)),
}));
const resonateWith = vi.fn();
const unresonate = vi.fn();
vi.mock('@/lib/api/v1/resonate', () => ({
  resonateWith: (...a: unknown[]) => resonateWith(...a),
  unresonate: (...a: unknown[]) => unresonate(...a),
}));
const ringAfter = vi.fn();
vi.mock('@/lib/push/ring', () => ({ ringAfter: (...a: unknown[]) => ringAfter(...a) }));
const spend = vi.fn();
vi.mock('@/lib/api/rateLimit', () => ({ spend: (...a: unknown[]) => spend(...a) }));

const { POST } = await import('./route');
const { DELETE } = await import('./[cardId]/route');
const { ApiFailure } = await import('@/lib/api/v1/http');

const settled = async () => {
  await Promise.all(afterWork);
  return revalidatePath.mock.calls.map(([p]) => p);
};
const post = (body: unknown, key = 'orig') =>
  POST(
    new Request(`http://localhost/api/v1/cards/${key}/resonances`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }),
    { params: Promise.resolve({ key }) },
  );
const del = (key: string, cardId: string) =>
  DELETE(new Request(`http://localhost/api/v1/cards/${key}/resonances/${cardId}`, { method: 'DELETE' }), {
    params: Promise.resolve({ key, cardId }),
  });

const CARD = { id: 'mine', referenceCardId: 'orig' };
const STALE = ['/card/mine', '/card/slug-mine'];
const LOCALIZED = ['/en/card/mine', '/zh-TW/card/mine', '/en/card/slug-mine', '/zh-TW/card/slug-mine'];

beforeEach(() => {
  vi.clearAllMocks();
  afterWork = [];
  getCurrentUser.mockResolvedValue({ id: 'alice' });
  spend.mockResolvedValue(undefined);
  resonateWith.mockResolvedValue({ card: CARD, changed: true, notificationId: 'resonance_alice_orig', stale: STALE });
  unresonate.mockResolvedValue({ changed: true, stale: STALE });
});

describe('POST /api/v1/cards/{id}/resonances', () => {
  it("answers the card and whether it changed, rings the original's author and revalidates the card's pages in every locale", async () => {
    const res = await post({ cardId: 'mine' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ card: CARD, changed: true });
    expect(spend).toHaveBeenCalledWith({}, 'alice', 'resonate');
    expect(resonateWith).toHaveBeenCalledWith({}, 'alice', 'orig', 'mine');
    expect(ringAfter).toHaveBeenCalledWith({}, 'resonance_alice_orig');
    expect(await settled()).toEqual(LOCALIZED);
    // A write: Firebase Auth is asked whether the session still stands.
    expect(getCurrentUser).toHaveBeenCalledWith({ revocation: 'live' });
  });

  it('revalidates nothing when the card already answered it', async () => {
    resonateWith.mockResolvedValue({ card: CARD, changed: false, notificationId: null, stale: [] });
    const res = await post({ cardId: 'mine' });
    expect(await res.json()).toEqual({ card: CARD, changed: false });
    expect(ringAfter).toHaveBeenCalledWith({}, null);
    expect(await settled()).toEqual([]);
  });

  it('is 429 over budget, changing nothing', async () => {
    spend.mockRejectedValue(new ApiFailure('rate_limited', 'Too many requests. Please try again later.'));
    const res = await post({ cardId: 'mine' });
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe('rate_limited');
    expect(resonateWith).not.toHaveBeenCalled();
  });

  it("passes the service's refusals on with their status, ringing and revalidating nothing", async () => {
    for (const [code, status] of [['conflict', 409], ['blocked', 403], ['not_found', 404], ['invalid_request', 400]] as const) {
      resonateWith.mockRejectedValueOnce(new ApiFailure(code, 'no'));
      const res = await post({ cardId: 'mine' });
      expect(res.status).toBe(status);
      expect((await res.json()).error.code).toBe(code);
    }
    expect(ringAfter).not.toHaveBeenCalled();
    expect(await settled()).toEqual([]);
  });

  it('refuses a body off the contract, and ids that could address another document', async () => {
    expect((await post({})).status).toBe(400);
    expect((await post('not json')).status).toBe(400);
    expect((await post({ cardId: 'cards/mine' })).status).toBe(400);
    expect((await post({ cardId: 'mine' }, 'a/b')).status).toBe(400);
    expect(spend).not.toHaveBeenCalled();
    expect(resonateWith).not.toHaveBeenCalled();
  });

  it('is 401 for nobody signed in', async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await post({ cardId: 'mine' })).status).toBe(401);
    expect(resonateWith).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/cards/{id}/resonances/{cardId}', () => {
  it("answers 204 and revalidates the card's pages", async () => {
    const res = await del('orig', 'mine');
    expect(res.status).toBe(204);
    expect(unresonate).toHaveBeenCalledWith({}, 'alice', 'orig', 'mine');
    expect(await settled()).toEqual(LOCALIZED);
    expect(spend).not.toHaveBeenCalled();
  });

  it('answers 204 again when it no longer answered it, revalidating nothing', async () => {
    unresonate.mockResolvedValue({ changed: false, stale: [] });
    expect((await del('orig', 'mine')).status).toBe(204);
    expect(await settled()).toEqual([]);
  });

  it("is 404 for a card that isn't yours, and 400 for an id off the contract", async () => {
    unresonate.mockRejectedValueOnce(new ApiFailure('not_found', 'No such card.'));
    expect((await del('orig', 'bobs')).status).toBe(404);
    expect((await del('orig', '__x__.')).status).toBe(400);
    expect(await settled()).toEqual([]);
  });
});

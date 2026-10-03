import { beforeEach, describe, expect, it, vi } from 'vitest';

// The card routes around the services: what they read from the request, and
// that every change that can take a card out of public view drops its cached
// pages — in every locale, after the response — and, when it was or is
// listable (the landing page among them), the sitemap.

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
const getCardDetail = vi.fn();
vi.mock('@/lib/api/v1/reads', () => ({ getCardDetail: (...a: unknown[]) => getCardDetail(...a) }));
const updateCard = vi.fn();
const deleteCard = vi.fn();
vi.mock('@/lib/api/v1/cards', () => ({
  updateCard: (...a: unknown[]) => updateCard(...a),
  deleteCard: (...a: unknown[]) => deleteCard(...a),
}));
const applyCardEdit = vi.fn();
vi.mock('@/lib/api/v1/edits', () => ({ applyCardEdit: (...a: unknown[]) => applyCardEdit(...a) }));
const indexCard = vi.fn(async (_id: string) => ({ indexed: true }));
vi.mock('@/lib/recommend/indexCard', () => ({ indexCard: (id: string) => indexCard(id) }));
const ringAfter = vi.fn();
vi.mock('@/lib/push/ring', () => ({ ringAfter: (...a: unknown[]) => ringAfter(...a) }));

const { GET, PATCH, DELETE } = await import('./route');
const { POST: applyEdit } = await import('./edits/apply/route');

const ctx = (key: string) => ({ params: Promise.resolve({ key }) });
const settled = async () => {
  await Promise.all(afterWork);
  return revalidatePath.mock.calls.map(([p]) => p);
};
const STALE = ['/card/c1', '/card/a-walk', '/u/alice', '/'];
const LOCALIZED = ['/en/card/c1', '/zh-TW/card/c1', '/en/card/a-walk', '/zh-TW/card/a-walk', '/en/u/alice', '/zh-TW/u/alice', '/en', '/zh-TW', '/sitemap.xml'];

beforeEach(() => {
  vi.clearAllMocks();
  afterWork = [];
  getCurrentUser.mockResolvedValue({ id: 'alice' });
});

describe('GET /api/v1/cards/{key}', () => {
  it('passes the lists asked for, ignoring names it does not know', async () => {
    getCardDetail.mockResolvedValue({ card: { id: 'c1' } });
    const res = await GET(new Request('http://localhost/api/v1/cards/a-walk?include=embeds,%20resonances,likes,'), ctx('a-walk'));
    expect(res.status).toBe(200);
    expect(getCardDetail).toHaveBeenCalledWith({}, 'alice', 'a-walk', new Set(['embeds', 'resonances']));
    await GET(new Request('http://localhost/api/v1/cards/a-walk'), ctx('a-walk'));
    expect(getCardDetail).toHaveBeenLastCalledWith({}, 'alice', 'a-walk', new Set());
  });
});

describe('PATCH /api/v1/cards/{id}', () => {
  const patch = (body: unknown, key = 'c1') =>
    PATCH(new Request(`http://localhost/api/v1/cards/${key}`, { method: 'PATCH', body: JSON.stringify(body) }), ctx(key));

  it("answers the card and revalidates its pages and its author's profile in every locale", async () => {
    updateCard.mockResolvedValue({ card: { id: 'c1', visibility: 'private' }, stale: STALE });
    const res = await patch({ visibility: 'private', anonymous: null });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'c1', visibility: 'private' });
    expect(updateCard).toHaveBeenCalledWith({}, 'alice', 'c1', { visibility: 'private', anonymous: null });
    expect(await settled()).toEqual(LOCALIZED);
    // Writes ask Firebase Auth whether the session still stands.
    expect(getCurrentUser).toHaveBeenCalledWith({ revocation: 'live' });
  });

  it('revalidates nothing when nothing changed', async () => {
    updateCard.mockResolvedValue({ card: { id: 'c1' }, stale: [], notificationId: null });
    await patch({ visibility: 'public' });
    expect(await settled()).toEqual([]);
    expect(ringAfter).toHaveBeenCalledWith({}, null);
  });

  it("rings the original's author after the response when the change let a resonance reach them, keeping the bell out of the answer", async () => {
    updateCard.mockResolvedValue({ card: { id: 'c1', visibility: 'public' }, stale: STALE, notificationId: 'resonance_alice_orig' });
    const res = await patch({ visibility: 'public' });
    expect(await res.json()).toEqual({ id: 'c1', visibility: 'public' });
    expect(ringAfter).toHaveBeenCalledWith({}, 'resonance_alice_orig');
  });

  it('refuses a body off the contract, and a slug where an id belongs', async () => {
    expect((await patch({ visibility: 'everyone' })).status).toBe(400);
    expect((await patch({ anonymous: 'yes' })).status).toBe(400);
    expect((await patch({ visibility: 'private' }, 'a/b')).status).toBe(400);
    expect(updateCard).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/cards/{id}', () => {
  it('answers 204 and revalidates the pages that showed the card', async () => {
    deleteCard.mockResolvedValue({ stale: STALE });
    const res = await DELETE(new Request('http://localhost/api/v1/cards/c1', { method: 'DELETE' }), ctx('c1'));
    expect(res.status).toBe(204);
    expect(deleteCard).toHaveBeenCalledWith({}, 'alice', 'c1');
    expect(await settled()).toEqual(LOCALIZED);
  });

  it("is 404 for a card that isn't yours, revalidating nothing", async () => {
    const { ApiFailure } = await import('@/lib/api/v1/http');
    deleteCard.mockRejectedValue(new ApiFailure('not_found', 'No such card.'));
    const res = await DELETE(new Request('http://localhost/api/v1/cards/c1', { method: 'DELETE' }), ctx('c1'));
    expect(res.status).toBe(404);
    expect(await settled()).toEqual([]);
  });
});

describe('POST /api/v1/cards/{id}/edits/apply', () => {
  const apply = () => applyEdit(new Request('http://localhost/api/v1/cards/c1/edits/apply', { method: 'POST' }), ctx('c1'));

  it('keeps the page list and the bell out of the answer, revalidates the card by id and slug and the profile, and rings a resonance it made reach out', async () => {
    applyCardEdit.mockResolvedValue({ id: 'c1', slug: 'a-walk', applied: true, stale: STALE, notificationId: 'resonance_alice_orig' });
    const res = await apply();
    expect(await res.json()).toEqual({ id: 'c1', slug: 'a-walk', applied: true });
    expect(ringAfter).toHaveBeenCalledWith({}, 'resonance_alice_orig');
    expect(await settled()).toEqual(LOCALIZED);
    expect(indexCard).toHaveBeenCalledWith('c1');
  });

  it('does nothing after a retry that applied nothing', async () => {
    applyCardEdit.mockResolvedValue({ id: 'c1', slug: 'a-walk', applied: false, stale: [] });
    await apply();
    expect(await settled()).toEqual([]);
    expect(indexCard).not.toHaveBeenCalled();
  });
});

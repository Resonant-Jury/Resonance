import { beforeEach, describe, expect, it, vi } from 'vitest';

// POST /api/v1/invites/{id}/accept: spends the caller's budget, accepts
// (apiV1Invites.emulator.test.ts covers the transaction), and rings the
// sender's bell after the response — the bell row's id never leaves the server.

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => ({}) }));
const acceptInvite = vi.fn();
vi.mock('@/lib/api/v1/invites', () => ({ acceptInvite: (...a: unknown[]) => acceptInvite(...a) }));
const ringAfter = vi.fn();
vi.mock('@/lib/push/ring', () => ({ ringAfter: (...a: unknown[]) => ringAfter(...a) }));
const spend = vi.fn();
vi.mock('@/lib/api/rateLimit', () => ({ spend: (...a: unknown[]) => spend(...a) }));

const { POST } = await import('./route');
const { ApiFailure } = await import('@/lib/api/v1/http');
const accept = (id: string) =>
  POST(new Request(`http://localhost/api/v1/invites/${id}/accept`, { method: 'POST' }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'alice' });
  spend.mockResolvedValue(undefined);
  acceptInvite.mockResolvedValue({ connectionId: 'alice_bob', notificationId: 'n1' });
});

describe('POST /api/v1/invites/{id}/accept', () => {
  it('answers the connection and rings the bell it wrote', async () => {
    const res = await accept('i1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ connectionId: 'alice_bob' });
    expect(spend).toHaveBeenCalledWith({}, 'alice', 'invite');
    expect(acceptInvite).toHaveBeenCalledWith({}, 'alice', 'i1');
    expect(ringAfter).toHaveBeenCalledWith({}, 'n1');
  });

  it('is 429 over budget, accepting nothing', async () => {
    spend.mockRejectedValue(new ApiFailure('rate_limited', 'Too many requests. Please try again later.'));
    expect((await accept('i1')).status).toBe(429);
    expect(acceptInvite).not.toHaveBeenCalled();
  });

  it("maps the service's refusals: a block, an invite no longer open, someone else's", async () => {
    for (const [code, status] of [['blocked', 403], ['conflict', 409], ['not_found', 404]] as const) {
      acceptInvite.mockRejectedValueOnce(new ApiFailure(code, 'no'));
      expect((await accept('i1')).status).toBe(status);
    }
    expect(ringAfter).not.toHaveBeenCalled();
  });

  it('refuses an id that could address another document', async () => {
    expect((await accept(encodeURIComponent('i1/../x'))).status).toBe(400);
    expect(acceptInvite).not.toHaveBeenCalled();
  });
});

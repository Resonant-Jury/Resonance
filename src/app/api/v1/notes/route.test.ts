import { beforeEach, describe, expect, it, vi } from 'vitest';

// POST /api/v1/notes: spends the caller's budget, sends (apiV1Conversations
// covers the transaction) and rings the author once after the response —
// through the chat push when the note went into their thread, through its
// bell row when the card is anonymous. Neither id leaves the server.

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => ({}) }));
const sendNote = vi.fn();
vi.mock('@/lib/api/v1/conversations', () => ({ sendNote: (...a: unknown[]) => sendNote(...a) }));
const refusalForPreLetterBuild = vi.fn();
vi.mock('@/lib/api/v1/preLetter', () => ({ refusalForPreLetterBuild: (...a: unknown[]) => refusalForPreLetterBuild(...a) }));
const afterNoteSent = vi.fn();
vi.mock('@/lib/api/v1/afterMessage', () => ({ afterNoteSent: (...a: unknown[]) => afterNoteSent(...a) }));
const ringAfter = vi.fn();
vi.mock('@/lib/push/ring', () => ({ ringAfter: (...a: unknown[]) => ringAfter(...a) }));
const spend = vi.fn();
vi.mock('@/lib/api/rateLimit', () => ({ spend: (...a: unknown[]) => spend(...a) }));

const { POST } = await import('./route');
const { ApiFailure } = await import('@/lib/api/v1/http');
const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request('http://localhost/api/v1/notes', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } }));

const push = { conversationId: 'alice_bob', messageId: 'n1', from: 'alice', to: 'bob' };

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'alice' });
  spend.mockResolvedValue(undefined);
  sendNote.mockResolvedValue({ id: 'n1', notificationId: 'bell1', push, duplicate: false });
  // Every refusal as it is, unless the request comes from a build before letters (preLetter.test.ts).
  refusalForPreLetterBuild.mockImplementation(async (_db: unknown, _uid: unknown, _req: unknown, e: unknown) => e);
});

describe('POST /api/v1/notes', () => {
  it("answers the note's id and rings the author through the chat push when the note went into their thread", async () => {
    const res = await post({ cardId: 'walk', text: '  謝謝你  ' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'n1' });
    expect(spend).toHaveBeenCalledWith({}, 'alice', 'note');
    expect(sendNote).toHaveBeenCalledWith({}, 'alice', { cardId: 'walk', text: '謝謝你' });
    expect(afterNoteSent).toHaveBeenCalledWith({}, push);
    // Its bell row is already marked pushed: never two buzzes.
    expect(ringAfter).not.toHaveBeenCalled();
  });

  it('rings the bell row of a note on an anonymous card, which stays out of every thread', async () => {
    sendNote.mockResolvedValue({ id: 'n2', notificationId: 'bell2', push: null, duplicate: false });
    const res = await post({ cardId: 'masked', text: 'hi' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'n2' });
    expect(ringAfter).toHaveBeenCalledWith({}, 'bell2');
    expect(afterNoteSent).not.toHaveBeenCalled();
  });

  // A retry after a lost answer: the note was left and rang the first time.
  it('answers a resend of a clientId as the first send was answered, ringing no one', async () => {
    const clientId = 'client-0123456789abcdef';
    sendNote.mockResolvedValue({ id: clientId, notificationId: null, push: null, duplicate: true });
    const res = await post({ cardId: 'walk', text: 'hi', clientId });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: clientId });
    expect(sendNote).toHaveBeenCalledWith({}, 'alice', { cardId: 'walk', text: 'hi', clientId });
    expect(afterNoteSent).not.toHaveBeenCalled();
    expect(ringAfter).not.toHaveBeenCalled();
  });

  it('refuses a clientId the contract does not take, sending nothing', async () => {
    for (const clientId of ['short', 'has/slash-0123456789', 'x'.repeat(65), 7]) {
      expect((await post({ cardId: 'walk', text: 'hi', clientId })).status).toBe(400);
    }
    // Older builds send none; Kotlin clients send null.
    for (const clientId of [undefined, null]) expect((await post({ cardId: 'walk', text: 'hi', clientId })).status).toBe(201);
    expect(sendNote).toHaveBeenCalledTimes(2);
  });

  it('is 429 over budget, sending nothing', async () => {
    spend.mockRejectedValue(new ApiFailure('rate_limited', 'Too many requests. Please try again later.'));
    expect((await post({ cardId: 'walk', text: 'hi' })).status).toBe(429);
    expect(sendNote).not.toHaveBeenCalled();
  });

  it("rings nothing when the service refuses: a block, a card you can't read", async () => {
    for (const [code, status] of [['blocked', 403], ['not_found', 404]] as const) {
      sendNote.mockRejectedValueOnce(new ApiFailure(code, 'no'));
      expect((await post({ cardId: 'walk', text: 'hi' })).status).toBe(status);
    }
    expect(afterNoteSent).not.toHaveBeenCalled();
    expect(ringAfter).not.toHaveBeenCalled();
  });

  // Builds before letters know no 409 here, but show a 403's message (lib/api/v1/preLetter; apiV1PreLetter.emulator.test.ts).
  it('answers each refusal as a build before letters is to get it, ringing nothing', async () => {
    const limit = new ApiFailure('conflict', 'Wait for them to reply.');
    sendNote.mockRejectedValue(limit);
    refusalForPreLetterBuild.mockResolvedValueOnce(new ApiFailure('forbidden', '你留的紙條對方還沒回覆，先等等對方吧'));
    const res = await post({ cardId: 'walk', text: 'hi' }, { 'User-Agent': 'Resonance/2.0.0 (Android 15; build 7)' });
    expect([res.status, await res.json()]).toEqual([403, { error: { code: 'forbidden', message: '你留的紙條對方還沒回覆，先等等對方吧' } }]);
    expect(refusalForPreLetterBuild).toHaveBeenCalledWith({}, 'alice', expect.any(Request), limit);
    expect(refusalForPreLetterBuild.mock.calls[0][2].headers.get('user-agent')).toBe('Resonance/2.0.0 (Android 15; build 7)');
    // As it is otherwise.
    expect((await post({ cardId: 'walk', text: 'hi' })).status).toBe(409);
    expect(afterNoteSent).not.toHaveBeenCalled();
    expect(ringAfter).not.toHaveBeenCalled();
  });

  it('refuses an empty note and a card id that could address another document', async () => {
    expect((await post({ cardId: 'walk', text: '   ' })).status).toBe(400);
    expect((await post({ cardId: 'cards/walk', text: 'hi' })).status).toBe(400);
    expect(sendNote).not.toHaveBeenCalled();
  });
});

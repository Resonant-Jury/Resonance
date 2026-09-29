import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Sending a note goes through the server (POST /api/v1/notes), which finds the
// card's author itself — the client never names the recipient.
vi.mock('./init', () => ({ getClientDb: vi.fn(() => ({})) }));
const mockAuth = { currentUser: { uid: 'me' } as { uid: string } | null };
vi.mock('@/lib/auth/firebase/client', () => ({ getFirebaseClientAuth: vi.fn(() => mockAuth) }));

import { sendNote } from './notes';

const fetchMock = vi.fn();
beforeEach(() => {
  mockAuth.currentUser = { uid: 'me' };
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('sendNote', () => {
  it('posts the card and the trimmed text, and answers the new note id', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'n1' }), { status: 201 }));
    await expect(sendNote({ cardId: 'c1', text: '  thank you  ' })).resolves.toBe('n1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/notes');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ cardId: 'c1', text: 'thank you' });
  });

  it("surfaces the server's reason when it refuses", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'blocked', message: 'You cannot send a note to this person.' } }), { status: 403 }),
    );
    await expect(sendNote({ cardId: 'c1', text: 'hi' })).rejects.toThrow('You cannot send a note to this person.');
  });

  it('never calls out for an empty or overlong note, or when signed out', async () => {
    await expect(sendNote({ cardId: 'c1', text: '   ' })).rejects.toThrow('Note is empty');
    await expect(sendNote({ cardId: 'c1', text: 'x'.repeat(2001) })).rejects.toThrow('Note too long');
    mockAuth.currentUser = null;
    await expect(sendNote({ cardId: 'c1', text: 'hi' })).rejects.toThrow('Not signed in');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

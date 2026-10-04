import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Sending a note goes through the server (POST /api/v1/notes), which finds the
// card's author itself — the client never names the recipient.
vi.mock('./init', () => ({ getClientDb: vi.fn(() => ({})) }));
type MockUser = { uid: string; getIdToken: () => Promise<string> };
const mockAuth = { currentUser: { uid: 'me', getIdToken: async () => 'id-token' } as MockUser | null };
vi.mock('@/lib/auth/firebase/client', () => ({ getFirebaseClientAuth: vi.fn(() => mockAuth) }));

import { ApiError } from './api';
import { sendNote } from './notes';

const fetchMock = vi.fn();
beforeEach(() => {
  mockAuth.currentUser = { uid: 'me', getIdToken: async () => 'id-token' };
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
    // As the signed-in writer, whatever the session cookie is doing.
    expect(init.headers.Authorization).toBe('Bearer id-token');
  });

  it('sends the clientId it is given, for the server to find a note whose answer was lost', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'client-0123456789abcdef' }), { status: 201 }));
    await expect(sendNote({ cardId: 'c1', text: 'hi', clientId: 'client-0123456789abcdef' })).resolves.toBe('client-0123456789abcdef');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ cardId: 'c1', text: 'hi', clientId: 'client-0123456789abcdef' });
  });

  it('says a letter is full as a conflict, for the composer to ask the writer to wait', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'conflict', message: 'Wait for them to reply.' } }), { status: 409 }),
    );
    const refused = await sendNote({ cardId: 'c1', text: 'hi' }).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(ApiError);
    expect(refused).toMatchObject({ status: 409, code: 'conflict' });
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

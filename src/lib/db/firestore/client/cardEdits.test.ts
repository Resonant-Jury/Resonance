import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Firebase boundary mocks ------------------------------------------------
// These functions are the whole reason a published card's autosave is safe:
// edits must land in `cards/{id}/edits/current` and never on the card itself,
// and only the server applies them. Mock the SDK and the network and assert
// the document paths, payloads and calls our code chooses.
vi.mock('./init', () => ({ getClientDb: vi.fn(() => ({ __db: true })) }));

type MockUser = { uid: string; getIdToken: () => Promise<string> };
const signedIn = (): MockUser => ({ uid: 'me', getIdToken: async () => 'id-token' });
const mockAuth = { currentUser: signedIn() as MockUser | null };
vi.mock('@/lib/auth/firebase/client', () => ({
  getFirebaseClientAuth: vi.fn(() => mockAuth),
}));

vi.mock('firebase/firestore/lite', () => ({
  // doc(db, ...segments) → a stand-in that records the path it addresses.
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  deleteDoc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => '<server-time>'),
  Timestamp: class {},
}));

import { deleteDoc, getDoc, setDoc } from 'firebase/firestore/lite';
import {
  applyPendingCardEdit,
  discardPendingCardEdit,
  getPendingCardEdit,
  savePendingCardEdit,
  type CardEditValues,
} from './cardEdits';

const EDIT_PATH = 'cards/card-1/edits/current';

const values: CardEditValues = {
  thoughtCore: 'A revised title',
  story: 'A revision still being written.',
  tags: ['memory'],
  visibility: 'public',
  media: { type: 'image', url: 'https://cdn/x.avif' },
  accentHue: 55,
  anonymous: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.currentUser = signedIn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pending card edits', () => {
  it('autosaves into the card’s private edits doc, never the card itself', async () => {
    await savePendingCardEdit('card-1', values);

    expect(setDoc).toHaveBeenCalledTimes(1);
    const [ref, payload] = vi.mocked(setDoc).mock.calls[0];
    expect((ref as unknown as { path: string }).path).toBe(EDIT_PATH);
    // It names its author: the account purge finds it even once its card is gone.
    expect(payload).toMatchObject({ ...values, authorId: 'me', updatedAt: '<server-time>' });
    // The live document is what readers are looking at — it must stay untouched
    // until the author explicitly saves.
    expect(
      vi.mocked(setDoc).mock.calls.some(
        ([r]) => (r as unknown as { path: string }).path === 'cards/card-1',
      ),
    ).toBe(false);
  });

  it('refuses to autosave when nobody is signed in', async () => {
    mockAuth.currentUser = null;
    await expect(savePendingCardEdit('card-1', values)).rejects.toThrow('Not signed in');
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('reads a buffered working copy back', async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ ...values, updatedAt: null }),
    } as never);

    const pending = await getPendingCardEdit('card-1');
    expect(pending).toMatchObject({
      thoughtCore: 'A revised title',
      tags: ['memory'],
      accentHue: 55,
      anonymous: false,
    });
  });

  it('reports no pending edit when there is none (or the read is denied)', async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
    await expect(getPendingCardEdit('card-1')).resolves.toBeNull();

    vi.mocked(getDoc).mockRejectedValue(Object.assign(new Error('Missing or insufficient permissions'), { code: 'permission-denied' }));
    await expect(getPendingCardEdit('card-1')).resolves.toBeNull();
  });

  // Opened on "no pending edit", the editor would autosave the live fields
  // over the working copy the read failed to fetch.
  it('lets a read that failed (offline) fail instead of reporting no pending edit', async () => {
    vi.mocked(getDoc).mockRejectedValue(Object.assign(new Error('Failed to get document because the client is offline.'), { code: 'unavailable' }));
    await expect(getPendingCardEdit('card-1')).rejects.toThrow('offline');
  });

  // The live card is what readers see: the server applies the revision (one
  // transaction, its date and slug kept, held to a card's limits — pinned in
  // test/emulator/apiV1Edits), never this browser.
  it('applies the revision through the API with the ID token, writing nothing itself', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: 'card-1', slug: 'a-revised-title', applied: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(applyPendingCardEdit('card-1')).resolves.toEqual({ id: 'card-1', slug: 'a-revised-title', applied: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/cards/card-1/edits/apply');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer id-token');
    expect(setDoc).not.toHaveBeenCalled();
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it("surfaces the server's refusal", async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: 'invalid_request', message: 'The edit does not fit a card.' } }), { status: 400 }),
    ));
    await expect(applyPendingCardEdit('card-1')).rejects.toMatchObject({ status: 400, code: 'invalid_request', message: 'The edit does not fit a card.' });
  });

  it('refuses to apply when nobody is signed in', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mockAuth.currentUser = null;
    await expect(applyPendingCardEdit('card-1')).rejects.toThrow('Not signed in');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('discards a working copy without touching the card', async () => {
    await discardPendingCardEdit('card-1');
    expect((vi.mocked(deleteDoc).mock.calls[0][0] as unknown as { path: string }).path).toBe(
      EDIT_PATH,
    );
    expect(setDoc).not.toHaveBeenCalled();
  });
});

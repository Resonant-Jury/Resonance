import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Firebase boundary mocks ------------------------------------------------
// These functions are the whole reason a published card's autosave is safe:
// edits must land in `cards/{id}/edits/current` and never on the card itself,
// and applying them must not touch `publishedAt`. Mock the SDK and assert the
// document paths and payloads our code chooses.
vi.mock('./init', () => ({ getClientDb: vi.fn(() => ({ __db: true })) }));

const mockAuth = { currentUser: { uid: 'me' } as { uid: string } | null };
vi.mock('@/lib/auth/firebase/client', () => ({
  getFirebaseClientAuth: vi.fn(() => mockAuth),
}));

const batch = { set: vi.fn(), delete: vi.fn(), commit: vi.fn() };
vi.mock('firebase/firestore/lite', () => ({
  // doc(db, ...segments) → a stand-in that records the path it addresses.
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(() => '<delete>'),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => '<server-time>'),
  writeBatch: vi.fn(() => batch),
  Timestamp: class {},
}));

import { deleteDoc, getDoc, setDoc, writeBatch } from 'firebase/firestore/lite';
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
  mockAuth.currentUser = { uid: 'me' };
  batch.commit.mockResolvedValue(undefined);
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

  it('applies the revision to the card and clears the buffer in one batch', async () => {
    vi.mocked(getDoc).mockResolvedValue({
      id: 'card-1',
      data: () => ({ authorId: 'me', slug: 'a-revised-title', ...values }),
    } as never);

    const card = await applyPendingCardEdit('card-1', values);

    expect(writeBatch).toHaveBeenCalledTimes(1);
    const [cardRef, payload, options] = batch.set.mock.calls[0];
    expect((cardRef as { path: string }).path).toBe('cards/card-1');
    expect(payload).toMatchObject(values);
    expect(options).toEqual({ merge: true });
    // Editing is not re-publishing: re-stamping publishedAt would re-date the
    // card and shove it back to the top of every feed.
    expect(payload).not.toHaveProperty('publishedAt');
    expect((batch.delete.mock.calls[0][0] as { path: string }).path).toBe(EDIT_PATH);
    expect(batch.commit).toHaveBeenCalled();
    expect(card.id).toBe('card-1');
  });

  it('removes the live cover when the revision removed it', async () => {
    vi.mocked(getDoc).mockResolvedValue({ id: 'card-1', data: () => ({ authorId: 'me' }) } as never);
    await applyPendingCardEdit('card-1', { ...values, media: undefined, accentHue: null });
    expect(batch.set.mock.calls[0][1]).toMatchObject({ media: '<delete>', accentHue: null });
  });

  it('discards a working copy without touching the card', async () => {
    await discardPendingCardEdit('card-1');
    expect((vi.mocked(deleteDoc).mock.calls[0][0] as unknown as { path: string }).path).toBe(
      EDIT_PATH,
    );
    expect(setDoc).not.toHaveBeenCalled();
  });
});

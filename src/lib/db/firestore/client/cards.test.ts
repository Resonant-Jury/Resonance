import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./init', () => ({ getClientDb: vi.fn(() => ({})) }));

const mockAuth = { currentUser: { uid: 'me' } as { uid: string } | null };
vi.mock('@/lib/auth/firebase/client', () => ({
  getFirebaseClientAuth: vi.fn(() => mockAuth),
}));
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(() => '<delete>'),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  serverTimestamp: vi.fn(() => '<server-time>'),
  setDoc: vi.fn(),
  Timestamp: class {},
}));

import { getDoc, setDoc } from 'firebase/firestore';
import { publishCard, updateCardDraft } from './cards';

function snapshot(publishedAt: unknown) {
  return {
    id: 'card-1',
    exists: () => true,
    data: () => ({ authorId: 'me', publishedAt }),
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.currentUser = { uid: 'me' };
});

describe('publishCard', () => {
  it('stamps publishedAt the first time a card goes out', async () => {
    vi.mocked(getDoc).mockResolvedValue(snapshot(null));
    await publishCard('card-1');
    expect(vi.mocked(setDoc).mock.calls[0][1]).toMatchObject({
      publishedAt: '<server-time>',
    });
  });

  // Regression: re-stamping an already-published card re-dates it. Every feed
  // orders by publishedAt, so a typo fix would shove the card back to the top
  // of everyone's home page and change the date shown on the card.
  it('leaves publishedAt alone on a card that is already published', async () => {
    vi.mocked(getDoc).mockResolvedValue(snapshot(new Date('2026-01-02')));
    await publishCard('card-1');
    const patch = vi.mocked(setDoc).mock.calls[0][1] as Record<string, unknown>;
    expect(patch).not.toHaveProperty('publishedAt');
    expect(patch).toMatchObject({ updatedAt: '<server-time>' });
  });
});

describe('updateCardDraft', () => {
  it('deletes a removed cover instead of leaving the old one behind', async () => {
    vi.mocked(getDoc).mockResolvedValue(snapshot(null));
    await updateCardDraft('card-1', { thoughtCore: 'x', media: undefined, accentHue: null });
    const [, payload, options] = vi.mocked(setDoc).mock.calls[0];
    expect(payload).toMatchObject({ media: '<delete>', accentHue: null });
    expect(options).toEqual({ merge: true });
  });

  it('leaves the cover alone when the patch does not mention it', async () => {
    vi.mocked(getDoc).mockResolvedValue(snapshot(null));
    await updateCardDraft('card-1', { thoughtCore: 'x' });
    expect(vi.mocked(setDoc).mock.calls[0][1]).not.toHaveProperty('media');
  });
});

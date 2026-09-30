import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./init', () => ({ getClientDb: vi.fn(() => ({})) }));

const mockAuth = {
  currentUser: { uid: 'me', getIdToken: async () => 'id-token' } as { uid: string; getIdToken: () => Promise<string> } | null,
};
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
  mockAuth.currentUser = { uid: 'me', getIdToken: async () => 'id-token' };
});

describe('publishCard', () => {
  // The rules keep publishedAt and the slug out of the browser's reach, so
  // publishing is one server call — the same one the apps make. (That it never
  // re-dates a published card is pinned in test/emulator/apiV1Publish.)
  it('publishes through the API with the ID token, never writing the card itself', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: 'card-1', slug: 'a-quiet-morning', firstPublish: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(publishCard('card-1')).resolves.toEqual({ id: 'card-1', slug: 'a-quiet-morning', firstPublish: true });
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe('/api/v1/cards/card-1/publish');
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer id-token');
      expect(setDoc).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('surfaces the server\'s refusal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: 'invalid_request', message: 'A card needs a title before it is published.' } }), { status: 400 }),
    ));
    try {
      await expect(publishCard('card-1')).rejects.toThrow('A card needs a title before it is published.');
    } finally {
      vi.unstubAllGlobals();
    }
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

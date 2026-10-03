import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./init', () => ({ getClientDb: vi.fn(() => ({})) }));

const mockAuth = {
  currentUser: { uid: 'me', getIdToken: async () => 'id-token' } as { uid: string; getIdToken: () => Promise<string> } | null,
};
vi.mock('@/lib/auth/firebase/client', () => ({
  getFirebaseClientAuth: vi.fn(() => mockAuth),
}));
vi.mock('firebase/firestore/lite', () => ({
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

import { getDoc, setDoc } from 'firebase/firestore/lite';
import { publishCard, resonateWith, unresonate, updateCardDraft } from './cards';
import { ApiError } from './api';

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

describe('resonateWith / unresonate', () => {
  // The rules never let the browser point a written card at another
  // (referenceCardId is set once, when a draft is made): both go through the
  // server, the same calls the apps make. (What the server checks is pinned
  // in test/emulator/apiV1Resonate.)
  it('points your card at the one you read through the API, with the ID token', async () => {
    const answer = { card: { id: 'mine', referenceCardId: 'orig' }, changed: true };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(answer), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(resonateWith('orig', 'mine')).resolves.toEqual(answer);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe('/api/v1/cards/orig/resonances');
      expect(init.method).toBe('POST');
      expect(JSON.parse(String(init.body))).toEqual({ cardId: 'mine' });
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer id-token');
      expect(setDoc).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("surfaces a conflict as the API's code, for the picker's own message", async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: 'conflict', message: 'This card already resonates with another card.' } }), { status: 409 }),
    ));
    try {
      const e = await resonateWith('orig', 'mine').catch((err: unknown) => err);
      expect(e).toBeInstanceOf(ApiError);
      expect(e).toMatchObject({ status: 409, code: 'conflict' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('takes it back with a DELETE naming both cards (204, no body)', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(unresonate('orig', 'mine')).resolves.toBeUndefined();
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe('/api/v1/cards/orig/resonances/mine');
      expect(init.method).toBe('DELETE');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('asks nothing of the server when nobody is signed in', async () => {
    mockAuth.currentUser = null;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(resonateWith('orig', 'mine')).rejects.toThrow('Not signed in');
      await expect(unresonate('orig', 'mine')).rejects.toThrow('Not signed in');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

// callApi: the signed-in user's ID token and, when one is at hand, the App
// Check token ride along; an error answer throws its code.

const auth = vi.hoisted(() => ({ currentUser: null as null | { getIdToken: () => Promise<string> } }));
vi.mock('@/lib/auth/firebase/client', () => ({ getFirebaseClientAuth: () => auth }));
vi.mock('@/lib/auth/firebase/appCheck', () => ({ appCheckHeaders: vi.fn(async () => ({ 'X-Firebase-AppCheck': 'app-check-token' })) }));

import { ApiError, callApi } from './api';

const fetch = vi.fn();

afterEach(() => {
  vi.unstubAllGlobals();
  fetch.mockReset();
  auth.currentUser = null;
});

describe('callApi', () => {
  it('sends the ID token and the App Check token', async () => {
    vi.stubGlobal('fetch', fetch);
    auth.currentUser = { getIdToken: async () => 'id-token' };
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: 1 })));
    expect(await callApi('/api/v1/me', { method: 'PATCH', body: { bio: 'hi' } })).toEqual({ ok: 1 });
    expect(fetch).toHaveBeenCalledWith('/api/v1/me', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ bio: 'hi' }),
      headers: { 'X-Firebase-AppCheck': 'app-check-token', Authorization: 'Bearer id-token', 'Content-Type': 'application/json' },
    }));
  });

  it('throws the answer’s error code', async () => {
    vi.stubGlobal('fetch', fetch);
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'not_found', message: 'No such card.' } }), { status: 404 }));
    await expect(callApi('/api/v1/cards/x')).rejects.toEqual(new ApiError(404, 'not_found', 'No such card.'));
  });
});

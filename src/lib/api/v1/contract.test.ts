import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getCurrentUser: () => getCurrentUser() }));
const sendMessage = vi.fn();
vi.mock('@/lib/api/v1/conversations', async (orig) => ({ ...(await orig()), sendMessage: (...a: unknown[]) => sendMessage(...a) }));
const ringAfter = vi.fn();
vi.mock('@/lib/push/ring', () => ({ ringAfter: (...a: unknown[]) => ringAfter(...a) }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => ({}) }));

const { buildOpenApi } = await import('./openapi');
const { POST } = await import('@/app/api/v1/messages/route');
const { ApiFailure } = await import('./http');

// The v1 contract as the native apps see it: the committed OpenAPI file is
// what their clients are generated from, and every error has the same shape.

describe('OpenAPI document', () => {
  it('is up to date with the Zod schemas (run `npm run api:openapi`)', () => {
    const committed = JSON.parse(readFileSync(resolve(__dirname, '../../../../openapi/v1/openapi.json'), 'utf8'));
    expect(committed).toEqual(buildOpenApi());
  });

  it('lets clients tolerate new fields (no additionalProperties: false)', () => {
    expect(JSON.stringify(buildOpenApi())).not.toContain('"additionalProperties":false');
  });
});

describe('POST /api/v1/messages (every write route shares these)', () => {
  const post = (body: unknown) =>
    POST(new Request('http://localhost/api/v1/messages', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));

  beforeEach(() => {
    getCurrentUser.mockReset().mockResolvedValue({ id: 'alice' });
    sendMessage.mockReset().mockResolvedValue({ conversationId: 'alice_bob', id: 'm1', notificationId: 'n1' });
    ringAfter.mockReset();
  });

  it('is 401 with the ApiError shape when nobody is signed in', async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await post({ to: 'bob', text: 'hi' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: 'unauthenticated', message: expect.any(String) } });
  });

  it('validates the body against the contract and names the bad fields', async () => {
    const res = await post({ to: '', text: 5 });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_request');
    expect(body.error.issues.map((i: { path: string }) => i.path).sort()).toEqual(['text', 'to']);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('refuses ids that could address another document path', async () => {
    const res = await post({ to: 'alice/blocks/bob', text: 'hi' });
    expect(res.status).toBe(400);
    expect((await res.json()).error.issues.map((i: { path: string }) => i.path)).toEqual(['to']);
    expect((await post({ to: 'bob', text: 'hi', cardRef: '../x' })).status).toBe(400);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('rejects a body that is not JSON', async () => {
    const res = await post('not json');
    expect(res.status).toBe(400);
  });

  it('sends the trimmed text, answers 201 without internals, and rings the bell row after', async () => {
    const res = await post({ to: 'bob', text: '  hi  ', extra: 'ignored' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ conversationId: 'alice_bob', id: 'm1' });
    expect(sendMessage).toHaveBeenCalledWith({}, 'alice', { to: 'bob', text: 'hi' });
    expect(ringAfter).toHaveBeenCalledWith({}, 'n1');
  });

  it('treats an explicit null on an optional field as absent (Kotlin clients send it)', async () => {
    const res = await post({ to: 'bob', text: 'hi', cardRef: null, noteRef: null });
    expect(res.status).toBe(201);
  });

  it('maps service failures to their status codes', async () => {
    sendMessage.mockRejectedValue(new ApiFailure('forbidden', 'You can message people you are connected with.'));
    expect((await post({ to: 'bob', text: 'hi' })).status).toBe(403);
    sendMessage.mockRejectedValue(new ApiFailure('not_found', 'No such card.'));
    expect((await post({ to: 'bob', text: '', cardRef: 'c1' })).status).toBe(404);
  });

  it('never leaks internals on unexpected errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sendMessage.mockRejectedValue(new Error('Firestore exploded: secret detail'));
    const res = await post({ to: 'bob', text: 'hi' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret');
  });
});

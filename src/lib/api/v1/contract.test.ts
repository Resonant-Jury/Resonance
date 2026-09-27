import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getCurrentUser: () => getCurrentUser() }));
const createInvite = vi.fn();
vi.mock('@/lib/api/v1/service', async (orig) => ({ ...(await orig()), createInvite: (...a: unknown[]) => createInvite(...a) }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => ({}) }));

const { buildOpenApi } = await import('./openapi');
const { POST } = await import('@/app/api/v1/invites/route');
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

describe('POST /api/v1/invites', () => {
  const post = (body: unknown) =>
    POST(new Request('http://localhost/api/v1/invites', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));

  beforeEach(() => {
    getCurrentUser.mockReset().mockResolvedValue({ id: 'alice' });
    createInvite.mockReset().mockResolvedValue('inv-1');
  });

  it('is 401 with the ApiError shape when nobody is signed in', async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await post({ toUserId: 'bob', message: 'hi' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: 'unauthenticated', message: expect.any(String) } });
  });

  it('validates the body against the contract and names the bad fields', async () => {
    const res = await post({ toUserId: '', message: '   ' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_request');
    expect(body.error.issues.map((i: { path: string }) => i.path).sort()).toEqual(['message', 'toUserId']);
    expect(createInvite).not.toHaveBeenCalled();
  });

  it('refuses ids that could address another document path', async () => {
    const res = await post({ toUserId: 'alice/blocks/bob', message: 'hi' });
    expect(res.status).toBe(400);
    expect((await res.json()).error.issues.map((i: { path: string }) => i.path)).toEqual(['toUserId']);
    expect((await post({ toUserId: 'bob', message: 'hi', referenceCardId: '../x' })).status).toBe(400);
    expect(createInvite).not.toHaveBeenCalled();
  });

  it('rejects a body that is not JSON', async () => {
    const res = await post('not json');
    expect(res.status).toBe(400);
  });

  it('creates the invite with the trimmed message and answers 201', async () => {
    const res = await post({ toUserId: 'bob', message: '  hi  ', extra: 'ignored' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'inv-1' });
    expect(createInvite).toHaveBeenCalledWith({}, 'alice', { toUserId: 'bob', message: 'hi' });
  });

  it('treats an explicit null on an optional field as absent (Kotlin clients send it)', async () => {
    const res = await post({ toUserId: 'bob', message: 'hi', referenceCardId: null });
    expect(res.status).toBe(201);
  });

  it('maps service failures to their status codes', async () => {
    createInvite.mockRejectedValue(new ApiFailure('rate_limited', 'At most 3 invites a day.'));
    expect((await post({ toUserId: 'bob', message: 'hi' })).status).toBe(429);
    createInvite.mockRejectedValue(new ApiFailure('blocked', 'nope'));
    expect((await post({ toUserId: 'bob', message: 'hi' })).status).toBe(403);
  });

  it('never leaks internals on unexpected errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    createInvite.mockRejectedValue(new Error('Firestore exploded: secret detail'));
    const res = await post({ toUserId: 'bob', message: 'hi' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret');
  });
});

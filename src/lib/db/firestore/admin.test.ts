import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// How the server's Firestore client is made: gRPC unless a deployment asks for
// REST (to compare cold starts), and the push SDK only loaded to send a push.

const apps: object[] = [];
vi.mock('firebase-admin/app', () => ({
  getApps: () => apps,
  getApp: () => apps[0],
  initializeApp: vi.fn(() => {
    const app = { name: '[DEFAULT]' };
    apps.push(app);
    return app;
  }),
  cert: vi.fn(() => ({})),
  applicationDefault: vi.fn(() => ({})),
}));
const getFirestore = vi.fn(() => ({ kind: 'grpc' }));
const initializeFirestore = vi.fn(() => ({ kind: 'rest' }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore, initializeFirestore }));
let messagingLoaded = false;
vi.mock('firebase-admin/messaging', () => {
  messagingLoaded = true;
  return { getMessaging: () => ({ kind: 'messaging' }) };
});

const { getAdminDb, getAdminMessaging, prefersRest } = await import('./admin');

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getAdminDb', () => {
  it('speaks gRPC by default', () => {
    vi.stubEnv('FIRESTORE_PREFER_REST', '');
    expect(getAdminDb()).toEqual({ kind: 'grpc' });
    expect(initializeFirestore).not.toHaveBeenCalled();
  });

  it('speaks REST when the deployment asks (FIRESTORE_PREFER_REST=1), on the app the auth module may already have made', () => {
    vi.stubEnv('FIRESTORE_PREFER_REST', '1');
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', '');
    expect(getAdminDb()).toEqual({ kind: 'rest' });
    expect(initializeFirestore).toHaveBeenCalledWith(apps[0], { preferRest: true });
  });

  it('never asks for REST against the emulator (its REST client wants Google credentials)', () => {
    expect(prefersRest({ FIRESTORE_PREFER_REST: '1', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' })).toBe(false);
    expect(prefersRest({ FIRESTORE_PREFER_REST: '1' })).toBe(true);
    expect(prefersRest({})).toBe(false);
  });
});

describe('getAdminMessaging', () => {
  it('loads the push SDK only when a push is sent', async () => {
    getAdminDb();
    expect(messagingLoaded).toBe(false);
    expect(await getAdminMessaging()).toEqual({ kind: 'messaging' });
    expect(messagingLoaded).toBe(true);
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The browser side of sign-in: who is signed in reaches the UI the moment
// the Firebase SDK knows it, while the server session cookie (needed only by
// the middleware and cookie-authenticated /api routes) is minted behind it —
// once, and only when it's missing or nearly spent.

const fb = vi.hoisted(() => {
  const auth = { currentUser: null as unknown };
  return {
    auth,
    listeners: [] as ((user: unknown) => void)[],
    getAuth: vi.fn(() => auth),
    initializeAuth: vi.fn(() => auth),
    signInWithPopup: vi.fn(),
    signOut: vi.fn(async () => undefined),
  };
});
vi.mock('firebase/app', () => ({ getApps: () => [{}], initializeApp: vi.fn() }));
vi.mock('firebase/auth', () => ({
  getAuth: fb.getAuth,
  initializeAuth: fb.initializeAuth,
  onIdTokenChanged: (_auth: unknown, cb: (user: unknown) => void) => {
    fb.listeners.push(cb);
    return () => undefined;
  },
  onAuthStateChanged: vi.fn(),
  signInWithPopup: fb.signInWithPopup,
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: fb.signOut,
  connectAuthEmulator: vi.fn(),
  GoogleAuthProvider: class {
    setCustomParameters() {}
  },
  OAuthProvider: class {},
  browserPopupRedirectResolver: 'popup-resolver',
  indexedDBLocalPersistence: 'indexedDB',
  browserLocalPersistence: 'local',
  browserSessionPersistence: 'session',
}));
vi.mock('./native', () => ({
  isNativeApp: () => false,
  signInWithGoogleNative: vi.fn(),
  signInWithAppleNative: vi.fn(),
}));

const DAY = 24 * 60 * 60 * 1000;
const MARK = 'resonance:session';

function firebaseUser(uid: string) {
  return { uid, email: `${uid}@example.com`, phoneNumber: null, emailVerified: true, getIdToken: async () => `token-${uid}` };
}

/** POST /api/auth/session calls, each held open until released. */
let posts: { body: unknown; release: (res?: Partial<Response>) => void }[];
const fetchMock = vi.fn((url: string, init?: RequestInit) => {
  if (init?.method === 'POST') {
    return new Promise((resolve) => {
      posts.push({
        body: JSON.parse(String(init.body)),
        release: (res = {}) => resolve({ ok: true, json: async () => ({ ok: true }), ...res }),
      });
    });
  }
  return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
});
const sessionPosts = () => fetchMock.mock.calls.filter(([url, init]) => url === '/api/auth/session' && init?.method === 'POST');

/** A fresh copy of the module (its Auth instance and in-flight state are module-level). */
async function load() {
  vi.resetModules();
  return import('./client');
}

function remember(uid: string, expiresAt: number) {
  window.localStorage.setItem(MARK, JSON.stringify({ uid, expiresAt }));
}

/** Let promise callbacks run. */
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  posts = [];
  fb.listeners.length = 0;
  fb.auth.currentUser = null;
  fetchMock.mockClear();
  fb.getAuth.mockClear();
  fb.initializeAuth.mockClear();
  fb.signInWithPopup.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  window.localStorage.clear();
  window.history.replaceState({}, '', '/en/home');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('restoring a signed-in reader', () => {
  it('reports the user at once and mints a missing cookie behind it', async () => {
    const { firebaseClientAuthProvider } = await load();
    const seen: { id: string | undefined; ready: boolean }[] = [];
    let settled: Promise<void> = Promise.resolve();
    firebaseClientAuthProvider.subscribe((user, session) => {
      seen.push({ id: user?.id, ready: session.ready });
      settled = session.settled;
    });

    fb.listeners[0](firebaseUser('u1'));
    // The UI already knows who it is; the cookie is still on its way.
    expect(seen).toEqual([{ id: 'u1', ready: false }]);
    await flush();
    expect(sessionPosts()).toHaveLength(1);
    expect(posts[0].body).toEqual({ idToken: 'token-u1' });

    posts[0].release();
    await settled;
    const mark = JSON.parse(window.localStorage.getItem(MARK)!);
    expect(mark.uid).toBe('u1');
    expect(mark.expiresAt - Date.now()).toBeGreaterThan(6 * DAY);
  });

  it('sends nothing while the cookie has more than a day left', async () => {
    remember('u1', Date.now() + 3 * DAY);
    const { firebaseClientAuthProvider } = await load();
    const ready: boolean[] = [];
    firebaseClientAuthProvider.subscribe((_user, session) => ready.push(session.ready));

    fb.listeners[0](firebaseUser('u1'));
    fb.listeners[0](firebaseUser('u1')); // the hourly token refresh
    await flush();
    expect(sessionPosts()).toHaveLength(0);
    expect(ready).toEqual([true, true]);
  });

  it('refreshes a cookie with under a day left, without holding anything up', async () => {
    remember('u1', Date.now() + 2 * 60 * 60 * 1000);
    const { firebaseClientAuthProvider } = await load();
    const ready: boolean[] = [];
    firebaseClientAuthProvider.subscribe((_user, session) => ready.push(session.ready));

    fb.listeners[0](firebaseUser('u1'));
    expect(ready).toEqual([true]); // the old cookie still works meanwhile
    await flush();
    expect(sessionPosts()).toHaveLength(1);
  });

  it("mints anew for a different account than the cookie's", async () => {
    remember('someone-else', Date.now() + 5 * DAY);
    const { firebaseClientAuthProvider } = await load();
    const ready: boolean[] = [];
    firebaseClientAuthProvider.subscribe((_user, session) => ready.push(session.ready));

    fb.listeners[0](firebaseUser('u1'));
    expect(ready).toEqual([false]);
    await flush();
    expect(sessionPosts()).toHaveLength(1);
  });

  it('sends one request however many token ticks arrive while it is out', async () => {
    const { firebaseClientAuthProvider } = await load();
    firebaseClientAuthProvider.subscribe(() => undefined);
    fb.listeners[0](firebaseUser('u1'));
    fb.listeners[0](firebaseUser('u1'));
    await flush();
    fb.listeners[0](firebaseUser('u1'));
    await flush();
    expect(sessionPosts()).toHaveLength(1);
  });

  it("uses the lifetime the server reports, when it reports one", async () => {
    const { firebaseClientAuthProvider } = await load();
    let settled: Promise<void> = Promise.resolve();
    firebaseClientAuthProvider.subscribe((_u, session) => (settled = session.settled));
    fb.listeners[0](firebaseUser('u1'));
    await flush();
    posts[0].release({ json: async () => ({ ok: true, expiresIn: 2 * DAY }) });
    await settled;
    const { expiresAt } = JSON.parse(window.localStorage.getItem(MARK)!);
    expect(expiresAt - Date.now()).toBeLessThanOrEqual(2 * DAY);
    expect(expiresAt - Date.now()).toBeGreaterThan(2 * DAY - 60_000);
  });

  it('keeps working when storage is unavailable (it just mints on every load)', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const { firebaseClientAuthProvider } = await load();
    let settled: Promise<void> = Promise.resolve();
    const seen: (string | undefined)[] = [];
    firebaseClientAuthProvider.subscribe((user, session) => {
      seen.push(user?.id);
      settled = session.settled;
    });
    fb.listeners[0](firebaseUser('u1'));
    expect(seen).toEqual(['u1']);
    await flush();
    posts[0].release();
    await expect(settled).resolves.toBeUndefined();
  });

  it('forgets the cookie when no one is signed in', async () => {
    remember('u1', Date.now() + 5 * DAY);
    const { firebaseClientAuthProvider } = await load();
    const ready: boolean[] = [];
    firebaseClientAuthProvider.subscribe((_user, session) => ready.push(session.ready));
    fb.listeners[0](null);
    expect(ready).toEqual([true]);
    expect(window.localStorage.getItem(MARK)).toBeNull();
  });
});

describe('signing in and out', () => {
  it('waits for a fresh cookie on sign-in — one request, even as the listener fires too', async () => {
    remember('u1', Date.now() + 5 * DAY); // an explicit sign-in mints regardless
    const { firebaseClientAuthProvider } = await load();
    firebaseClientAuthProvider.subscribe(() => undefined);
    fb.signInWithPopup.mockImplementation(async () => {
      fb.listeners[0](firebaseUser('u1'));
      return { user: firebaseUser('u1') };
    });

    let done = false;
    const signingIn = firebaseClientAuthProvider.signInWithGoogle().then((u) => {
      done = true;
      return u;
    });
    await flush();
    expect(fb.signInWithPopup).toHaveBeenCalledWith(fb.auth, expect.anything(), 'popup-resolver');
    expect(sessionPosts()).toHaveLength(1);
    expect(done).toBe(false); // the sign-in page navigates only once the cookie is set

    posts[0].release();
    await expect(signingIn).resolves.toMatchObject({ id: 'u1' });
  });

  it('fails the sign-in when the cookie cannot be minted', async () => {
    const { firebaseClientAuthProvider } = await load();
    fb.signInWithPopup.mockResolvedValue({ user: firebaseUser('u1') });
    const signingIn = firebaseClientAuthProvider.signInWithGoogle();
    await flush();
    posts[0].release({ ok: false });
    await expect(signingIn).rejects.toThrow('Unable to create session');
  });

  it('drops the cookie and what is remembered about it on sign-out', async () => {
    remember('u1', Date.now() + 5 * DAY);
    const { firebaseClientAuthProvider } = await load();
    await firebaseClientAuthProvider.signOut();
    expect(fb.signOut).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/session', { method: 'DELETE' });
    expect(window.localStorage.getItem(MARK)).toBeNull();
  });
});

// Firebase's popup resolver, on Safari and mobile, loads Google's gapi script
// and an iframe before it restores the user — so it is set up only where a
// sign-in popup may follow.
describe('setting Auth up', () => {
  it('skips the popup resolver for a signed-in reader away from the sign-in pages', async () => {
    remember('u1', Date.now() + 5 * DAY);
    const { getFirebaseClientAuth } = await load();
    getFirebaseClientAuth();
    expect(fb.initializeAuth).toHaveBeenCalledWith(expect.anything(), {
      persistence: ['indexedDB', 'local', 'session'],
    });
    expect(fb.getAuth).not.toHaveBeenCalled();
  });

  it('keeps it on the sign-in pages, so Safari lets the popup open', async () => {
    remember('u1', Date.now() + 5 * DAY);
    window.history.replaceState({}, '', '/zh-TW/signin');
    const { getFirebaseClientAuth } = await load();
    getFirebaseClientAuth();
    expect(fb.getAuth).toHaveBeenCalled();
    expect(fb.initializeAuth).not.toHaveBeenCalled();
  });

  it('keeps it for a visitor who is not signed in (the sign-in page may be a client-side hop away)', async () => {
    const { getFirebaseClientAuth } = await load();
    getFirebaseClientAuth();
    expect(fb.getAuth).toHaveBeenCalled();
    expect(fb.initializeAuth).not.toHaveBeenCalled();
  });
});

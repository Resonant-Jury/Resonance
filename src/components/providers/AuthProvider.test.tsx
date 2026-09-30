// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { AuthUser } from '@/lib/auth/types';
import type { SessionState } from '@/lib/auth/firebase/client';

// Every hook gates on `loading`; only cookie-reading /api callers gate on
// `sessionReady`. So `loading` must end when the SDK knows the user — not
// when the session cookie request comes back.

let emit: (user: AuthUser | null, session: SessionState) => void = () => undefined;
vi.mock('@/lib/auth/firebase/client', () => ({
  USE_FIREBASE_EMULATOR: false,
  firebaseClientAuthProvider: {
    subscribe: (cb: typeof emit) => {
      emit = cb;
      return () => undefined;
    },
    refreshSession: vi.fn(),
  },
}));

import { AuthProvider, useAuth } from './AuthProvider';

function Probe() {
  const { user, loading, sessionReady } = useAuth();
  return <p>{loading ? 'loading' : `${user?.id ?? 'nobody'} · cookie ${sessionReady ? 'ready' : 'pending'}`}</p>;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

const me: AuthUser = { id: 'u1', email: null, phoneNumber: null, emailVerified: true };

beforeEach(() => {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
});

describe('AuthProvider', () => {
  it('reports the signed-in user before the session cookie is back', async () => {
    expect(screen.getByText('loading')).toBeInTheDocument();
    const cookie = deferred();
    act(() => emit(me, { ready: false, settled: cookie.promise }));
    expect(screen.getByText('u1 · cookie pending')).toBeInTheDocument();

    await act(async () => cookie.resolve());
    expect(screen.getByText('u1 · cookie ready')).toBeInTheDocument();
  });

  it('is ready at once when the cookie is already in place', () => {
    act(() => emit(me, { ready: true, settled: new Promise(() => undefined) }));
    expect(screen.getByText('u1 · cookie ready')).toBeInTheDocument();
  });

  it("doesn't let an older refresh mark a newer one ready", async () => {
    const first = deferred();
    act(() => emit(me, { ready: false, settled: first.promise }));
    act(() => emit({ ...me, id: 'u2' }, { ready: false, settled: new Promise(() => undefined) }));
    await act(async () => first.resolve());
    expect(screen.getByText('u2 · cookie pending')).toBeInTheDocument();
  });

  it('settles signed out with nothing to wait for', () => {
    act(() => emit(null, { ready: true, settled: Promise.resolve() }));
    expect(screen.getByText('nobody · cookie ready')).toBeInTheDocument();
  });
});

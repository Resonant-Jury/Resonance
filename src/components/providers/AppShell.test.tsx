// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl, screen, waitFor } from '@/../test/render';

// The signed-in area's shell routes whoever can't be in it yet: signed out to
// /signin (public pages aside), signed in without a profile — or with one
// that never got a pen name, which can reach no one — to /signup, where
// onboarding names it (POST /api/v1/me).

const auth = { user: { id: 'nina' } as { id: string } | null, loading: false, sessionReady: true };
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => auth }));
const profile = { data: undefined as unknown, isLoading: false };
vi.mock('@/lib/data/hooks', () => ({ useMyProfile: () => profile }));
const replace = vi.fn();
let pathname = '/home';
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ replace }), usePathname: () => pathname }));
vi.mock('@/components/sections/AppHeader/AppHeader', () => ({ AppHeader: () => null }));
vi.mock('@/components/sections/AppHeader/FloatingWriteButton', () => ({ FloatingWriteButton: () => null }));
vi.mock('@/components/molecules/AccountDeletionBanner/AccountDeletionBanner', () => ({ AccountDeletionBanner: () => null }));

import { AppShell } from './AppShell';

const shell = () => renderWithIntl(<AppShell><p>the page</p></AppShell>);
const named = (handle: string) => ({ id: 'nina', handle, initials: 'NI', accentColor: 'x' });

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(auth, { user: { id: 'nina' }, loading: false });
  Object.assign(profile, { data: undefined, isLoading: false });
  pathname = '/home';
});

describe('AppShell', () => {
  it('lets someone with a pen name stay', async () => {
    profile.data = named('nina');
    shell();
    expect(screen.getByText('the page')).toBeInTheDocument();
    await waitFor(() => expect(replace).not.toHaveBeenCalled());
  });

  it('sends a signed-in account without a profile to onboarding', async () => {
    profile.data = null;
    shell();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/signup'));
  });

  it('sends a profile that never got a pen name to onboarding to choose one', async () => {
    for (const handle of ['', '   ']) {
      replace.mockClear();
      profile.data = named(handle);
      const view = shell();
      await waitFor(() => expect(replace).toHaveBeenCalledWith('/signup'));
      view.unmount();
    }
  });

  it('waits for the profile before deciding', async () => {
    Object.assign(profile, { data: undefined, isLoading: true });
    shell();
    await waitFor(() => expect(replace).not.toHaveBeenCalled());
  });

  it('sends a signed-out visitor to sign in, except on a public page', async () => {
    auth.user = null;
    pathname = '/me';
    const view = shell();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/signin?next=%2Fme'));
    view.unmount();
    replace.mockClear();
    pathname = '/card/a-walk';
    shell();
    await waitFor(() => expect(replace).not.toHaveBeenCalled());
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderWithIntl, screen } from '@/../test/render';
import { AppHeader } from './AppHeader';

// Navigation + auth boundaries the account controls reach into. The signed-out
// path renders none of the firestore-backed children, but the modules still
// import, so stub them to keep the render hermetic.
vi.mock('@/i18n/navigation', async () => {
  const actual = await vi.importActual<typeof import('@/i18n/navigation')>('@/i18n/navigation');
  return {
    ...actual,
    usePathname: () => '/home',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  };
});

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ signOut: vi.fn() }),
}));

vi.mock('./NotificationBell', () => ({
  NotificationBell: () => <div data-testid="notification-bell" />,
}));

vi.mock('./MessagesEntry', () => ({
  MessagesEntry: () => <div data-testid="messages-entry" />,
}));

const user = { initials: 'NC', handle: 'ncchen', accentColor: 'var(--color-terracotta)' };

describe('AppHeader account slot', () => {
  it('shows the sign-in button and no notification bell when signed out', () => {
    renderWithIntl(<AppHeader user={user} signedIn={false} authReady />);

    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByTestId('notification-bell')).toBeNull();
    expect(screen.queryByTestId('messages-entry')).toBeNull();
    // The placeholder avatar (combobox trigger) must not appear either.
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('shows the account controls when signed in', () => {
    renderWithIntl(<AppHeader user={user} signedIn authReady />);

    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    expect(screen.getByTestId('notification-bell')).toBeInTheDocument();
  });

  it('renders no account controls until auth resolves', () => {
    renderWithIntl(<AppHeader user={user} signedIn={false} authReady={false} />);

    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    expect(screen.queryByTestId('notification-bell')).toBeNull();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { useEffect } from 'react';
import { renderWithIntl, screen, userEvent } from '@/../test/render';
import { AppChromeProvider, useAppChrome } from '@/components/providers/AppChrome';
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

  // The bar is the frame, so its one verb is a solid fill, not a second
  // outline (the mobile menu's sign-in is solid too).
  it('draws the sign-in button solid, without a pen outline of its own', () => {
    renderWithIntl(<AppHeader user={user} signedIn={false} authReady />);

    const button = screen.getByRole('link', { name: 'Sign in' }).querySelector('button');
    expect(button).toHaveAttribute('data-variant', 'solid');
  });

  it('shows the account controls when signed in', () => {
    renderWithIntl(<AppHeader user={user} signedIn authReady />);

    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    expect(screen.getByTestId('notification-bell')).toBeInTheDocument();
  });

  // The pen is the signed-in reader's way to start a card at every width: the feed's end and the card pages
  // carry no write button of their own.
  it('leads the signed-in account row with the pen to the writer', () => {
    renderWithIntl(<AppHeader user={user} signedIn authReady />);
    const write = screen.getByRole('link', { name: 'Write' });
    expect(write.getAttribute('href')).toMatch(/^(\/en)?\/write$/);
    expect(write.compareDocumentPosition(screen.getByTestId('messages-entry')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('offers no pen to a signed-out visitor', () => {
    renderWithIntl(<AppHeader user={user} signedIn={false} authReady />);
    expect(screen.queryByRole('link', { name: 'Write' })).toBeNull();
  });

  it('renders no account controls until auth resolves', () => {
    renderWithIntl(<AppHeader user={user} signedIn={false} authReady={false} />);

    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    expect(screen.queryByTestId('notification-bell')).toBeNull();
  });
});

describe('AppHeader taken over by a page', () => {
  // A phone's settings detail: the bar the writer stands over its workspace
  // too — the back arrow and that screen's title, nothing else.
  it('shows only the back arrow and the screen’s title', async () => {
    const onBack = vi.fn();
    function Claim() {
      const { setMobileHeader } = useAppChrome();
      useEffect(() => setMobileHeader({ title: 'Profile', onBack }), [setMobileHeader]);
      return null;
    }
    renderWithIntl(
      <AppChromeProvider>
        <AppHeader user={user} signedIn authReady />
        <Claim />
      </AppChromeProvider>,
    );

    expect(await screen.findByText('Profile')).toBeInTheDocument();
    expect(screen.queryByTestId('notification-bell')).toBeNull();
    expect(screen.queryByText('Resonance')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithIntl, screen, userEvent } from '@/../test/render';
import { Subnavbar } from './Subnavbar';

const mockPush = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const mockSignOut = vi.fn();
vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({
    signOut: mockSignOut,
  }),
}));

describe('Subnavbar', () => {
  const user = { initials: 'NC', handle: 'ncchen', accentColor: 'var(--color-terracotta)' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders closed by default showing avatar', () => {
    renderWithIntl(<Subnavbar user={user} />);
    const trigger = screen.getByRole('combobox', { name: 'ncchen' });
    expect(trigger).toBeInTheDocument();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens panel showing menu items on click', async () => {
    renderWithIntl(<Subnavbar user={user} />);
    const trigger = screen.getByRole('combobox', { name: 'ncchen' });
    await userEvent.click(trigger);

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(4);
    expect(screen.getByText('My Card Box')).toBeInTheDocument();
    expect(screen.getByText('Messages')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Sign out')).toBeInTheDocument();
  });

  it('navigates to card box and settings', async () => {
    renderWithIntl(<Subnavbar user={user} />);
    const trigger = screen.getByRole('combobox', { name: 'ncchen' });
    
    // Open menu
    await userEvent.click(trigger);
    
    // Click card box
    await userEvent.click(screen.getByText('My Card Box'));
    expect(mockPush).toHaveBeenCalledWith('/me');
  });

  it('asks for confirmation before signing out, then signs out on confirm', async () => {
    const originalLocation = window.location;
    // We temp mock location.href assignment
    const locationMock = { href: '' };
    Object.defineProperty(window, 'location', {
      value: locationMock,
      writable: true,
      configurable: true,
    });

    mockSignOut.mockResolvedValueOnce(undefined);

    renderWithIntl(<Subnavbar user={user} />);
    const trigger = screen.getByRole('combobox', { name: 'ncchen' });
    await userEvent.click(trigger);

    // Choosing 登出 opens the confirm dialog — nothing signs out yet.
    await userEvent.click(screen.getByText('Sign out'));
    expect(mockSignOut).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'Sign out?' });
    expect(dialog).toBeInTheDocument();

    // Confirming actually signs out and lands on /signin.
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(mockSignOut).toHaveBeenCalled();
    expect(locationMock.href).toBe('/en/signin');

    // Restore
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  it('keeps the session when the sign-out confirm is cancelled', async () => {
    renderWithIntl(<Subnavbar user={user} />);
    await userEvent.click(screen.getByRole('combobox', { name: 'ncchen' }));
    await userEvent.click(screen.getByText('Sign out'));

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

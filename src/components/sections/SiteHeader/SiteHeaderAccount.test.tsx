// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl, screen, userEvent } from '@/../test/render';

const push = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => ({ signOut: vi.fn() }) }));
vi.mock('@/lib/data/hooks', () => ({
  useMyProfile: () => ({ data: { handle: 'alice', initials: 'AL', accentColor: 'var(--color-sage)' } }),
}));

import { SiteHeaderAccountMenu } from './SiteHeaderAccount';

// On the landing and policy pages the avatar did what it does nowhere else:
// it was a link to the card box. It is the app header's account menu now.
describe('the site header’s avatar', () => {
  it('opens the account menu, as the app header’s does, rather than leaving for a page', async () => {
    renderWithIntl(<SiteHeaderAccountMenu />);
    expect(screen.queryByRole('link')).toBeNull();

    await userEvent.click(screen.getByRole('combobox', { name: 'alice' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent?.trim())).toEqual([
      'My Card Box',
      'Messages',
      'Settings',
      'Sign out',
    ]);

    await userEvent.click(screen.getByText('My Card Box'));
    expect(push).toHaveBeenCalledWith('/me');
  });
});

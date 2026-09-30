// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderWithIntl, screen } from '@/../test/render';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: null, loading: false }),
}));
vi.mock('@/lib/data/hooks', () => ({
  useMyProfile: () => ({ data: undefined }),
}));

import { SiteHeader } from './SiteHeader';

describe('SiteHeader', () => {
  // The bar is the frame, so a signed-out viewer's one verb is a solid fill
  // rather than a second outline — the same button as the app header's.
  it('draws the sign-in button solid when signed out', async () => {
    renderWithIntl(<SiteHeader />);

    const link = await screen.findByRole('link', { name: 'Sign In' });
    expect(link).toHaveAttribute('href', '/signin');
    expect(link.querySelector('button')).toHaveAttribute('data-variant', 'solid');
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithIntl, screen } from '@/../test/render';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const auth = vi.hoisted(() => ({ user: null as { id: string } | null, loading: false }));
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => auth }));

// The signed-in half reads the viewer's profile through the data layer
// (Firestore); it is loaded on demand, and this records when it is.
const account = vi.hoisted(() => ({ loaded: vi.fn() }));
vi.mock('./SiteHeaderAccount', () => {
  account.loaded();
  return {
    SiteHeaderAvatar: () => <span>alice&apos;s avatar</span>,
    SiteHeaderSignedInNav: () => null,
  };
});

import { SiteHeader } from './SiteHeader';

beforeEach(() => {
  auth.user = null;
  auth.loading = false;
});

describe('SiteHeader', () => {
  // The bar is the frame, so a signed-out viewer's one verb is a solid fill
  // rather than a second outline — the same button as the app header's.
  it('draws the sign-in button solid when signed out', async () => {
    renderWithIntl(<SiteHeader />);

    const link = await screen.findByRole('link', { name: 'Sign In' });
    expect(link).toHaveAttribute('href', '/signin');
    expect(link.querySelector('button')).toHaveAttribute('data-variant', 'solid');
  });

  // The landing and policy pages: a signed-out visitor's first load carries
  // no data layer at all.
  it("never loads the signed-in half for a signed-out visitor", async () => {
    renderWithIntl(<SiteHeader />);
    await screen.findByRole('link', { name: 'Sign In' });
    await new Promise((r) => setTimeout(r, 20));
    expect(account.loaded).not.toHaveBeenCalled();
  });

  it("loads it once someone is signed in, and shows their avatar", async () => {
    auth.user = { id: 'alice' };
    renderWithIntl(<SiteHeader />);
    expect(await screen.findByText("alice's avatar")).toBeInTheDocument();
    expect(account.loaded).toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: 'Sign In' })).not.toBeInTheDocument();
  });
});

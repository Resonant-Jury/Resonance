// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl, screen, within } from '@/../test/render';
import { UA } from '@/../test/userAgents';
import en from '@/messages/en.json';
import { APP_STORE_URL, PLAY_STORE_URL } from '@/lib/appStores';
import { HeroSection } from './HeroSection/HeroSection';
import { CTASection } from './CTASection/CTASection';
import { SiteFooter } from './SiteFooter/SiteFooter';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

// The apps' download badges on the landing page and under every public page:
// the hero holds the page's one download block (the QR code for computers,
// the anchor /download sends them to); the closing band and the footer repeat
// the badges alone.
afterEach(() => vi.restoreAllMocks());

const stores = (el: HTMLElement) =>
  within(el)
    .getAllByRole('link')
    .map((a) => a.getAttribute('href'))
    .filter((href) => href === APP_STORE_URL || href === PLAY_STORE_URL);

describe('the download badges on the landing page', () => {
  it('puts the download block, QR code and all, in the hero under its calls to action', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(UA.macChrome);
    renderWithIntl(<HeroSection />);
    const block = screen.getByRole('group', { name: en.download.title });
    expect(block).toHaveAttribute('id', 'download');
    expect(stores(block)).toEqual([APP_STORE_URL, PLAY_STORE_URL]);
    expect(within(block).getByRole('img', { name: en.download.qr })).toBeInTheDocument();
    const share = screen.getByRole('link', { name: en.hero.share });
    expect(share.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('repeats the badges, without the QR code, in the closing band and the footer', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(UA.macChrome);
    for (const section of [<CTASection key="cta" />, <SiteFooter key="footer" />]) {
      const { unmount } = renderWithIntl(section);
      const group = screen.getByRole('group', { name: en.download.title });
      expect(stores(group)).toEqual([APP_STORE_URL, PLAY_STORE_URL]);
      expect(within(group).queryByRole('img', { name: en.download.qr })).toBeNull();
      unmount();
    }
  });
});

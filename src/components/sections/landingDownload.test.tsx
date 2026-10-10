// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl, screen, within } from '@/../test/render';
import { UA } from '@/../test/userAgents';
import en from '@/messages/en.json';
import zh from '@/messages/zh-TW.json';
import { APP_STORE_URL, PLAY_STORE_URL } from '@/lib/appStores';
import { HeroSection } from './HeroSection/HeroSection';
import { CTASection } from './CTASection/CTASection';
import { SiteFooter } from './SiteFooter/SiteFooter';

vi.mock('next-intl/server', () => ({ setRequestLocale: vi.fn() }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

// The apps' download badges on the landing page: the hero holds the page's
// one download block (the QR code for computers, the anchor /download sends
// them to); the footer repeats the badges alone, with the stores' trademark
// line under them. The closing band right above the footer has none (two
// pairs a few hundred pixels apart read as one block twice), and the policy
// pages' footer has none either: the apps open those pages in an in-app
// browser, where the badges would offer the app to someone using it.
afterEach(() => vi.restoreAllMocks());

const stores = (el: HTMLElement) =>
  within(el)
    .getAllByRole('link')
    .map((a) => a.getAttribute('href'))
    .filter((href) => href === APP_STORE_URL || href === PLAY_STORE_URL);

describe('the download badges on the landing page', () => {
  it('puts the download block, QR code and all, in the hero as its one call to action', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(UA.macChrome);
    renderWithIntl(<HeroSection />);
    const block = screen.getByRole('group', { name: en.download.title });
    expect(block).toHaveAttribute('id', 'download');
    expect(stores(block)).toEqual([APP_STORE_URL, PLAY_STORE_URL]);
    expect(within(block).getByRole('img', { name: en.download.qr })).toBeInTheDocument();
    const description = screen.getByText(en.hero.description);
    expect(description.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('link', { name: /explore stories|share your story/i })).toBeNull();
  });

  it('repeats the badges, without the QR code, in the footer — the stores’ trademark line under them', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(UA.macChrome);
    renderWithIntl(<SiteFooter />);
    const group = screen.getByRole('group', { name: en.download.title });
    expect(stores(group)).toEqual([APP_STORE_URL, PLAY_STORE_URL]);
    expect(within(group).queryByRole('img', { name: en.download.qr })).toBeNull();
    const marks = screen.getByText(en.footer.trademarks);
    expect(group.compareDocumentPosition(marks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('names the stores’ marks in Chinese on the Chinese page', () => {
    renderWithIntl(<SiteFooter />, { locale: 'zh-TW', messages: zh });
    expect(screen.getByText(zh.footer.trademarks)).toBeInTheDocument();
  });

  it('leaves the closing band to its calls to action: the footer under it has the badges', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(UA.macChrome);
    renderWithIntl(<CTASection />);
    expect(screen.queryByRole('group', { name: en.download.title })).toBeNull();
    expect(screen.getByRole('link', { name: en.cta.start })).toBeInTheDocument();
  });
});

describe('the policy pages’ footer', () => {
  // The apps open the policy pages in an in-app browser (SFSafariViewController,
  // a Custom Tab): no store badges there, nor the marks they would need.
  it('offers no store badges and names no store marks', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(UA.iPhoneSafari);
    renderWithIntl(<SiteFooter edgeColor="var(--color-cream)" download={false} />);
    expect(screen.queryByRole('group', { name: en.download.title })).toBeNull();
    expect(screen.queryByText(en.footer.trademarks)).toBeNull();
    expect(screen.getByRole('link', { name: en.footer.privacy })).toBeInTheDocument();
  });

  it('is the footer the (legal) layout renders', async () => {
    const { default: LegalLayout } = await import('@/app/[locale]/(legal)/layout');
    const tree = await LegalLayout({ children: null, params: Promise.resolve({ locale: 'en' }) });
    const footer = (tree.props.children as React.ReactElement[]).find((el) => el?.type === SiteFooter);
    expect(footer?.props).toMatchObject({ download: false });
  });
});

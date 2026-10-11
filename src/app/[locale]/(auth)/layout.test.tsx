// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';
import { renderWithIntl, screen, within } from '@/../test/render';

vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async (ns: 'hero') => (key: keyof typeof en.hero) => en[ns][key],
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import AuthLayout, { viewport } from './layout';

describe('the (auth) layout', () => {
  // The sheet pads itself with env(safe-area-inset-bottom), which stays 0
  // unless the page asks to cover the screen — these pages only.
  it('lets its pages run under the home indicator', () => {
    expect(viewport).toEqual({ viewportFit: 'cover' });
  });

  // The brand is a cover beside the sheet (over it on a phone or an upright
  // tablet): the mark over the wordmark, the hero's line under it, then its
  // storytellers (screens with room only: auth.module.css).
  it('sets the brand on its cover, the hero’s line and storytellers under the wordmark', async () => {
    const { container } = renderWithIntl(
      await AuthLayout({ children: <h1>Welcome back</h1>, params: Promise.resolve({ locale: 'en' }) }),
    );

    const home = screen.getByRole('link', { name: 'Resonance' });
    expect(home).toHaveAttribute('href', '/');
    const line = screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Let lives influence lives');
    expect(home.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The accent word carries the hero's pen-wave underline.
    const accent = within(line).getByText(en.hero.headlineAccent).parentElement!;
    expect(accent.querySelector('svg path')).toHaveAttribute('fill', 'none');

    const proof = screen.getByText(en.hero.proof);
    expect(line.compareDocumentPosition(proof) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // The hero's drifting blobs behind it, their still stand-ins in the HTML;
    // no fixed blob behind the mark.
    expect(container.querySelectorAll('[data-drift]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-drift-color]')).toHaveLength(3);

    expect(screen.getByRole('main')).toContainElement(screen.getByRole('heading', { name: 'Welcome back' }));
  });
});

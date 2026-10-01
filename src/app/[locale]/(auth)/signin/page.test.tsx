// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import { renderWithIntl, screen } from '@/../test/render';

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: null, loading: false, refreshSession: vi.fn(), signInWithGoogle: vi.fn(), signInWithApple: vi.fn() }),
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import SignInPage from './page';

afterEach(() => window.history.replaceState(null, '', '/'));

describe('the sign-in page', () => {
  // It read the query string while rendering (useSearchParams), which keeps a
  // static page's client tree out of its HTML: no sign-in button until the
  // scripts had run — and none at all without them.
  it('has its sign-in button in the server HTML', () => {
    const html = renderToString(
      <NextIntlClientProvider locale="en" messages={en}>
        <SignInPage />
      </NextIntlClientProvider>,
    );
    expect(html).toContain(en.auth.continueWithGoogle);
    expect(html).toContain(en.auth.signInTitle);
  });

  it('says a deletion was scheduled when sent here for that', async () => {
    window.history.replaceState(null, '', '/en/signin?notice=deletion-scheduled');
    renderWithIntl(<SignInPage />);
    expect(await screen.findByRole('status')).toHaveTextContent(en.auth.deletionScheduled);
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import { renderWithIntl, screen, userEvent, within } from '@/../test/render';
import buttonStyles from '@/components/atoms/OrganicButton/OrganicButton.module.css';

const auth = vi.hoisted(() => ({
  refreshSession: vi.fn(),
  signInWithGoogle: vi.fn(),
}));

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: null, loading: false, ...auth }),
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import SignInPage from './page';

afterEach(() => {
  window.history.replaceState(null, '', '/');
  vi.clearAllMocks();
});

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

// Both sets of buttons are in the HTML and the width shows one (jsdom shows
// both): the desktop card keeps its outline buttons; the phone's sheet, itself
// the frame, has full-width faces with no pen line of their own.
describe('the buttons on the phone sheet', () => {
  const sheet = (container: HTMLElement) =>
    within(container.querySelector<HTMLElement>('[data-layout="sheet"]')!);
  const card = (container: HTMLElement) =>
    within(container.querySelector<HTMLElement>('[data-layout="card"]')!);

  it('make Google the verb: a full-width solid button, its G on a white disc', () => {
    const { container } = renderWithIntl(<SignInPage />);
    const google = sheet(container).getByRole('button', { name: en.auth.continueWithGoogle });
    expect(google).toHaveAttribute('data-variant', 'solid');
    expect(google.classList).toContain(buttonStyles.block);
    expect(google.querySelector('path[fill="#FFFFFF"]')).not.toBeNull();

    // The desktop card's wears the same face at its own width — a button is
    // a filled shape there too, never an outline inside the card's frame.
    const onCard = card(container).getByRole('button', { name: en.auth.continueWithGoogle });
    expect(onCard).toHaveAttribute('data-variant', 'solid');
    expect(onCard.querySelector('path[fill="#FFFFFF"]')).not.toBeNull();
    expect(onCard.classList).not.toContain(buttonStyles.block);
  });

  it('offer Google alone (Sign in with Apple lives in the iOS app)', () => {
    const { container } = renderWithIntl(<SignInPage />);
    expect(sheet(container).getAllByRole('button')).toHaveLength(1);
    expect(card(container).getAllByRole('button')).toHaveLength(1);
  });

  // B6: the pressed one keeps its words and draws the pen loop in its mark's slot.
  it('show the button working and take no second tap meanwhile', async () => {
    auth.signInWithGoogle.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithIntl(<SignInPage />);
    const google = sheet(container).getByRole('button', { name: en.auth.continueWithGoogle });

    await userEvent.click(google);
    expect(google).toHaveAccessibleName(en.auth.continueWithGoogle);
    expect(google).toHaveAttribute('aria-busy', 'true');
    // One loader, in the G's place (not beside it).
    expect(google.querySelectorAll('[data-button-loader]')).toHaveLength(1);
    expect(google.querySelector('path[fill="#FFFFFF"]')).toBeNull();

    await userEvent.click(google);
    expect(auth.signInWithGoogle).toHaveBeenCalledTimes(1);
  });
});

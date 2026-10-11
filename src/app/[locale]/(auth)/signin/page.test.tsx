// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import { renderWithIntl, screen, userEvent, waitFor } from '@/../test/render';
import buttonStyles from '@/components/atoms/OrganicButton/OrganicButton.module.css';

const auth = vi.hoisted(() => ({
  refreshSession: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithApple: vi.fn(),
}));
const flags = vi.hoisted(() => ({ apple: false }));
const profile = vi.hoisted(() => ({ getCurrentUserHandle: vi.fn() }));
const pages = vi.hoisted(() => ({ replacePage: vi.fn() }));
vi.mock('@/lib/db/firestore/client/profile', () => profile);
vi.mock('@/lib/auth/afterSignIn', async (original) => ({
  ...(await original<typeof import('@/lib/auth/afterSignIn')>()),
  replacePage: pages.replacePage,
}));

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: null, loading: false, ...auth }),
}));
vi.mock('@/lib/auth/providers', async (original) => ({
  ...(await original<typeof import('@/lib/auth/providers')>()),
  get APPLE_SIGN_IN() {
    return flags.apple;
  },
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import SignInPage from './page';

afterEach(() => {
  window.history.replaceState(null, '', '/');
  flags.apple = false;
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

// The sheet is the frame: the buttons are full-width faces with no pen line
// of their own, Apple's in ink first once the web has it, Google's after it.
describe('the buttons on the sheet', () => {
  it('make Google the verb: a full-width solid button, its G on a white disc', () => {
    renderWithIntl(<SignInPage />);
    const google = screen.getByRole('button', { name: en.auth.continueWithGoogle });
    expect(google).toHaveAttribute('data-variant', 'solid');
    expect(google.classList).toContain(buttonStyles.block);
    expect(google.querySelector('path[fill="#FFFFFF"]')).not.toBeNull();
  });

  it('offer Google alone until Sign in with Apple is set up for the web', () => {
    renderWithIntl(<SignInPage />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: en.auth.continueWithApple })).toBeNull();
  });

  // No line under the title saying how passwords are handled.
  it('say nothing about passwords', () => {
    const { container } = renderWithIntl(<SignInPage />);
    expect(container).not.toHaveTextContent(/password/i);
  });

  it('put Apple first, in ink, when it is set up', async () => {
    flags.apple = true;
    auth.signInWithApple.mockReturnValue(new Promise(() => {}));
    renderWithIntl(<SignInPage />);
    const [first, second] = screen.getAllByRole('button');
    expect(first).toHaveAccessibleName(en.auth.continueWithApple);
    expect(first).toHaveAttribute('data-variant', 'ink');
    expect(first.classList).toContain(buttonStyles.block);
    expect(second).toHaveAccessibleName(en.auth.continueWithGoogle);

    // The one pressed works; the other waits.
    await userEvent.click(first);
    expect(auth.signInWithApple).toHaveBeenCalledWith('en');
    expect(first).toHaveAttribute('aria-busy', 'true');
    expect(second).toBeDisabled();
    expect(auth.signInWithGoogle).not.toHaveBeenCalled();
  });

  // B6: the pressed one keeps its words and draws the pen loop in its mark's slot.
  it('show the button working and take no second tap meanwhile', async () => {
    auth.signInWithGoogle.mockReturnValue(new Promise(() => {}));
    renderWithIntl(<SignInPage />);
    const google = screen.getByRole('button', { name: en.auth.continueWithGoogle });

    await userEvent.click(google);
    expect(google).toHaveAccessibleName(en.auth.continueWithGoogle);
    expect(google).toHaveAttribute('aria-busy', 'true');
    // One loader, in the G's place (not beside it).
    expect(google.querySelectorAll('[data-button-loader]')).toHaveLength(1);
    expect(google.querySelector('path[fill="#FFFFFF"]')).toBeNull();

    await userEvent.click(google);
    expect(auth.signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  // Closing the provider's window is not a failure; an address that belongs
  // to an account made the other way says which way in.
  it('say nothing when the window is closed, and point to the other way in when the email has it', async () => {
    auth.signInWithGoogle.mockRejectedValueOnce(Object.assign(new Error('closed'), { code: 'auth/popup-closed-by-user' }));
    renderWithIntl(<SignInPage />);
    const google = screen.getByRole('button', { name: en.auth.continueWithGoogle });
    await userEvent.click(google);
    expect(screen.queryByText(en.auth.signInError)).toBeNull();
    expect(google).not.toHaveAttribute('aria-busy');

    auth.signInWithGoogle.mockRejectedValueOnce(
      Object.assign(new Error('exists'), { code: 'auth/account-exists-with-different-credential' }),
    );
    await userEvent.click(google);
    expect(await screen.findByText(en.auth.otherProviderError)).toBeInTheDocument();
  });
});

// Signed in, the page leaves for the next one in its own place (out of the
// tab's history). A first sign-in goes straight to the sign-up's profile step:
// it used to open the feed first, which then sent it on to sign-up.
describe('after signing in', () => {
  it('sends a first sign-in straight to the profile step, carrying next', async () => {
    window.history.replaceState(null, '', '/en/signin?next=%2Fen%2Fwrite');
    auth.signInWithGoogle.mockResolvedValue({ id: 'u1' });
    profile.getCurrentUserHandle.mockResolvedValue(null);
    renderWithIntl(<SignInPage />);
    await userEvent.click(screen.getByRole('button', { name: en.auth.continueWithGoogle }));
    await waitFor(() =>
      expect(pages.replacePage).toHaveBeenCalledWith(`/en/signup?step=profile&next=${encodeURIComponent('/en/write')}`),
    );
  });

  it('sends an account with a pen name to next, else the feed', async () => {
    auth.signInWithGoogle.mockResolvedValue({ id: 'u1' });
    profile.getCurrentUserHandle.mockResolvedValue('Nian');
    renderWithIntl(<SignInPage />);
    await userEvent.click(screen.getByRole('button', { name: en.auth.continueWithGoogle }));
    await waitFor(() => expect(pages.replacePage).toHaveBeenCalledWith('/en/home'));
  });
});


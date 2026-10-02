// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import { renderWithIntl, screen, userEvent, within } from '@/../test/render';
import buttonStyles from '@/components/atoms/OrganicButton/OrganicButton.module.css';
import styles from '../auth.module.css';

const auth = vi.hoisted(() => ({
  refreshSession: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithApple: vi.fn(),
}));
const shell = vi.hoisted(() => ({ ios: false }));

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: null, loading: false, ...auth }),
}));
vi.mock('@/lib/auth/firebase/native', () => ({ isIosNativeApp: () => shell.ios }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import SignInPage from './page';

afterEach(() => {
  window.history.replaceState(null, '', '/');
  shell.ios = false;
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

    const onCard = card(container).getByRole('button', { name: en.auth.continueWithGoogle });
    expect(onCard).toHaveAttribute('data-variant', 'outline');
    expect(onCard.classList).not.toContain(buttonStyles.block);
  });

  it('offer no Apple button outside the iOS app', () => {
    const { container } = renderWithIntl(<SignInPage />);
    expect(sheet(container).getAllByRole('button')).toHaveLength(1);
  });

  // Apple asks for a black Sign in with Apple button, as prominent as the others.
  it('put Apple first in the iOS app, an ink button the size of Google’s', async () => {
    shell.ios = true;
    const { container } = renderWithIntl(<SignInPage />);
    await sheet(container).findByRole('button', { name: en.auth.continueWithApple });
    const [apple, google] = sheet(container).getAllByRole('button');
    expect(apple).toHaveAccessibleName(en.auth.continueWithApple);
    expect(apple).toHaveAttribute('data-variant', 'ink');
    // Sized alike: full width, the same height and label.
    expect(apple.className).toBe(google.className);
    expect(google).toHaveAccessibleName(en.auth.continueWithGoogle);
    // Apple's logo stands bare in the cream label; only Google's sits on a disc.
    expect(apple.querySelector('path[fill="#FFFFFF"]')).toBeNull();
  });

  it('say they are signing in, dim, and take no second tap meanwhile', async () => {
    shell.ios = true;
    auth.signInWithGoogle.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithIntl(<SignInPage />);
    const apple = await sheet(container).findByRole('button', { name: en.auth.continueWithApple });
    const google = sheet(container).getByRole('button', { name: en.auth.continueWithGoogle });

    await userEvent.click(google);
    expect(google).toHaveAccessibleName(en.auth.signingIn);
    expect(apple).toHaveAccessibleName(en.auth.signingIn);
    expect(google.classList).toContain(styles.busy);
    expect(apple.classList).toContain(styles.busy);

    await userEvent.click(google);
    await userEvent.click(apple);
    expect(auth.signInWithGoogle).toHaveBeenCalledTimes(1);
    expect(auth.signInWithApple).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import en from '@/messages/en.json';
import { fireEvent, renderWithIntl, screen, userEvent, waitFor } from '@/../test/render';

const auth = vi.hoisted(() => ({
  user: null as { id: string } | null,
  loading: false,
  signInWithGoogle: vi.fn(),
  signInWithApple: vi.fn(),
}));
const profile = vi.hoisted(() => ({
  getCurrentUserHandle: vi.fn(),
  checkHandleAvailable: vi.fn(),
  createCurrentUserProfile: vi.fn(),
}));
const pages = vi.hoisted(() => ({ replacePage: vi.fn() }));

vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('@/lib/db/firestore/client/profile', () => ({
  ...profile,
  HANDLE_FORBIDDEN: /[/?#\\]/gu,
  isHandleTaken: () => false,
}));
vi.mock('@/lib/auth/afterSignIn', async (original) => ({
  ...(await original<typeof import('@/lib/auth/afterSignIn')>()),
  replacePage: pages.replacePage,
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import SignUpPage from './page';

afterEach(() => {
  auth.user = null;
  auth.loading = false;
  window.history.replaceState(null, '', '/');
  vi.clearAllMocks();
});

describe('the sign-up page', () => {
  it('offers the providers to a reader who is not signed in', () => {
    renderWithIntl(<SignUpPage />);
    expect(screen.getByRole('button', { name: en.auth.continueWithGoogle })).toBeInTheDocument();
    expect(profile.getCurrentUserHandle).not.toHaveBeenCalled();
  });

  // A first sign-in is sent here for the profile step: it shows at once, not
  // the providers first.
  it('opens on the profile step when sent for it, and keeps it for an account without a pen name', async () => {
    window.history.replaceState(null, '', '/en/signup?step=profile');
    auth.user = { id: 'u1' };
    profile.getCurrentUserHandle.mockResolvedValue(null);
    renderWithIntl(<SignUpPage />);
    expect(await screen.findByLabelText(en.auth.handleLabel)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en.auth.continueWithGoogle })).toBeNull();
    await waitFor(() => expect(profile.getCurrentUserHandle).toHaveBeenCalled());
    expect(pages.replacePage).not.toHaveBeenCalled();
  });

  // An account that has its pen name — signed in here with it, or stepped
  // back to this page after finishing — goes on, never shown the form again.
  it('sends an account that has a pen name on to next, else the feed', async () => {
    auth.user = { id: 'u1' };
    profile.getCurrentUserHandle.mockResolvedValue('Nian');
    renderWithIntl(<SignUpPage />);
    await waitFor(() => expect(pages.replacePage).toHaveBeenCalledWith('/en/home'));

    vi.clearAllMocks();
    window.history.replaceState(null, '', '/en/signup?step=profile&next=%2Fen%2Fmessages');
    profile.getCurrentUserHandle.mockResolvedValue('Nian');
    renderWithIntl(<SignUpPage />);
    await waitFor(() => expect(pages.replacePage).toHaveBeenCalledWith('/en/messages'));
  });

  // Finishing replaces this page with the writer, so no way back from the
  // writer (its Leave, saving for later, the browser's back) lands here.
  it('finishes into the writer, leaving this page out of the history', async () => {
    window.history.replaceState(null, '', '/en/signup?step=profile');
    auth.user = { id: 'u1' };
    profile.getCurrentUserHandle.mockResolvedValue(null);
    profile.checkHandleAvailable.mockResolvedValue(true);
    profile.createCurrentUserProfile.mockResolvedValue({});
    renderWithIntl(<SignUpPage />);

    fireEvent.change(await screen.findByLabelText(en.auth.handleLabel), { target: { value: 'Nian' } });
    const finish = screen.getByRole('button', { name: en.auth.finish });
    await waitFor(() => expect(finish).not.toBeDisabled());
    await userEvent.click(finish);
    // The writer, marked as a new account's first card: its way out opens the feed.
    await waitFor(() => expect(pages.replacePage).toHaveBeenCalledWith('/en/write?from=signup'));
    expect(profile.createCurrentUserProfile).toHaveBeenCalledWith({ handle: 'Nian', region: 'TW', primaryLocale: 'zh-TW' });
  });

  // Stepped back to from the browser's page cache, the page came back as it
  // was left — mid-save, its button working for ever.
  it('answers again when the browser restores it from its page cache', async () => {
    window.history.replaceState(null, '', '/en/signup?step=profile');
    auth.user = { id: 'u1' };
    profile.getCurrentUserHandle.mockResolvedValue(null);
    profile.checkHandleAvailable.mockResolvedValue(true);
    profile.createCurrentUserProfile.mockReturnValue(new Promise(() => {}));
    renderWithIntl(<SignUpPage />);

    fireEvent.change(await screen.findByLabelText(en.auth.handleLabel), { target: { value: 'Nian' } });
    const finish = screen.getByRole('button', { name: en.auth.finish });
    await waitFor(() => expect(finish).not.toBeDisabled());
    await userEvent.click(finish);
    expect(finish).toHaveAttribute('aria-busy', 'true');

    const restored = new Event('pageshow') as PageTransitionEvent;
    Object.defineProperty(restored, 'persisted', { value: true });
    act(() => {
      window.dispatchEvent(restored);
    });
    expect(finish).not.toHaveAttribute('aria-busy');
  });
});

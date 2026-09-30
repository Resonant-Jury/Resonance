// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { renderWithIntl, screen, fireEvent, waitFor, userEvent, within } from '@/../test/render';

// The settings form autosaves through the profile write module — that module
// boundary (plus revalidation) is what these tests pin down.
vi.mock('@/lib/db/firestore/client/profile', () => ({
  updateProfile: vi.fn().mockResolvedValue(undefined),
  isHandleTaken: (err: unknown) => (err as { code?: string } | null)?.code === 'conflict',
  HANDLE_FORBIDDEN: /[/?#\\\p{Cc}]/gu,
}));
vi.mock('@/lib/db/firestore/client/revalidate', () => ({
  requestRevalidate: vi.fn().mockResolvedValue(undefined),
}));
const mockSignOut = vi.fn().mockResolvedValue(undefined);
vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'me', email: 'me@example.com', phoneNumber: null }, signOut: mockSignOut }),
}));
vi.mock('@/lib/account/client', () => ({
  scheduleMyAccountDeletion: vi.fn(),
  downloadMyData: vi.fn(),
}));
vi.mock('@/components/molecules/BlockedListModal/BlockedListModal', () => ({
  BlockedListModal: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="Blocked people" /> : null),
}));
vi.mock('@/components/providers/AppChrome', () => ({
  useAppChrome: () => ({ setMobileHeader: vi.fn() }),
}));
vi.mock('@/components/providers/TweaksPanel', () => ({
  useTweaks: () => ({
    state: { accentColor: 'terracotta', fontFamily: 'default', cardDensity: 'normal', grainIntensity: 1 },
    update: vi.fn(),
  }),
}));
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/settings',
}));
// Desktop layout — the autosave path is identical on mobile.
vi.mock('@/lib/hooks/useIsMobile', () => ({ useIsMobile: () => false }));
// Avatar upload drags in the image pipeline and saves itself already.
vi.mock('@/components/molecules/AvatarUpload/AvatarUpload', () => ({
  AvatarUpload: () => <div data-testid="avatar-upload" />,
}));

import { updateProfile } from '@/lib/db/firestore/client/profile';
import { downloadMyData, scheduleMyAccountDeletion } from '@/lib/account/client';
import { requestRevalidate } from '@/lib/db/firestore/client/revalidate';
import { SettingsClient } from './SettingsClient';

const initial = {
  handle: 'ncc',
  bio: 'hello',
  region: 'TW',
  primaryLocale: 'zh-TW' as const,
  autoTranslateTo: ['en' as const],
  initials: 'NC',
  accentColor: 'oklch(88% 0.08 55)',
};

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('SettingsClient autosave', () => {
  it('saves only the changed field a moment after editing stops', async () => {
    vi.useFakeTimers();
    renderWithIntl(<SettingsClient initial={initial} />);

    fireEvent.change(screen.getByDisplayValue('hello'), {
      target: { value: 'a new bio' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(updateProfile).toHaveBeenCalledTimes(1);
    expect(updateProfile).toHaveBeenCalledWith({ bio: 'a new bio' });
    // The public profile cache is busted after every successful save.
    expect(requestRevalidate).toHaveBeenCalledWith(expect.arrayContaining(['/u/ncc']));
  });

  it('debounces a typing burst into one save and revalidates old + new handle', async () => {
    vi.useFakeTimers();
    renderWithIntl(<SettingsClient initial={initial} />);

    const handleInput = screen.getByDisplayValue('ncc');
    fireEvent.change(handleInput, { target: { value: 'nc' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    fireEvent.change(handleInput, { target: { value: 'ncchen' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(updateProfile).toHaveBeenCalledTimes(1);
    expect(updateProfile).toHaveBeenCalledWith({ handle: 'ncchen' });
    expect(requestRevalidate).toHaveBeenCalledWith(
      expect.arrayContaining(['/u/ncchen', '/u/ncc']),
    );
  });

  it('never saves an emptied handle', async () => {
    vi.useFakeTimers();
    renderWithIntl(<SettingsClient initial={initial} />);

    fireEvent.change(screen.getByDisplayValue('ncc'), { target: { value: '  ' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('flushes pending edits when the component unmounts', async () => {
    const { unmount } = renderWithIntl(<SettingsClient initial={initial} />);
    fireEvent.change(screen.getByDisplayValue('hello'), {
      target: { value: 'left before the debounce' },
    });
    // Unmount before the debounce elapses — the flush must still persist.
    unmount();
    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({ bio: 'left before the debounce' }),
    );
  });

  it('says so when the pen name is taken, without holding back the rest', async () => {
    vi.useFakeTimers();
    vi.mocked(updateProfile).mockImplementation(async (patch) => {
      if (patch.handle) throw Object.assign(new Error('That pen name is taken.'), { code: 'conflict' });
    });
    renderWithIntl(<SettingsClient initial={initial} />);

    fireEvent.change(screen.getByDisplayValue('ncc'), { target: { value: 'bob' } });
    fireEvent.change(screen.getByDisplayValue('hello'), { target: { value: 'still saved' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(updateProfile).toHaveBeenCalledWith({ bio: 'still saved' });
    expect(updateProfile).toHaveBeenCalledWith({ handle: 'bob' });
    expect(screen.getByText('Taken')).toBeInTheDocument();

    // The refused name isn't sent again with the next edit.
    fireEvent.change(screen.getByDisplayValue('still saved'), { target: { value: 'edited again' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(vi.mocked(updateProfile).mock.calls.filter(([p]) => p.handle)).toHaveLength(1);
  });

  it('keeps path characters out of the pen name', async () => {
    renderWithIntl(<SettingsClient initial={initial} />);
    fireEvent.change(screen.getByDisplayValue('ncc'), { target: { value: 'a/b?c#d' } });
    expect(screen.getByDisplayValue('abcd')).toBeInTheDocument();
  });
});

describe('SettingsClient account deletion', () => {
  it('schedules deletion only after confirming, then signs out', async () => {
    vi.mocked(scheduleMyAccountDeletion).mockResolvedValue({
      requestedAt: '2026-09-27T00:00:00Z',
      purgeAfter: '2026-10-04T00:00:00Z',
    });
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithIntl(<SettingsClient initial={initial} />);

    await u.click(screen.getByRole('tab', { name: 'Delete account' }));
    await u.click(screen.getByRole('button', { name: 'Delete account' }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete your account?' });
    expect(scheduleMyAccountDeletion).not.toHaveBeenCalled();
    await u.click(within(dialog).getByRole('button', { name: 'Delete account' }));

    await waitFor(() => expect(scheduleMyAccountDeletion).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
  });

  it('keeps the account when the confirmation is dismissed', async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithIntl(<SettingsClient initial={initial} />);

    await u.click(screen.getByRole('tab', { name: 'Delete account' }));
    await u.click(screen.getByRole('button', { name: 'Delete account' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete your account?' });
    await u.click(within(dialog).getByRole('button', { name: 'Keep my account' }));

    expect(scheduleMyAccountDeletion).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('offers the data download before deleting', async () => {
    vi.mocked(downloadMyData).mockResolvedValue(undefined);
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithIntl(<SettingsClient initial={initial} />);

    await u.click(screen.getByRole('tab', { name: 'Delete account' }));
    await u.click(screen.getByRole('button', { name: 'Download my data' }));
    await waitFor(() => expect(downloadMyData).toHaveBeenCalledTimes(1));
  });

  it('opens the blocked-people list from privacy settings', async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithIntl(<SettingsClient initial={initial} />);

    await u.click(screen.getByRole('tab', { name: 'Privacy & connections' }));
    await u.click(screen.getByRole('button', { name: 'Manage blocks' }));
    expect(await screen.findByRole('dialog', { name: 'Blocked people' })).toBeInTheDocument();
  });
});

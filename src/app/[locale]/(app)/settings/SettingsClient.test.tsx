// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { renderWithIntl, screen, fireEvent, waitFor } from '@/../test/render';

// The settings form autosaves through the profile write module — that module
// boundary (plus revalidation) is what these tests pin down.
vi.mock('@/lib/db/firestore/client/profile', () => ({
  updateProfile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/db/firestore/client/revalidate', () => ({
  requestRevalidate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { email: 'me@example.com', phoneNumber: null }, signOut: vi.fn() }),
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
});

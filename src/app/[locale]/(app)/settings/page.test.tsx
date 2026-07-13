// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderWithIntl, screen } from '@/../test/render';
import type { User } from '@/lib/db/types';

// The page's data boundary is the profile hook: the settings shell must render
// immediately (no server fetch) and hand the loaded profile to SettingsClient.
const mockUseMyProfile = vi.fn();
vi.mock('@/lib/data/hooks', () => ({
  useMyProfile: () => mockUseMyProfile(),
}));

// SettingsClient drags in the whole form stack; capture its props instead.
const settingsClientSpy = vi.fn();
vi.mock('./SettingsClient', () => ({
  SettingsClient: (props: { initial: Record<string, unknown> }) => {
    settingsClientSpy(props);
    return <div data-testid="settings-client" />;
  },
}));

import SettingsPage from './page';

const me: User = {
  id: 'me',
  handle: 'ncc',
  bio: 'hello',
  region: 'TW',
  primaryLocale: 'zh-TW',
  autoTranslateTo: ['en'],
  verified: false,
  phoneHash: '',
  avatarSeed: '1',
  initials: 'NC',
  accentColor: 'oklch(88% 0.08 55)',
  joinedAt: new Date('2025-01-01'),
  handleChangedAt: new Date('2025-01-01'),
};

afterEach(() => vi.clearAllMocks());

describe('SettingsPage (client-fetched)', () => {
  it('renders the shell with a loader while the profile is still loading', () => {
    mockUseMyProfile.mockReturnValue({ data: undefined });
    renderWithIntl(<SettingsPage />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-client')).not.toBeInTheDocument();
  });

  it('mounts SettingsClient with the loaded profile as its initial values', () => {
    mockUseMyProfile.mockReturnValue({ data: me });
    renderWithIntl(<SettingsPage />);
    expect(screen.getByTestId('settings-client')).toBeInTheDocument();
    expect(settingsClientSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        initial: expect.objectContaining({
          handle: 'ncc',
          bio: 'hello',
          region: 'TW',
          primaryLocale: 'zh-TW',
          initials: 'NC',
        }),
      }),
    );
  });
});

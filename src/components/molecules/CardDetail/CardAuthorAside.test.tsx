// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SWRConfig } from 'swr';
import { renderWithIntl, screen } from '@/../test/render';
import type { User } from '@/lib/db/types';
import { CardAuthorAside } from './CardAuthorAside';

const mockUseAuth = vi.fn();
vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));
const mockIsConnected = vi.fn();
vi.mock('@/lib/db/firestore/client/reads', () => ({
  isConnected: () => mockIsConnected(),
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const author: User = {
  id: 'author-1',
  handle: 'storyteller',
  region: 'TW',
  primaryLocale: 'zh-TW',
  autoTranslateTo: [],
  verified: false,
  phoneHash: '',
  avatarSeed: '7',
  initials: 'ST',
  accentColor: 'var(--color-sage)',
  joinedAt: new Date(),
  handleChangedAt: new Date(),
};

function render(ui: React.ReactElement) {
  return renderWithIntl(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{ui}</SWRConfig>,
  );
}

beforeEach(() => {
  mockUseAuth.mockReturnValue({ user: { id: 'viewer-1' }, loading: false });
  mockIsConnected.mockResolvedValue(true);
});
afterEach(() => vi.clearAllMocks());

describe('CardAuthorAside', () => {
  it('offers no「傳訊息」on the card page, even to a connected reader (a conversation starts from the profile or Messages)', async () => {
    render(<CardAuthorAside author={author} verifiedLabel="Verified" />);
    expect(screen.getAllByRole('link', { name: 'storyteller' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /Message/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Message/)).not.toBeInTheDocument();
    // Nothing is asked about the connection either.
    expect(mockIsConnected).not.toHaveBeenCalled();
  });

  it('shows the anonymous byline without a profile link', () => {
    render(<CardAuthorAside author={author} verifiedLabel="Verified" anonymous />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText('storyteller')).not.toBeInTheDocument();
  });
});

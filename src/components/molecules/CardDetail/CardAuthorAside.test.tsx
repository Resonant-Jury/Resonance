// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SWRConfig } from 'swr';
import { renderWithIntl, screen, waitFor } from '@/../test/render';
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

describe('CardAuthorAside message entry', () => {
  it('offers「傳訊息」to a connected viewer, linking to the thread', async () => {
    render(<CardAuthorAside author={author} verifiedLabel="Verified" />);
    const link = await screen.findByRole('link', { name: /Message/ });
    expect(link).toHaveAttribute('href', '/messages/storyteller');
  });

  it('shows nothing extra to strangers', async () => {
    mockIsConnected.mockResolvedValue(false);
    render(<CardAuthorAside author={author} verifiedLabel="Verified" />);
    // let the connection check settle before asserting absence
    await waitFor(() => expect(mockIsConnected).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: /Message/ })).not.toBeInTheDocument();
  });

  it('never leaks the entry on an anonymous byline', () => {
    render(<CardAuthorAside author={author} verifiedLabel="Verified" anonymous />);
    expect(mockIsConnected).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: /Message/ })).not.toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import type { Card } from '@/lib/db/types';

// The edit page now loads the draft client-direct (owner-scoped by rules)
// instead of blocking navigation on a server render. These tests drive the
// auth-settle → fetch → ownership-check composition.
const mockUseAuth = vi.fn();
vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));
vi.mock('@/lib/db/firestore/client/reads', () => ({
  getCardById: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'card-1' }),
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
// The workspace drags in the editor + map; capture its props instead.
const workspaceSpy = vi.fn();
vi.mock('@/components/sections/WriteWorkspace/WriteWorkspace', () => ({
  WriteWorkspace: (props: Record<string, unknown>) => {
    workspaceSpy(props);
    return <div data-testid="write-workspace" />;
  },
}));

import { getCardById } from '@/lib/db/firestore/client/reads';
import EditCardPage from './page';

function card(authorId: string): Card {
  return {
    id: 'card-1',
    authorId,
    thoughtCore: 'A draft core',
    story: 'draft story',
    tags: ['t'],
    originalLocale: 'zh-TW',
    translations: {},
    visibility: 'private',
    publishedAt: null,
    readCount: 0,
    resonanceCount: 0,
    inviteCount: 0,
    referenceCardId: 'ref-9',
  };
}

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <EditCardPage />
      </SWRConfig>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mockUseAuth.mockReturnValue({ user: { id: 'me' }, loading: false });
});
afterEach(() => vi.clearAllMocks());

describe('EditCardPage (client-fetched)', () => {
  it('shows a loader (and does not fetch) while auth is still restoring', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    renderPage();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(getCardById).not.toHaveBeenCalled();
  });

  it('loads the owner draft and mounts the workspace with its content', async () => {
    vi.mocked(getCardById).mockResolvedValue(card('me'));
    renderPage();
    await waitFor(() => expect(screen.getByTestId('write-workspace')).toBeInTheDocument());
    expect(getCardById).toHaveBeenCalledWith('card-1');
    expect(workspaceSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceCardId: 'ref-9',
        initial: expect.objectContaining({
          id: 'card-1',
          thoughtCore: 'A draft core',
          story: 'draft story',
          visibility: 'private',
        }),
      }),
    );
  });

  it("shows not-found for someone else's card (or a denied read)", async () => {
    vi.mocked(getCardById).mockResolvedValue(card('someone-else'));
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(en.card.notFound.title)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('write-workspace')).not.toBeInTheDocument();
  });
});

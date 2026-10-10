// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { renderWithIntl, screen, userEvent } from '@/../test/render';
import { mockElementSize } from '@/../test/organic';
import type { Card } from '@/lib/db/types';

const push = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push, replace: vi.fn() }),
}));
vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'me' } }),
}));
const mine = { id: 'mine', authorId: 'me', thoughtCore: 'My card' } as Card;
const theirs = { id: 'theirs', slug: 'bobs-walk', authorId: 'bob', thoughtCore: 'Bob’s walk' } as Card;
vi.mock('@/components/molecules/ThoughtMap/ThoughtMapBoard', () => ({
  ThoughtMapBoard: ({ onOpenCard }: { onOpenCard?: (card: Card) => void }) => (
    <div>
      <button onClick={() => onOpenCard?.(mine)}>open mine</button>
      <button onClick={() => onOpenCard?.(theirs)}>open theirs</button>
    </div>
  ),
}));
const saveNow = vi.fn(async () => {});
vi.mock('@/components/sections/WriteWorkspace/OpenedCardPane', () => ({
  OpenedCardPane: ({ card, editorRef }: { card: Card; editorRef?: React.Ref<unknown> }) => {
    React.useImperativeHandle(editorRef, () => ({ saveNow, hasWork: () => false, cardId: () => card.id }));
    return <p>opened: {card.thoughtCore}</p>;
  },
}));

import { ThoughtMapPage } from './ThoughtMapPage';

mockElementSize(120, 40);

const realMatchMedia = window.matchMedia;
function screenAtSplit(wide: boolean) {
  window.matchMedia = vi.fn(
    (query: string) =>
      ({
        matches: wide && /min-width/.test(query),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}
afterEach(() => {
  window.matchMedia = realMatchMedia;
  vi.clearAllMocks();
});

describe('the thought-map page', () => {
  // At the split, one page with the writer's: my card opens in the pane beside the map, someone else's on its
  // own page, and folding the pane away saves what it shows at once.
  it('opens my card in the pane and someone else’s on its page at the split', async () => {
    screenAtSplit(true);
    renderWithIntl(<ThoughtMapPage />);
    await userEvent.click(screen.getByRole('button', { name: 'open theirs' }));
    expect(push).toHaveBeenCalledWith('/card/bobs-walk');
    expect(screen.queryByText(/opened:/)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'open mine' }));
    expect(await screen.findByText('opened: My card')).toBeInTheDocument();
    const divider = screen.getByRole('separator');
    divider.focus();
    await userEvent.keyboard('{Enter}');
    expect(saveNow).toHaveBeenCalledTimes(1);
    expect(screen.getByText('opened: My card')).toBeInTheDocument();
  });

  // Below it the pane covers the map, and someone else's card opens there as its reading panel, as before.
  it('opens someone else’s card in the covering pane below the split', async () => {
    screenAtSplit(false);
    renderWithIntl(<ThoughtMapPage />);
    await userEvent.click(screen.getByRole('button', { name: 'open theirs' }));
    expect(push).not.toHaveBeenCalled();
    expect(await screen.findByText('opened: Bob’s walk')).toBeInTheDocument();
  });
});

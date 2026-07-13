// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderWithIntl, screen, userEvent } from '@/../test/render';
import type { Card } from '@/lib/db/types';
import type { MyThoughtMap } from '@/lib/data/hooks';

// The canvas persists through the client thoughtMap module; mock the boundary.
vi.mock('@/lib/db/firestore/client/thoughtMap', () => ({
  addMapNode: vi.fn().mockResolvedValue(undefined),
  createMapEdge: vi.fn(),
  createMapGroup: vi.fn(),
  edgeId: (a: string, b: string) => `${a}_${b}`,
  moveMapNode: vi.fn(),
  moveMapNodes: vi.fn(),
  removeMapEdge: vi.fn(),
  removeMapGroup: vi.fn(),
  removeMapNode: vi.fn(),
  setNodeGroups: vi.fn(),
  updateMapEdgeLabel: vi.fn(),
  updateMapGroup: vi.fn(),
}));
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { addMapNode } from '@/lib/db/firestore/client/thoughtMap';
import { ThoughtMapCanvas } from './ThoughtMapCanvas';

function card(id: string, extra: Partial<Card> = {}): Card {
  return {
    id,
    authorId: 'me',
    thoughtCore: `Core of ${id}`,
    story: 'story',
    tags: [],
    originalLocale: 'en',
    translations: {},
    visibility: 'public',
    publishedAt: new Date('2026-01-01'),
    readCount: 0,
    resonanceCount: 0,
    inviteCount: 0,
    ...extra,
  };
}

function mapData(): MyThoughtMap {
  return {
    nodes: [],
    edges: [],
    groups: [],
    cards: {
      mine: card('mine'),
      theirs: card('theirs', { authorId: 'other' }),
    },
    resonatedIds: ['theirs'],
  };
}

afterEach(() => vi.clearAllMocks());

describe('ThoughtMapCanvas card tray', () => {
  it('lists own and resonated cards as rows and places the picked one', async () => {
    renderWithIntl(<ThoughtMapCanvas data={mapData()} style={{ height: 480 }} />);

    // Empty map: the empty-state CTA opens the tray.
    await userEvent.setup().click(screen.getAllByRole('button', { name: /Add card/i })[0]);

    // Both the viewer's own card and the resonated original are offered.
    const mineRow = screen.getByRole('button', { name: /Core of mine/ });
    const theirsRow = screen.getByRole('button', { name: /Core of theirs/ });
    expect(mineRow).toBeInTheDocument();
    expect(theirsRow).toBeInTheDocument();

    // Picking the resonated card files it onto the (owner's) map.
    await userEvent.setup().click(theirsRow);
    expect(addMapNode).toHaveBeenCalledWith('theirs', expect.any(Number), expect.any(Number));
  });
});

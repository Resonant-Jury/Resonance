// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderWithIntl, screen, userEvent } from '@/../test/render';
import { mockElementSize } from '@/../test/organic';
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

describe('ThoughtMapCanvas toolbar', () => {
  // The toolbar floats over the board: every tool is a filled pill with no
  // pen line — the second tool tonal, opaque over the dots — and the one verb,
  // adding a card, the only solid terracotta.
  it('floats a tonal tool beside a single solid verb', () => {
    renderWithIntl(<ThoughtMapCanvas data={mapData()} style={{ height: 480 }} />);

    expect(screen.getByRole('button', { name: /New group/i })).toHaveAttribute('data-variant', 'tonal');
    // The empty-state CTA is also "Add card"; the toolbar's is the first.
    expect(screen.getAllByRole('button', { name: /Add card/i })[0]).toHaveAttribute('data-variant', 'solid');
  });
});

describe('ThoughtMapCanvas zoom cluster', () => {
  // The shapes draw only once measured; the cluster is a strip of four controls.
  mockElementSize(190, 42);

  it('sits on a wobbly sheet of the cards\' paper, grain and all, with no pen line', () => {
    renderWithIntl(<ThoughtMapCanvas data={mapData()} style={{ height: 480 }} />);

    const cluster = screen.getByRole('button', { name: 'Zoom in' }).parentElement as HTMLElement;
    const ground = Array.from(cluster.children).filter((el) => el.tagName.toLowerCase() === 'svg');
    const paths = ground.flatMap((svg) => Array.from(svg.querySelectorAll('path')));

    // One fill in the card paper, hand-drawn (a path, not a CSS rounded box) …
    const fill = paths.filter((p) => p.getAttribute('fill') === 'var(--color-card-bg)');
    expect(fill).toHaveLength(1);
    // … the cards' grain tile over it (0.3, as the Modal and the paper buttons) …
    expect(cluster.querySelector(':scope > svg feFuncA')).toHaveAttribute('slope', '0.3');
    // … cut to the same wobbly edge …
    expect(cluster.querySelector(':scope > svg clipPath path')).toHaveAttribute('d', fill[0].getAttribute('d'));
    // … and nothing stroked round it.
    expect(paths.filter((p) => p.getAttribute('stroke'))).toHaveLength(0);
  });

  it('leaves the rounded box to the drawn sheet, not the stylesheet', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/molecules/ThoughtMap/ThoughtMap.module.css'), 'utf8');
    const rule = css.match(/\.zoomCluster\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain('padding');
    expect(rule).not.toMatch(/background|border/);
  });

  it('keeps its controls working over the sheet', async () => {
    renderWithIntl(<ThoughtMapCanvas data={mapData()} style={{ height: 480 }} />);

    expect(screen.getByText('100%')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('125%')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});

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

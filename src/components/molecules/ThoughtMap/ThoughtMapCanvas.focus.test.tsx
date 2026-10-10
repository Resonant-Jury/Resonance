// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, renderWithIntl, fireEvent, screen } from '@/../test/render';
import { mockElementSize } from '@/../test/organic';
import type { Card } from '@/lib/db/types';
import type { MyThoughtMap } from '@/lib/data/hooks';

vi.mock('@/lib/db/firestore/client/thoughtMap', () => ({
  addMapNode: vi.fn().mockResolvedValue(undefined),
  createMapEdge: vi.fn(),
  createMapGroup: vi.fn(),
  edgeId: (a: string, b: string) => `${a}_${b}`,
  moveMapNode: vi.fn().mockResolvedValue(undefined),
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
import { ThoughtMapCanvas } from './ThoughtMapCanvas';
import { NODE_H, NODE_W } from './mapMath';

// The map 900 × 600 wide whatever the pane does: the glide reads the width it has then.
mockElementSize(900, 600);

function card(id: string): Card {
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
  };
}

const at = new Date('2026-01-01');
const spots: Record<string, { x: number; y: number }> = { a: { x: 0, y: 0 }, b: { x: 900, y: 40 }, c: { x: 1800, y: 700 } };
function mapData(): MyThoughtMap {
  const ids = Object.keys(spots);
  return {
    nodes: ids.map((id) => ({ id, cardId: id, ...spots[id], createdAt: at, updatedAt: at })),
    edges: [],
    groups: [],
    cards: Object.fromEntries(ids.map((id) => [id, card(id)])),
    resonatedIds: [],
  };
}

type Props = { paneOpen?: boolean; focusCardId?: string | null; settleKey?: number };
function board(props: Props) {
  const data = mapData();
  const view = renderWithIntl(<ThoughtMapCanvas data={data} style={{ height: 600 }} {...props} />);
  const node = screen.getByText('Core of a').closest('[role="button"]') as HTMLElement;
  const world = node.closest('div[style*="translate("]') as HTMLElement;
  const rerender = (next: Props) => view.rerender(<ThoughtMapCanvas data={data} style={{ height: 600 }} {...next} />);
  return { world, viewport: world.parentElement as HTMLElement, rerender };
}

/** Where a card's centre is on the screen under the world's camera. */
function centreOf(world: HTMLElement, id: string) {
  const [, x, y, s] = world.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)/)!.map(Number);
  return { x: (spots[id].x + NODE_W / 2) * s + x, y: (spots[id].y + NODE_H / 2) * s + y, s };
}

const settle = () => act(() => void vi.advanceTimersByTime(500));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('ThoughtMapCanvas centring the card the pane shows', () => {
  it('glides the opened card to the map’s centre when the pane opens, at its zoom', () => {
    const { world, rerender } = board({});
    const { s } = centreOf(world, 'c');
    rerender({ paneOpen: true, focusCardId: 'c' });
    settle();
    const c = centreOf(world, 'c');
    expect(c.x).toBeCloseTo(450);
    expect(c.y).toBeCloseTo(300);
    expect(c.s).toBe(s);
  });

  it('brings another card opened in the pane to the centre, and again once the divider is released', () => {
    const { world, viewport, rerender } = board({ paneOpen: true, focusCardId: 'a' });
    rerender({ paneOpen: true, focusCardId: 'b' });
    settle();
    expect(centreOf(world, 'b').x).toBeCloseTo(450);

    // The reader pans away; a released divider brings the card back.
    fireEvent.pointerDown(viewport, { button: 0, pointerId: 1, clientX: 400, clientY: 300 });
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 200, clientY: 250 });
    fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 200, clientY: 250 });
    expect(centreOf(world, 'b').x).not.toBeCloseTo(450);
    rerender({ paneOpen: true, focusCardId: 'b', settleKey: 1 });
    settle();
    expect(centreOf(world, 'b').x).toBeCloseTo(450);
    expect(centreOf(world, 'b').y).toBeCloseTo(300);
  });

  it('leaves the camera alone for a card that is not on the map', () => {
    const { world, rerender } = board({});
    const before = world.style.transform;
    rerender({ paneOpen: false, focusCardId: 'elsewhere', settleKey: 1 });
    settle();
    expect(world.style.transform).toBe(before);
  });
});

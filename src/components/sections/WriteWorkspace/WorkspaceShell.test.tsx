// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, renderWithIntl, screen, userEvent, within } from '@/../test/render';
import { mockElementSize, penLines } from '@/../test/organic';
import type { Card } from '@/lib/db/types';

const mockBack = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ back: mockBack, push: vi.fn(), replace: vi.fn() }),
}));
// The shell is about the chrome around the map; the map itself is swapped out
// for a card (its tab's 開啟卡片 shown while `map.tabShown`) and an arrow's label field.
const map = { tabShown: true };
vi.mock('@/components/molecules/ThoughtMap/ThoughtMapBoard', () => ({
  ThoughtMapBoard: ({
    onOpenCard,
    paneOpen,
    focusCardId,
    settleKey,
  }: {
    onOpenCard?: (card: Card) => void;
    paneOpen?: boolean;
    focusCardId?: string | null;
    settleKey?: number;
  }) => (
    <div data-testid="map" data-focus={focusCardId ?? ''} data-settle={settleKey}>
      <div role="button" tabIndex={-1} data-card-id="c1" onDoubleClick={() => onOpenCard?.({ id: 'c1' } as Card)}>
        A card
      </div>
      {(map.tabShown || !paneOpen) && (
        <button type="button" onClick={() => onOpenCard?.({ id: 'c1' } as Card)}>
          Open card
        </button>
      )}
      <input aria-label="Arrow label" />
    </div>
  ),
}));

import { WorkspaceShell } from './WorkspaceShell';

// The button draws its shapes only once measured; give it a box.
mockElementSize(120, 40);

/** A screen as wide as `width`, for the shell's media queries. */
const realMatchMedia = window.matchMedia;
function screenWidth(width: number) {
  window.matchMedia = vi.fn(
    (query: string) =>
      ({
        matches: /min-width: (\d+)px/.test(query) ? width >= Number(/min-width: (\d+)px/.exec(query)![1]) : false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

describe('the map behind the editor', () => {
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  // Below the split the open editor covers the map: a phone writing a card
  // read the whole map and its cards for nothing.
  it('is not mounted on a phone while the editor covers it, and stays once shown', () => {
    screenWidth(390);
    const shell = (open: boolean) => (
      <WorkspaceShell open={open} onClose={vi.fn()}>
        <p>editor</p>
      </WorkspaceShell>
    );
    const { rerender } = renderWithIntl(shell(true));
    expect(screen.queryByTestId('map')).toBeNull();

    rerender(shell(false));
    expect(screen.getByTestId('map')).toBeInTheDocument();
    // A card opened from the map covers it again; hiding the pane hands it back as it was.
    rerender(shell(true));
    expect(screen.getByTestId('map')).toBeInTheDocument();
  });

  it('is mounted beside the editor on a desktop', () => {
    screenWidth(1440);
    renderWithIntl(
      <WorkspaceShell open onClose={vi.fn()}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    expect(screen.getByTestId('map')).toBeInTheDocument();
  });
});

describe('WorkspaceShell', () => {
  // The Leave control floats over the map: a tonal pill, opaque to stay
  // legible over the board, and no pen line of its own.
  it('leaves through a tonal button without a pen outline', async () => {
    renderWithIntl(
      <WorkspaceShell open={false} onClose={vi.fn()}>
        <p>editor</p>
      </WorkspaceShell>,
    );

    const leave = screen.getByRole('button', { name: 'Leave' });
    expect(leave).toHaveAttribute('data-variant', 'tonal');
    expect(penLines(leave)).toHaveLength(0);

    await userEvent.click(leave);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe('the chrome around the panes', () => {
  beforeEach(() => mockBack.mockClear());
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  // The thought-map page: the pane a card opened into has a header row of its
  // own — what it shows on the left, a borderless →| that hides it on the
  // right (hides, never discards: no ✕ — the edits are saved as they are made).
  it('names what the pane shows in its header and hides the pane through its →|', async () => {
    const onClose = vi.fn();
    renderWithIntl(
      <WorkspaceShell open onClose={onClose} paneTitle="Edit published card">
        <p>editor</p>
      </WorkspaceShell>,
    );
    const header = screen.getByRole('heading', { level: 2, name: 'Edit published card' }).closest('header')!;
    const hide = within(header).getByRole('button', { name: 'Hide the editor' });
    // A glyph on the pane's paper: no pill, no pen line round it.
    expect(hide).not.toHaveAttribute('data-variant');
    expect(penLines(hide)).toHaveLength(0);
    // The header stands over what the pane shows, outside what scrolls (the
    // editor's sticky toolbar keeps to the top of its own scroller, under the header).
    const body = screen.getByText('editor').parentElement!;
    expect(header.nextElementSibling).toBe(body);
    expect(body).not.toContainElement(header);
    await userEvent.click(hide);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // At the split Escape folds the pane away (the divider's hide: kept as it was), never closes it.
  it('folds the pane on Escape — not while a dialog over it, or a field on the map, takes the key', async () => {
    // A desktop: the map stands beside the pane.
    screenWidth(1440);
    const onClose = vi.fn();
    const onHide = vi.fn();
    renderWithIntl(
      <WorkspaceShell open onClose={onClose} onHide={onHide} paneTitle="Edit draft">
        <p>editor</p>
      </WorkspaceShell>,
    );
    // A dialog over the page is the one Escape closes.
    const dialog = document.createElement('div');
    dialog.setAttribute('aria-modal', 'true');
    document.body.appendChild(dialog);
    await userEvent.keyboard('{Escape}');
    expect(onHide).not.toHaveBeenCalled();
    dialog.remove();

    // A field on the map keeps its own Escape (an arrow's label being named: it cancels).
    screen.getByRole('textbox', { name: 'Arrow label' }).focus();
    await userEvent.keyboard('{Escape}');
    expect(onHide).not.toHaveBeenCalled();

    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard('{Escape}');
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('separator', { name: 'Show the editor' })).toBeInTheDocument();
    expect(screen.getByText('editor')).toBeInTheDocument();
  });

  // Opening a card leaves the focus on its 開啟卡片 (or on the card, double-
  // clicked): the next Escape is the pane's, not swallowed by the map.
  it('folds the pane on Escape with the focus still on the map’s 開啟卡片 or on the card', async () => {
    screenWidth(1440);
    const onHide = vi.fn();
    renderWithIntl(<MapPage onHide={onHide} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open card' }));
    expect(screen.getByRole('button', { name: 'Open card' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(onHide).toHaveBeenCalledTimes(1);

    await userEvent.dblClick(screen.getByRole('button', { name: 'A card' }));
    expect(screen.getByRole('separator', { name: 'Drag to resize panes' })).toBeInTheDocument();
    screen.getByRole('button', { name: 'A card' }).focus();
    await userEvent.keyboard('{Escape}');
    expect(onHide).toHaveBeenCalledTimes(2);
  });

  // Below the split the pane covers the map, and Escape closes it as its →| does.
  it('closes the covering pane on Escape below the split', async () => {
    screenWidth(1024);
    const onClose = vi.fn();
    renderWithIntl(
      <WorkspaceShell open onClose={onClose} paneTitle="Edit draft">
        <p>editor</p>
      </WorkspaceShell>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Typing in the card, Escape never folds it away at once: the first press
  // steps out of the field to the →| (an IME's Escape is the IME's), the next hides.
  it('steps out of a field on the first Escape and hides on the next — even from an editor that keeps Escape', async () => {
    const onClose = vi.fn();
    renderWithIntl(
      <WorkspaceShell open onClose={onClose} paneTitle="Edit draft">
        <input aria-label="Title" />
        {/* The story editor (ProseMirror) prevents the default of every Escape it hears. */}
        <div
          role="textbox"
          aria-label="Story"
          contentEditable
          suppressContentEditableWarning
          onKeyDown={(e) => e.key === 'Escape' && e.preventDefault()}
        />
      </WorkspaceShell>,
    );
    const hide = screen.getByRole('button', { name: 'Hide the editor' });

    const title = screen.getByRole('textbox', { name: 'Title' });
    title.focus();
    fireEvent.keyDown(title, { key: 'Escape', isComposing: true });
    fireEvent.keyDown(title, { key: 'Escape', keyCode: 229 });
    expect(title).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(hide).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();

    const story = screen.getByRole('textbox', { name: 'Story' });
    // jsdom has no isContentEditable: the browser's answer.
    Object.defineProperty(story, 'isContentEditable', { value: true });
    story.focus();
    await userEvent.keyboard('{Escape}');
    expect(hide).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Its pen line inks in whole while anything under it has scrolled — the
  // editor's column, or the reading panel's own scroller (another author's card).
  it('inks its pen line while what the pane shows has scrolled under it', () => {
    renderWithIntl(
      <WorkspaceShell open onClose={vi.fn()} paneTitle="Original">
        <div data-testid="panel" />
      </WorkspaceShell>,
    );
    const header = screen.getByRole('heading', { level: 2, name: 'Original' }).closest('header')!;
    expect(header).not.toHaveAttribute('data-scrolled');
    const panel = screen.getByTestId('panel');
    panel.scrollTop = 120;
    fireEvent.scroll(panel);
    expect(header).toHaveAttribute('data-scrolled');
    panel.scrollTop = 0;
    fireEvent.scroll(panel);
    expect(header).not.toHaveAttribute('data-scrolled');
  });

  it('has no header row, and Escape does nothing, while the pane is closed', async () => {
    const onClose = vi.fn();
    renderWithIntl(
      <WorkspaceShell open={false} onClose={onClose} paneTitle="Edit draft">
        <p>editor</p>
      </WorkspaceShell>,
    );
    expect(screen.queryByRole('button', { name: 'Hide the editor' })).toBeNull();
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  // The writer below the split: its bar over the pane that covers the map, as on the apps' writer page — its
  // back arrow and title, in place of the Leave over the map and the →|.
  it('stands the writer’s bar over the pane instead of the floating controls below the split', async () => {
    const onBack = vi.fn();
    renderWithIntl(
      <WorkspaceShell open bar={{ title: 'New card', onBack }}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'New card' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Leave' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Hide the editor' })).toBeNull();
    // Its back arrow is the way out: Escape leaves the writer to it.
    await userEvent.keyboard('{Escape}');
    expect(onBack).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mockBack).not.toHaveBeenCalled();
  });
});

/** The thought-map page in small: a card opened from the map shows in the pane until it is hidden. */
function MapPage({ onHide }: { onHide?: () => void }) {
  const [card, setCard] = useState<Card | null>(null);
  return (
    <WorkspaceShell
      open={card != null}
      onClose={() => setCard(null)}
      onHide={onHide}
      paneTitle="Edit draft"
      paneKey={card?.id}
      onOpenCard={setCard}
    >
      <input aria-label="Title" />
    </WorkspaceShell>
  );
}

describe('the map while the pane is open', () => {
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    map.tabShown = true;
  });

  // Below the split the pane covers the map: Tab must not walk controls no one
  // sees, nor the focus stay on one.
  it('is inert while the pane covers it, and only then', async () => {
    screenWidth(390);
    const shell = (open: boolean) => (
      <WorkspaceShell open={open} onClose={vi.fn()} paneTitle="Edit draft">
        <p>editor</p>
      </WorkspaceShell>
    );
    const { rerender } = renderWithIntl(shell(false));
    const mapPane = screen.getByTestId('map').parentElement!;
    expect(mapPane).not.toHaveAttribute('inert');
    rerender(shell(true));
    expect(mapPane).toHaveAttribute('inert');
    rerender(shell(false));
    expect(mapPane).not.toHaveAttribute('inert');

    // Beside the pane on a desktop, it stays in reach.
    window.matchMedia = realMatchMedia;
    screenWidth(1440);
    rerender(shell(true));
    expect(screen.getByTestId('map').parentElement).not.toHaveAttribute('inert');
  });

  // Hiding the pane unmounts what had the focus (its →|, the field being
  // written in): the focus goes back to what opened the card, not to the page.
  it('hands the focus back to the 開啟卡片 that opened the card when the pane closes', async () => {
    screenWidth(1024);
    renderWithIntl(<MapPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Open card' }));
    await userEvent.click(screen.getByRole('button', { name: 'Hide the editor' }));
    expect(screen.queryByRole('button', { name: 'Hide the editor' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open card' })).toHaveFocus();

    // And by Escape, from the field being written in (out of it, then hidden).
    await userEvent.click(screen.getByRole('button', { name: 'Open card' }));
    await userEvent.click(screen.getByRole('textbox', { name: 'Title' }));
    await userEvent.keyboard('{Escape}{Escape}');
    expect(screen.queryByRole('button', { name: 'Hide the editor' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open card' })).toHaveFocus();
  });

  it('hands the focus to the card itself when what opened it is gone', async () => {
    screenWidth(1024);
    map.tabShown = false;
    renderWithIntl(<MapPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Open card' }));
    // The tab went away with the pane open; hiding the pane brings a new one.
    await userEvent.click(screen.getByRole('button', { name: 'Hide the editor' }));
    expect(screen.getByRole('button', { name: 'A card' })).toHaveFocus();
  });

  // Another card opened while the pane is open starts at its top, the
  // header's line at rest — not where the last card was left.
  it('starts another card at its top, its header line at rest', () => {
    screenWidth(1024);
    const shell = (key: string) => (
      <WorkspaceShell open onClose={vi.fn()} paneTitle="Original" paneKey={key}>
        <div data-testid={`panel-${key}`} />
      </WorkspaceShell>
    );
    const { rerender } = renderWithIntl(shell('a'));
    const header = screen.getByRole('heading', { level: 2, name: 'Original' }).closest('header')!;
    const body = header.nextElementSibling as HTMLElement;
    body.scrollTop = 300;
    fireEvent.scroll(body);
    expect(header).toHaveAttribute('data-scrolled');

    rerender(shell('b'));
    expect(header).not.toHaveAttribute('data-scrolled');
    expect(body.scrollTop).toBe(0);
  });
});

/** The shell's box: 1000 wide from the left edge, so a pointer at x leaves the editor (1000 − x) / 10 % of it. */
function shellBox() {
  const box = { left: 0, right: 1000, width: 1000, top: 0, bottom: 800, height: 800, x: 0, y: 0, toJSON: () => ({}) };
  const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(box as DOMRect);
  return () => spy.mockRestore();
}

describe('the workspace at the split', () => {
  let restoreBox: () => void;
  beforeEach(() => {
    screenWidth(1440);
    mockBack.mockClear();
    restoreBox = shellBox();
  });
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    restoreBox();
  });

  const divider = () => screen.getByRole('separator');
  const pane = () => document.getElementById(divider().getAttribute('aria-controls')!)!;
  const drag = (...xs: number[]) => {
    const [from, ...rest] = xs;
    fireEvent.pointerDown(divider(), { button: 0, pointerId: 1, clientX: from });
    for (const x of rest) fireEvent.pointerMove(divider(), { pointerId: 1, clientX: x });
    fireEvent.pointerUp(divider(), { pointerId: 1, clientX: rest.at(-1) ?? from });
  };

  // One page whichever way it was come into: no bar and no header row in the pane, the Leave over the map
  // its way back (the writer's own way out, asking as it does).
  it('has no bar and no header row: the Leave over the map is the way back', async () => {
    const onBack = vi.fn();
    const onLeave = vi.fn();
    const { unmount } = renderWithIntl(
      <WorkspaceShell open bar={{ title: 'New card', onBack }} onLeave={onLeave}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    // Still the page's heading, for a screen reader.
    expect(screen.getByRole('heading', { level: 1, name: 'New card' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();
    unmount();

    renderWithIntl(
      <WorkspaceShell open onClose={vi.fn()} paneTitle="Edit draft">
        <p>editor</p>
      </WorkspaceShell>,
    );
    expect(screen.queryByRole('heading', { level: 2, name: 'Edit draft' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Hide the editor' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('resizes the editor between 32 % and 50 % of the width', () => {
    renderWithIntl(
      <WorkspaceShell open onClose={vi.fn()}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    expect(divider()).toHaveAttribute('aria-valuenow', '50');
    drag(500, 600);
    expect(divider()).toHaveAttribute('aria-valuenow', '40');
    drag(600, 200);
    expect(divider()).toHaveAttribute('aria-valuenow', '50');
    drag(500, 680);
    expect(divider()).toHaveAttribute('aria-valuenow', '32');
    expect(screen.queryByText('Release to hide the editor')).toBeNull();
  });

  // The map brings the card the pane shows to its centre once its width settles: not on every frame of a
  // drag, once the divider is released (or stepped by a key) — a release that folds the pane is its own.
  it('tells the map its width has settled when the divider is released, not while it is dragged', () => {
    renderWithIntl(
      <WorkspaceShell open onClose={vi.fn()} focusCardId="c1">
        <p>editor</p>
      </WorkspaceShell>,
    );
    const map = screen.getByTestId('map');
    expect(map).toHaveAttribute('data-focus', 'c1');
    const settled = () => Number(map.getAttribute('data-settle'));
    const before = settled();
    fireEvent.pointerDown(divider(), { button: 0, pointerId: 1, clientX: 500 });
    fireEvent.pointerMove(divider(), { pointerId: 1, clientX: 560 });
    fireEvent.pointerMove(divider(), { pointerId: 1, clientX: 600 });
    expect(settled()).toBe(before);
    fireEvent.pointerUp(divider(), { pointerId: 1, clientX: 600 });
    expect(settled()).toBe(before + 1);
    fireEvent.keyDown(divider(), { key: 'ArrowLeft' });
    expect(settled()).toBe(before + 2);
  });

  // Dragged on toward the edge the pane follows; narrower than 18 % it dims and the pill says what releasing
  // does — and releasing there folds it away, kept as it was, saved at once.
  it('hides the pane when released past the hide line, keeping what it shows', () => {
    const onHide = vi.fn();
    renderWithIntl(
      <WorkspaceShell open onClose={vi.fn()} onHide={onHide}>
        <input aria-label="Title" defaultValue="kept" />
      </WorkspaceShell>,
    );
    fireEvent.pointerDown(divider(), { button: 0, pointerId: 1, clientX: 500 });
    fireEvent.pointerMove(divider(), { pointerId: 1, clientX: 760 });
    // Following the pointer past the narrowest (24 %), not yet in the hide zone.
    expect(divider()).toHaveAttribute('aria-valuenow', '24');
    expect(pane()).not.toHaveAttribute('data-dim');
    expect(screen.queryByText('Release to hide the editor')).toBeNull();
    fireEvent.pointerMove(divider(), { pointerId: 1, clientX: 900 });
    expect(pane()).toHaveAttribute('data-dim');
    expect(screen.getByText('Release to hide the editor')).toBeInTheDocument();
    fireEvent.pointerUp(divider(), { pointerId: 1, clientX: 900 });

    expect(onHide).toHaveBeenCalledTimes(1);
    expect(pane()).toHaveAttribute('data-folded');
    expect(pane()).toHaveAttribute('inert');
    expect(screen.queryByText('Release to hide the editor')).toBeNull();
    // Docked at the edge, to show it again; what the pane shows is still there, as it was.
    expect(divider()).toHaveAccessibleName('Show the editor');
    expect(divider()).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByRole('textbox', { name: 'Title', hidden: true })).toHaveValue('kept');
  });

  it('cancels the hide when dragged back above the hide line, and springs back to the narrowest', () => {
    const onHide = vi.fn();
    renderWithIntl(
      <WorkspaceShell open onClose={vi.fn()} onHide={onHide}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    fireEvent.pointerDown(divider(), { button: 0, pointerId: 1, clientX: 500 });
    fireEvent.pointerMove(divider(), { pointerId: 1, clientX: 900 });
    expect(screen.getByText('Release to hide the editor')).toBeInTheDocument();
    fireEvent.pointerMove(divider(), { pointerId: 1, clientX: 760 });
    expect(screen.queryByText('Release to hide the editor')).toBeNull();
    expect(pane()).not.toHaveAttribute('data-dim');
    fireEvent.pointerUp(divider(), { pointerId: 1, clientX: 760 });
    expect(onHide).not.toHaveBeenCalled();
    expect(pane()).not.toHaveAttribute('data-folded');
    expect(divider()).toHaveAttribute('aria-valuenow', '32');
  });

  // Folded, the docked grip shows the pane again at the width it had — tapped, or drawn toward the map.
  it('shows the pane again from the docked grip, at its last width', () => {
    renderWithIntl(
      <WorkspaceShell open onClose={vi.fn()}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    drag(500, 600);
    expect(divider()).toHaveAttribute('aria-valuenow', '40');
    drag(600, 950);
    expect(pane()).toHaveAttribute('data-folded');

    // A tap.
    drag(995);
    expect(pane()).not.toHaveAttribute('data-folded');
    expect(divider()).toHaveAttribute('aria-valuenow', '40');

    // A drag toward the map.
    drag(600, 950);
    expect(pane()).toHaveAttribute('data-folded');
    drag(995, 960);
    expect(pane()).not.toHaveAttribute('data-folded');
    expect(divider()).toHaveAttribute('aria-valuenow', '40');

    // Drawn the other way (off the window's edge), it stays docked.
    drag(600, 950);
    drag(990, 1000, 1030);
    expect(pane()).toHaveAttribute('data-folded');
  });

  it('shows the folded pane again when a card is opened from the map', async () => {
    renderWithIntl(<MapPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Open card' }));
    drag(500, 950);
    expect(pane()).toHaveAttribute('data-folded');
    await userEvent.click(screen.getByRole('button', { name: 'Open card' }));
    expect(pane()).not.toHaveAttribute('data-folded');
  });

  // A separator the keyboard moves: arrows resize within 32–50 %, Enter and Space fold and show; folded, the
  // arrow toward the map shows it again.
  it('answers the keyboard as a separator', async () => {
    const onHide = vi.fn();
    renderWithIntl(
      <WorkspaceShell open onClose={vi.fn()} onHide={onHide}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    expect(divider()).toHaveAccessibleName('Drag to resize panes');
    expect(divider()).toHaveAttribute('aria-orientation', 'vertical');
    divider().focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(divider()).toHaveAttribute('aria-valuenow', '50');
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(divider()).toHaveAttribute('aria-valuenow', '46');
    for (let i = 0; i < 10; i++) await userEvent.keyboard('{ArrowRight}');
    expect(divider()).toHaveAttribute('aria-valuenow', '32');

    await userEvent.keyboard('{Enter}');
    expect(pane()).toHaveAttribute('data-folded');
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(divider()).toHaveFocus();
    await userEvent.keyboard(' ');
    expect(pane()).not.toHaveAttribute('data-folded');
    expect(divider()).toHaveAttribute('aria-valuenow', '32');
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{ArrowRight}');
    expect(pane()).toHaveAttribute('data-folded');
    await userEvent.keyboard('{ArrowLeft}');
    expect(pane()).not.toHaveAttribute('data-folded');
  });

  // Typing in the card, the first Escape steps out of the field to the divider (which says what Enter does
  // there), the next folds the pane — the focus staying on the divider, where it shows again.
  it('steps out of a field to the divider on Escape, and folds on the next', async () => {
    const onHide = vi.fn();
    renderWithIntl(
      <WorkspaceShell open onClose={vi.fn()} onHide={onHide}>
        <input aria-label="Title" />
      </WorkspaceShell>,
    );
    await userEvent.click(screen.getByRole('textbox', { name: 'Title' }));
    await userEvent.keyboard('{Escape}');
    expect(divider()).toHaveFocus();
    expect(onHide).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(divider()).toHaveFocus();
    // Folded, Escape has nothing left to fold.
    await userEvent.keyboard('{Escape}');
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  // Folding by a button inside the pane (none today but the editor's own) hands the focus to the divider.
  it('hands the focus to the docked grip when the pane folds with the focus in it', async () => {
    renderWithIntl(
      <WorkspaceShell open onClose={vi.fn()}>
        <button type="button">In the pane</button>
      </WorkspaceShell>,
    );
    screen.getByRole('button', { name: 'In the pane' }).focus();
    await userEvent.keyboard('{Escape}');
    expect(pane()).toHaveAttribute('data-folded');
    expect(divider()).toHaveFocus();
  });
});

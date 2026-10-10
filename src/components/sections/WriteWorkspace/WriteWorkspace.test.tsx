// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, beforeEach, describe, it, expect, onTestFinished, vi } from 'vitest';
import { fireEvent, renderWithIntl, screen, userEvent, waitFor, within } from '@/../test/render';
import en from '@/messages/en.json';
import type { Card } from '@/lib/db/types';

// The editor is its own suite (CardEditor.test: what counts as work, what
// saving writes); here it is the handle the page asks, and a field that
// remembers what was typed into it for as long as it stays mounted.
const editor = vi.hoisted(() => ({
  hasWork: vi.fn(() => false),
  saveNow: vi.fn(async () => {}),
  cardId: vi.fn((): string | undefined => undefined),
}));
vi.mock('@/components/molecules/CardEditor/CardEditor', () => ({
  CardEditor: ({ ref }: { ref?: React.Ref<typeof editor> }) => {
    React.useImperativeHandle(ref, () => editor);
    return <textarea aria-label="Draft" />;
  },
}));

const back = vi.fn();
const replace = vi.fn();
const push = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ back, push, replace }),
}));
/** How many entries this tab's history holds (jsdom's starts with one: a tab opened on the writer). */
let historyLength = 2;
Object.defineProperty(window.history, 'length', { configurable: true, get: () => historyLength });
vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'me' } }),
}));
vi.mock('@/lib/data/hooks', () => ({
  useHasWrittenCards: () => ({ data: true }),
}));

/** Cards on the map: one of the viewer's own, an original they resonated with, and the draft's own (`draft`). */
const mine = { id: 'mine', authorId: 'me', thoughtCore: 'My older card', publishedAt: new Date('2026-09-01') } as Card;
const theirs = { id: 'theirs', authorId: 'bob', thoughtCore: 'Bob’s walk', publishedAt: new Date('2026-09-02') } as Card;
const draftCard = { id: 'draft', authorId: 'me', thoughtCore: 'The draft' } as Card;
vi.mock('@/components/molecules/ThoughtMap/ThoughtMapBoard', () => ({
  ThoughtMapBoard: ({ onOpenCard }: { onOpenCard?: (card: Card) => void }) => (
    <div>
      <button onClick={() => onOpenCard?.(mine)}>open mine</button>
      <button onClick={() => onOpenCard?.(theirs)}>open theirs</button>
      <button onClick={() => onOpenCard?.(draftCard)}>open the draft</button>
    </div>
  ),
}));
/** The editor of a card opened from the map, as the page sees it. */
const openedEditor = vi.hoisted(() => ({
  hasWork: vi.fn(() => false),
  saveNow: vi.fn(async () => {}),
  cardId: vi.fn((): string | undefined => undefined),
}));
vi.mock('./OpenedCardPane', () => ({
  OpenedCardPane: ({ card, editorRef }: { card: Card; editorRef?: React.Ref<typeof openedEditor> }) => {
    React.useImperativeHandle(editorRef, () => openedEditor);
    return <p>opened: {card.thoughtCore}</p>;
  },
}));
vi.mock('./LazyOriginalCardPanel', () => ({ OriginalCardPanel: () => null }));

import { WriteWorkspace } from './WriteWorkspace';

/** A desktop at the split, where the map lies beside the draft (`wide = false`: a narrower window). */
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
beforeEach(() => screenAtSplit(true));
afterEach(() => {
  window.matchMedia = realMatchMedia;
  vi.clearAllMocks();
  editor.hasWork.mockReturnValue(false);
  editor.cardId.mockReturnValue(undefined);
  openedEditor.hasWork.mockReturnValue(false);
  historyLength = 2;
});

const leaveButton = () => screen.getByRole('button', { name: en.me.thoughtMap.leave });
const backArrow = () => screen.getByRole('button', { name: en.app.nav.back });
/** The dialog's Leave (named as the Leave over the map is). */
const confirmLeave = () => userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: en.write.leaveConfirm }));

describe('the writer at the split', () => {
  // One page with the thought map's: no bar over it, the Leave over the map its way back; the title is the
  // page's heading still, for a screen reader.
  it('has no bar: the Leave over the map is the way out', () => {
    renderWithIntl(<WriteWorkspace title={en.write.title} locale="en" />);
    expect(screen.queryByRole('button', { name: en.app.nav.back })).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: en.write.title })).toBeInTheDocument();
    expect(leaveButton()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en.write.closeEditor })).toBeNull();
    expect(screen.getByRole('separator', { name: en.write.resizeDivider })).toBeInTheDocument();
  });

  it('leaves at once when nothing written would be left behind', async () => {
    renderWithIntl(<WriteWorkspace title={en.write.title} locale="en" />);
    await userEvent.click(leaveButton());
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
    expect(editor.saveNow).toHaveBeenCalled();
  });

  it('asks first when it would leave written work, in the apps’ words', async () => {
    editor.hasWork.mockReturnValue(true);
    renderWithIntl(<WriteWorkspace title={en.write.title} locale="en" />);
    await userEvent.click(leaveButton());

    const dialog = screen.getByRole('dialog', { name: en.write.leaveTitle });
    expect(dialog).toHaveTextContent(en.write.leaveBody);
    await userEvent.click(screen.getByRole('button', { name: en.write.leaveStay }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(back).not.toHaveBeenCalled();

    // Leaving saves what is on screen first, then goes.
    await userEvent.click(leaveButton());
    await confirmLeave();
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
    expect(editor.saveNow).toHaveBeenCalledTimes(1);
    expect(editor.saveNow.mock.invocationCallOrder[0]).toBeLessThan(back.mock.invocationCallOrder[0]);
  });

  it('says a live card’s revision is kept but not applied', async () => {
    editor.hasWork.mockReturnValue(true);
    renderWithIntl(
      <WriteWorkspace
        title={en.write.editPublishedTitle}
        locale="en"
        initial={{ id: 'live', publishedAt: new Date('2026-08-01'), thoughtCore: 'Live' }}
      />,
    );
    await userEvent.click(leaveButton());
    expect(screen.getByRole('dialog')).toHaveTextContent(en.write.leaveBodyRevision);
  });

  it('still leaves when the save before it fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    editor.saveNow.mockRejectedValueOnce(new Error('offline'));
    renderWithIntl(<WriteWorkspace title={en.write.title} locale="en" />);
    await userEvent.click(leaveButton());
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
  });

  // Folding the pane away by its divider saves the draft at once and keeps it as it was.
  it('saves the draft at once when its pane is folded away, and keeps it', async () => {
    renderWithIntl(<WriteWorkspace title={en.write.title} locale="en" />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Draft' }), 'kept');
    const divider = screen.getByRole('separator');
    divider.focus();
    fireEvent.keyDown(divider, { key: 'Enter' });
    expect(editor.saveNow).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('separator', { name: en.write.openEditor })).toBeInTheDocument();
    fireEvent.keyDown(divider, { key: 'Enter' });
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('kept');
  });
});

describe('the writer below the split', () => {
  beforeEach(() => screenAtSplit(false));

  // As on the apps' writer page: the bar names the page, and the Leave over the map is the split's.
  it('carries the back arrow and the page’s title, and nothing floats over the pane', () => {
    renderWithIntl(<WriteWorkspace title={en.write.title} locale="en" />);
    expect(screen.getByRole('heading', { level: 1, name: en.write.title })).toBeInTheDocument();
    expect(backArrow()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en.write.closeEditor })).toBeNull();
    expect(screen.queryByRole('button', { name: en.me.thoughtMap.leave })).toBeNull();
  });

  it('asks first when its back would leave written work', async () => {
    editor.hasWork.mockReturnValue(true);
    renderWithIntl(<WriteWorkspace title={en.write.title} locale="en" />);
    await userEvent.click(backArrow());
    expect(screen.getByRole('dialog', { name: en.write.leaveTitle })).toBeInTheDocument();
    await confirmLeave();
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
  });
});

describe('a card opened from the map', () => {
  // In place: the draft is saved first and waits under it, the same one, still holding what was typed —
  // the draft's own card on the map brings it back. No step in the tab's history: the way out leaves.
  it('opens one of mine in the pane, and the draft’s own card brings the draft back as it was', async () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    onTestFinished(() => pushState.mockRestore());
    renderWithIntl(<WriteWorkspace title={en.write.editTitle} locale="en" initial={{ id: 'draft', story: 'x' }} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Draft' }), 'not lost');

    await userEvent.click(screen.getByRole('button', { name: 'open mine' }));
    expect(screen.getByText('opened: My older card')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Draft' })).toBeNull();
    expect(editor.saveNow).toHaveBeenCalledTimes(1);
    expect(pushState).not.toHaveBeenCalled();

    // The draft's own card.
    await userEvent.click(screen.getByRole('button', { name: 'open the draft' }));
    expect(screen.queryByText(/opened:/)).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('not lost');
    expect(back).not.toHaveBeenCalled();
  });

  // A fresh /write's draft gets its id at its first save, in the editor: the route's `initial` never has one.
  it('knows a fresh draft’s own card once its first save made it', async () => {
    renderWithIntl(<WriteWorkspace title={en.write.title} locale="en" />);
    editor.cardId.mockReturnValue('mine');
    await userEvent.click(screen.getByRole('button', { name: 'open mine' }));
    expect(screen.queryByText('opened: My older card')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Draft' })).toBeInTheDocument();
  });

  // Someone else's card is read on its own page — the draft saved first, so its address is the draft's.
  it('opens someone else’s card on its own page, after saving the draft', async () => {
    renderWithIntl(<WriteWorkspace title={en.write.title} locale="en" />);
    await userEvent.click(screen.getByRole('button', { name: 'open theirs' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/card/theirs'));
    expect(editor.saveNow.mock.invocationCallOrder[0]).toBeLessThan(push.mock.invocationCallOrder[0]);
    expect(screen.queryByText(/opened:/)).toBeNull();
  });

  // The way out asks for the card the pane shows too, and saves both before it goes.
  it('asks before leaving work in a card opened over the draft, in its words', async () => {
    renderWithIntl(<WriteWorkspace title={en.write.title} locale="en" />);
    await userEvent.click(screen.getByRole('button', { name: 'open mine' }));
    openedEditor.hasWork.mockReturnValue(true);
    await userEvent.click(leaveButton());
    // My older card is live: its revision is kept, not applied.
    expect(screen.getByRole('dialog')).toHaveTextContent(en.write.leaveBodyRevision);
    await confirmLeave();
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
    expect(openedEditor.saveNow).toHaveBeenCalled();
  });
});

describe('a writer opened in a tab of its own', () => {
  // A bookmark, a pasted address, a Write link opened in a new tab: nothing in the tab to go back to.
  it('leaves for the feed (an edit: the card box), and its way out answers every time', async () => {
    historyLength = 1;
    const { unmount } = renderWithIntl(<WriteWorkspace title={en.write.title} locale="en" />);
    await userEvent.click(leaveButton());
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/home'));
    expect(back).not.toHaveBeenCalled();
    unmount();

    renderWithIntl(<WriteWorkspace title={en.write.editTitle} locale="en" initial={{ id: 'd1', story: 'x' }} />);
    await userEvent.click(leaveButton());
    await waitFor(() => expect(replace).toHaveBeenLastCalledWith('/me'));
  });

  // Stepped back to as the tab's first page (its later pages ahead of it): the history is long, but nothing of
  // ours lies behind — the Navigation API says so where there is one.
  it('leaves for the feed from the tab’s first page, pages ahead of it or not', async () => {
    vi.stubGlobal('navigation', { canGoBack: false });
    onTestFinished(() => {
      vi.unstubAllGlobals();
    });
    renderWithIntl(<WriteWorkspace title={en.write.title} locale="en" />);
    await userEvent.click(leaveButton());
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/home'));
    expect(back).not.toHaveBeenCalled();
  });

  it('asks again and leaves on Leave after a way back that went nowhere', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWithIntl(<WriteWorkspace title={en.write.title} locale="en" />);
    await userEvent.click(leaveButton());
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
    // Still here: the router's back went nowhere.
    await vi.advanceTimersByTimeAsync(1600);
    editor.hasWork.mockReturnValue(true);
    await userEvent.click(leaveButton());
    await confirmLeave();
    await waitFor(() => expect(back).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).toBeNull();
    vi.useRealTimers();
  });
});

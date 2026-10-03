// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { renderWithIntl, screen, userEvent, waitFor } from '@/../test/render';
import en from '@/messages/en.json';
import type { Card } from '@/lib/db/types';

// The editor is its own suite (CardEditor.test: what counts as work, what
// saving writes); here it is the handle the page asks, and a field that
// remembers what was typed into it for as long as it stays mounted.
const editor = vi.hoisted(() => ({
  hasWork: vi.fn(() => false),
  saveNow: vi.fn(async () => {}),
}));
vi.mock('@/components/molecules/CardEditor/CardEditor', () => ({
  CardEditor: ({ ref }: { ref?: React.Ref<typeof editor> }) => {
    React.useImperativeHandle(ref, () => editor);
    return <textarea aria-label="Draft" />;
  },
}));

const back = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ back, push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'me' } }),
}));
vi.mock('@/lib/data/hooks', () => ({
  useHasWrittenCards: () => ({ data: true }),
}));

/** Cards on the map: one of the viewer's own, and an original they resonated with. */
const mine = { id: 'mine', authorId: 'me', thoughtCore: 'My older card', publishedAt: new Date('2026-09-01') } as Card;
const theirs = { id: 'theirs', authorId: 'bob', thoughtCore: 'Bob’s walk', publishedAt: new Date('2026-09-02') } as Card;
vi.mock('@/components/molecules/ThoughtMap/ThoughtMapBoard', () => ({
  ThoughtMapBoard: ({ onOpenCard }: { onOpenCard?: (card: Card) => void }) => (
    <div>
      <button onClick={() => onOpenCard?.(mine)}>open mine</button>
      <button onClick={() => onOpenCard?.(theirs)}>open theirs</button>
    </div>
  ),
}));
vi.mock('./OpenedCardPane', () => ({
  OpenedCardPane: ({ card }: { card: Card }) => <p>opened: {card.thoughtCore}</p>,
}));
vi.mock('./LazyOriginalCardPanel', () => ({ OriginalCardPanel: () => null }));

import { WriteWorkspace } from './WriteWorkspace';

/** A desktop, where the map lies beside the draft. */
const realMatchMedia = window.matchMedia;
beforeEach(() => {
  window.matchMedia = vi.fn(
    (query: string) =>
      ({
        matches: /min-width/.test(query),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
});
afterEach(() => {
  window.matchMedia = realMatchMedia;
  vi.clearAllMocks();
  editor.hasWork.mockReturnValue(false);
});

const backArrow = () => screen.getByRole('button', { name: en.app.nav.back });

describe('the writer’s bar', () => {
  // As on the apps' writer page: the bar names the page, and the floating
  // ✕ and the Leave over the map are gone.
  it('carries the back arrow and the page’s title, and nothing floats over the panes', () => {
    renderWithIntl(<WriteWorkspace title={en.write.title} locale="en" />);
    expect(screen.getByRole('heading', { level: 1, name: en.write.title })).toBeInTheDocument();
    expect(backArrow()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en.write.closeEditor })).toBeNull();
    expect(screen.queryByRole('button', { name: en.me.thoughtMap.leave })).toBeNull();
  });

  it('leaves at once when nothing written would be left behind', async () => {
    renderWithIntl(<WriteWorkspace title={en.write.title} locale="en" />);
    await userEvent.click(backArrow());
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
    expect(editor.saveNow).toHaveBeenCalled();
  });

  it('asks first when it would leave written work, in the apps’ words', async () => {
    editor.hasWork.mockReturnValue(true);
    renderWithIntl(<WriteWorkspace title={en.write.title} locale="en" />);
    await userEvent.click(backArrow());

    const dialog = screen.getByRole('dialog', { name: en.write.leaveTitle });
    expect(dialog).toHaveTextContent(en.write.leaveBody);
    await userEvent.click(screen.getByRole('button', { name: en.write.leaveStay }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(back).not.toHaveBeenCalled();

    // Leaving saves what is on screen first, then goes.
    await userEvent.click(backArrow());
    await userEvent.click(screen.getByRole('button', { name: en.write.leaveConfirm }));
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
    await userEvent.click(backArrow());
    expect(screen.getByRole('dialog')).toHaveTextContent(en.write.leaveBodyRevision);
  });

  it('still leaves when the save before it fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    editor.saveNow.mockRejectedValueOnce(new Error('offline'));
    renderWithIntl(<WriteWorkspace title={en.write.title} locale="en" />);
    await userEvent.click(backArrow());
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
  });
});

describe('a card opened from the map', () => {
  // A step deeper: the bar names what the pane shows, and back returns to
  // the draft — the same one, still holding what was typed into it.
  it('takes the bar’s title, and back returns to the draft as it was', async () => {
    editor.hasWork.mockReturnValue(true);
    renderWithIntl(<WriteWorkspace title={en.write.title} locale="en" />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Draft' }), 'not lost');

    await userEvent.click(screen.getByRole('button', { name: 'open mine' }));
    expect(screen.getByText('opened: My older card')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: en.write.editPublishedTitle })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Draft' })).toBeNull();

    await userEvent.click(backArrow());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(back).not.toHaveBeenCalled();
    expect(screen.queryByText('opened: My older card')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: en.write.title })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('not lost');
  });

  it('names someone else’s card as the original it is', async () => {
    renderWithIntl(<WriteWorkspace title={en.write.title} locale="en" />);
    await userEvent.click(screen.getByRole('button', { name: 'open theirs' }));
    expect(screen.getByRole('heading', { level: 1, name: en.write.referenceCard })).toBeInTheDocument();
  });
});

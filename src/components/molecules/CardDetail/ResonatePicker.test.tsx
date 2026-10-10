// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import useSWR, { SWRConfig } from 'swr';
import { renderWithIntl, screen, userEvent, waitFor, within } from '@/../test/render';
import type { Card } from '@/lib/db/types';

// The picker on the real card-box hook and the real resonate call: the
// shelf read (client/reads), the v1 call (callApi), the signed-in user and
// navigation are the module boundary.
vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'me' }, loading: false }),
}));
vi.mock('@/lib/auth/firebase/client', () => ({
  getFirebaseClientAuth: () => ({ currentUser: { uid: 'me', getIdToken: async () => 'token' } }),
  hasSessionMark: () => true,
}));
const mockPush = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}));
const mockShelf = vi.fn();
vi.mock('@/lib/db/firestore/client/reads', () => ({
  getCardsByAuthor: (...args: unknown[]) => mockShelf(...args),
  getUsersByIds: async () => ({}),
}));
const mockCallApi = vi.fn();
vi.mock('@/lib/db/firestore/client/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/firestore/client/api')>()),
  callApi: (...args: unknown[]) => mockCallApi(...args),
}));

import { ApiError } from '@/lib/db/firestore/client/api';
import { ResonatePicker, resonateChoices } from './ResonatePicker';

function card(id: string, over: Partial<Card> = {}): Card {
  return {
    id,
    authorId: 'me',
    slug: id,
    thoughtCore: `Card ${id}`,
    story: '',
    tags: [],
    originalLocale: 'en',
    translations: {},
    visibility: 'public',
    // 1 September of this year, at noon wherever the test runs: its row reads "Sep 1".
    publishedAt: new Date(new Date().getFullYear(), 8, 1, 12),
    readCount: 0,
    resonanceCount: 0,
    inviteCount: 0,
    anonymous: false,
    ...over,
  };
}

/** The viewer's published shelf: what getCardsByAuthor(uid, 'published') answers (public and connections-only). */
const SHELF = [
  card('walk'),
  card('sea', { anonymous: true, thoughtCore: 'A day at the sea' }),
  card('answering', { referenceCardId: 'someone-elses' }),
  card('friends-only', { visibility: 'connections' }),
  card('origin'), // the card the target itself answers
];

/** What else this browser holds that shows which card answers which. */
const reads = {
  mine: vi.fn(async () => null),
  targetPage: vi.fn(async () => ({})),
  chosenPage: vi.fn(async () => ({})),
  resonated: vi.fn(async () => ({ cards: [], authors: {} })),
  map: vi.fn(async () => ({})),
};
function Cached() {
  useSWR('myResonance:target:me', reads.mine);
  useSWR('cardPage:target:me', reads.targetPage);
  useSWR('cardPage:walk:me', reads.chosenPage);
  useSWR('cardbox:me:resonated', reads.resonated);
  useSWR('thoughtmap:me', reads.map);
  return null;
}

function renderPicker(extra: { onClose?: () => void; onResonated?: (c: Card) => void } = {}, children?: ReactNode) {
  const onClose = extra.onClose ?? vi.fn();
  renderWithIntl(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <Cached />
      {children}
      <ResonatePicker open onClose={onClose} targetId="target" targetReferenceId="origin" onResonated={extra.onResonated} />
    </SWRConfig>,
  );
  return { onClose };
}

const user = () => userEvent.setup();

beforeEach(() => {
  vi.clearAllMocks();
  mockShelf.mockResolvedValue(SHELF);
  mockCallApi.mockResolvedValue({ card: {}, changed: true });
});

describe('resonateChoices', () => {
  it('offers public published cards answering nothing, never the target or the card it answers, and counts those answering another', () => {
    const draft = card('draft', { publishedAt: null });
    const { cards, hidden } = resonateChoices([...SHELF, draft, card('target')], 'target', 'origin');
    expect(cards.map((c) => c.id)).toEqual(['walk', 'sea']);
    expect(hidden).toBe(1);
  });

  it('does not count a card already answering this very target as hidden', () => {
    expect(resonateChoices([card('a', { referenceCardId: 'target' })], 'target').hidden).toBe(0);
  });
});

describe('ResonatePicker', () => {
  // A quiet list: the title alone (no subtitle, no caption over the cards), the
  // way to write a new card as one line, then rows of a title on one line and
  // one muted line under it — when it came out, 匿名 · first for an anonymous card.
  it('leads with writing a new card, then lists the cards that may resonate, saying why some are missing', async () => {
    renderPicker();
    const dialog = screen.getByRole('dialog', { name: 'Resonate with this card' });
    expect(within(dialog).getByRole('heading', { name: 'Resonate with this card' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Write a new card' })).toBeInTheDocument();

    const choices = await screen.findByRole('radiogroup', { name: 'Resonate with this card' });
    const rows = within(choices).getAllByRole('radio');
    expect(rows.map((r) => r.textContent)).toEqual(['Card walkSep 1', 'A day at the seaAnonymous · Sep 1']);
    // Each row is named by its title and described by its meta line.
    expect(rows[1]).toHaveAccessibleName('A day at the sea');
    expect(rows[1]).toHaveAccessibleDescription('Anonymous · Sep 1');
    expect(mockShelf).toHaveBeenCalledWith('me', 'published');
    // The card answering another, the connections-only card and the target's own original are not offered.
    expect(screen.queryByText('Card answering')).toBeNull();
    expect(screen.queryByText('Card friends-only')).toBeNull();
    expect(screen.queryByText('Card origin')).toBeNull();
    expect(screen.getByText("Cards already resonating with another card aren't listed")).toBeInTheDocument();
    // The round-3 chrome is gone: no subtitle, no hint under "write a new card", no caption over the cards.
    expect(screen.queryByText("Write a new card, or pick one you've written about something similar")).toBeNull();
    expect(screen.queryByText('Start from this card and put your own experience into words')).toBeNull();
    expect(screen.queryByText("Or pick one you've written")).toBeNull();
  });

  it('notes why cards are missing only when some are', async () => {
    mockShelf.mockResolvedValue([card('walk'), card('sea')]);
    renderPicker();
    await screen.findByRole('radio', { name: 'Card walk' });
    expect(screen.queryByText("Cards already resonating with another card aren't listed")).toBeNull();
  });

  it('opens the writer for a new card from the first row', async () => {
    const { onClose } = renderPicker();
    await user().click(screen.getByRole('button', { name: 'Write a new card' }));
    expect(onClose).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/write?referenceCardId=target');
    expect(mockCallApi).not.toHaveBeenCalled();
  });

  it('resonates only once a card is chosen and confirmed, then reads again what shows the link', async () => {
    const onResonated = vi.fn();
    const { onClose } = renderPicker({ onResonated });
    await waitFor(() => expect(reads.mine).toHaveBeenCalledTimes(1));
    const confirm = screen.getByRole('button', { name: 'Resonate' });
    // Nothing chosen yet: the verb is not pressable.
    expect(confirm).toBeDisabled();

    const walk = await screen.findByRole('radio', { name: 'Card walk' });
    await user().click(walk);
    // A tap marks the card; nothing is sent yet.
    expect(walk).toHaveAttribute('aria-checked', 'true');
    expect(mockCallApi).not.toHaveBeenCalled();
    expect(confirm).toBeEnabled();
    expect(confirm).toHaveAttribute('data-variant', 'solid');

    await user().click(confirm);
    await waitFor(() =>
      expect(mockCallApi).toHaveBeenCalledWith('/api/v1/cards/target/resonances', { method: 'POST', body: { cardId: 'walk' } }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onResonated).toHaveBeenCalledWith(expect.objectContaining({ id: 'walk' }));
    // The button on the original, both cards' pages, the resonated shelf and the map are read again.
    await waitFor(() => expect(reads.mine).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(reads.targetPage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(reads.chosenPage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(reads.resonated).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(reads.map).toHaveBeenCalledTimes(2));
  });

  it('lets a marked card go when it is tapped again, and the verb is not pressable then', async () => {
    renderPicker();
    const walk = await screen.findByRole('radio', { name: 'Card walk' });
    const confirm = screen.getByRole('button', { name: 'Resonate' });
    await user().click(walk);
    expect(confirm).toBeEnabled();
    await user().click(walk);
    expect(walk).toHaveAttribute('aria-checked', 'false');
    expect(confirm).toBeDisabled();
    expect(mockCallApi).not.toHaveBeenCalled();
  });

  it('says so when the card already answers another, stays open, and reads the shelf again', async () => {
    mockCallApi.mockRejectedValue(new ApiError(409, 'conflict', 'already answering'));
    const { onClose } = renderPicker();
    await user().click(await screen.findByRole('radio', { name: 'Card walk' }));
    await user().click(screen.getByRole('button', { name: 'Resonate' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This card already resonates with another card');
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(mockShelf).toHaveBeenCalledTimes(2));
    // The mark goes with what it was based on (as in the apps): nothing is chosen until a card is again.
    expect(screen.getByRole('radio', { name: 'Card walk' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('button', { name: 'Resonate' })).toBeDisabled();
  });

  // While the choice is on its way, cancel is visibly out of reach (as in the apps), and nothing closes the picker.
  it('disables cancel while resonating', async () => {
    let answer!: (v: unknown) => void;
    mockCallApi.mockReturnValue(new Promise((r) => (answer = r)));
    const { onClose } = renderPicker();
    await user().click(await screen.findByRole('radio', { name: 'Card walk' }));
    await user().click(screen.getByRole('button', { name: 'Resonate' }));
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    await waitFor(() => expect(cancel).toBeDisabled());
    expect(onClose).not.toHaveBeenCalled();
    answer({ card: {}, changed: true });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('asks to try again when anything else goes wrong', async () => {
    mockCallApi.mockRejectedValue(new ApiError(403, 'blocked', 'blocked'));
    const { onClose } = renderPicker();
    await user().click(await screen.findByRole('radio', { name: 'Card walk' }));
    await user().click(screen.getByRole('button', { name: 'Resonate' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't resonate — please try again");
    expect(onClose).not.toHaveBeenCalled();
  });

  it('points to the first row when there is no card to pick, with no footnote when nothing was left out', async () => {
    mockShelf.mockResolvedValue([card('friends-only', { visibility: 'connections' })]);
    renderPicker();
    expect(await screen.findByText('You have no public cards yet — write your first one above')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByText("Cards already resonating with another card aren't listed")).toBeNull();
    expect(screen.getByRole('button', { name: 'Resonate' })).toBeDisabled();
  });

  // Their public cards are there, only none may answer this one: never "no public cards yet".
  it('says why none is listed when every public card answers another, once', async () => {
    mockShelf.mockResolvedValue([card('answering', { referenceCardId: 'someone-elses' })]);
    renderPicker();
    expect(await screen.findByText("Cards already resonating with another card aren't listed")).toBeInTheDocument();
    expect(screen.getAllByText("Cards already resonating with another card aren't listed")).toHaveLength(1);
    expect(screen.queryByText('You have no public cards yet — write your first one above')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByRole('button', { name: 'Write a new card' })).toBeInTheDocument();
  });

  // Nothing to pick and nothing to say: no rule over an empty list, only the way to write one.
  it('says nothing, and draws no empty list, when the only public card is the one this card answers', async () => {
    mockShelf.mockResolvedValue([card('origin')]);
    renderPicker();
    // While the shelf is read the wavy rule stands under the first row, over the rows' footprint;
    // read, it goes with the list.
    const write = screen.getByRole('button', { name: 'Write a new card' });
    expect(write.nextElementSibling).not.toBeNull();
    await waitFor(() => expect(write.nextElementSibling).toBeNull());
    expect(mockShelf).toHaveBeenCalled();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByText('You have no public cards yet — write your first one above')).toBeNull();
    expect(screen.queryByText("Cards already resonating with another card aren't listed")).toBeNull();
    expect(screen.getByRole('button', { name: 'Write a new card' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resonate' })).toBeDisabled();
  });

  it('closes through its tonal cancel', async () => {
    const { onClose } = renderPicker();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel).toHaveAttribute('data-variant', 'tonal');
    await user().click(cancel);
    expect(onClose).toHaveBeenCalled();
  });
});

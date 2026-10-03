// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import type { ReactNode } from 'react';
import useSWR, { SWRConfig } from 'swr';
import { renderWithIntl, screen, userEvent, waitFor } from '@/../test/render';
import { CardActionsMenu } from './CardActionsMenu';

// The owner's「⋯」on a card, on the real client card writes: the v1 API call
// (callApi), the signed-in user and navigation are the module boundary.
const mockPush = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'u1' }, loading: false }),
}));
vi.mock('@/lib/auth/firebase/client', () => ({
  getFirebaseClientAuth: () => ({ currentUser: { uid: 'u1', getIdToken: async () => 'token' } }),
}));

const mockCallApi = vi.fn();
vi.mock('@/lib/db/firestore/client/api', () => ({
  callApi: (...args: unknown[]) => mockCallApi(...args),
}));

/** What else this browser holds of the viewer's cards: the card box shelves they opened and their profile's lists. */
const boxReads = vi.fn(async () => ['c1']);
const privateShelfReads = vi.fn(async () => []);
const profileReads = vi.fn(async () => ['c1']);
/** …and what shows which card answers which (see lib/data/resonate). */
const resonanceReads = {
  originalButton: vi.fn(async () => ({ id: 'c5' })),
  originalPage: vi.fn(async () => ({})),
  ownPage: vi.fn(async () => ({})),
  resonatedShelf: vi.fn(async () => []),
};
function OwnLists() {
  useSWR('cardbox:u1:published', boxReads);
  useSWR('cardbox:u1:private', privateShelfReads);
  useSWR('profilePage:me:u1', profileReads);
  useSWR('myResonance:orig:u1', resonanceReads.originalButton);
  useSWR('cardPage:orig:u1', resonanceReads.originalPage);
  useSWR('cardPage:c5:u1', resonanceReads.ownPage);
  useSWR('cardbox:u1:resonated', resonanceReads.resonatedShelf);
  return null;
}

function renderMenu(menu: ReactNode) {
  return renderWithIntl(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <OwnLists />
      {menu}
    </SWRConfig>,
  );
}

describe('CardActionsMenu', () => {
  let fetchSpy: MockInstance<typeof fetch>;
  beforeEach(() => {
    vi.clearAllMocks();
    mockCallApi.mockResolvedValue({});
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    return () => fetchSpy.mockRestore();
  });

  it('opens the menu and navigates to the editor on Edit', async () => {
    renderMenu(<CardActionsMenu card={{ id: 'c1', visibility: 'public' }} />);

    expect(screen.queryByRole('menu')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);

    await userEvent.click(screen.getByText('Edit'));
    expect(mockPush).toHaveBeenCalledWith('/write/c1');
  });

  it('makes a public card private through the server, then reads the card box and profile lists again', async () => {
    const onChanged = vi.fn();
    renderMenu(<CardActionsMenu card={{ id: 'c1', visibility: 'public' }} onChanged={onChanged} />);
    await waitFor(() => expect(boxReads).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Make private'));

    await waitFor(() =>
      expect(mockCallApi).toHaveBeenCalledWith('/api/v1/cards/c1', { method: 'PATCH', body: { visibility: 'private' } }),
    );
    expect(onChanged).toHaveBeenCalled();
    await waitFor(() => expect(boxReads).toHaveBeenCalledTimes(2));
    // The card moves shelves: both read again.
    await waitFor(() => expect(privateShelfReads).toHaveBeenCalledTimes(2));
    expect(profileReads).toHaveBeenCalledTimes(2);
    // The server drops the cached pages itself: the browser asks for nothing more.
    expect(fetchSpy).not.toHaveBeenCalled();
    // The menu closes after the change lands.
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('offers Make public on a private card', async () => {
    renderMenu(<CardActionsMenu card={{ id: 'c2', visibility: 'private' }} />);

    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Make public'));

    await waitFor(() =>
      expect(mockCallApi).toHaveBeenCalledWith('/api/v1/cards/c2', { method: 'PATCH', body: { visibility: 'public' } }),
    );
  });

  it('asks for confirmation before deleting, and deletes through the server on confirm', async () => {
    const onDeleted = vi.fn();
    renderMenu(<CardActionsMenu card={{ id: 'c3', visibility: 'public' }} onDeleted={onDeleted} />);
    await waitFor(() => expect(boxReads).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Delete'));

    // Nothing deleted yet — the confirm dialog is showing instead.
    expect(mockCallApi).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete this card?')).toBeInTheDocument();

    // Deleting can't be undone: the verb is red, "keep it" plain text, and
    // neither draws a pen line inside the modal's own frame.
    expect(screen.getByRole('button', { name: 'Delete card' })).toHaveAttribute('data-variant', 'danger');
    expect(screen.getByRole('button', { name: 'Keep it' })).toHaveAttribute('data-variant', 'text');

    await userEvent.click(screen.getByText('Delete card'));
    await waitFor(() => expect(mockCallApi).toHaveBeenCalledWith('/api/v1/cards/c3', { method: 'DELETE' }));
    expect(onDeleted).toHaveBeenCalled();
    await waitFor(() => expect(boxReads).toHaveBeenCalledTimes(2));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('offers 取消共振 only on a card that resonates with another', async () => {
    renderMenu(<CardActionsMenu card={{ id: 'c5', visibility: 'public', referenceCardId: 'orig' }} referenceTitle="A walk" />);
    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Edit',
      'Make private',
      'Stop resonating',
      'Delete',
    ]);
  });

  it('asks before taking a resonance back, then lets go of it through the server and reads again what showed it', async () => {
    const onChanged = vi.fn();
    renderMenu(
      <CardActionsMenu
        card={{ id: 'c5', visibility: 'public', referenceCardId: 'orig' }}
        referenceTitle="A walk"
        onChanged={onChanged}
      />,
    );
    await waitFor(() => expect(resonanceReads.originalButton).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Stop resonating'));

    // Nothing sent yet: the question names the card it resonates with.
    expect(mockCallApi).not.toHaveBeenCalled();
    expect(screen.getByText('Stop resonating with "A walk"?')).toBeInTheDocument();
    expect(screen.getByText("Your card stays; it just won't be listed with that card.")).toBeInTheDocument();
    // The card stays, so the verb is the dialog's plain solid fill, not the red of a delete.
    const confirm = screen.getByRole('button', { name: 'Stop resonating' });
    expect(confirm).toHaveAttribute('data-variant', 'solid');

    await userEvent.click(confirm);
    await waitFor(() =>
      expect(mockCallApi).toHaveBeenCalledWith('/api/v1/cards/orig/resonances/c5', { method: 'DELETE' }),
    );
    expect(onChanged).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(resonanceReads.originalButton).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(resonanceReads.originalPage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(resonanceReads.ownPage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(resonanceReads.resonatedShelf).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(boxReads).toHaveBeenCalledTimes(2));
  });

  it('asks the server for the title of the card it resonates with when the page has none', async () => {
    mockCallApi.mockImplementation(async (path: string) =>
      path.startsWith('/api/v1/cards?keys=')
        ? {
            cards: [
              {
                id: 'orig', slug: 'orig', title: 'Rain on the way home', excerpt: '', tags: [], publishedAt: null,
                author: null, anonymous: true, visibility: 'public', imageUrl: null, imageLabel: null,
                accentHue: null, readMinutes: 1, referenceCardId: null, reason: null,
              },
            ],
          }
        : {},
    );
    renderMenu(<CardActionsMenu card={{ id: 'c5', visibility: 'public', referenceCardId: 'orig' }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Stop resonating'));

    expect(await screen.findByText('Stop resonating with "Rain on the way home"?')).toBeInTheDocument();
    expect(mockCallApi).toHaveBeenCalledWith('/api/v1/cards?keys=orig');
  });

  it('keeps the question open and says so when taking the resonance back fails', async () => {
    mockCallApi.mockRejectedValue(new Error('offline'));
    renderMenu(<CardActionsMenu card={{ id: 'c5', visibility: 'public', referenceCardId: 'orig' }} referenceTitle="A walk" />);
    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Stop resonating'));
    await userEvent.click(screen.getByRole('button', { name: 'Stop resonating' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("That didn't work. Try again.");
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('keeps the card when the confirm dialog is cancelled', async () => {
    renderMenu(<CardActionsMenu card={{ id: 'c4', visibility: 'public' }} />);

    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Delete'));
    await userEvent.click(screen.getByText('Keep it'));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mockCallApi).not.toHaveBeenCalled();
  });
});

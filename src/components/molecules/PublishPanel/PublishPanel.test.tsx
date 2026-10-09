// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrictMode } from 'react';
import { renderWithIntl, screen, userEvent, waitFor } from '@/../test/render';
import en from '@/messages/en.json';
import { PublishPanel } from './PublishPanel';

vi.mock('@/lib/data/hooks', () => ({
  useMyProfile: () => ({ data: { id: 'me', handle: 'my-handle', initials: 'MH', accentColor: 'oklch(88% 0.08 55)' } }),
}));
vi.mock('@/lib/hints', () => ({
  useHint: () => ({ visible: false, dismiss: vi.fn() }),
}));

const baseProps = {
  open: true,
  thoughtCore: 'A thought',
  story: 'A story',
  initialVisibility: 'public' as const,
  initialAnonymous: false,
  pending: false,
  error: null,
};

beforeEach(() => {
  // The mirror-moment echo is a grace note; the panel must not wait for it.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/** The mirror moment has come back (here: without an echo), so nothing is left to update the panel. */
const echoSettled = () =>
  waitFor(() => expect(screen.queryByText(en.write.publishPanel.insightLoading)).not.toBeInTheDocument());

describe('PublishPanel', () => {
  // The modal is the frame: Publish is a solid fill, "Not yet" the tonal pill
  // before it — the foot every dialog shares, right-aligned, the verb rightmost.
  it('publishes with a solid verb, rightmost, and backs out with a tonal cancel', async () => {
    const onPublish = vi.fn();
    const onClose = vi.fn();
    renderWithIntl(<PublishPanel {...baseProps} onPublish={onPublish} onClose={onClose} />);

    const publish = screen.getByRole('button', { name: 'Publish' });
    const cancel = screen.getByRole('button', { name: 'Not yet' });
    expect(publish).toHaveAttribute('data-variant', 'solid');
    expect(cancel).toHaveAttribute('data-variant', 'tonal');
    expect(Array.from(publish.parentElement!.children)).toEqual([cancel, publish]);

    await userEvent.click(cancel);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPublish).not.toHaveBeenCalled();

    await userEvent.click(publish);
    expect(onPublish).toHaveBeenCalledWith({ visibility: 'public', anonymous: false });
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  // Why it didn't go through is read before the buttons that try again.
  it('shows the mirror moment when React mounts the panel twice (dev), not a loading line for good', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ coreInsight: 'Small kindnesses add up' }) }));
    renderWithIntl(
      <StrictMode>
        <PublishPanel {...baseProps} onPublish={vi.fn()} onClose={vi.fn()} />
      </StrictMode>,
    );
    expect(await screen.findByText(/Small kindnesses add up/)).toBeInTheDocument();
    expect(screen.queryByText(en.write.publishPanel.insightLoading)).not.toBeInTheDocument();
  });

  it('says a failed publish above the actions', async () => {
    renderWithIntl(<PublishPanel {...baseProps} error="Couldn't publish" onPublish={vi.fn()} onClose={vi.fn()} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("Couldn't publish");
    const publish = screen.getByRole('button', { name: 'Publish' });
    expect(alert.compareDocumentPosition(publish) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await echoSettled();
  });

  // The request is on its way: the row rests, so it is neither sent twice nor walked away from.
  it('rests its actions while publishing', async () => {
    renderWithIntl(<PublishPanel {...baseProps} pending onPublish={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Publishing…' }).parentElement).toHaveAttribute('data-busy', 'true');
    await echoSettled();
  });

  // Public / Only me is a choice: a screen reader hears which side is chosen.
  it('tells which visibility is chosen', async () => {
    const onPublish = vi.fn();
    renderWithIntl(<PublishPanel {...baseProps} onPublish={onPublish} onClose={vi.fn()} />);
    const pub = screen.getByRole('button', { name: en.write.visibility.public });
    const mine = screen.getByRole('button', { name: en.write.visibility.private });
    expect(pub).toHaveAttribute('aria-pressed', 'true');
    expect(mine).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(mine);
    expect(pub).toHaveAttribute('aria-pressed', 'false');
    expect(mine).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(onPublish).toHaveBeenCalledWith({ visibility: 'private', anonymous: false });
    await echoSettled();
  });

  it('keeps the same tonal / solid pair when updating a live card', async () => {
    const onPublish = vi.fn();
    renderWithIntl(<PublishPanel {...baseProps} mode="update" onPublish={onPublish} onClose={vi.fn()} />);

    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toHaveAttribute('data-variant', 'solid');
    expect(screen.getByRole('button', { name: 'Not yet' })).toHaveAttribute('data-variant', 'tonal');
    await userEvent.click(save);
    expect(onPublish).toHaveBeenCalled();
    // An update never asks for the mirror moment.
    expect(fetch).not.toHaveBeenCalled();
  });

  // An anonymous card is public or only yours: for connections only, its few readers would know who wrote it.
  it('publishes an anonymous card asked for connections only as public, and says why', async () => {
    const onPublish = vi.fn();
    renderWithIntl(<PublishPanel {...baseProps} initialVisibility="connections" onPublish={onPublish} onClose={vi.fn()} />);
    expect(screen.queryByText('An anonymous card is either public or only for you')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('switch', { name: 'Publish anonymously' }));
    expect(screen.getByText('An anonymous card is either public or only for you')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(onPublish).toHaveBeenLastCalledWith({ visibility: 'public', anonymous: true });
  });

  it('opens an anonymous card kept for connections as public, and keeps private as it is', async () => {
    const onPublish = vi.fn();
    const { unmount } = renderWithIntl(
      <PublishPanel {...baseProps} initialVisibility="connections" initialAnonymous onPublish={onPublish} onClose={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(onPublish).toHaveBeenLastCalledWith({ visibility: 'public', anonymous: true });
    unmount();

    renderWithIntl(<PublishPanel {...baseProps} initialVisibility="private" initialAnonymous onPublish={onPublish} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(onPublish).toHaveBeenLastCalledWith({ visibility: 'private', anonymous: true });
  });
});

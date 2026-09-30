// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithIntl, screen, userEvent, waitFor } from '@/../test/render';
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

describe('PublishPanel', () => {
  // The modal is the frame: Publish is a solid fill, "Not yet" plain text.
  it('publishes with a solid verb and backs out with a plain-text cancel', async () => {
    const onPublish = vi.fn();
    const onClose = vi.fn();
    renderWithIntl(<PublishPanel {...baseProps} onPublish={onPublish} onClose={onClose} />);

    const publish = screen.getByRole('button', { name: 'Publish' });
    const cancel = screen.getByRole('button', { name: 'Not yet' });
    expect(publish).toHaveAttribute('data-variant', 'solid');
    expect(cancel).toHaveAttribute('data-variant', 'text');

    await userEvent.click(cancel);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPublish).not.toHaveBeenCalled();

    await userEvent.click(publish);
    expect(onPublish).toHaveBeenCalledWith({ visibility: 'public', anonymous: false });
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  it('keeps the same solid / text pair when updating a live card', async () => {
    const onPublish = vi.fn();
    renderWithIntl(<PublishPanel {...baseProps} mode="update" onPublish={onPublish} onClose={vi.fn()} />);

    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toHaveAttribute('data-variant', 'solid');
    expect(screen.getByRole('button', { name: 'Not yet' })).toHaveAttribute('data-variant', 'text');
    await userEvent.click(save);
    expect(onPublish).toHaveBeenCalled();
    // An update never asks for the mirror moment.
    expect(fetch).not.toHaveBeenCalled();
  });
});

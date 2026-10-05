// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl, screen, userEvent, waitFor } from '@/../test/render';

// The profile photo goes up the way every picture does — compressed and
// size-checked in the browser — marked as an avatar so the server scales it
// to 256 px; a refusal (too big, or the server saying no) shows the error.

const uploadImageFile = vi.fn();
vi.mock('@/lib/images/upload', () => ({ uploadImageFile: (...a: unknown[]) => uploadImageFile(...a) }));

const { AvatarUpload } = await import('./AvatarUpload');

beforeEach(() => vi.clearAllMocks());

function setup() {
  const onUploaded = vi.fn();
  const { container } = renderWithIntl(<AvatarUpload initials="AL" onUploaded={onUploaded} />);
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  return { onUploaded, input };
}

describe('AvatarUpload', () => {
  it('uploads the chosen picture as an avatar and hands back its URL', async () => {
    uploadImageFile.mockResolvedValue({ publicUrl: 'https://img.example/me.webp', key: 'k' });
    const { onUploaded, input } = setup();
    const photo = new File([new Uint8Array(10)], 'me.jpg', { type: 'image/jpeg' });

    await userEvent.upload(input, photo);
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith('https://img.example/me.webp'));
    expect(uploadImageFile).toHaveBeenCalledWith(photo, { purpose: 'avatar' });
    expect(screen.queryByText('Couldn’t upload it — please try again')).not.toBeInTheDocument();
  });

  it('shows the error when the picture is refused', async () => {
    uploadImageFile.mockRejectedValue(new Error('Image is too large'));
    const { onUploaded, input } = setup();

    await userEvent.upload(input, new File([new Uint8Array(10)], 'huge.gif', { type: 'image/gif' }));
    expect(await screen.findByText('Couldn’t upload it — please try again')).toBeInTheDocument();
    expect(onUploaded).not.toHaveBeenCalled();
  });
});

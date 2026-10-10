// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, renderWithIntl, screen, userEvent, waitFor, within } from '@/../test/render';
import { mockElementSize } from '@/../test/organic';
import { CROP_START, cropRect, panView, zoomView } from '@/lib/images/avatarCrop';
import en from '@/messages/en.json';

// A profile photo is framed before it goes up (B7): a chosen or dropped
// picture opens our crop dialog; 使用 sends the framed square the way every
// picture goes — compressed and size-checked in the browser, marked as an
// avatar so the server scales it to 256 px — and waits for the profile's save.

mockElementSize(120, 40);

const uploadImageFile = vi.fn();
vi.mock('@/lib/images/upload', () => ({ uploadImageFile: (...a: unknown[]) => uploadImageFile(...a) }));

// The browser's decoding and drawing (canvas, createImageBitmap) are the boundary.
const picture = { width: 4000, height: 3000 };
const loadCropSource = vi.fn();
const renderCrop = vi.fn();
vi.mock('@/lib/images/avatarCropImage', () => ({
  loadCropSource: (...a: unknown[]) => loadCropSource(...a),
  renderCrop: (...a: unknown[]) => renderCrop(...a),
  releaseCropSource: vi.fn(),
}));

const { AvatarUpload } = await import('./AvatarUpload');

const t = en.settings.profile;
const framed = new Blob([new Uint8Array(4)], { type: 'image/jpeg' });

beforeEach(() => {
  vi.clearAllMocks();
  loadCropSource.mockImplementation(async () => ({ canvas: document.createElement('canvas'), ...picture }));
  renderCrop.mockResolvedValue(framed);
});

function setup(props: { src?: string; onUploaded?: (url: string) => void | Promise<void> } = {}) {
  const onUploaded = vi.fn(props.onUploaded ?? (async () => undefined));
  const { container } = renderWithIntl(<AvatarUpload initials="AL" src={props.src} onUploaded={onUploaded} />);
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  return { onUploaded, input };
}

const photo = () => new File([new Uint8Array(10)], 'me.jpg', { type: 'image/jpeg' });

async function openDialog(input: HTMLInputElement) {
  await userEvent.upload(input, photo());
  return screen.findByRole('dialog', { name: t.cropTitle });
}

describe('AvatarUpload', () => {
  it('names the photo button by whether there is a photo yet', () => {
    setup();
    expect(screen.getByRole('button', { name: t.avatarAdd })).toBeInTheDocument();
  });

  it('frames the chosen picture first, then sends the square as an avatar and hands back its URL', async () => {
    uploadImageFile.mockResolvedValue({ publicUrl: 'https://img.example/me.webp', key: 'k' });
    const { onUploaded, input } = setup({ src: 'https://img.example/old.webp' });
    expect(screen.getByRole('button', { name: t.avatarChange })).toBeInTheDocument();

    const dialog = await openDialog(input);
    // Nothing goes up before 使用.
    expect(uploadImageFile).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('group', { name: t.cropStage })).toBeInTheDocument();
    expect(within(dialog).getByRole('slider', { name: t.cropZoom })).toHaveValue('1');

    await userEvent.click(within(dialog).getByRole('button', { name: t.cropUse }));
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith('https://img.example/me.webp'));
    // Unzoomed and centred: the middle 3000 × 3000 of a 4000 × 3000 picture.
    const [, rect] = renderCrop.mock.calls[0];
    expect(rect.x).toBeCloseTo(500);
    expect(rect.y).toBeCloseTo(0);
    expect(rect.side).toBeCloseTo(3000);
    const [sent, opts] = uploadImageFile.mock.calls[0];
    expect(sent).toBeInstanceOf(File);
    expect((sent as File).name).toBe('avatar.jpg');
    expect((sent as File).type).toBe('image/jpeg');
    expect(opts).toEqual({ purpose: 'avatar' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: t.cropTitle })).not.toBeInTheDocument());
  });

  it('zooms and moves the framing from the keyboard on the stage', async () => {
    uploadImageFile.mockResolvedValue({ publicUrl: 'https://img.example/me.webp', key: 'k' });
    const { input } = setup();
    const dialog = await openDialog(input);
    const stage = within(dialog).getByRole('group', { name: t.cropStage });
    fireEvent.keyDown(stage, { key: '+' });
    fireEvent.keyDown(stage, { key: 'ArrowRight' });
    fireEvent.keyDown(stage, { key: 'ArrowDown', shiftKey: true });
    await userEvent.click(within(dialog).getByRole('button', { name: t.cropUse }));
    await waitFor(() => expect(renderCrop).toHaveBeenCalled());

    // The mask is the stage less 24 all round: + zooms ×1.1 about the centre,
    // an arrow moves the picture 8 px, Shift 32 — as the model says.
    const d = parseFloat(stage.style.width) - 48;
    expect(d).toBeGreaterThan(0);
    let v = zoomView(picture, d, CROP_START, 1.1);
    v = panView(picture, d, v, 8, 0);
    v = panView(picture, d, v, 0, 32);
    const want = cropRect(picture, d, v);
    const [, rect] = renderCrop.mock.calls[0];
    expect(rect.x).toBeCloseTo(want.x, 6);
    expect(rect.y).toBeCloseTo(want.y, 6);
    expect(rect.side).toBeCloseTo(want.side, 6);
  });

  it('shows the loader on 使用 while the photo goes up, rests Cancel and keeps the dialog', async () => {
    let finish: (v: unknown) => void = () => undefined;
    uploadImageFile.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { input } = setup();
    const dialog = await openDialog(input);
    const use = within(dialog).getByRole('button', { name: t.cropUse });
    await userEvent.click(use);
    await waitFor(() => expect(use).toHaveAttribute('aria-busy', 'true'));
    expect(within(dialog).getByRole('button', { name: t.cropCancel })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: t.cropTitle })).toBeInTheDocument();
    finish({ publicUrl: 'https://img.example/me.webp', key: 'k' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: t.cropTitle })).not.toBeInTheDocument());
  });

  it('says the photo couldn’t go up — the upload or the profile’s save — and lets 使用 try again', async () => {
    uploadImageFile.mockRejectedValueOnce(new Error('Image is too large'));
    const { onUploaded, input } = setup();
    const dialog = await openDialog(input);
    await userEvent.click(within(dialog).getByRole('button', { name: t.cropUse }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(t.avatarError);
    expect(onUploaded).not.toHaveBeenCalled();

    // The upload goes through, but the profile's save fails: still said in the dialog.
    uploadImageFile.mockResolvedValue({ publicUrl: 'https://img.example/me.webp', key: 'k' });
    onUploaded.mockRejectedValueOnce(new Error('denied'));
    const use = within(dialog).getByRole('button', { name: t.cropUse });
    expect(use).not.toHaveAttribute('aria-busy');
    await userEvent.click(use);
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(t.avatarError);
    expect(screen.getByRole('dialog', { name: t.cropTitle })).toBeInTheDocument();
  });

  it('closes on Cancel with nothing sent', async () => {
    const { onUploaded, input } = setup();
    const dialog = await openDialog(input);
    await userEvent.click(within(dialog).getByRole('button', { name: t.cropCancel }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: t.cropTitle })).not.toBeInTheDocument());
    expect(uploadImageFile).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('says a picture it can’t open, without opening the dialog', async () => {
    loadCropSource.mockRejectedValue(new Error('not an image'));
    const { input } = setup();
    await userEvent.upload(input, photo());
    expect(await screen.findByRole('alert')).toHaveTextContent(t.avatarOpenError);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UPLOAD_MAX_FILE_BYTES } from './limits';

// The browser's upload path: compress, refuse locally what /api/upload would
// answer 413 to, and mark a profile photo so the server scales it to 256 px.

const compressImage = vi.fn(async (file: File, _max?: number) => file);
vi.mock('./compress', () => ({ compressImage: (file: File, max?: number) => compressImage(file, max) }));

const { uploadImageFile, UploadTooLarge } = await import('./upload');

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ publicUrl: 'https://img.example/k.webp', key: 'k.webp' })));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const sent = () => fetchMock.mock.calls[0][1].body as FormData;

describe('uploadImageFile', () => {
  it('sends the compressed picture to /api/upload, as a story image by default', async () => {
    const small = new File([new Uint8Array(10)], 'small.webp', { type: 'image/webp' });
    compressImage.mockResolvedValueOnce(small);
    const photo = new File([new Uint8Array(100)], 'photo.jpg', { type: 'image/jpeg' });

    expect(await uploadImageFile(photo)).toEqual({ publicUrl: 'https://img.example/k.webp', key: 'k.webp' });
    expect(compressImage).toHaveBeenCalledWith(photo, undefined);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/upload');
    expect(sent().get('file')).toBe(small);
    expect(sent().get('purpose')).toBeNull();
  });

  it('marks a profile photo, compressed to a smaller edge', async () => {
    await uploadImageFile(new File([new Uint8Array(100)], 'me.png', { type: 'image/png' }), { purpose: 'avatar' });
    expect(compressImage.mock.calls[0][1]).toBe(1024);
    expect(sent().get('purpose')).toBe('avatar');
  });

  it('refuses a picture still too big once compressed, without sending it', async () => {
    const gif = new File([new Uint8Array(UPLOAD_MAX_FILE_BYTES + 1)], 'huge.gif', { type: 'image/gif' });
    await expect(uploadImageFile(gif, { purpose: 'avatar' })).rejects.toBeInstanceOf(UploadTooLarge);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws on a refused upload', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"error":"Image is too large"}', { status: 413 }));
    await expect(uploadImageFile(new File([new Uint8Array(1)], 'a.jpg', { type: 'image/jpeg' }))).rejects.toThrow('413');
  });
});

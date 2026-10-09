// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, renderWithIntl, screen } from '@/../test/render';
import type { LinkPreview } from '@/lib/db/types';
import { StoryLinkCard } from './StoryLinkCard';

const preview = (extra: Partial<LinkPreview> = {}): LinkPreview => ({
  url: 'https://www.example.com/rain',
  title: 'A rainy walk',
  description: 'Notes from a walk after the rain.',
  ...extra,
});
const PICTURE = '/api/link-image?u=https%3A%2F%2Fcdn.example.com%2Fc.jpg&s=sig';

// jsdom lays nothing out: give every element a card's size, so the card draws its measured shape.
function layOut(w: number, h: number) {
  const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
  const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => w });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => h });
  return () => {
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', width!);
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', height!);
  };
}

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

const card = () => screen.getByRole('link', { name: 'Open link: example.com' });

describe('StoryLinkCard', () => {
  it('is one block of the chat bubble’s fill with no pen line, the picture cut by the same outline', () => {
    restore = layOut(420, 300);
    renderWithIntl(<StoryLinkCard preview={preview({ image: PICTURE })} />);
    const a = card();
    expect(a).not.toHaveAttribute('data-shape-pending');
    // The card's own shapes (the link glyph by the host is an icon of its own).
    const shapes = [...a.querySelectorAll(':scope > svg')];
    const paths = shapes.flatMap((svg) => [...svg.querySelectorAll('path')]);
    // The fill, and nothing stroked: no outline around the card or its picture.
    expect(paths).toHaveLength(1);
    expect(paths[0]).toHaveAttribute('fill', 'var(--bubble-theirs)');
    expect(shapes.some((svg) => svg.querySelector('[stroke]'))).toBe(false);
    // The picture runs flush across the top, clipped to the fill's own outline.
    const d = paths[0].getAttribute('d')!;
    const picture = a.querySelector('img')!.parentElement!;
    expect(picture).toHaveAttribute('data-clipped');
    expect(picture.style.clipPath).toBe(`path('${d}')`);
    // The hover wash is the quote fill, in the same outline.
    const wash = a.querySelector<HTMLElement>('[data-brush-wash]')!;
    expect(wash.style.clipPath).toBe(`path('${d}')`);
    fireEvent.mouseEnter(a, { clientX: 10, clientY: 10 });
    expect((wash.firstElementChild as HTMLElement).style.background).toBe('var(--bubble-quote)');
  });

  it('stands in as a plain rounded block of the same fill, with no ring, until it is measured (the server’s HTML)', () => {
    renderWithIntl(<StoryLinkCard preview={preview({ image: PICTURE })} />);
    const a = card();
    expect(a).toHaveAttribute('data-shape-pending');
    expect(a.style.getPropertyValue('--shape-fill')).toBe('var(--bubble-theirs)');
    expect(a.style.getPropertyValue('--shape-ink')).toBe('');
    expect(a.style.getPropertyValue('--shape-ink-width')).toBe('');
    expect(a.querySelector(':scope > svg')).toBeNull();
    // Not yet clipped: the picture keeps inside the stand-in's rounded top.
    expect(a.querySelector('img')!.parentElement).not.toHaveAttribute('data-clipped');
  });

  it('is just the fill with the words when the page has no picture', () => {
    restore = layOut(420, 120);
    renderWithIntl(<StoryLinkCard preview={preview()} />);
    const a = card();
    expect(a.querySelector('img')).toBeNull();
    expect(a).toHaveTextContent('A rainy walk');
    expect(a).toHaveTextContent('example.com');
    expect(a.querySelectorAll(':scope > svg path')).toHaveLength(1);
  });

  it('drops a picture that won’t load, leaving no empty frame — one that failed before the page came alive too', () => {
    restore = layOut(420, 300);
    const { unmount } = renderWithIntl(<StoryLinkCard preview={preview({ image: PICTURE })} />);
    fireEvent.error(card().querySelector('img')!);
    expect(card().querySelector('img')).toBeNull();
    expect(card()).toHaveTextContent('A rainy walk');
    unmount();

    // The server's HTML asked for it before React listened: broken already (complete, no width), no error event to come.
    const complete = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'complete');
    const naturalWidth = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'naturalWidth');
    let loaded = false;
    Object.defineProperty(HTMLImageElement.prototype, 'complete', { configurable: true, get: () => true });
    Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get: () => (loaded ? 1200 : 0) });
    try {
      const broken = renderWithIntl(<StoryLinkCard preview={preview({ image: PICTURE })} />);
      expect(card().querySelector('img')).toBeNull();
      broken.unmount();
      // One that did load stays.
      loaded = true;
      renderWithIntl(<StoryLinkCard preview={preview({ image: PICTURE })} />);
      expect(card().querySelector('img')).not.toBeNull();
    } finally {
      Object.defineProperty(HTMLImageElement.prototype, 'complete', complete!);
      Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', naturalWidth!);
    }
  });
});

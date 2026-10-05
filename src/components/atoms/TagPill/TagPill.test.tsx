// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, renderWithIntl, screen, userEvent } from '@/../test/render';
import zhTW from '@/messages/zh-TW.json';
import { INK } from '@/lib/design/strokes';
import { TagPill } from './TagPill';

// jsdom has no layout, and the pill's hand-drawn shape only draws once its box
// has a size — give every element one so the border svg renders.
const proto = HTMLElement.prototype;
const offW = Object.getOwnPropertyDescriptor(proto, 'offsetWidth');
const offH = Object.getOwnPropertyDescriptor(proto, 'offsetHeight');

beforeEach(() => {
  Object.defineProperty(proto, 'offsetWidth', { configurable: true, get: () => 80 });
  Object.defineProperty(proto, 'offsetHeight', { configurable: true, get: () => 24 });
});

afterEach(() => {
  if (offW) Object.defineProperty(proto, 'offsetWidth', offW);
  if (offH) Object.defineProperty(proto, 'offsetHeight', offH);
});

/** The pill's wobbly shape: the decorative svg that is its direct child (not the × glyph). */
function shape(label: string) {
  const pill = screen.getByText(label).parentElement as HTMLElement;
  const svg = Array.from(pill.children).find((el) => el.tagName.toLowerCase() === 'svg');
  if (!svg) throw new Error(`no hand-drawn shape drawn for "${label}"`);
  const paths = Array.from(svg.querySelectorAll('path'));
  return {
    fills: paths.filter((p) => p.getAttribute('fill') && p.getAttribute('fill') !== 'none'),
    strokes: paths.filter((p) => p.getAttribute('stroke')),
  };
}

describe('TagPill outline', () => {
  it.each(['sm', 'md'] as const)('draws the %s pill as a bare fill, with no pen outline', (size) => {
    render(
      <TagPill size={size} color="var(--color-sage)">
        quiet
      </TagPill>,
    );
    const { fills, strokes } = shape('quiet');
    expect(fills).toHaveLength(1);
    expect(fills[0]).toHaveAttribute('fill', 'var(--color-sage)');
    expect(strokes).toHaveLength(0);
  });

  it('defaults to the md size, so the tags on cards carry no outline', () => {
    render(<TagPill>plain</TagPill>);
    expect(shape('plain').strokes).toHaveLength(0);
  });

  it.each(['lg', 'xl'] as const)('keeps the ink outline on the input-like %s pill', (size) => {
    render(
      <TagPill size={size} color="var(--color-terracotta-light)">
        chosen
      </TagPill>,
    );
    const { fills, strokes } = shape('chosen');
    // Same fill as the small sizes, plus the pen line on top.
    expect(fills).toHaveLength(1);
    expect(fills[0]).toHaveAttribute('fill', 'var(--color-terracotta-light)');
    expect(strokes).toHaveLength(1);
    expect(Number(strokes[0].getAttribute('stroke-width'))).toBe(INK);
  });

  // A small pill can sit on bare page paper rather than inside a framed card
  // (the owner's "anonymous" badge under a card on the shelf): cream-dark on
  // cream vanishes without its rim, so the caller asks for it.
  it.each(['sm', 'md'] as const)('draws the %s pill with its rim when asked to be outlined', (size) => {
    render(
      <TagPill size={size} color="var(--color-cream-dark)" outlined>
        badge
      </TagPill>,
    );
    const { fills, strokes } = shape('badge');
    expect(fills).toHaveLength(1);
    expect(fills[0]).toHaveAttribute('fill', 'var(--color-cream-dark)');
    expect(strokes).toHaveLength(1);
    expect(Number(strokes[0].getAttribute('stroke-width'))).toBe(INK);
  });

  it('lets a large pill opt out of the rim too', () => {
    render(
      <TagPill size="lg" outlined={false}>
        bare
      </TagPill>,
    );
    expect(shape('bare').strokes).toHaveLength(0);
  });

  it('keeps the removal × on the writer pill and calls back without triggering the pill', async () => {
    const onRemove = vi.fn();
    const onClick = vi.fn();
    renderWithIntl(
      <TagPill size="lg" onRemove={onRemove} onClick={onClick}>
        removable
      </TagPill>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove tag' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('names the removal × in the reader’s language', () => {
    renderWithIntl(
      <TagPill size="lg" onRemove={() => {}}>
        散步
      </TagPill>,
      { locale: 'zh-TW', messages: zhTW },
    );
    expect(screen.getByRole('button', { name: '移除標籤' })).toBeInTheDocument();
  });

  it('is still a keyboard-operable button when clickable, with or without the outline', async () => {
    const onClick = vi.fn();
    render(
      <TagPill size="sm" ariaLabel="Filter by tea" onClick={onClick}>
        tea
      </TagPill>,
    );
    const pill = screen.getByRole('button', { name: 'Filter by tea' });
    pill.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    await userEvent.click(pill);
    expect(onClick).toHaveBeenCalledTimes(3);
  });
});

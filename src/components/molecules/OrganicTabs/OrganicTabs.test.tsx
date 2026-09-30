// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '@/../test/render';
import { OrganicTabs } from './OrganicTabs';

// jsdom has no layout, and the hand-drawn wash only draws once its box has a
// size — give every element one so the svg renders.
const proto = HTMLElement.prototype;
const offW = Object.getOwnPropertyDescriptor(proto, 'offsetWidth');
const offH = Object.getOwnPropertyDescriptor(proto, 'offsetHeight');

beforeEach(() => {
  Object.defineProperty(proto, 'offsetWidth', { configurable: true, get: () => 90 });
  Object.defineProperty(proto, 'offsetHeight', { configurable: true, get: () => 44 });
});

afterEach(() => {
  if (offW) Object.defineProperty(proto, 'offsetWidth', offW);
  if (offH) Object.defineProperty(proto, 'offsetHeight', offH);
});

/**
 * The hand-drawn shapes behind a tab: the decorative svgs that sit beside the
 * tab button (its wash), split into fill paths and pen-stroked paths.
 */
function washOf(tab: HTMLElement) {
  const wrapper = tab.parentElement?.parentElement as HTMLElement;
  const svg = Array.from(wrapper.children).find((el) => el.tagName.toLowerCase() === 'svg');
  if (!svg) return null;
  const paths = Array.from(svg.querySelectorAll('path'));
  return {
    fills: paths.filter((p) => p.getAttribute('fill') && p.getAttribute('fill') !== 'none'),
    strokes: paths.filter((p) => p.getAttribute('stroke')),
  };
}

const tabs = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'Mine' },
  { key: 'saved', label: 'Saved' },
];

describe('OrganicTabs', () => {
  it('renders a tablist with one tab per item and marks the active one selected', () => {
    render(<OrganicTabs tabs={tabs} active="mine" onChange={() => {}} aria-label="Feed filter" />);

    const list = screen.getByRole('tablist', { name: 'Feed filter' });
    expect(list).toHaveAttribute('aria-orientation', 'horizontal');

    const allTabs = screen.getAllByRole('tab');
    expect(allTabs).toHaveLength(3);
    expect(screen.getByRole('tab', { name: 'Mine' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onChange with the tab key when an inactive tab is clicked', async () => {
    const onChange = vi.fn();
    render(<OrganicTabs tabs={tabs} active="all" onChange={onChange} />);

    await userEvent.click(screen.getByRole('tab', { name: 'Saved' }));
    expect(onChange).toHaveBeenCalledWith('saved');
  });

  it('reflects vertical orientation on the tablist', () => {
    render(<OrganicTabs tabs={tabs} active="all" onChange={() => {}} orientation="vertical" />);
    expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'vertical');
  });

  it('washes the selected tab with a wobbly fill and no pen outline when variant is surface', () => {
    render(<OrganicTabs tabs={tabs} active="mine" onChange={() => {}} variant="surface" />);

    const wash = washOf(screen.getByRole('tab', { name: 'Mine' }));
    expect(wash).not.toBeNull();
    expect(wash!.fills).toHaveLength(1);
    expect(wash!.fills[0].getAttribute('fill')).toContain('terracotta-light');
    // A tab is a control, not a container: washed in, never framed.
    expect(wash!.strokes).toHaveLength(0);
  });

  it('washes only the selected tab, and moves the wash when the selection changes', () => {
    const { rerender } = render(
      <OrganicTabs tabs={tabs} active="all" onChange={() => {}} variant="surface" />,
    );
    expect(washOf(screen.getByRole('tab', { name: 'All' }))).not.toBeNull();
    // Unselected tabs sit bare in the strip — no wrapper, no wash.
    expect(screen.getByRole('tab', { name: 'Mine' }).parentElement).toBe(screen.getByRole('tablist'));

    rerender(<OrganicTabs tabs={tabs} active="saved" onChange={() => {}} variant="surface" />);
    expect(washOf(screen.getByRole('tab', { name: 'Saved' }))?.strokes).toHaveLength(0);
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'All' }).parentElement).toBe(screen.getByRole('tablist'));
  });

  it('washes the selected item of the vertical (settings) nav the same way, outline-free', () => {
    render(<OrganicTabs tabs={tabs} active="mine" onChange={() => {}} orientation="vertical" />);
    const wash = washOf(screen.getByRole('tab', { name: 'Mine' }));
    expect(wash?.fills).toHaveLength(1);
    expect(wash?.strokes).toHaveLength(0);
  });

  it('keeps the selected tab operable: still a tab, selected, and clickable through its wash', async () => {
    const onChange = vi.fn();
    render(<OrganicTabs tabs={tabs} active="mine" onChange={onChange} variant="surface" />);
    const active = screen.getByRole('tab', { name: 'Mine' });
    expect(active).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(active);
    expect(onChange).toHaveBeenCalledWith('mine');
  });

  it('underlines the selected horizontal tab with a wavy stroke instead of a wash by default', () => {
    render(<OrganicTabs tabs={tabs} active="mine" onChange={() => {}} />);
    const active = screen.getByRole('tab', { name: 'Mine' });
    expect(washOf(active)).toBeNull();
    // The indicator is the underline under the label, not a frame round the tab.
    expect(active.querySelectorAll('svg path[stroke]')).toHaveLength(1);
  });
});

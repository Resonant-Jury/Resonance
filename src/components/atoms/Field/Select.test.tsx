// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, userEvent, fireEvent } from '@/../test/render';
import { inkCircles, inkFills, stubRowLayout, type RowLayout } from '@/../test/layout';
import { Select } from './Field';

// Passed directly as children, the way a native <select> takes <option>s.
const OPTIONS = [
  <option key="tw" value="tw">Taiwan</option>,
  <option key="jp" value="jp">Japan</option>,
  <option key="us" value="us">United States</option>,
  <option key="kr" value="kr">Korea</option>,
];

describe('Select (organic dropdown)', () => {
  it('shows the selected option label in the closed trigger', () => {
    render(
      <Select value="jp" onChange={() => {}} ariaLabel="Region">
        {OPTIONS}
      </Select>,
    );
    const trigger = screen.getByRole('combobox', { name: 'Region' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveTextContent('Japan');
  });

  it('expands a covering card listing every option', async () => {
    render(
      <Select value="tw" onChange={() => {}} ariaLabel="Region">
        {OPTIONS}
      </Select>,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Region' }));

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Region' })).toHaveAttribute('aria-expanded', 'true');
    // All N options are listed in the open card (the wavy dividers between them
    // are SVG paths drawn once the panel is measured).
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });

  it('marks the current value as selected', async () => {
    render(
      <Select value="us" onChange={() => {}} ariaLabel="Region">
        {OPTIONS}
      </Select>,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Region' }));
    expect(screen.getByRole('option', { name: /United States/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('calls onChange with the chosen value and closes', async () => {
    const onChange = vi.fn();
    render(
      <Select value="tw" onChange={onChange} ariaLabel="Region">
        {OPTIONS}
      </Select>,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Region' }));
    await userEvent.click(screen.getByRole('option', { name: 'Korea' }));
    expect(onChange).toHaveBeenCalledWith('kr');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('Select row ink', () => {
  let layout: RowLayout;

  beforeEach(() => {
    layout = stubRowLayout({ width: 240, rowHeight: 54 });
  });
  afterEach(() => layout.restore());

  const openSelect = async (value = 'jp') => {
    render(
      <Select value={value} onChange={() => {}} ariaLabel="Region">
        {OPTIONS}
      </Select>,
    );
    const trigger = screen.getByRole('combobox', { name: 'Region' });
    await userEvent.click(trigger);
    return trigger;
  };
  const inked = () => inkCircles().map((c) => c.r > 0);

  it('rests the ink on the selected option when the panel opens', async () => {
    await openSelect('jp');
    expect(inked()).toEqual([false, true, false, false]);
    // Keyboard ink grows from the row's centre.
    expect(inkCircles()[1]).toMatchObject({ cx: 120, cy: 54 + 27 });
  });

  it('spreads from the pointer onto the hovered option', async () => {
    await openSelect('jp');
    const korea = screen.getByRole('option', { name: 'Korea' });
    fireEvent.mouseEnter(korea, { clientX: 40, clientY: 180 });

    expect(inked()).toEqual([false, false, false, true]);
    expect(inkCircles()[3]).toMatchObject({ cx: 40, cy: 180 });
    // Reaches the far corner of the 240 × 216 panel from the pointer.
    expect(inkCircles()[3].r).toBeCloseTo(Math.hypot(200, 180) + 4, 5);
  });

  it('keeps the ink on the last hovered option once the pointer leaves', async () => {
    const trigger = await openSelect('tw');
    const us = screen.getByRole('option', { name: 'United States' });
    fireEvent.mouseEnter(us, { clientX: 40, clientY: 130 });
    fireEvent.mouseLeave(us);

    expect(inked()).toEqual([false, false, true, false]);
    expect(trigger.getAttribute('aria-activedescendant')).toBe(us.id);
  });

  it('moves the ink down with ArrowDown and up with ArrowUp, from each row\'s centre', async () => {
    const trigger = await openSelect('tw');
    expect(inked()).toEqual([true, false, false, false]);

    await userEvent.keyboard('{ArrowDown}');
    expect(inked()).toEqual([false, true, false, false]);
    expect(inkCircles()[1]).toMatchObject({ cx: 120, cy: 54 + 27 });
    expect(trigger.getAttribute('aria-activedescendant')).toBe(
      screen.getByRole('option', { name: 'Japan' }).id,
    );

    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(inked()).toEqual([false, false, false, true]);

    await userEvent.keyboard('{ArrowUp}');
    expect(inked()).toEqual([false, false, true, false]);
  });

  it('lets the keyboard take the ink back from a pointer resting on another row', async () => {
    await openSelect('tw');
    fireEvent.mouseEnter(screen.getByRole('option', { name: 'Japan' }), { clientX: 30, clientY: 70 });
    expect(inked()).toEqual([false, true, false, false]);

    await userEvent.keyboard('{ArrowDown}');
    expect(inked()).toEqual([false, false, true, false]);
  });

  it('washes the option in terracotta and leaves the selected option styling alone', async () => {
    await openSelect('jp');
    expect(new Set(inkFills()).size).toBe(1);
    expect(inkFills()[0]).toBe('color-mix(in oklch, var(--color-terracotta) 15%, var(--color-cream))');

    fireEvent.mouseEnter(screen.getByRole('option', { name: 'Korea' }), { clientX: 10, clientY: 190 });
    const japan = screen.getByRole('option', { name: 'Japan' });
    const korea = screen.getByRole('option', { name: 'Korea' });
    // Only the hover/keyboard wash moved; "selected" is still Japan's alone.
    expect(japan).toHaveAttribute('aria-selected', 'true');
    expect(japan).toHaveAttribute('data-selected');
    expect(korea).toHaveAttribute('aria-selected', 'false');
    expect(korea).not.toHaveAttribute('data-selected');
  });

  it('chooses the keyboard-inked option on Enter', async () => {
    const onChange = vi.fn();
    render(
      <Select value="tw" onChange={onChange} ariaLabel="Region">
        {OPTIONS}
      </Select>,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Region' }));
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('us');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

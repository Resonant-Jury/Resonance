// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '@/../test/render';
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
    const trigger = screen.getByRole('button', { name: 'Region' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveTextContent('Japan');
  });

  it('expands a covering card listing every option', async () => {
    render(
      <Select value="tw" onChange={() => {}} ariaLabel="Region">
        {OPTIONS}
      </Select>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Region' }));

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Region' })).toHaveAttribute('aria-expanded', 'true');
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
    await userEvent.click(screen.getByRole('button', { name: 'Region' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Region' }));
    await userEvent.click(screen.getByRole('option', { name: 'Korea' }));
    expect(onChange).toHaveBeenCalledWith('kr');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '@/../test/render';
import { OrganicTabs } from './OrganicTabs';

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
});

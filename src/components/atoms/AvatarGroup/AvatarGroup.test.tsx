// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '@/../test/render';
import { AvatarGroup, type AvatarGroupMember } from './AvatarGroup';

function member(id: string): AvatarGroupMember {
  return { id, initials: id.toUpperCase(), accentColor: 'var(--accent)', avatarSeed: '3' };
}

describe('AvatarGroup', () => {
  it('renders at most `max` avatars and collapses the rest into a +N chip', () => {
    render(<AvatarGroup members={['a', 'b', 'c', 'd', 'e'].map(member)} max={3} />);
    // Three avatars shown (their initials render as text)…
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
    // …and the remaining two collapse into a +2 overflow chip.
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.queryByText('D')).not.toBeInTheDocument();
  });

  it('omits the overflow chip when members fit within max', () => {
    render(<AvatarGroup members={['a', 'b'].map(member)} max={3} />);
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it('is a button that fires onClick when provided', async () => {
    const onClick = vi.fn();
    render(<AvatarGroup members={['a'].map(member)} onClick={onClick} ariaLabel="View all" />);
    await userEvent.click(screen.getByRole('button', { name: 'View all' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders without a button wrapper when no onClick is given', () => {
    render(<AvatarGroup members={['a'].map(member)} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, userEvent } from '@/../test/render';
import { BareIconButton } from './BareIconButton';

describe('BareIconButton', () => {
  it('is a button named by what it does, which its tooltip repeats (hidden from assistive tech)', async () => {
    const onClick = vi.fn();
    render(<BareIconButton icon="reply" label="Reply" onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Reply' });
    const tip = button.nextElementSibling as HTMLElement;
    expect(tip).toHaveTextContent('Reply');
    expect(tip).toHaveAttribute('aria-hidden', 'true');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('puts its tooltip away on Escape until focus leaves, and says nothing when disabled', async () => {
    const onClick = vi.fn();
    const { rerender } = render(<BareIconButton icon="chevron-down" label="Later match" onClick={onClick} tip="below" />);
    const button = screen.getByRole('button', { name: 'Later match' });
    const tip = button.nextElementSibling as HTMLElement;
    expect(tip).toHaveAttribute('data-side', 'below');
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(tip).toHaveAttribute('data-dismissed');
    fireEvent.blur(button);
    expect(tip).not.toHaveAttribute('data-dismissed');

    rerender(<BareIconButton icon="chevron-down" label="Later match" onClick={onClick} disabled />);
    await userEvent.click(screen.getByRole('button', { name: 'Later match' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

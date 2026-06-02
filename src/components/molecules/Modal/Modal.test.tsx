// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '@/../test/render';
import { Modal } from './Modal';

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(
      <Modal open={false}>
        <p>Hidden body</p>
      </Modal>
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Hidden body')).not.toBeInTheDocument();
  });

  it('portals an accessible dialog with its content when open', () => {
    render(
      <Modal open ariaLabel="Invite dialog">
        <p>Visible body</p>
      </Modal>
    );
    const dialog = screen.getByRole('dialog', { name: 'Invite dialog' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Visible body')).toBeInTheDocument();
  });

  it('closes on backdrop click but not when the content is clicked', async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} ariaLabel="Dialog">
        <p>Body</p>
      </Modal>
    );

    // Clicking the content (which stops propagation) must not close.
    await userEvent.click(screen.getByText('Body'));
    expect(onClose).not.toHaveBeenCalled();

    // Clicking the backdrop (the dialog role element) closes.
    await userEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when Escape is pressed', async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose}>
        <p>Body</p>
      </Modal>
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes via the dedicated close button', async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose}>
        <p>Body</p>
      </Modal>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

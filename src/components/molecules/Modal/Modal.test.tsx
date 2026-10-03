// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { renderWithIntl as render, screen, userEvent, fireEvent } from '@/../test/render';
import { Modal } from './Modal';

afterEach(() => {
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
});

/** The backdrop is the dialog's parent: what a click beside the dialog lands on. */
const backdrop = () => screen.getByRole('dialog').parentElement!;

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

  it('closes on a backdrop click but not when the content is clicked', async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} ariaLabel="Dialog">
        <p>Body</p>
      </Modal>
    );

    await userEvent.click(screen.getByText('Body'));
    await userEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(backdrop());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Selecting text by dragging out past the dialog's edge ends on the
  // backdrop: that is not a click on it.
  it('stays open when a press starts inside it and ends on the backdrop', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose}>
        <p>Body</p>
      </Modal>
    );
    fireEvent.pointerDown(screen.getByText('Body'));
    fireEvent.click(backdrop());
    expect(onClose).not.toHaveBeenCalled();
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

  // No ✕: the one close is a word for a screen reader (shown only when the
  // keyboard reaches it), not a glyph in the corner.
  it('draws no ✕, and keeps a named close for screen readers', async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose}>
        <p>Body</p>
      </Modal>
    );
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close.querySelector('svg')).toBeNull();
    expect(close).not.toHaveAttribute('data-variant');
    await userEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('names its close as the host asks', () => {
    render(
      <Modal open onClose={vi.fn()} closeLabel="Keep writing">
        <p>Body</p>
      </Modal>
    );
    expect(screen.getByRole('button', { name: 'Keep writing' })).toBeInTheDocument();
  });

  // A list or a picker has nothing else at its foot: its close is drawn there.
  it('shows the close as a quiet text button at its foot with closeButton', async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} closeButton>
        <p>Body</p>
      </Modal>
    );
    const closes = screen.getAllByRole('button', { name: 'Close' });
    expect(closes).toHaveLength(1);
    expect(closes[0]).toHaveAttribute('data-variant', 'text');
    await userEvent.click(closes[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // While something is in flight the host leaves onClose out: nothing closes it.
  it('offers no close at all without onClose', () => {
    render(
      <Modal open closeButton>
        <p>Body</p>
      </Modal>
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('takes focus when it opens and hands it back when it closes', async () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          <Modal open={open} onClose={() => setOpen(false)} ariaLabel="Panel">
            <p>Body</p>
          </Modal>
        </>
      );
    }
    render(<Host />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(opener);
    expect(screen.getByRole('dialog', { name: 'Panel' })).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  // The page under the backdrop can't be clicked, nor reached by Tab: focus walks round the dialog.
  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    render(
      <>
        <button>Behind</button>
        <Modal open onClose={vi.fn()} ariaLabel="Confirm">
          <button>Cancel</button>
          <button>Delete</button>
        </Modal>
      </>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Confirm' });
    expect(dialog).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();
    await userEvent.tab();
    // The close kept for screen readers is the last stop, then round to the first again.
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Behind' })).not.toHaveFocus();
  });

  // What Escape closes is this dialog alone: a listener under it (a search over a thread) is told so.
  it('claims the Escape that closes it', async () => {
    const heard = vi.fn((e: KeyboardEvent) => e.defaultPrevented);
    render(
      <Modal open onClose={vi.fn()}>
        <p>Body</p>
      </Modal>,
    );
    document.addEventListener('keydown', heard);
    await userEvent.keyboard('{Escape}');
    document.removeEventListener('keydown', heard);
    expect(heard).toHaveReturnedWith(true);
  });

  // The browser paints its own bars in the theme colour: they dim with the
  // page while a modal is open, and come back after.
  it('dims the theme colour while open', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#faf2e9';
    document.head.appendChild(meta);

    const { rerender } = render(
      <Modal open>
        <p>Body</p>
      </Modal>
    );
    expect(meta.content).not.toBe('#faf2e9');

    rerender(
      <Modal open={false}>
        <p>Body</p>
      </Modal>
    );
    expect(meta.content).toBe('#faf2e9');
  });
});

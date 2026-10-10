// @vitest-environment jsdom
import type { ComponentProps } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithIntl as render, screen, userEvent, within } from '@/../test/render';
import { mockElementSize, penLines } from '@/../test/organic';
import { ConfirmModal } from './ConfirmModal';

// The buttons draw nothing until they are measured; give them a box.
mockElementSize(120, 40);

function renderConfirm(props: Partial<ComponentProps<typeof ConfirmModal>> = {}) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(
    <ConfirmModal
      open
      title="Delete this?"
      body="This can't be undone."
      cancelLabel="Keep it"
      confirmLabel="Delete"
      onCancel={onCancel}
      onConfirm={onConfirm}
      {...props}
    />,
  );
  const dialog = screen.getByRole('dialog', { name: 'Delete this?' });
  return {
    onCancel,
    onConfirm,
    cancel: within(dialog).getByRole('button', { name: 'Keep it' }),
    confirm: within(dialog).getByRole('button', { name: /Delete|…/ }),
  };
}

describe('ConfirmModal', () => {
  // The modal is the frame: neither action draws a pen outline of its own.
  it('asks with a tonal cancel and a solid verb, both without a pen line, the verb rightmost', async () => {
    const { cancel, confirm, onCancel, onConfirm } = renderConfirm();

    expect(cancel).toHaveAttribute('data-variant', 'tonal');
    // One row, in scanning order: the way out, then the verb.
    expect(cancel.parentElement).toBe(confirm.parentElement);
    expect(Array.from(cancel.parentElement!.children)).toEqual([cancel, confirm]);
    expect(confirm).toHaveAttribute('data-variant', 'solid');
    expect(penLines(cancel)).toHaveLength(0);
    expect(penLines(confirm)).toHaveLength(0);

    await userEvent.click(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('turns the verb red when the loss is permanent', () => {
    const { cancel, confirm } = renderConfirm({ destructive: true });

    expect(confirm).toHaveAttribute('data-variant', 'danger');
    expect(penLines(confirm)).toHaveLength(0);
    // Keeping it stays the tonal pill — only the verb is flagged.
    expect(cancel).toHaveAttribute('data-variant', 'tonal');
  });

  // B6: the verb keeps its word and draws the pen loop; the way out rests.
  it('keeps the verb\'s word with a loader while busy, takes no click and rests the way out', async () => {
    const { confirm, cancel, onConfirm } = renderConfirm({ busy: true, destructive: true });
    expect(confirm).toHaveTextContent('Delete');
    expect(confirm).not.toHaveTextContent('…');
    expect(confirm).toHaveAttribute('aria-busy', 'true');
    expect(confirm.querySelector('[data-button-loader]')).not.toBeNull();
    expect(cancel).toBeDisabled();
    await userEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  // The apps' confirm says why a try failed, and keeps the question until its words are read.
  it('says why the last try failed, above the buttons, and stays open to try again', () => {
    const { confirm } = renderConfirm({ error: "That didn't go through — try again" });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("That didn't go through — try again");
    expect(alert.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps the title\'s line empty while its words are on their way', () => {
    renderConfirm({ titlePending: true });
    expect(screen.getByRole('heading', { name: 'Delete this?' })).toHaveAttribute('data-pending');
  });
});

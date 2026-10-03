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
  it('asks with plain-text cancel and a solid verb, both without a pen line', async () => {
    const { cancel, confirm, onCancel, onConfirm } = renderConfirm();

    expect(cancel).toHaveAttribute('data-variant', 'text');
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
    // Keeping it stays plain text — only the verb is flagged.
    expect(cancel).toHaveAttribute('data-variant', 'text');
  });

  it('dims the actions and swaps the verb for an ellipsis while busy', () => {
    const { confirm } = renderConfirm({ busy: true, destructive: true });
    expect(confirm).toHaveTextContent('…');
    expect(confirm.parentElement).toHaveAttribute('data-busy', 'true');
  });
});

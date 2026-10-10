// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderWithIntl, screen } from '@/../test/render';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('says a title and one quiet line under a decorative mark, the title a heading on a page', () => {
    const { container } = renderWithIntl(<EmptyState icon="chat" title="No conversations yet" line="Leave a note" />);
    expect(screen.getByRole('heading', { level: 2, name: 'No conversations yet' })).toBeInTheDocument();
    expect(screen.getByText('Leave a note').tagName).toBe('P');
    // The blob and its glyph are decoration only.
    const mark = container.querySelector('svg')!.closest('[aria-hidden]');
    expect(mark).not.toBeNull();
    expect(mark!.querySelector('path')).not.toBeNull();
  });

  it('inside a dialog the title is plain words, and with no icon there is no mark', () => {
    const { container } = renderWithIntl(<EmptyState titleAs="p" title="No notifications yet" line="Later" />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('fills its region when asked', () => {
    const { container } = renderWithIntl(<EmptyState fills line="Pick a conversation from the left" />);
    expect(container.firstElementChild).toHaveAttribute('data-fills');
  });
});

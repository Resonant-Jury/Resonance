// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderWithIntl, screen } from '@/../test/render';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { AppMobileNavModal } from './AppMobileNavModal';

describe('AppMobileNavModal', () => {
  // A signed-out viewer's way in is the menu's one verb; the modal is the
  // frame, so it is a solid fill rather than a second outline.
  it('offers a signed-out viewer a solid sign-in button', () => {
    renderWithIntl(<AppMobileNavModal open onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveAttribute('data-variant', 'solid');
  });

  it('shows the viewer\'s avatar instead once signed in', () => {
    renderWithIntl(
      <AppMobileNavModal
        open
        onClose={vi.fn()}
        user={{ initials: 'NC', handle: 'ncc', accentColor: 'oklch(88% 0.08 55)' }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
  });
});

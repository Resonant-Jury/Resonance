// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { renderWithIntl, screen, userEvent } from '@/../test/render';
import { mockElementSize, penLines } from '@/../test/organic';

const mockBack = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ back: mockBack, push: vi.fn(), replace: vi.fn() }),
}));
// The shell is about the chrome around the map; the map itself is swapped out.
vi.mock('@/components/molecules/ThoughtMap/ThoughtMapBoard', () => ({
  ThoughtMapBoard: () => <div data-testid="map" />,
}));

import { WorkspaceShell } from './WorkspaceShell';

// The button draws its shapes only once measured; give it a box.
mockElementSize(120, 40);

/** A screen as wide as `width`, for the shell's media queries. */
const realMatchMedia = window.matchMedia;
function screenWidth(width: number) {
  window.matchMedia = vi.fn(
    (query: string) =>
      ({
        matches: /min-width: (\d+)px/.test(query) ? width >= Number(/min-width: (\d+)px/.exec(query)![1]) : false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

describe('the map behind the editor', () => {
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  // Below the split the open editor covers the map: a phone writing a card
  // read the whole map and its cards for nothing.
  it('is not mounted on a phone while the editor covers it, and stays once shown', () => {
    screenWidth(390);
    const shell = (open: boolean) => (
      <WorkspaceShell open={open} onClose={vi.fn()}>
        <p>editor</p>
      </WorkspaceShell>
    );
    const { rerender } = renderWithIntl(shell(true));
    expect(screen.queryByTestId('map')).toBeNull();

    rerender(shell(false));
    expect(screen.getByTestId('map')).toBeInTheDocument();
    // A card opened from the map covers it again; ✕ hands it back as it was.
    rerender(shell(true));
    expect(screen.getByTestId('map')).toBeInTheDocument();
  });

  it('is mounted beside the editor on a desktop', () => {
    screenWidth(1440);
    renderWithIntl(
      <WorkspaceShell open onClose={vi.fn()}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    expect(screen.getByTestId('map')).toBeInTheDocument();
  });
});

describe('WorkspaceShell', () => {
  // The Leave control floats over the map: a tonal pill, opaque to stay
  // legible over the board, and no pen line of its own.
  it('leaves through a tonal button without a pen outline', async () => {
    renderWithIntl(
      <WorkspaceShell open={false} onClose={vi.fn()}>
        <p>editor</p>
      </WorkspaceShell>,
    );

    const leave = screen.getByRole('button', { name: 'Leave' });
    expect(leave).toHaveAttribute('data-variant', 'tonal');
    expect(penLines(leave)).toHaveLength(0);

    await userEvent.click(leave);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe('the chrome around the panes', () => {
  beforeEach(() => mockBack.mockClear());

  // The thought-map page: the pane a card opened into closes on its ✕.
  it('closes the pane on its ✕ when there is no bar', async () => {
    const onClose = vi.fn();
    renderWithIntl(
      <WorkspaceShell open onClose={onClose}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Hide the editor' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // The writer: one bar over both panes, as on the apps' writer page — its
  // back arrow and title, in place of the Leave over the map and the ✕.
  it('stands the writer’s bar over both panes instead of the floating controls', async () => {
    const onBack = vi.fn();
    renderWithIntl(
      <WorkspaceShell open bar={{ title: 'New card', onBack }}>
        <p>editor</p>
      </WorkspaceShell>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'New card' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Leave' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Hide the editor' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mockBack).not.toHaveBeenCalled();
  });
});

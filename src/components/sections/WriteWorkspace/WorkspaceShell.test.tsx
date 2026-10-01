// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
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
  // The Leave control floats over the map: paper to stay legible over the
  // board, and no pen line of its own.
  it('leaves through a paper button without a pen outline', async () => {
    renderWithIntl(
      <WorkspaceShell open={false} onClose={vi.fn()}>
        <p>editor</p>
      </WorkspaceShell>,
    );

    const leave = screen.getByRole('button', { name: 'Leave' });
    expect(leave).toHaveAttribute('data-variant', 'paper');
    expect(penLines(leave)).toHaveLength(0);

    await userEvent.click(leave);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

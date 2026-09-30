// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithIntl, screen, userEvent, fireEvent } from '@/../test/render';
import { inkCircles, inkFills, stubRowLayout, type RowLayout } from '@/../test/layout';
import { Subnavbar } from './Subnavbar';

const mockPush = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const mockSignOut = vi.fn();
vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({
    signOut: mockSignOut,
  }),
}));

describe('Subnavbar', () => {
  const user = { initials: 'NC', handle: 'ncchen', accentColor: 'var(--color-terracotta)' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders closed by default showing avatar', () => {
    renderWithIntl(<Subnavbar user={user} />);
    const trigger = screen.getByRole('combobox', { name: 'ncchen' });
    expect(trigger).toBeInTheDocument();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens panel showing menu items on click', async () => {
    renderWithIntl(<Subnavbar user={user} />);
    const trigger = screen.getByRole('combobox', { name: 'ncchen' });
    await userEvent.click(trigger);

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(4);
    expect(screen.getByText('My Card Box')).toBeInTheDocument();
    expect(screen.getByText('Messages')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Sign out')).toBeInTheDocument();
  });

  it('navigates to card box and settings', async () => {
    renderWithIntl(<Subnavbar user={user} />);
    const trigger = screen.getByRole('combobox', { name: 'ncchen' });
    
    // Open menu
    await userEvent.click(trigger);
    
    // Click card box
    await userEvent.click(screen.getByText('My Card Box'));
    expect(mockPush).toHaveBeenCalledWith('/me');
  });

  it('asks for confirmation before signing out, then signs out on confirm', async () => {
    const originalLocation = window.location;
    // We temp mock location.href assignment
    const locationMock = { href: '' };
    Object.defineProperty(window, 'location', {
      value: locationMock,
      writable: true,
      configurable: true,
    });

    mockSignOut.mockResolvedValueOnce(undefined);

    renderWithIntl(<Subnavbar user={user} />);
    const trigger = screen.getByRole('combobox', { name: 'ncchen' });
    await userEvent.click(trigger);

    // Choosing 登出 opens the confirm dialog — nothing signs out yet.
    await userEvent.click(screen.getByText('Sign out'));
    expect(mockSignOut).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'Sign out?' });
    expect(dialog).toBeInTheDocument();

    // Confirming actually signs out and lands on /signin.
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(mockSignOut).toHaveBeenCalled();
    expect(locationMock.href).toBe('/en/signin');

    // Restore
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  it('keeps the session when the sign-out confirm is cancelled', async () => {
    renderWithIntl(<Subnavbar user={user} />);
    await userEvent.click(screen.getByRole('combobox', { name: 'ncchen' }));
    await userEvent.click(screen.getByText('Sign out'));

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  describe('row ink', () => {
    let layout: RowLayout;

    beforeEach(() => {
      layout = stubRowLayout({ width: 200, rowHeight: 44 });
    });
    afterEach(() => layout.restore());

    const open = async () => {
      renderWithIntl(<Subnavbar user={user} />);
      const trigger = screen.getByRole('combobox', { name: 'ncchen' });
      await userEvent.click(trigger);
      return trigger;
    };
    const inked = () => inkCircles().map((c) => c.r > 0);

    it('rests the ink on the first row, from its centre, when opened', async () => {
      await open();
      expect(inked()).toEqual([true, false, false, false]);
      expect(inkCircles()[0]).toMatchObject({ cx: 100, cy: 22 });
    });

    it('spreads the ink from the pointer onto the hovered row, and withdraws it on leave', async () => {
      await open();
      const settings = screen.getByRole('menuitem', { name: 'Settings' });
      fireEvent.mouseEnter(settings, { clientX: 150, clientY: 100 });

      expect(inked()).toEqual([false, false, true, false]);
      expect(inkCircles()[2]).toMatchObject({ cx: 150, cy: 100 });
      // Far corner of the 200 × 176 panel from (150, 100), plus 4.
      expect(inkCircles()[2].r).toBeCloseTo(Math.hypot(150, 100) + 4, 5);
      expect(settings).toHaveAttribute('data-active');

      fireEvent.mouseLeave(settings);
      expect(inkCircles().map((c) => c.r)).toEqual([0, 0, 0, 0]);
      expect(settings).not.toHaveAttribute('data-active');
    });

    it('walks the ink with the arrow keys, growing from each row\'s centre', async () => {
      const trigger = await open();
      await userEvent.keyboard('{ArrowDown}{ArrowDown}');

      expect(inked()).toEqual([false, false, true, false]);
      expect(inkCircles()[2]).toMatchObject({ cx: 100, cy: 2 * 44 + 22 });
      expect(trigger.getAttribute('aria-activedescendant')).toBe(
        screen.getByRole('menuitem', { name: 'Settings' }).id,
      );
    });

    it('hands the ink from the pointer to the keyboard when an arrow key is pressed', async () => {
      await open();
      fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'Messages' }), {
        clientX: 20,
        clientY: 66,
      });
      expect(inked()).toEqual([false, true, false, false]);

      await userEvent.keyboard('{ArrowDown}');
      expect(inked()).toEqual([false, false, true, false]);
    });

    it('keeps the sign-out row yellow — resting under the ink, and as the ink itself', async () => {
      await open();
      const panelSvg = screen.getByRole('menu').parentElement!.querySelector('svg') as SVGElement;

      const rest = Array.from(panelSvg.querySelectorAll('path')).find((p) =>
        p.getAttribute('fill')?.includes('yellow) 25%'),
      );
      expect(rest).toBeDefined();
      const firstInk = panelSvg.querySelector('g[mask^="url(#rowink-"]') as SVGGElement;
      expect(rest!.compareDocumentPosition(firstInk) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

      const fills = inkFills();
      expect(fills.slice(0, 3).every((f) => f.includes('--color-terracotta) 13%'))).toBe(true);
      expect(fills[3]).toContain('yellow) 40%');

      fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'Sign out' }), {
        clientX: 30,
        clientY: 150,
      });
      expect(inked()).toEqual([false, false, false, true]);
    });
  });
});

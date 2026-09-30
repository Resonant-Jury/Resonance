// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, userEvent, fireEvent } from '@/../test/render';
import { inkCircles, inkFills, stubRowLayout, type RowLayout } from '@/../test/layout';
import { OrganicMenu, type OrganicMenuItem } from './OrganicMenu';

const ITEMS: OrganicMenuItem[] = [
  { key: 'edit', icon: 'pen', label: 'Edit' },
  { key: 'share', icon: 'globe', label: 'Share' },
  { key: 'delete', icon: 'trash', label: 'Delete', danger: true },
];

describe('OrganicMenu row ink', () => {
  let layout: RowLayout;

  beforeEach(() => {
    layout = stubRowLayout({ width: 200, rowHeight: 42 });
  });
  afterEach(() => layout.restore());

  async function openMenu(onChoose = vi.fn()) {
    render(<OrganicMenu items={ITEMS} onChoose={onChoose} label="Manage" />);
    await userEvent.click(screen.getByRole('button', { name: 'Manage' }));
    return onChoose;
  }

  it('starts with no ink on any row', async () => {
    await openMenu();
    const ink = inkCircles();
    expect(ink).toHaveLength(3);
    expect(ink.map((c) => c.r)).toEqual([0, 0, 0]);
  });

  it('spreads the ink of the hovered row from where the pointer entered', async () => {
    await openMenu();
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'Share' }), {
      clientX: 30,
      clientY: 60,
    });

    const ink = inkCircles();
    expect(ink[0].r).toBe(0);
    expect(ink[2].r).toBe(0);
    // Reaches the panel's farthest corner (200 wide, 126 tall) from the pointer, plus 4.
    expect(ink[1].r).toBeCloseTo(Math.hypot(170, 66) + 4, 5);
    expect(ink[1]).toMatchObject({ cx: 30, cy: 60 });
    expect(screen.getByRole('menuitem', { name: 'Share' })).toHaveAttribute('data-active');
    expect(screen.getByRole('menuitem', { name: 'Edit' })).not.toHaveAttribute('data-active');
  });

  it('keeps spreading from where the pointer came in while it wanders along the row', async () => {
    await openMenu();
    const edit = screen.getByRole('menuitem', { name: 'Edit' });
    fireEvent.mouseEnter(edit, { clientX: 10, clientY: 10 });
    const entered = inkCircles()[0];
    fireEvent.mouseMove(edit, { clientX: 120, clientY: 30 });

    // A moving centre would restart the 340ms spread on every move.
    expect(inkCircles()[0]).toMatchObject({ cx: 10, cy: 10, r: entered.r });
  });

  it('moves the ink to the next row and withdraws it when the pointer leaves', async () => {
    await openMenu();
    const edit = screen.getByRole('menuitem', { name: 'Edit' });
    const share = screen.getByRole('menuitem', { name: 'Share' });

    fireEvent.mouseEnter(edit, { clientX: 20, clientY: 20 });
    expect(inkCircles().map((c) => c.r > 0)).toEqual([true, false, false]);

    fireEvent.mouseLeave(edit);
    fireEvent.mouseEnter(share, { clientX: 20, clientY: 60 });
    expect(inkCircles().map((c) => c.r > 0)).toEqual([false, true, false]);

    fireEvent.mouseLeave(share);
    expect(inkCircles().map((c) => c.r)).toEqual([0, 0, 0]);
    expect(share).not.toHaveAttribute('data-active');
  });

  it('keeps the destructive row yellow at rest and inks it a deeper yellow', async () => {
    await openMenu();
    const svg = screen.getByRole('menu').parentElement!.querySelector('svg') as SVGElement;

    // The resting warning wash is drawn under the ink, before any hover…
    const rest = Array.from(svg.querySelectorAll('path')).find((p) =>
      p.getAttribute('fill')?.includes('yellow) 25%'),
    );
    expect(rest).toBeDefined();
    const inkGroup = svg.querySelector('g[mask^="url(#rowink-"]') as SVGGElement;
    expect(
      rest!.compareDocumentPosition(inkGroup) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // …and each row keeps its own ink colour: ordinary rows the menu accent,
    // the delete row a stronger yellow.
    const fills = inkFills();
    expect(fills[0]).toContain('--menu-border-hover) 15%');
    expect(fills[1]).toContain('--menu-border-hover) 15%');
    expect(fills[2]).toContain('yellow) 45%');

    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'Delete' }), {
      clientX: 100,
      clientY: 100,
    });
    expect(inkCircles().map((c) => c.r > 0)).toEqual([false, false, true]);
    expect(rest!.isConnected).toBe(true);
  });

  it('still chooses the row that was inked', async () => {
    const onChoose = await openMenu();
    const share = screen.getByRole('menuitem', { name: 'Share' });
    fireEvent.mouseEnter(share, { clientX: 20, clientY: 60 });
    await userEvent.click(share);
    expect(onChoose).toHaveBeenCalledWith('share');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('row ink motion', () => {
  it('turns the spread off for people who prefer reduced motion', () => {
    // jsdom cannot evaluate media queries, so pin the stylesheet contract.
    const css = readFileSync(
      join(process.cwd(), 'src/components/atoms/RowInk/RowInk.module.css'),
      'utf8',
    );
    expect(css).toMatch(/\.circle\s*\{[^}]*transition:\s*r 340ms linear/);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.circle\s*\{\s*transition:\s*none/,
    );
  });
});

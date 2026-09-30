// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, userEvent } from '@/../test/render';
import { mockElementSize, penLines } from '@/../test/organic';
import { OrganicButton, type OrganicButtonVariant } from './OrganicButton';

// The button draws nothing until it is measured; give it a box.
mockElementSize(120, 40);

const FRAMED: OrganicButtonVariant[] = ['primary', 'ghost', 'outline'];
const FRAMELESS: OrganicButtonVariant[] = ['solid', 'danger', 'text', 'textAccent', 'paper'];

function renderVariant(variant: OrganicButtonVariant) {
  render(<OrganicButton variant={variant}>Press me</OrganicButton>);
  return screen.getByRole('button', { name: 'Press me' });
}

describe('OrganicButton variants', () => {
  it.each(FRAMED)('%s draws its own pen outline', (variant) => {
    expect(penLines(renderVariant(variant))).toHaveLength(1);
  });

  // One frame per layer: inside a modal / panel / bar / toolbar a control adds
  // no outline of its own — the container is the frame.
  it.each(FRAMELESS)('%s draws no pen outline', (variant) => {
    const btn = renderVariant(variant);
    expect(btn).toHaveAttribute('data-variant', variant);
    expect(penLines(btn)).toHaveLength(0);
    expect(btn).toHaveTextContent('Press me');
  });

  it.each(FRAMELESS)('%s keeps the hover ink, spreading from the pointer', (variant) => {
    const btn = renderVariant(variant);
    const ink = () => Number(btn.querySelector('mask circle')?.getAttribute('r'));
    expect(ink()).toBe(0);
    fireEvent.mouseEnter(btn, { clientX: 10, clientY: 10 });
    expect(ink()).toBeGreaterThan(0);
    fireEvent.mouseLeave(btn);
    expect(ink()).toBe(0);
  });

  it.each([
    ['solid', 'var(--color-terracotta)'],
    ['danger', 'var(--color-danger, oklch(58% 0.16 25))'],
    ['paper', 'var(--color-card-bg)'],
    ['text', 'transparent'],
    ['textAccent', 'transparent'],
  ] as const)('%s wears the %s face', (variant, face) => {
    const btn = renderVariant(variant);
    // The face is the first shape drawn (fill only — its stroke is transparent).
    expect(btn.querySelector('svg path')?.getAttribute('fill')).toBe(face);
  });

  // With no pen line and the browser's ring switched off, a Tab-focused Cancel
  // would be invisible. jsdom cannot evaluate :focus-visible, so pin the
  // stylesheet contract and check the button is reachable by keyboard.
  it.each(FRAMELESS)('%s is reachable by Tab and rings the focus colour', async (variant) => {
    const btn = renderVariant(variant);
    await userEvent.tab();
    expect(btn).toHaveFocus();

    const css = readFileSync(
      join(process.cwd(), 'src/components/atoms/OrganicButton/OrganicButton.module.css'),
      'utf8',
    );
    const [, selectors, body] = css.match(/\.btn:is\(([^)]*)\):focus-visible\s*\{([^}]*)\}/) ?? [];
    expect(selectors).toContain(`[data-variant='${variant}']`);
    expect(body).toMatch(/outline:\s*2px solid var\(--field-border-focus\)/);
    expect(body).toMatch(/outline-offset:/);
  });

  it('still takes clicks', async () => {
    const onClick = vi.fn();
    render(<OrganicButton variant="text" onClick={onClick}>Cancel</OrganicButton>);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

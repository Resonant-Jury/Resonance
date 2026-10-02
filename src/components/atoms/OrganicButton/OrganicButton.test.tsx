// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { render, screen, fireEvent, userEvent } from '@/../test/render';
import { mockElementSize, penLines } from '@/../test/organic';
import { OrganicButton, type OrganicButtonVariant } from './OrganicButton';
import styles from './OrganicButton.module.css';

// The button draws nothing until it is measured; give it a box.
mockElementSize(120, 40);

const FRAMED: OrganicButtonVariant[] = ['primary', 'ghost', 'outline'];
const FRAMELESS: OrganicButtonVariant[] = ['solid', 'danger', 'ink', 'text', 'textAccent', 'paper'];

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
    // The wash is a disc grown by transform under the button's outline.
    const ink = () => {
      const disc = btn.querySelector('[data-brush-wash] > *') as HTMLElement;
      return Number(disc.style.transform.match(/scale\(([^)]+)\)/)?.[1]);
    };
    expect(ink()).toBe(0);
    fireEvent.mouseEnter(btn, { clientX: 10, clientY: 10 });
    expect(ink()).toBeGreaterThan(0);
    fireEvent.mouseLeave(btn);
    expect(ink()).toBe(0);
  });

  it.each([
    ['solid', 'var(--color-terracotta)'],
    ['danger', 'var(--color-danger, oklch(58% 0.16 25))'],
    ['ink', 'var(--color-text)'],
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

  // Sign in with Apple asks for a black button: the ink face with a cream
  // label, as large as its neighbour and, like it, no pen line on the sheet.
  it('ink sets a cream label on the ink colour', () => {
    const btn = renderVariant('ink');
    expect(btn.style.color).toBe('var(--color-cream)');
    expect(btn.style.getPropertyValue('--shape-fill')).toBe('var(--color-text)');
  });

  it('still takes clicks', async () => {
    const onClick = vi.fn();
    render(<OrganicButton variant="text" onClick={onClick}>Cancel</OrganicButton>);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

// A sheet's provider buttons span its width: the face is drawn across all of
// it — the size it measures — and the label stays in the middle.
describe('block', () => {
  it('fills its container and draws its face at that width', () => {
    render(<OrganicButton variant="solid" block>Continue with Google</OrganicButton>);
    const btn = screen.getByRole('button', { name: 'Continue with Google' });
    expect(btn.classList).toContain(styles.block);
    // The width the button measures (mockElementSize's box above).
    expect(btn.querySelector('svg')).toHaveAttribute('width', '120');

    const css = readFileSync(
      join(process.cwd(), 'src/components/atoms/OrganicButton/OrganicButton.module.css'),
      'utf8',
    );
    const [, block] = css.match(/\.block\s*\{([^}]*)\}/) ?? [];
    expect(block).toMatch(/width:\s*100%/);
    const [, btnRule] = css.match(/\.btn\s*\{([^}]*)\}/) ?? [];
    expect(btnRule).toMatch(/justify-content:\s*center/);
  });

  it('is off by default', () => {
    render(<OrganicButton>Explore</OrganicButton>);
    expect(screen.getByRole('button', { name: 'Explore' }).classList).not.toContain(styles.block);
  });
});

// The server's HTML has no measured size, so no drawn shape: a primary's cream
// label stood on the cream hero, invisible until the scripts ran (or forever
// without them). Until measured the button is a plain pill of its own fill
// and pen — `.res-shape-stand-in` in globals.css, which the drawn one replaces.
describe('before it is measured', () => {
  it('stands in as a plain pill of its own fill and pen in the server HTML', () => {
    const host = document.createElement('div');
    host.innerHTML = renderToString(<OrganicButton variant="primary">Explore</OrganicButton>);
    const btn = host.querySelector('button')!;
    expect(btn).toHaveAttribute('data-shape-pending');
    expect(btn.classList).toContain('res-shape-stand-in');
    expect(btn.style.getPropertyValue('--shape-fill')).toBe('var(--color-terracotta)');
    expect(btn.style.getPropertyValue('--shape-ink')).toContain('var(--color-terracotta)');

    const css = readFileSync(join(process.cwd(), 'src/styles/globals.css'), 'utf8');
    const [, rule] = css.match(/\.res-shape-stand-in\[data-shape-pending\]\s*\{([^}]*)\}/) ?? [];
    expect(rule).toMatch(/background-color:\s*var\(--shape-fill/);
    expect(rule).toMatch(/box-shadow:\s*inset 0 0 0 var\(--shape-ink-width[^)]*\) var\(--shape-ink/);
  });

  it('drops the stand-in once drawn', () => {
    expect(renderVariant('primary')).not.toHaveAttribute('data-shape-pending');
  });
});

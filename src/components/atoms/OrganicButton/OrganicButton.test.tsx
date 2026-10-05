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

const ALL: OrganicButtonVariant[] = [
  'primary', 'secondary', 'ghost', 'outline', 'ctaLight', 'ctaGhost', 'secondaryOutline',
  'solid', 'tonal', 'danger', 'dangerTonal', 'ink', 'text', 'textAccent', 'paper',
];

function renderVariant(variant: OrganicButtonVariant) {
  render(<OrganicButton variant={variant}>Press me</OrganicButton>);
  return screen.getByRole('button', { name: 'Press me' });
}

// The face is the first shape drawn (fill only — its stroke is transparent).
const face = (btn: HTMLElement) => btn.querySelector('svg path')?.getAttribute('fill');

describe('OrganicButton variants', () => {
  // A button is a filled shape: the pen outline belongs to containers (cards,
  // modals, panels, bars) and inputs, never to a control — on bare paper or
  // inside a frame alike.
  it.each(ALL)('%s draws no pen outline', (variant) => {
    const btn = renderVariant(variant);
    expect(btn).toHaveAttribute('data-variant', variant);
    expect(penLines(btn)).toHaveLength(0);
    expect(btn).toHaveTextContent('Press me');
  });

  it.each(ALL)('%s keeps the hover ink, spreading from the pointer', (variant) => {
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

  // What says "press me" is the fill, ranked: the verb deep terracotta,
  // everything beside it the tonal tint, the final destructive confirm solid
  // red and the button that opens that flow the red tint.
  it.each([
    ['solid', 'var(--button-fill)', 'var(--color-cream)'],
    ['tonal', 'var(--button-tonal)', 'var(--button-on-tonal)'],
    ['danger', 'color-mix(in oklch, var(--color-danger, oklch(58% 0.16 25)), black 8%)', 'var(--color-cream)'],
    ['dangerTonal', 'var(--button-danger-tonal)', 'var(--button-on-danger-tonal)'],
    ['ink', 'var(--color-text)', 'var(--color-cream)'],
    ['paper', 'var(--color-card-bg)', 'var(--color-text)'],
    ['ctaLight', 'var(--color-cream)', 'var(--button-on-tonal)'],
    ['ctaGhost', 'color-mix(in oklch, var(--color-terracotta), black 18%)', 'var(--color-cream)'],
  ] as const)('%s wears the %s face with a %s label', (variant, fill, label) => {
    const btn = renderVariant(variant);
    expect(face(btn)).toBe(fill);
    expect(btn.style.color).toBe(label);
  });

  // The older names keep working and wear the rank they stood for, so call
  // sites can move to the rank names at their own pace. Cancel / Close /
  // Load more (`text`, `textAccent`) were bare words; a word alone did not
  // read as a button beside a filled verb, so they wear the tonal pill.
  it.each([
    ['primary', 'solid'],
    ['outline', 'tonal'],
    ['ghost', 'tonal'],
    ['secondary', 'tonal'],
    ['secondaryOutline', 'tonal'],
    ['text', 'tonal'],
    ['textAccent', 'tonal'],
  ] as const)('%s wears the %s face', (legacy, rank) => {
    render(
      <>
        <OrganicButton variant={legacy}>Old name</OrganicButton>
        <OrganicButton variant={rank}>Rank name</OrganicButton>
      </>,
    );
    const legacyBtn = screen.getByRole('button', { name: 'Old name' });
    const rankBtn = screen.getByRole('button', { name: 'Rank name' });
    expect([face(legacyBtn), legacyBtn.style.color]).toEqual([face(rankBtn), rankBtn.style.color]);
  });

  // With no pen line and the browser's ring switched off, a Tab-focused
  // button would be invisible. jsdom cannot evaluate :focus-visible, so pin
  // the stylesheet contract and check the button is reachable by keyboard.
  it.each(ALL)('%s is reachable by Tab and rings the focus colour', async (variant) => {
    const btn = renderVariant(variant);
    await userEvent.tab();
    expect(btn).toHaveFocus();

    const css = readFileSync(
      join(process.cwd(), 'src/components/atoms/OrganicButton/OrganicButton.module.css'),
      'utf8',
    );
    const [, body] = css.match(/\.btn:focus-visible\s*\{([^}]*)\}/) ?? [];
    expect(body).toMatch(/outline:\s*2px solid var\(--field-border-focus\)/);
    expect(body).toMatch(/outline-offset:/);
  });

  // On the terracotta band a terracotta ring would vanish into it.
  it('rings the band\'s buttons in cream', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/components/atoms/OrganicButton/OrganicButton.module.css'),
      'utf8',
    );
    const [, selectors, body] = css.match(/\.btn:is\(([^)]*)\):focus-visible\s*\{([^}]*)\}/) ?? [];
    expect(selectors).toContain("[data-variant='ctaLight']");
    expect(selectors).toContain("[data-variant='ctaGhost']");
    expect(body).toMatch(/outline-color:\s*var\(--color-cream\)/);
  });

  // Every label clears 4.5:1 on its face: the fills are mixes defined once,
  // beside the palette (a test can't evaluate color-mix; pin the recipe the
  // contrast was measured on — cream 4.7:1 on the fill, the deep label 4.8:1
  // on the tint and 6.1:1 on cream, the deep red 5.7:1 on its tint).
  it('takes its faces from the button tokens', () => {
    const tokens = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');
    expect(tokens).toMatch(/--button-fill:\s*color-mix\(in oklch, var\(--color-terracotta\), black 12%\);/);
    expect(tokens).toMatch(/--button-tonal:\s*color-mix\(in oklch, var\(--color-terracotta-light\) 75%, var\(--color-cream-dark\)\);/);
    expect(tokens).toMatch(/--button-on-tonal:\s*color-mix\(in oklch, var\(--color-terracotta\), black 22%\);/);
    expect(tokens).toMatch(
      /--button-danger-tonal:\s*color-mix\(in oklch, var\(--color-danger, oklch\(58% 0\.16 25\)\) 20%, oklch\(98% 0\.02 25\)\);/,
    );
    expect(tokens).toMatch(
      /--button-on-danger-tonal:\s*color-mix\(in oklch, var\(--color-danger, oklch\(58% 0\.16 25\)\), black 22%\);/,
    );
  });

  // No face is see-through: a button always shows the shape you press.
  it.each(ALL)('%s has a fill', (variant) => {
    const btn = renderVariant(variant);
    expect(face(btn)).toBeTruthy();
    expect(face(btn)).not.toBe('transparent');
    expect(btn.style.getPropertyValue('--shape-fill')).not.toBe('transparent');
  });

  // Sign in with Apple asks for a black button: the ink face with a cream
  // label, as large as its neighbour and, like it, no pen line.
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

// A dialog's verb before there is anything to act on (the resonate picker's
// 共振 until a card is chosen): it can't be pressed and doesn't answer a hover.
describe('disabled', () => {
  it('takes no click and grows no hover ink', async () => {
    const onClick = vi.fn();
    render(
      <OrganicButton variant="solid" disabled onClick={onClick}>
        Resonate
      </OrganicButton>,
    );
    const btn = screen.getByRole('button', { name: 'Resonate' });
    expect(btn).toBeDisabled();
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.mouseEnter(btn, { clientX: 10, clientY: 10 });
    const disc = btn.querySelector('[data-brush-wash] > *') as HTMLElement;
    expect(Number(disc.style.transform.match(/scale\(([^)]+)\)/)?.[1])).toBe(0);
  });

  it('is pressable by default', () => {
    expect(renderVariant('solid')).toBeEnabled();
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
// without them). Until measured the button is a plain pill of its own fill —
// `.res-shape-stand-in` in globals.css, which the drawn one replaces.
describe('before it is measured', () => {
  it('stands in as a plain pill of its own fill in the server HTML', () => {
    const host = document.createElement('div');
    host.innerHTML = renderToString(<OrganicButton variant="primary">Explore</OrganicButton>);
    const btn = host.querySelector('button')!;
    expect(btn).toHaveAttribute('data-shape-pending');
    expect(btn.classList).toContain('res-shape-stand-in');
    expect(btn.style.getPropertyValue('--shape-fill')).toBe('var(--button-fill)');
    // No pen line to stand in for.
    expect(btn.style.getPropertyValue('--shape-ink')).toBe('');

    const css = readFileSync(join(process.cwd(), 'src/styles/globals.css'), 'utf8');
    const [, rule] = css.match(/\.res-shape-stand-in\[data-shape-pending\]\s*\{([^}]*)\}/) ?? [];
    expect(rule).toMatch(/background-color:\s*var\(--shape-fill/);
  });

  it('drops the stand-in once drawn', () => {
    expect(renderVariant('primary')).not.toHaveAttribute('data-shape-pending');
  });
});

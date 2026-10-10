// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { render } from '@testing-library/react';
import { ReadingProgress, readingProgress } from './ReadingProgress';

describe('readingProgress', () => {
  const line = 73;
  const vh = 800;
  // visible height = 800 − 73 = 727
  it('is 0 while the story starts below the bar, and 1 once its foot reaches the screen’s foot', () => {
    expect(readingProgress(400, 2000, vh, line)).toBe(0);
    expect(readingProgress(line, 2000, vh, line)).toBe(0);
    expect(readingProgress(line - (2000 - 727) / 2, 2000, vh, line)).toBeCloseTo(0.5);
    expect(readingProgress(vh - 2000, 2000, vh, line)).toBeCloseTo(1);
    expect(readingProgress(-5000, 2000, vh, line)).toBe(1);
  });

  it('is nothing for a story that fits on the screen', () => {
    expect(readingProgress(100, 727, vh, line)).toBeNull();
    expect(readingProgress(100, 300, vh, line)).toBeNull();
  });
});

describe('ReadingProgress', () => {
  it('is decorative: hidden from assistive tech and takes no pointer', () => {
    function Page() {
      const ref = useRef<HTMLDivElement>(null);
      return (
        <>
          <ReadingProgress targetRef={ref} />
          <div ref={ref}>story</div>
        </>
      );
    }
    const { container } = render(<Page />);
    const box = container.firstElementChild as HTMLElement;
    expect(box).toHaveAttribute('aria-hidden', 'true');
    expect(box.textContent).toBe('');
  });

  afterEach(() => vi.restoreAllMocks());

  it('draws the marker in its own pen: the reading-progress tokens, round caps, on the bar’s own line', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1280);
    function Page() {
      const ref = useRef<HTMLDivElement>(null);
      return (
        <>
          <ReadingProgress targetRef={ref} />
          <div ref={ref}>story</div>
        </>
      );
    }
    const { container } = render(<Page />);
    const path = container.querySelector('path')!;
    expect(path).not.toBeNull();
    // No pen of its own in the markup (neither the old terracotta nor the 1.8 INK): the module's rule sets it.
    expect(path.getAttribute('stroke')).toBeNull();
    expect(path.getAttribute('stroke-width')).toBeNull();
    const css = readFileSync(join(process.cwd(), 'src/components/molecules/CardDetail/ReadingProgress.module.css'), 'utf8');
    const line = css.match(/\.line\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(line).toMatch(/stroke:\s*var\(--reading-progress\)/);
    expect(line).toMatch(/stroke-width:\s*var\(--reading-progress-width\)/);
    expect(line).toMatch(/stroke-linecap:\s*round/);
  });
});

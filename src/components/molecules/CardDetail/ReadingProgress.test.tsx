// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
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
});

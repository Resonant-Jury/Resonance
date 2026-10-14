// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useEdgeFades } from './useEdgeFades';

function List() {
  const ref = useEdgeFades<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="list">
      <p>row</p>
    </div>
  );
}

// jsdom lays nothing out: give the list a size and a scroll position by hand.
function size(el: HTMLElement, { scrollHeight, clientHeight, scrollTop }: { scrollHeight: number; clientHeight: number; scrollTop: number }) {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: clientHeight });
  Object.defineProperty(el, 'scrollTop', { configurable: true, writable: true, value: scrollTop });
}

describe('useEdgeFades', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 1;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('fades the edges the list can still scroll toward, and none when it all fits', () => {
    render(<List />);
    const list = screen.getByTestId('list');

    size(list, { scrollHeight: 300, clientHeight: 300, scrollTop: 0 });
    fireEvent.scroll(list);
    expect(list).not.toHaveAttribute('data-edge-fade-top');
    expect(list).not.toHaveAttribute('data-edge-fade-bottom');

    size(list, { scrollHeight: 900, clientHeight: 300, scrollTop: 0 });
    fireEvent.scroll(list);
    expect(list).not.toHaveAttribute('data-edge-fade-top');
    expect(list).toHaveAttribute('data-edge-fade-bottom');

    size(list, { scrollHeight: 900, clientHeight: 300, scrollTop: 250 });
    fireEvent.scroll(list);
    expect(list).toHaveAttribute('data-edge-fade-top');
    expect(list).toHaveAttribute('data-edge-fade-bottom');

    size(list, { scrollHeight: 900, clientHeight: 300, scrollTop: 600 });
    fireEvent.scroll(list);
    expect(list).toHaveAttribute('data-edge-fade-top');
    expect(list).not.toHaveAttribute('data-edge-fade-bottom');
  });
});

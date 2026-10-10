// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { IMAGE_RETRY_MS, useImageRetry } from './useImageRetry';

function Picture({ src }: { src: string }) {
  const { hidden, attempt, onError } = useImageRetry(src);
  // eslint-disable-next-line @next/next/no-img-element
  return hidden ? null : <img key={attempt} data-attempt={attempt} src={src} alt="" onError={onError} />;
}

describe('useImageRetry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('hides a picture that failed, asks for it once more after the server has forgotten the failure, and gives up after a second one', () => {
    const { container } = render(<Picture src="/api/link-image?u=a&s=b" />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();

    act(() => vi.advanceTimersByTime(IMAGE_RETRY_MS - 1));
    expect(container.querySelector('img')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(container.querySelector('img')).toHaveAttribute('data-attempt', '1');

    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    act(() => vi.advanceTimersByTime(IMAGE_RETRY_MS * 3));
    expect(container.querySelector('img')).toBeNull();
  });

  it('starts over for another picture', () => {
    const { container, rerender } = render(<Picture src="/api/link-image?u=a&s=b" />);
    fireEvent.error(container.querySelector('img')!);
    act(() => vi.advanceTimersByTime(IMAGE_RETRY_MS));
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();

    rerender(<Picture src="/api/link-image?u=c&s=d" />);
    expect(container.querySelector('img')).toHaveAttribute('data-attempt', '0');
  });
});

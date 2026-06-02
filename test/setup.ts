// Global test setup, loaded before every test file (see vitest.config.ts).
//
// jest-dom adds DOM-oriented matchers (toBeInTheDocument, toHaveTextContent,
// …). They are harmless to register in the node environment — they only get
// exercised by jsdom-based component tests — so registering them globally
// keeps individual test files free of boilerplate.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmount any React trees rendered during a test so component suites stay
// isolated from one another. No-op for pure-logic suites.
afterEach(() => {
  cleanup();
});

// jsdom lacks ResizeObserver and matchMedia, which many organic atoms rely on
// (useElementSize / useIsMobile). Stub them so component tests can mount. These
// are no-ops in the node environment where `window` is undefined.
if (typeof window !== 'undefined') {
  const w = window as unknown as {
    ResizeObserver?: unknown;
    matchMedia?: unknown;
  };
  if (!w.ResizeObserver) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    w.ResizeObserver = ResizeObserverStub;
  }
  if (!w.matchMedia) {
    w.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
  }
}

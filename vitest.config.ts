import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

// Vitest setup for Resonance.
//
// - `tsconfigPaths` makes the `@/*` alias resolve exactly like in the app.
// - `react` enables JSX + Fast Refresh transform so component tests work.
// - Default environment is `node` (fast, suits the pure-logic suites). Files
//   that render React must opt into jsdom with a top-of-file directive:
//       // @vitest-environment jsdom
//   See test/setup.ts for the matching jest-dom matchers.
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  // tsconfig.json uses `jsx: "preserve"` for Next; tests need a real runtime.
  // The automatic runtime injects the JSX factory so files don't import React.
  esbuild: { jsx: 'automatic' },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});

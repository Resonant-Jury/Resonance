import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Suites that need the local Firebase emulators (Firestore rules, Admin SDK
// purges). Run with `npm run test:emulator`, which starts the emulators, runs
// these, and shuts them down. Kept out of `npm test` because they need Java.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    include: ['test/emulator/**/*.emulator.test.ts'],
    // Suites share one emulator; running files in parallel would let one
    // suite's clearFirestore() wipe another's fixtures mid-test.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});

#!/usr/bin/env node
/**
 * `npm run dev:emulator` — Next dev server wired to the local Firebase
 * emulators (start them first with `npm run emulators`). Extra args are passed
 * through to `next dev` (e.g. `-- --port 3100`).
 */
import { spawn } from 'node:child_process';
import { emulatorEnv } from './emulator-env.mjs';

const child = spawn('npx', ['next', 'dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, ...emulatorEnv },
});
child.on('exit', (code) => process.exit(code ?? 0));

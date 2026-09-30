#!/usr/bin/env node
/**
 * `npm run emulators:at` — the Auth + Firestore emulators on the ports in
 * EMULATOR_AUTH_PORT / EMULATOR_FIRESTORE_PORT instead of firebase.json's,
 * so a second checkout or session can run its own beside the shared ones:
 *
 *   EMULATOR_AUTH_PORT=9199 EMULATOR_FIRESTORE_PORT=8180 npm run emulators:at
 *   EMULATOR_AUTH_PORT=9199 EMULATOR_FIRESTORE_PORT=8180 npm run emulators:at -- "npx vitest run -c vitest.emulator.config.ts"
 *
 * With a command it runs `emulators:exec` (the emulators live while it
 * runs). The same variables make `npm run dev:emulator`, the seed scripts and
 * the apps' `emulatorAuthPort` / `emulatorFirestorePort` launch arguments
 * reach this pair. The hub, logging and websocket ports follow the Firestore
 * port (+1, +2, +3).
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { EMULATOR_AUTH_PORT, EMULATOR_FIRESTORE_PORT, EMULATOR_PROJECT_ID } from './emulator-env.mjs';

const firebaseDir = resolve(process.cwd(), 'firebase');
const base = JSON.parse(readFileSync(join(firebaseDir, 'firebase.json'), 'utf8'));
const firestorePort = Number(EMULATOR_FIRESTORE_PORT);
const config = {
  firestore: {
    rules: join(firebaseDir, base.firestore?.rules ?? 'firestore.rules'),
    indexes: join(firebaseDir, base.firestore?.indexes ?? 'firestore.indexes.json'),
  },
  emulators: {
    auth: { host: '127.0.0.1', port: Number(EMULATOR_AUTH_PORT) },
    firestore: { host: '127.0.0.1', port: firestorePort, websocketPort: firestorePort + 3 },
    hub: { port: firestorePort + 1 },
    logging: { port: firestorePort + 2 },
    ui: { enabled: false },
    singleProjectMode: true,
  },
};
const dir = mkdtempSync(join(tmpdir(), 'resonance-emulators-'));
const file = join(dir, 'firebase.json');
writeFileSync(file, JSON.stringify(config, null, 2));

const command = process.argv.slice(2).join(' ').trim();
const args = command
  ? ['emulators:exec', '--only', 'auth,firestore', '--project', EMULATOR_PROJECT_ID, '--config', file, command]
  : ['emulators:start', '--only', 'auth,firestore', '--project', EMULATOR_PROJECT_ID, '--config', file];
const child = spawn('firebase', args, { stdio: 'inherit', cwd: process.cwd() });
child.on('exit', (code) => process.exit(code ?? 0));

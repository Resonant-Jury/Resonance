/**
 * Environment for running the app against the local Firebase emulators.
 *
 * The project id starts with `demo-`, which Firebase treats as an
 * emulator-only project: no request can ever reach real Firebase resources,
 * so seeded test accounts and data stay on this machine. Service-account
 * credentials and R2 are blanked for the same reason — account purges and
 * uploads must not touch production storage while testing.
 */
export const EMULATOR_PROJECT_ID = 'demo-resonance';

/**
 * The emulators' ports: firebase/firebase.json's by default. Another pair
 * (EMULATOR_AUTH_PORT / EMULATOR_FIRESTORE_PORT, as `npm run emulators:at`
 * starts them) lets a second checkout or session run its own emulators
 * beside the shared ones.
 */
export const EMULATOR_AUTH_PORT = process.env.EMULATOR_AUTH_PORT || '9099';
export const EMULATOR_FIRESTORE_PORT = process.env.EMULATOR_FIRESTORE_PORT || '8080';

export const emulatorEnv = {
  NEXT_PUBLIC_FIREBASE_EMULATOR: 'true',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: EMULATOR_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_API_KEY: 'demo-key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${EMULATOR_PROJECT_ID}.firebaseapp.com`,
  NEXT_PUBLIC_FIREBASE_APP_ID: 'demo-app',
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: '',
  FIREBASE_PROJECT_ID: EMULATOR_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL: '',
  FIREBASE_PRIVATE_KEY: '',
  NEXT_PUBLIC_EMULATOR_AUTH_PORT: EMULATOR_AUTH_PORT,
  NEXT_PUBLIC_EMULATOR_FIRESTORE_PORT: EMULATOR_FIRESTORE_PORT,
  FIRESTORE_EMULATOR_HOST: `127.0.0.1:${EMULATOR_FIRESTORE_PORT}`,
  FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${EMULATOR_AUTH_PORT}`,
  R2_ENDPOINT: '',
  R2_ACCESS_KEY_ID: '',
  R2_SECRET_ACCESS_KEY: '',
  CRON_SECRET: 'emulator-cron-secret',
};

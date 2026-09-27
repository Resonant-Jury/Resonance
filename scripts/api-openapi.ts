/**
 * Write openapi/v1/openapi.json from the Zod contract (src/lib/api/v1).
 * The native clients are generated from this file; a test fails if it is stale.
 *
 *   npm run api:openapi
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildOpenApi } from '../src/lib/api/v1/openapi';

const out = resolve(__dirname, '../openapi/v1/openapi.json');
writeFileSync(out, `${JSON.stringify(buildOpenApi(), null, 2)}\n`);
console.log(`wrote ${out}`);

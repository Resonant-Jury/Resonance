import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// The functions run in Hong Kong (vercel.json "regions": nearest Firestore's
// asia-east1), but OpenAI refuses requests from Hong Kong. So every route that
// can reach the OpenAI client is pinned elsewhere in vercel.json "functions".
// This follows each route's imports to keep that list complete and current.

const ROOT = join(__dirname, '../../..');
const OPENAI = join(ROOT, 'src/lib/ai/openai.ts');
const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')) as {
  regions: string[];
  functions?: Record<string, { regions?: string[]; maxDuration?: number }>;
};
/** Where OpenAI answers "unsupported_country_region_territory". */
const REFUSED = new Set(['hkg1']);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** The server entry points: route handlers, pages and layouts. */
const entries = walk(join(ROOT, 'src/app')).filter((f) => /\/(route|page|layout)\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(ROOT, 'src', spec.slice(2)) : spec.startsWith('.') ? join(dirname(from), spec) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Runtime imports only: `import type` / `export type` bring no code along. */
const IMPORT = /(?:^|\n)\s*(import|export)(\s+type)?\b[^'"`;]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

const reaches = new Map<string, boolean>();
function reachesOpenAI(file: string, seen = new Set<string>()): boolean {
  if (file === OPENAI) return true;
  const known = reaches.get(file);
  if (known !== undefined) return known;
  if (seen.has(file)) return false;
  seen.add(file);
  const source = readFileSync(file, 'utf8');
  let found = false;
  for (const m of source.matchAll(IMPORT)) {
    if (m[2]) continue;
    const spec = m[3] ?? m[4] ?? m[5];
    const target = spec && resolveImport(file, spec);
    if (target && reachesOpenAI(target, seen)) {
      found = true;
      break;
    }
  }
  reaches.set(file, found);
  return found;
}

/** vercel.json's function globs (`*` within one path segment, `**` across). */
function globMatches(glob: string, path: string): boolean {
  const pattern = glob
    .split('**')
    .map((part) => part.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*'))
    .join('.*');
  return new RegExp(`^${pattern}$`).test(path);
}

function regionsOf(path: string): string[] {
  const entry = Object.entries(vercel.functions ?? {}).find(([glob]) => globMatches(glob, path));
  return entry?.[1].regions ?? vercel.regions;
}

const openAIRoutes = entries.filter((f) => reachesOpenAI(f)).map((f) => relative(ROOT, f));

describe('function regions', () => {
  it('finds the routes that call OpenAI (publishing, tags, insight, illustrations, recommendations)', () => {
    expect(openAIRoutes).toContain('src/app/api/v1/cards/[key]/publish/route.ts');
    expect(openAIRoutes).toContain('src/app/api/generate-image/route.ts');
    expect(openAIRoutes).not.toContain('src/app/api/cards/latest/route.ts');
  });

  it('runs none of them where OpenAI refuses requests', () => {
    const refused = openAIRoutes.filter((route) => regionsOf(route).some((r) => REFUSED.has(r)));
    expect(refused).toEqual([]);
  });

  it('pins only routes that need it (a stale pin would keep a route far from Firestore)', () => {
    for (const glob of Object.keys(vercel.functions ?? {})) {
      expect(openAIRoutes.some((route) => globMatches(glob, route)), glob).toBe(true);
    }
  });

  it('gives a pinned route the same time limit as its own maxDuration', () => {
    for (const [glob, config] of Object.entries(vercel.functions ?? {})) {
      for (const route of openAIRoutes.filter((r) => globMatches(glob, r))) {
        const own = readFileSync(join(ROOT, route), 'utf8').match(/export const maxDuration = (\d+)/)?.[1];
        expect(config.maxDuration, route).toBe(own === undefined ? undefined : Number(own));
      }
    }
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cardContentProblem } from '@/lib/db/firestore/cardContent';
import { formerPublicBases, publicBases, storageKeyOf } from './publicUrl';

// "A picture we stored", during a move of the storage to a new host: the
// bucket's keys are served by the new base (R2_PUBLIC_BASE, where uploads go)
// and by the former ones (R2_FORMER_PUBLIC_BASES) alike, and pictures stored
// before the move still name the old host — they are ours all the same.

const NOW = 'https://img.resonance.test';
const BEFORE = 'https://pub-0123.r2.dev';
const KEY = 'image/2026-10/0b9c6a2e-1f43-4c55-9d8e-2a1c3b4d5e6f.avif';

afterEach(() => vi.unstubAllEnvs());

describe('publicBases', () => {
  it('lists the current base first, then the former ones — trimmed, without repeats or the current one', () => {
    const env = { R2_PUBLIC_BASE: `${NOW}/`, R2_FORMER_PUBLIC_BASES: ` ${BEFORE}/ ,,${NOW},https://old.example,${BEFORE}` };
    expect(publicBases(env)).toEqual([NOW, BEFORE, 'https://old.example']);
    expect(formerPublicBases(env)).toEqual([BEFORE, 'https://old.example']);
    expect(publicBases({ R2_PUBLIC_BASE: NOW })).toEqual([NOW]);
    expect(publicBases({})).toEqual([]);
  });
});

describe('storageKeyOf', () => {
  it('finds the same key behind the current host and a former one, from the environment', () => {
    vi.stubEnv('R2_PUBLIC_BASE', NOW);
    vi.stubEnv('R2_FORMER_PUBLIC_BASES', BEFORE);
    expect(storageKeyOf(`${NOW}/${KEY}`)).toBe(KEY);
    expect(storageKeyOf(`${BEFORE}/${KEY}`)).toBe(KEY);
    expect(storageKeyOf(`https://elsewhere.example/${KEY}`)).toBeNull();
    // A host that only starts like ours, or a path that climbs out of the bucket.
    expect(storageKeyOf(`${BEFORE}.evil.example/${KEY}`)).toBeNull();
    expect(storageKeyOf(`${BEFORE}/image/../../secrets/key.png`)).toBeNull();
  });

  it('takes only the bases it is given, when given some', () => {
    vi.stubEnv('R2_FORMER_PUBLIC_BASES', BEFORE);
    expect(storageKeyOf(`${BEFORE}/${KEY}`, NOW)).toBeNull();
    expect(storageKeyOf(`${BEFORE}/${KEY}`, [NOW, `${BEFORE}/`])).toBe(KEY);
    expect(storageKeyOf(`${NOW}/${KEY}`, [])).toBeNull();
  });

  it('knows nothing as ours when no base is configured', () => {
    vi.stubEnv('R2_PUBLIC_BASE', '');
    vi.stubEnv('R2_FORMER_PUBLIC_BASES', '');
    expect(storageKeyOf(`${NOW}/${KEY}`)).toBeNull();
  });
});

describe('a cover the server copies (cardContentProblem)', () => {
  const content = (url: string) => ({ thoughtCore: 'T', story: 'S', tags: [], media: { type: 'image', url } });

  it('takes a cover on the current host or a former one, and refuses one elsewhere', () => {
    vi.stubEnv('R2_PUBLIC_BASE', NOW);
    vi.stubEnv('R2_FORMER_PUBLIC_BASES', BEFORE);
    expect(cardContentProblem(content(`${NOW}/${KEY}`))).toBeNull();
    expect(cardContentProblem(content(`${BEFORE}/${KEY}`))).toBeNull();
    expect(cardContentProblem(content(`https://tracker.example/${KEY}`))).toBe('media');
    // Without the former host listed, a picture there is not ours.
    expect(cardContentProblem(content(`${BEFORE}/${KEY}`), { publicBases: [NOW] })).toBe('media');
    // The card's own cover, kept as it is, wherever it is.
    expect(cardContentProblem(content(`https://tracker.example/${KEY}`), { keptMediaUrl: `https://tracker.example/${KEY}` })).toBeNull();
  });
});

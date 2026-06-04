import { describe, it, expect } from 'vitest';
import { ensureUniqueSlug, slugify } from './slugify';

describe('slugify', () => {
  it('lowercases, hyphenates, and trims to ASCII words', () => {
    expect(slugify('A Quiet Reconciliation')).toBe('a-quiet-reconciliation');
  });

  it('collapses punctuation and runs of separators', () => {
    expect(slugify('  Being  seen --- matters! ')).toBe('being-seen-matters');
  });

  it('strips diacritics rather than dropping the letter', () => {
    expect(slugify('Café au lait')).toBe('cafe-au-lait');
  });

  it('caps the number of words and overall length', () => {
    const slug = slugify('one two three four five six seven eight nine ten');
    expect(slug.split('-')).toHaveLength(8);
  });

  it('returns empty string when nothing survives normalization', () => {
    expect(slugify('—— 中文標題 ——')).toBe('');
  });
});

describe('ensureUniqueSlug', () => {
  const taken = (set: Set<string>) => async (s: string) => set.has(s);

  it('returns the base when it is free', async () => {
    const out = await ensureUniqueSlug('quiet-night', 'mia', taken(new Set()));
    expect(out).toBe('quiet-night');
  });

  it('falls back to base + handle on collision', async () => {
    const out = await ensureUniqueSlug('quiet-night', 'Mia Chen', taken(new Set(['quiet-night'])));
    expect(out).toBe('quiet-night-mia-chen');
  });

  it('appends a number when base + handle also collides', async () => {
    const out = await ensureUniqueSlug(
      'quiet-night',
      'mia',
      taken(new Set(['quiet-night', 'quiet-night-mia'])),
    );
    expect(out).toBe('quiet-night-mia-2');
  });

  it('keeps incrementing until a free slug is found', async () => {
    const out = await ensureUniqueSlug(
      'quiet-night',
      'mia',
      taken(new Set(['quiet-night', 'quiet-night-mia', 'quiet-night-mia-2', 'quiet-night-mia-3'])),
    );
    expect(out).toBe('quiet-night-mia-4');
  });

  it('substitutes a default when the base is empty', async () => {
    const out = await ensureUniqueSlug('', 'mia', taken(new Set()));
    expect(out).toBe('story');
  });
});

import { describe, expect, it } from 'vitest';
import { signImageUrl } from '@/lib/links/imageProxy';
import { GET } from './route';

// The route is public and unauthenticated, so what matters at this level is
// that it is wired to the signature check: nothing it is not signed for is
// fetched, and no answer says why. (The picture itself has its own suite.)

const ask = (search: string) => GET(new Request(`http://localhost/api/link-image${search}`));

describe('GET /api/link-image', () => {
  it('answers a bare 404, cacheable for a moment only, when asked for nothing or for something unsigned', async () => {
    for (const search of ['', '?u=https%3A%2F%2Fexample.com%2Fa.png', `?u=https%3A%2F%2Fexample.com%2Fa.png&s=${'A'.repeat(43)}`, '?s=abc']) {
      const res = await ask(search);
      expect(res.status, search).toBe(404);
      expect(res.headers.get('cache-control')).toBe('public, max-age=300');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(await res.text()).toBe('');
    }
  });

  it('does not reach the private network even for an address it signed itself', async () => {
    for (const target of ['http://169.254.169.254/latest/meta-data/', 'http://127.0.0.1/a.png', 'http://[::1]/a.png']) {
      const res = await ask(`?u=${encodeURIComponent(target)}&s=${signImageUrl(target)}`);
      expect(res.status, target).toBe(404);
      expect(await res.text()).toBe('');
    }
  });
});

import { describe, it, expect, vi } from 'vitest';
import { getCacheControlHeader } from 'next/dist/server/lib/cache-control';

// How long a cached (ISR) page may still be served stale: next.config's
// expireTime against the routes' own `revalidate`, through the header Next
// itself writes for them. The layouts' server reads aren't the subject.
vi.mock('./cardPageData', () => ({ loadCard: vi.fn() }));
vi.mock('@/lib/db/firestore/user', () => ({ FirestoreUserRepository: class {} }));

import nextConfig from '../../../../../../next.config';
import { revalidate as cardRevalidate } from './layout';
import { revalidate as profileRevalidate } from '../../u/[handle]/layout';

const DAY = 86400;

describe('stale ISR HTML', () => {
  it('a card page is served stale for at most a day after it was rendered, not a year', () => {
    expect(nextConfig.expireTime).toBe(DAY);
    expect(getCacheControlHeader({ revalidate: cardRevalidate, expire: nextConfig.expireTime })).toBe(
      `s-maxage=${cardRevalidate}, stale-while-revalidate=${DAY - cardRevalidate}`,
    );
  });

  it("never outlives a route's own backstop: the profile's daily one renders fresh once it is a day old", () => {
    expect(profileRevalidate).toBeLessThanOrEqual(nextConfig.expireTime!);
    expect(getCacheControlHeader({ revalidate: profileRevalidate, expire: nextConfig.expireTime })).toBe(`s-maxage=${profileRevalidate}`);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/lib/db/types';

const findByHandle = vi.fn<(handle: string) => Promise<User | null>>();
vi.mock('@/lib/db/firestore/user', () => ({
  FirestoreUserRepository: class {
    findByHandle = findByHandle;
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string, v?: { handle: string }) => `${key}:${v?.handle ?? ''}`,
}));

import { generateMetadata } from './layout';

afterEach(() => {
  vi.unstubAllEnvs();
  findByHandle.mockReset();
});

const bob = { id: 'u-bob', handle: '小鮑', bio: 'Walks at dawn.', initials: 'B', avatarSeed: '1' } as unknown as User;

describe('a profile’s metadata', () => {
  // A profile is a public page: Safari offers the app, and once installed
  // opens it on this profile (the app opens /u/{handle}).
  it('offers the iOS app, opening it on this profile', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://resonance.example');
    findByHandle.mockResolvedValue(bob);
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'en', handle: encodeURIComponent('小鮑') }) });
    expect(findByHandle).toHaveBeenCalledWith('小鮑');
    expect(meta.itunes).toEqual({
      appId: '6817604797',
      appArgument: `https://resonance.example/en/u/${encodeURIComponent('小鮑')}`,
    });
    expect(meta.title).toBe('shareTitle:小鮑');
  });

  it('offers it on a profile that isn’t there too, with nothing else', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://resonance.example');
    findByHandle.mockResolvedValue(null);
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'zh-TW', handle: 'nobody' }) });
    expect(meta).toEqual({ itunes: { appId: '6817604797', appArgument: 'https://resonance.example/zh-TW/u/nobody' } });
  });
});

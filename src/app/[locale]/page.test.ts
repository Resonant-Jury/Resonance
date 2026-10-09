import { afterEach, describe, expect, it, vi } from 'vitest';

// The landing page's head: only what it adds to the locale layout's.
vi.mock('@/lib/db', () => ({ repos: {} }));
vi.mock('next-intl/server', () => ({ setRequestLocale: vi.fn() }));

import { generateMetadata } from './page';

afterEach(() => vi.unstubAllEnvs());

describe('the landing page’s metadata', () => {
  // A public page: Safari on an iPhone or iPad offers the app (Open, once installed).
  it('offers the iOS app in Safari’s banner', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://resonance.example');
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'zh-TW' }) });
    expect(meta.itunes).toEqual({ appId: '6817604797', appArgument: 'https://resonance.example/zh-TW' });
  });
});

import { describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';

vi.mock('next-intl/server', () => ({
  getMessages: vi.fn(),
  setRequestLocale: vi.fn(),
  getTranslations: async ({ namespace }: { namespace: 'metadata' }) => (key: keyof typeof en.metadata) => en[namespace][key],
}));
vi.mock('@/styles/fonts', () => ({ fontVariables: '' }));

import { generateMetadata } from './layout';

describe('the locale layout’s metadata', () => {
  // <meta name="apple-itunes-app" content="app-id=6817604797">: Safari's Smart App Banner.
  it('offers the iOS app to Safari on every page', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'zh-TW' }) });
    expect(meta.itunes).toEqual({ appId: '6817604797' });
  });
});

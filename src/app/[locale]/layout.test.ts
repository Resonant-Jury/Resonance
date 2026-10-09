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
  // <meta name="apple-itunes-app">, Safari's Smart App Banner, is the public
  // pages' own (the landing page, a card, a profile): not every page's — not
  // the policy pages the apps show in an in-app browser, the sign-in pages or
  // the signed-in app's pages, where it pushes the editor or a thread down.
  it('offers the iOS app on no page by default', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'zh-TW' }) });
    expect(meta.itunes).toBeUndefined();
  });
});

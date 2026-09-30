import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { SWRConfig } from 'swr';
import { Timestamp } from 'firebase-admin/firestore';
import enMessages from '@/messages/en.json';
import { fakeAdminDb, type FakeAdminDb } from '@/../test/fakeAdminDb';
import type { CardSeed } from '@/lib/data/cardSeed';

// The card page's server render — what goes into the cached (ISR) HTML and
// the RSC payload for every reader. The Admin SDK is faked in memory; the
// page is rendered to HTML as the server does it (no viewer, auth unknown).

let fake: FakeAdminDb;
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => fake.db }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => (key === 'anonymousAuthor' ? 'Anonymous' : key),
}));
// The server knows no viewer: auth is still "restoring" in the render.
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => ({ user: null, loading: true }) }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
// Nothing reads from the browser during a server render; the client read
// layer is stubbed only so importing it stays inert.
vi.mock('@/lib/db/firestore/client/reads', () => ({}));
vi.mock('@/lib/db/firestore/client/blocks', () => ({}));

import CardPage from './page';
import { generateMetadata } from './layout';
import { CardDetailClient } from './CardDetailClient';
import { CARD_HOLD_SCRIPT } from './cardHold';

const at = (iso: string) => Timestamp.fromDate(new Date(iso));

const AUTHOR = {
  handle: 'quiet-walker',
  handleLower: 'quiet-walker',
  bio: 'Walks at dawn, writes at dusk.',
  region: 'Taipei',
  verified: true,
  avatarSeed: '4242',
  avatarUrl: 'https://img.example/avatar-quiet-walker.avif',
  initials: 'QW',
  accentColor: 'oklch(88% 0.08 55)',
  phoneHash: 'hash-of-a-phone',
  joinedAt: at('2025-01-01T00:00:00Z'),
};

function card(extra: Record<string, unknown> = {}) {
  return {
    authorId: 'uid-author',
    slug: 'a-quiet-morning',
    thoughtCore: 'A quiet morning',
    story: '## Before the city wakes\n\nThe kettle ticks while the street is still blue.',
    tags: ['dawn'],
    originalLocale: 'en',
    translations: {},
    visibility: 'public',
    publishedAt: at('2026-03-01T23:30:00Z'),
    readCount: 3,
    resonanceCount: 1,
    inviteCount: 0,
    signature: { coreInsight: 'Mornings belong to no one.', insightScore: 0.8 },
    ...extra,
  };
}

async function renderPage(slug: string) {
  const element = (await CardPage({ params: Promise.resolve({ locale: 'en', slug }) })) as ReactElement<{
    children: ReactNode[];
  }>;
  const [script, client] = element.props.children as [ReactElement | false | null, ReactElement<{ seed: CardSeed | null }>];
  const html = renderToString(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
      <SWRConfig value={{ provider: () => new Map() }}>{element}</SWRConfig>
    </NextIntlClientProvider>,
  );
  // What the RSC payload carries for the page: the client component's props.
  return { html, seed: client.props.seed, payload: JSON.stringify(client.props), script, client };
}

beforeEach(() => {
  fake = fakeAdminDb({
    'users/uid-author': AUTHOR,
    'cards/pub1': card(),
    'cards/anon1': card({ slug: 'unsigned-letter', thoughtCore: 'An unsigned letter', story: 'Nobody needs to know who wrote this.', anonymous: true }),
    'cards/priv1': card({ slug: 'my-own-diary', thoughtCore: 'Diary', story: 'Only for me, this one.', visibility: 'private' }),
    'cards/conn1': card({ slug: 'for-friends', thoughtCore: 'For friends', story: 'Just between us.', visibility: 'connections' }),
    'cards/draft1': card({ slug: 'half-written', thoughtCore: 'Half written', story: 'Still drafting this.', publishedAt: null }),
  });
});

describe('card page server render', () => {
  it("renders a public card's story into the HTML, with the id and the story handed to the browser", async () => {
    const { html, seed, client, script } = await renderPage('a-quiet-morning');

    expect(html).toContain('A quiet morning');
    expect(html).toContain('The kettle ticks while the street is still blue.');
    expect(html).toContain('Before the city wakes');
    expect(html).toContain('quiet-walker');
    // Nothing waits for the browser: no skeleton, no not-found.
    expect(html).not.toContain("This card can't be found");

    // The browser starts from this (SWR fallbackData) and never asks the
    // server to resolve the slug: the id is in hand.
    expect(client.type).toBe(CardDetailClient);
    expect(seed?.id).toBe('pub1');
    expect(seed?.view?.card.story).toBe(card().story);
    expect(seed?.view?.author?.handle).toBe('quiet-walker');

    // The content is marked for holding, and the pre-paint script is there to
    // hold it in a signed-in browser until the reader's blocks are known.
    expect(html).toContain('data-card-hold=""');
    expect(script && (script.props as { dangerouslySetInnerHTML: { __html: string } }).dangerouslySetInnerHTML.__html).toBe(
      CARD_HOLD_SCRIPT,
    );
  });

  it('hands over a whitelist, not documents: nothing a profile or card keeps privately', async () => {
    const { payload } = await renderPage('a-quiet-morning');
    expect(payload).not.toContain('hash-of-a-phone');
    expect(payload).not.toContain('Mornings belong to no one.');
    expect(payload).not.toContain('insightScore');
    expect(payload).not.toContain('readCount');
  });

  it("never serialises an anonymous card's author — not in the HTML, not in the payload", async () => {
    const { html, payload, seed } = await renderPage('unsigned-letter');

    expect(html).toContain('Nobody needs to know who wrote this.');
    expect(html).toContain('Anonymous');
    for (const secret of ['uid-author', 'quiet-walker', 'Walks at dawn', 'avatar-quiet-walker', '4242', 'QW']) {
      expect(html).not.toContain(secret);
      expect(payload).not.toContain(secret);
    }
    expect(seed?.view?.author).toBeNull();
    expect(seed?.view?.card.authorId).toBe('');
    // The server never even read the profile.
    expect(fake.reads).not.toContain('users/uid-author');

    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'en', slug: 'unsigned-letter' }) });
    expect(JSON.stringify(meta)).not.toContain('quiet-walker');
    expect((meta.openGraph as { authors?: unknown }).authors).toBeUndefined();
  });

  it.each([
    ['a private card', 'my-own-diary', 'priv1', 'Only for me, this one.'],
    ['a connections-only card', 'for-friends', 'conn1', 'Just between us.'],
    ['a draft (even one marked public)', 'draft1', 'draft1', 'Still drafting this.'],
  ])('keeps %s out of the HTML: only its id goes to the browser, which reads it as the viewer', async (_, key, id, story) => {
    const { html, seed, payload, script } = await renderPage(key);
    expect(seed).toEqual({ id, view: null });
    expect(html).not.toContain(story);
    expect(payload).not.toContain(story);
    expect(html).not.toContain('quiet-walker');
    expect(script).toBeFalsy();
    // Nor in the share metadata.
    expect(await generateMetadata({ params: Promise.resolve({ locale: 'en', slug: key }) })).toEqual({});
  });

  it('says there is no card for a URL that names none, and nothing when the server read fails', async () => {
    expect((await renderPage('never-was')).seed).toEqual({ id: null, view: null });

    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    fake.db.collection = () => {
      throw new Error('firestore down');
    };
    const { seed, html } = await renderPage('a-quiet-morning');
    // null: the browser resolves the URL itself, as before the server read.
    expect(seed).toBeNull();
    expect(html).not.toContain("This card can't be found");
    error.mockRestore();
  });

  it("gives the page's <head> the public card's share metadata from the same read", async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'en', slug: 'a-quiet-morning' }) });
    expect(meta.title).toBe('A quiet morning');
    expect(meta.openGraph).toMatchObject({ authors: ['quiet-walker'] });
  });
});

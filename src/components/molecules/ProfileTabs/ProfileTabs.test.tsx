// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl, screen, userEvent } from '@/../test/render';
import type { Card, User } from '@/lib/db/types';

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'me' }, loading: false }),
}));
// next-intl's Link / useRouter need routing config we don't stand up here.
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
  useRouter: () => ({ push: vi.fn() }),
}));
// The owner's「⋯」menu talks to Firestore; it isn't what's under test.
vi.mock('@/components/molecules/CardActionsMenu/CardActionsMenu', () => ({
  CardActionsMenu: () => null,
}));

import { ProfileTabs } from './ProfileTabs';

// jsdom has no layout, and the hand-drawn shapes only draw once their box has
// a size — give every element one so the svgs render.
const proto = HTMLElement.prototype;
const offW = Object.getOwnPropertyDescriptor(proto, 'offsetWidth');
const offH = Object.getOwnPropertyDescriptor(proto, 'offsetHeight');
beforeEach(() => {
  Object.defineProperty(proto, 'offsetWidth', { configurable: true, get: () => 90 });
  Object.defineProperty(proto, 'offsetHeight', { configurable: true, get: () => 24 });
});
afterEach(() => {
  if (offW) Object.defineProperty(proto, 'offsetWidth', offW);
  if (offH) Object.defineProperty(proto, 'offsetHeight', offH);
});

function card(id: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    authorId: 'me',
    slug: id,
    thoughtCore: `Thought ${id}`,
    story: 'a story body',
    tags: [],
    originalLocale: 'en',
    translations: {},
    visibility: 'public',
    publishedAt: new Date('2026-01-01'),
    readCount: 0,
    resonanceCount: 0,
    inviteCount: 0,
    ...overrides,
  };
}

const me = {
  id: 'me',
  handle: '@me',
  initials: 'ME',
  avatarSeed: '1',
  accentColor: 'var(--accent)',
} as unknown as User;

/** Pen-stroked paths among the hand-drawn shapes drawn directly beside `el`'s content. */
function strokedShapePaths(wrapper: Element) {
  return Array.from(wrapper.children)
    .filter((c) => c.tagName.toLowerCase() === 'svg')
    .flatMap((svg) => Array.from(svg.querySelectorAll('path[stroke]')));
}

describe('ProfileTabs — the card box shelves', () => {
  it('washes the selected shelf tab without an outline, and moves the wash as the viewer switches', async () => {
    renderWithIntl(
      <ProfileTabs
        manageable
        loading
        tabs={['published', 'private', 'draft']}
      />,
    );

    const published = screen.getByRole('tab', { name: 'Published' });
    expect(published).toHaveAttribute('aria-selected', 'true');
    const washWrapper = published.parentElement!.parentElement!;
    expect(washWrapper.querySelectorAll(':scope > svg path[fill]')).toHaveLength(1);
    expect(strokedShapePaths(washWrapper)).toHaveLength(0);

    await userEvent.click(screen.getByRole('tab', { name: 'Private' }));
    expect(screen.getByRole('tab', { name: 'Private' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Published' }).parentElement).toBe(
      screen.getByRole('tablist'),
    );
    const moved = screen.getByRole('tab', { name: 'Private' }).parentElement!.parentElement!;
    expect(strokedShapePaths(moved)).toHaveLength(0);
  });

  it('draws the tags on a shelf card as bare fills, and the owner-only anonymous badge with its rim', () => {
    renderWithIntl(
      <ProfileTabs
        manageable
        tabs={['published']}
        authors={{ me }}
        data={{
          published: [
            card('a', { tags: ['tea', 'rest'] }),
            card('b', { anonymous: true, tags: ['quiet'] }),
          ],
        }}
      />,
    );

    const pillOf = (label: string) => screen.getByText(label).parentElement as HTMLElement;
    for (const label of ['tea', 'rest', 'quiet', 'Anonymous']) {
      // Every pill has its own shape (a fill) …
      expect(pillOf(label).querySelectorAll(':scope > svg path[fill]').length).toBeGreaterThan(0);
    }
    // … tags are data inside a framed card, so nothing is stroked round them …
    for (const label of ['tea', 'rest', 'quiet']) {
      expect(strokedShapePaths(pillOf(label))).toHaveLength(0);
    }
    // … but the badge sits on the bare page, cream-dark on cream, and keeps its rim.
    expect(strokedShapePaths(pillOf('Anonymous'))).toHaveLength(1);
  });
});

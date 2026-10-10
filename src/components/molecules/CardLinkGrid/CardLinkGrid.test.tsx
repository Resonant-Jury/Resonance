// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderWithIntl, act } from '@/../test/render';
import type { Card } from '@/lib/db/types';
import { CARD_HUES } from '@/lib/design/dominantHue';
import { cardPalettes } from '@/lib/design/cardColours';
import { CardLinkGrid } from './CardLinkGrid';
import { MiniCardGrid } from '@/components/molecules/MiniStoryCard/MiniCardGrid';

// B3: every card list colours its cards by the one shared rule (cardPalettes):
// a card never wears the family of any of the three before it, whatever its
// cover says — so neighbours differ in one column and in rows of two or three.

vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

function card(id: string, accentHue?: number): Card {
  return {
    id,
    authorId: 'a',
    thoughtCore: `Card ${id}`,
    story: 'story',
    tags: [],
    originalLocale: 'en',
    translations: {},
    visibility: 'public',
    publishedAt: new Date('2026-01-01'),
    readCount: 0,
    resonanceCount: 0,
    inviteCount: 0,
    anonymous: true,
    accentHue,
  };
}

/** The hue each drawn card wears, read from its paper (`--card-interior: oklch(97.5% 0.012 <hue>)`). */
function wornHues(container: HTMLElement): number[] {
  return Array.from(container.querySelectorAll('article')).map((el) => {
    const paper = (el as HTMLElement).style.getPropertyValue('--card-interior');
    return Number(paper.match(/([\d.]+)\)$/)![1]);
  });
}

// Six covers of one green, then two of one peach: by their covers alone all
// six would be green, side by side.
const hues = [140, 140, 140, 140, 140, 140, 55, 55];

describe('card lists never put one colour beside itself', () => {
  it('colours the grid by the shared rule, so no card wears the family of the three before it', () => {
    const cards = hues.map((h, i) => card(`c${i}`, h));
    const { container } = renderWithIntl(<CardLinkGrid cards={cards} authors={{}} />);
    // Sorted by the cards' order (the client grid lays them out column by column).
    const byId = new Map(
      Array.from(container.querySelectorAll('a')).map((a, k) => [a.getAttribute('href'), wornHues(container)[k]]),
    );
    const worn = cards.map((c) => byId.get(`/card/${c.id}`)!);
    expect(worn).toEqual(cardPalettes(hues).map((p) => CARD_HUES[p]));
    // The cover's family stays the first card's preference.
    expect(worn[0]).toBe(140);
    for (let i = 1; i < worn.length; i++) {
      for (let j = Math.max(0, i - 3); j < i; j++) expect(worn[i]).not.toBe(worn[j]);
    }
  });

  it('keeps the colours already shown when a page is appended', () => {
    const first = hues.slice(0, 4).map((h, i) => card(`c${i}`, h));
    const all = hues.map((h, i) => card(`c${i}`, h));
    const { container, rerender } = renderWithIntl(<CardLinkGrid cards={first} authors={{}} />);
    const before = new Map(Array.from(container.querySelectorAll('a')).map((a, k) => [a.getAttribute('href'), wornHues(container)[k]]));
    act(() => rerender(<CardLinkGrid cards={all} authors={{}} />));
    const after = new Map(Array.from(container.querySelectorAll('a')).map((a, k) => [a.getAttribute('href'), wornHues(container)[k]]));
    for (const [href, hue] of before) expect(after.get(href)).toBe(hue);
  });

  it('colours the mini cards (resonances, linked cards) by the same rule', () => {
    const cards = hues.map((h, i) => card(`m${i}`, h));
    const { container } = renderWithIntl(<MiniCardGrid cards={cards} authors={{}} />);
    const worn = Array.from(container.querySelectorAll('article')).map((el) => {
      // A card with no picture shows its family's wash instead: oklch(90% 0.06 <hue>).
      return Number(el.outerHTML.match(/oklch\(90% 0\.06 ([\d.]+)\)/)![1]);
    });
    expect(worn).toEqual(cardPalettes(hues).map((p) => CARD_HUES[p]));
  });
});

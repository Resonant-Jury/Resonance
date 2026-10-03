// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import useSWR, { SWRConfig } from 'swr';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'me' }, loading: false }),
}));

import { cardKey } from './cardPrefill';
import { resonanceKeys, useResonanceRefresh } from './resonate';

describe('resonanceKeys', () => {
  it('names the original’s button and page, the card’s page under its id and its slug, the two shelves and the map', () => {
    expect(resonanceKeys('me', 'orig', { id: 'c1', slug: 'a-walk' })).toEqual([
      'myResonance:orig:me',
      'cardPage:orig:me',
      'cardPage:c1:me',
      cardKey('c1', 'me'),
      cardKey('a-walk', 'me'),
      'cardbox:me:published',
      'cardbox:me:resonated',
      'thoughtmap:me',
    ]);
  });

  it('names the card once when it has no slug of its own', () => {
    const keys = resonanceKeys('me', 'orig', { id: 'c1' });
    expect(keys.filter((k) => k.startsWith('card:'))).toEqual([cardKey('c1', 'me')]);
  });
});

describe('useResonanceRefresh', () => {
  it('reads again what this viewer holds of the link, and nothing of anyone else’s', async () => {
    const reads = {
      button: vi.fn(async () => null),
      page: vi.fn(async () => ({})),
      bySlug: vi.fn(async () => ({})),
      shelf: vi.fn(async () => []),
      someoneElses: vi.fn(async () => []),
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
    );
    const { result } = renderHook(
      () => {
        useSWR('myResonance:orig:me', reads.button);
        useSWR('cardPage:c1:me', reads.page);
        useSWR(cardKey('a-walk', 'me'), reads.bySlug);
        useSWR('cardbox:me:resonated', reads.shelf);
        useSWR('cardbox:other:resonated', reads.someoneElses);
        return useResonanceRefresh();
      },
      { wrapper },
    );
    await waitFor(() => expect(reads.shelf).toHaveBeenCalledTimes(1));

    act(() => result.current('orig', { id: 'c1', slug: 'a-walk' }));

    await waitFor(() => expect(reads.button).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(reads.page).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(reads.bySlug).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(reads.shelf).toHaveBeenCalledTimes(2));
    expect(reads.someoneElses).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import useSWR, { SWRConfig } from 'swr';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'me' }, loading: false }),
}));

import { cardKey } from './cardPrefill';
import { dependsOnConnections, resonanceKeys, useConnectionRefresh, useResonanceRefresh } from './resonate';

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

  // Resonating can connect the two authors, and taking it back can end that.
  it('reads again what turns on the viewer’s connections, each key once', async () => {
    const reads = { connected: vi.fn(async () => true), conversation: vi.fn(async () => null), page: vi.fn(async () => ({})) };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
    );
    const { result } = renderHook(
      () => {
        useSWR('connected:bob_me', reads.connected);
        useSWR('conversation:bob_me', reads.conversation);
        // Named by the resonance and turning on connections both: read again once, not twice.
        useSWR('cardPage:orig:me', reads.page);
        return useResonanceRefresh();
      },
      { wrapper },
    );
    await waitFor(() => expect(reads.page).toHaveBeenCalledTimes(1));

    act(() => result.current('orig', { id: 'c1' }));

    await waitFor(() => expect(reads.connected).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(reads.conversation).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(reads.page).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 20));
    expect(reads.page).toHaveBeenCalledTimes(2);
  });
});

describe('dependsOnConnections', () => {
  const depends = dependsOnConnections('me');

  it('takes whether the viewer is connected with someone, their threads, their people, their shelves and what a connection lets them read', () => {
    for (const key of [
      'connected:bob_me',
      'conversation:bob_me',
      'conversations:me',
      'cardbox:me:bookmarks',
      'cardbox:me:published',
      'relation:bob:me',
      'profilePage:bob:me',
      'cardPage:c9:me',
      cardKey('a-walk', 'me'),
    ]) {
      expect(depends(key), key).toBe(true);
    }
  });

  it('leaves what is the same whoever reads it, and what another viewer holds', () => {
    for (const key of [
      'conversations:bob',
      'cardbox:bob:published',
      'profilePage:bob:carol',
      'cardPage:c9:bob',
      cardKey('a-walk', undefined),
      'person:bob',
      'related:c9',
      'blocks:me',
      ['feed:latest', 'me', null],
      undefined,
    ]) {
      expect(depends(key), String(key)).toBe(false);
    }
  });
});

describe('useConnectionRefresh', () => {
  it('reads again what turns on the viewer’s connections, and what the caller adds, in one pass', async () => {
    const reads = {
      connected: vi.fn(async () => true),
      people: vi.fn(async () => []),
      ownProfile: vi.fn(async () => []),
      someoneElses: vi.fn(async () => []),
      unrelated: vi.fn(async () => null),
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
    );
    const { result } = renderHook(
      () => {
        useSWR('connected:bob_me', reads.connected);
        useSWR('conversations:me', reads.people);
        useSWR('profileCards:me', reads.ownProfile);
        useSWR('cardbox:other:published', reads.someoneElses);
        useSWR('related:c9', reads.unrelated);
        return useConnectionRefresh();
      },
      { wrapper },
    );
    await waitFor(() => expect(reads.unrelated).toHaveBeenCalledTimes(1));

    act(() => result.current((key) => key === 'profileCards:me'));

    await waitFor(() => expect(reads.connected).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(reads.people).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(reads.ownProfile).toHaveBeenCalledTimes(2));
    expect(reads.someoneElses).toHaveBeenCalledTimes(1);
    expect(reads.unrelated).toHaveBeenCalledTimes(1);
  });
});

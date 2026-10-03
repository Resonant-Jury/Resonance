import { describe, it, expect } from 'vitest';
import type { Message } from '@/lib/db/types';
import { messageCard, resonanceCardKey, threadCardKeys } from './cardLink';

const msg = (text: string, extra: Partial<Message> = {}): Message => ({
  id: 'm',
  senderId: 'alice',
  text,
  sentAt: new Date(0),
  ...extra,
});

describe('resonanceCardKey', () => {
  it('reads the card from a card page on any of our hosts, under a locale or not', () => {
    expect(resonanceCardKey('https://resonance.channel/zh-TW/card/rich-story', [])).toBe('rich-story');
    expect(resonanceCardKey('https://www.resonance.channel/en/card/rich-story/', [])).toBe('rich-story');
    expect(resonanceCardKey('https://resonance-world.vercel.app/card/AbC_123?ref=x#top', [])).toBe('AbC_123');
    expect(resonanceCardKey('https://RESONANCE.CHANNEL/card/a', [])).toBe('a');
  });

  it('takes another host only when told to (the page’s own, in emulator builds)', () => {
    expect(resonanceCardKey('https://example.com/card/a', [])).toBeNull();
    expect(resonanceCardKey('https://preview.example.com/card/a', ['preview.example.com'])).toBe('a');
  });

  it('takes nothing that only looks like one of ours', () => {
    for (const url of [
      'https://resonance.channel.evil.com/card/a',
      'https://evilresonance.channel/card/a',
      'https://resonance.channel@evil.com/card/a',
      'https://user@resonance.channel/card/a',
      'javascript://resonance.channel/card/a',
      'https://resonance.channel/fr/card/a',
      'https://resonance.channel/card/a/edit',
      'https://resonance.channel/u/a',
      'https://resonance.channel/card/',
      'https://resonance.channel/card/a%2Fb',
      'https://resonance.channel/card/%E4%B8%AD',
      'not a url',
    ]) {
      expect(resonanceCardKey(url, []), url).toBeNull();
    }
  });
});

describe('messageCard', () => {
  it('is the shared card of a message that carries one', () => {
    expect(messageCard(msg('', { cardRef: 'c1' }), [])).toEqual({ key: 'c1', via: 'cardRef' });
  });

  it('is the card a message’s link leads to, and says when the link is all there is', () => {
    expect(messageCard(msg('https://resonance.channel/zh-TW/card/rich-story'), [])).toEqual({
      key: 'rich-story',
      via: 'link',
      url: 'https://resonance.channel/zh-TW/card/rich-story',
      linkOnly: true,
    });
    expect(messageCard(msg('讀讀這篇 https://resonance.channel/card/walk 很棒'), [])).toMatchObject({
      key: 'walk',
      linkOnly: false,
    });
  });

  it('goes by the link the server previewed', () => {
    expect(
      messageCard(msg('look', { preview: { url: 'https://resonance.channel/en/card/walk', title: 'A walk' } }), []),
    ).toMatchObject({ key: 'walk', via: 'link' });
  });

  it('is no card for any other link, or none', () => {
    expect(messageCard(msg('https://example.com/card/walk'), [])).toBeNull();
    expect(messageCard(msg('just words'), [])).toBeNull();
    // Only the first link counts: it is the one previewed.
    expect(messageCard(msg('https://example.com/x then https://resonance.channel/card/walk'), [])).toBeNull();
  });
});

describe('threadCardKeys', () => {
  it('lists each card a thread is about once, in thread order', () => {
    expect(
      threadCardKeys(
        [
          msg('', { cardRef: 'c2' }),
          msg('https://resonance.channel/card/walk'),
          msg('', { cardRef: 'c2' }),
          msg('hello'),
          msg('https://resonance.channel/zh-TW/card/c1'),
        ],
        [],
      ),
    ).toEqual(['c2', 'walk', 'c1']);
  });
});

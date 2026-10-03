import { describe, it, expect } from 'vitest';
import { linkify, firstLinkOf, parseLink } from './linkify';

const links = (text: string) =>
  linkify(text).flatMap((s) => (s.type === 'link' ? [s] : []));

describe('linkify', () => {
  it('finds http(s) and www links and keeps the surrounding text', () => {
    const segs = linkify('see https://example.com/a?b=1 and www.example.org now');
    expect(segs.map((s) => s.type)).toEqual(['text', 'link', 'text', 'link', 'text']);
    expect(links('see https://example.com/a?b=1 and www.example.org now').map((l) => l.url)).toEqual([
      'https://example.com/a?b=1',
      'https://www.example.org/',
    ]);
  });

  it('leaves trailing punctuation, CJK punctuation and an unbalanced paren out of the link', () => {
    expect(links('看這個 https://example.com/x。')[0].text).toBe('https://example.com/x');
    expect(links('(https://example.com/x)')[0].text).toBe('https://example.com/x');
    expect(links('https://en.wikipedia.org/wiki/A_(b) ok')[0].text).toBe('https://en.wikipedia.org/wiki/A_(b)');
    expect(links('go to https://example.com!?')[0].text).toBe('https://example.com');
  });

  it('ends a link where Chinese text starts', () => {
    const [l] = links('https://example.com/p很好看');
    expect(l.text).toBe('https://example.com/p');
  });

  it('never links other schemes', () => {
    expect(links('javascript:alert(1) data:text/html,hi file:///etc/passwd ftp://example.com')).toEqual([]);
    expect(links('click [x](javascript:alert(1))')).toEqual([]);
  });

  it('refuses addresses with a user name, an odd port, no dot, or too long', () => {
    expect(links('http://user@example.com/')).toEqual([]);
    expect(links('https://bank.com@evil.com/login')).toEqual([]);
    expect(links('http://user:pw@example.com/')).toEqual([]);
    expect(links('https://example.com:8443/')).toEqual([]);
    expect(links('http://localhost/')).toEqual([]);
    expect(links(`https://example.com/${'a'.repeat(2100)}`)).toEqual([]);
    expect(links('https://example.com:443/ok')[0].url).toBe('https://example.com/ok');
  });

  it('flags IP addresses and punycode hosts as suspicious, and names as not', () => {
    expect(links('http://192.168.0.1/admin')[0].suspicious).toBe(true);
    expect(links('http://2130706433.example.com/')[0].suspicious).toBe(false);
    expect(links('https://xn--pple-43d.com/')[0].suspicious).toBe(true);
    expect(links('https://аpple.com/')).toEqual([]); // non-ASCII ends the candidate; no dot left to link
    expect(links('https://example.com/')[0].suspicious).toBe(false);
  });

  it('does not start a link in the middle of a word or address', () => {
    expect(links('foowww.example.com')).toEqual([]);
    expect(links('me@www.example.com')).toEqual([]);
  });

  it('firstLinkOf returns the first link only', () => {
    expect(firstLinkOf('a https://one.com b https://two.com')?.url).toBe('https://one.com/');
    expect(firstLinkOf('nothing here')).toBeNull();
  });

  it('parseLink returns the normalized href', () => {
    expect(parseLink('HTTPS://Example.COM/A')?.url).toBe('https://example.com/A');
  });
});

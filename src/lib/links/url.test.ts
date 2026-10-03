import { describe, expect, it } from 'vitest';
import { LINK_MAX_LENGTH, findLinks, firstLink, normalizeLink } from './url';

// The rules every linkifier mirrors: what in a message is a link, and which
// links the server will follow. The cases double as the shared fixture list
// for the Android, iOS and web twins.

const urls = (text: string) => findLinks(text).map((l) => l.url);
const written = (text: string) => findLinks(text).map((l) => text.slice(l.start, l.end));

describe('where a link starts and ends', () => {
  it('finds http, https and www links, and makes a www link https', () => {
    expect(urls('see http://a.com/x and https://b.org?q=1 or www.c.net/p')).toEqual([
      'http://a.com/x',
      'https://b.org/?q=1',
      'https://www.c.net/p',
    ]);
  });

  it('reads the scheme in any case', () => {
    expect(urls('HTTPS://Example.COM/Path')).toEqual(['https://example.com/Path']);
    expect(urls('WWW.Example.com')).toEqual(['https://www.example.com/']);
  });

  it('gives back where the words are, as UTF-16 offsets', () => {
    const text = '😀 look: https://a.com/x.';
    const [link] = findLinks(text);
    expect(text.slice(link.start, link.end)).toBe('https://a.com/x');
  });

  it('trims sentence punctuation, ASCII and CJK', () => {
    expect(written('go to https://a.com/x, then')).toEqual(['https://a.com/x']);
    expect(written('really? https://a.com/x?!')).toEqual(['https://a.com/x']);
    expect(written('https://a.com/x...')).toEqual(['https://a.com/x']);
    expect(written('看這個https://a.com/x，很棒')).toEqual(['https://a.com/x']);
    for (const mark of ['。', '！', '？', '、', '）', '」', '』', '】', '》', '；', '：']) {
      expect(written(`https://a.com/x${mark}`)).toEqual(['https://a.com/x']);
    }
    expect(written('*https://a.com/x*')).toEqual(['https://a.com/x']);
    expect(written('好看https://a.com/x~~')).toEqual(['https://a.com/x']);
  });

  it('drops a closing bracket only when nothing in the link opened it', () => {
    expect(written('(see https://a.com/x)')).toEqual(['https://a.com/x']);
    expect(written('https://en.wikipedia.org/wiki/Rust_(language)')).toEqual(['https://en.wikipedia.org/wiki/Rust_(language)']);
    expect(written('(https://en.wikipedia.org/wiki/Rust_(language))')).toEqual(['https://en.wikipedia.org/wiki/Rust_(language)']);
    expect(written('[https://a.com/x]')).toEqual(['https://a.com/x']);
    expect(written('{https://a.com/x}')).toEqual(['https://a.com/x']);
  });

  it('stops at white space, angle brackets and quotes', () => {
    expect(written('<https://a.com/x>')).toEqual(['https://a.com/x']);
    expect(written('"https://a.com/x"')).toEqual(['https://a.com/x']);
    expect(written('https://a.com/x\nhttps://b.com/y')).toEqual(['https://a.com/x', 'https://b.com/y']);
    expect(written('https://a.com/x\u3000https://b.com/y')).toEqual(['https://a.com/x', 'https://b.com/y']);
    expect(written('“https://a.com/x”')).toEqual(['https://a.com/x']);
  });

  it('stops at an emoji or arrow stuck to the link', () => {
    expect(written('https://a.com/x😂')).toEqual(['https://a.com/x']);
    expect(written('https://a.com/x→next')).toEqual(['https://a.com/x']);
  });

  it('keeps CJK letters in a path, but not after the host', () => {
    expect(urls('https://zh.wikipedia.org/wiki/中文')).toEqual(['https://zh.wikipedia.org/wiki/%E4%B8%AD%E6%96%87']);
    expect(written('https://example.com很棒')).toEqual(['https://example.com']);
    expect(urls('https://example.com很棒')).toEqual(['https://example.com/']);
    expect(written('www.example.com網址')).toEqual(['www.example.com']);
  });

  it('is not fooled by what stands before it', () => {
    expect(urls('xhttps://a.com')).toEqual([]);
    expect(urls('foo.www.example.com')).toEqual([]);
    expect(urls('a@www.example.com')).toEqual([]);
    expect(urls('//https://a.com')).toEqual([]);
    expect(urls('網址:www.example.com')).toEqual(['https://www.example.com/']);
    expect(urls('網址：https://a.com')).toEqual(['https://a.com/']);
  });

  it('counts a link inside another link\'s query as part of it', () => {
    expect(urls('https://a.com/r?u=https://b.com/x')).toEqual(['https://a.com/r?u=https://b.com/x']);
  });

  it('finds nothing in text without a link', () => {
    expect(findLinks('')).toEqual([]);
    expect(findLinks('hello.world and www and http://')).toEqual([]);
    expect(firstLink('no links here, just example.com')).toBeNull();
  });
});

describe('what is not a link', () => {
  it.each([
    ['javascript:alert(1)'],
    ['ftp://a.com/file'],
    ['file:///etc/passwd'],
    ['data:text/html,<script>alert(1)</script>'],
    ['mailto:a@b.com'],
    ['intent://scan/#Intent;scheme=zxing;end'],
  ])('%s is none', (text) => {
    expect(urls(text)).toEqual([]);
  });

  it('refuses a user name or password, the phishing trick', () => {
    expect(urls('https://google.com@evil.example/')).toEqual([]);
    expect(urls('http://user:pass@a.com/')).toEqual([]);
    expect(urls('http://@a.com/')).toEqual([]);
    // A backslash ends the link: browsers read it as a slash, so the host is a.com and nothing after it is part of the link.
    expect(written('https://a.com\\@evil.example/')).toEqual(['https://a.com']);
    // An @ later on is just part of the path.
    expect(urls('https://a.com/@user')).toEqual(['https://a.com/@user']);
  });

  it('refuses a host in non-ASCII letters (the homograph trick) but takes its punycode', () => {
    expect(urls('https://аррӏе.com/')).toEqual([]);
    expect(urls('https://例子.測試/')).toEqual([]);
    expect(urls('https://xn--80ak6aa92e.com/')).toEqual(['https://xn--80ak6aa92e.com/']);
  });

  it('refuses ports other than none, 80 and 443', () => {
    expect(urls('http://a.com:8080/')).toEqual([]);
    expect(urls('https://a.com:22/')).toEqual([]);
    expect(urls('http://a.com:80/')).toEqual(['http://a.com/']);
    expect(urls('https://a.com:443/x')).toEqual(['https://a.com/x']);
    expect(urls('https://a.com:80/x')).toEqual(['https://a.com:80/x']);
  });

  it('refuses a host with no dot: single names and IPv6 literals', () => {
    expect(urls('http://localhost/')).toEqual([]);
    expect(urls('http://intranet/wiki')).toEqual([]);
    expect(urls('http://[::1]/')).toEqual([]);
    expect(urls('http://[::ffff:127.0.0.1]/')).toEqual([]);
    expect(urls('http://localhost./')).toEqual([]);
    expect(urls('http://a..com/')).toEqual([]);
  });

  it('is longer than 2048 characters, written or normalized', () => {
    const long = `https://a.com/${'x'.repeat(LINK_MAX_LENGTH)}`;
    expect(urls(long)).toEqual([]);
    expect(urls(`https://a.com/${'x'.repeat(LINK_MAX_LENGTH - 15)}`)).toHaveLength(1);
    // Short as written, long once every character is percent-encoded.
    expect(urls(`https://a.com/${'中'.repeat(700)}`)).toEqual([]);
  });

  it('skips a refused link and still finds the next good one', () => {
    expect(firstLink('http://localhost/ and https://good.example/x')).toBe('https://good.example/x');
    expect(firstLink('http://user@evil.example http://also-evil:8080/ www.fine.example')).toBe('https://www.fine.example/');
  });
});

describe('normalizing', () => {
  it('turns the tricks for writing an address into the plain one', () => {
    // Not hidden by new URL: each of these IS 127.0.0.1 afterwards, which is what the fetcher then refuses.
    expect(normalizeLink('http://2130706433/')).toBe('http://127.0.0.1/');
    expect(normalizeLink('http://0x7f.1/')).toBe('http://127.0.0.1/');
    expect(normalizeLink('http://127.1/')).toBe('http://127.0.0.1/');
    expect(normalizeLink('http://0177.0.0.1/')).toBe('http://127.0.0.1/');
    expect(normalizeLink('http://１２７.０.０.１/')).toBe('http://127.0.0.1/');
    expect(normalizeLink('http://017700000001/')).toBe('http://127.0.0.1/');
  });

  it('lower-cases the host and keeps the path as written', () => {
    expect(normalizeLink('https://EXAMPLE.com/Path?Q=1#Frag')).toBe('https://example.com/Path?Q=1#Frag');
  });

  it('refuses control characters, white space, backslashes and other schemes outright', () => {
    expect(normalizeLink('https://a.com/\u0000x')).toBeNull();
    expect(normalizeLink('https://a.com/x y')).toBeNull();
    expect(normalizeLink('https://a.com/\tx')).toBeNull();
    expect(normalizeLink('htt\tps://a.com/')).toBeNull();
    expect(normalizeLink('https://a.com/a\\b')).toBeNull();
    expect(normalizeLink('//a.com/x')).toBeNull();
    expect(normalizeLink('/relative')).toBeNull();
    expect(normalizeLink('')).toBeNull();
    expect(normalizeLink('https://')).toBeNull();
    expect(normalizeLink('https://1.2.3.4.5/')).toBeNull();
  });

  it('can be told to allow any port, for the fetcher tests', () => {
    expect(normalizeLink('http://a.com:3456/', { anyPort: true })).toBe('http://a.com:3456/');
  });
});

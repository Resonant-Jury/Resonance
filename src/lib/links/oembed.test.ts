import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyImageSignature } from './imageProxy';
import { YOUTUBE_OEMBED, parseYouTubeOEmbed, youTubeOEmbedUrl, youTubeThumbnail, youTubeVideoId } from './oembed';

// Which links are YouTube videos (and so are previewed from YouTube's oEmbed
// answer rather than its page, whose head is too big to read), what request
// that makes, and what is kept of the answer. The fetch itself is
// safeFetch's JSON mode (safeFetch.test.ts); the whole unfurl is preview.test.ts.

const ID = 'dQw4w9WgXcQ';

afterEach(() => vi.restoreAllMocks());

describe('youTubeVideoId', () => {
  it('finds the video on every host and path YouTube plays one from', () => {
    for (const link of [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtube.com/watch?v=${ID}&t=42s&list=PL123`,
      `https://m.youtube.com/watch?feature=share&v=${ID}`,
      `https://music.youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}`,
      `https://youtu.be/${ID}?si=AbCdEf123`,
      `http://youtu.be/${ID}/`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/live/${ID}?feature=shared`,
      `https://www.youtube.com/embed/${ID}`,
      `https://WWW.YouTube.com/watch?v=${ID}`,
      `www.youtube.com/watch?v=${ID}`,
    ]) {
      expect(youTubeVideoId(link), link).toBe(ID);
    }
  });

  it('is nothing for anything that is not plainly a video on YouTube', () => {
    for (const link of [
      `https://www.youtube.com.evil.example/watch?v=${ID}`,
      `https://evil.example/youtu.be/${ID}`,
      `https://youtube.co/watch?v=${ID}`,
      `https://notyoutube.com/watch?v=${ID}`,
      `https://www.youtube.com/watch?v=${ID}x`, // 12 characters
      'https://www.youtube.com/watch?v=short',
      `https://www.youtube.com/watch?v=${ID.slice(0, 10)}%`,
      'https://www.youtube.com/watch',
      'https://www.youtube.com/playlist?list=PL123',
      `https://www.youtube.com/channel/${ID}`,
      `https://www.youtube.com/shorts/${ID}/more`,
      `https://youtu.be/${ID}/x`,
      'https://youtu.be/',
      `https://www.youtube.com:8443/watch?v=${ID}`,
      `https://user@youtu.be/${ID}`,
      `ftp://youtu.be/${ID}`,
      'not a link',
    ]) {
      expect(youTubeVideoId(link), link).toBeNull();
    }
  });
});

describe('youTubeOEmbedUrl', () => {
  it('asks the fixed endpoint about the video id alone, whatever else the link carried', () => {
    const url = new URL(youTubeOEmbedUrl(ID));
    expect(`${url.origin}${url.pathname}`).toBe(YOUTUBE_OEMBED);
    expect([...url.searchParams.keys()].sort()).toEqual(['format', 'url']);
    expect(url.searchParams.get('format')).toBe('json');
    expect(url.searchParams.get('url')).toBe(`https://www.youtube.com/watch?v=${ID}`);
  });
});

describe('parseYouTubeOEmbed', () => {
  const LINK = `https://youtu.be/${ID}`;
  const answer = (data: unknown) => Buffer.from(typeof data === 'string' ? data : JSON.stringify(data));
  const signedFor = (image: string | undefined) => {
    const params = new URL(image!, 'https://resonance.channel').searchParams;
    expect(image!.startsWith('/api/link-image?')).toBe(true);
    expect(verifyImageSignature(params.get('u')!, params.get('s')!)).toBe(true);
    return params.get('u');
  };

  it("keeps the title, the channel as the description, YouTube as the site, and the thumbnail through our proxy", () => {
    const preview = parseYouTubeOEmbed(
      LINK,
      ID,
      answer({
        title: 'Never Gonna Give You Up',
        author_name: 'Rick Astley',
        provider_name: 'YouTube',
        thumbnail_url: `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`,
        html: '<iframe src="https://www.youtube.com/embed/x"></iframe>',
        type: 'video',
      }),
    )!;
    expect(preview).toMatchObject({ url: LINK, title: 'Never Gonna Give You Up', description: 'Rick Astley', siteName: 'YouTube' });
    expect(Object.keys(preview).sort()).toEqual(['description', 'image', 'siteName', 'title', 'url']);
    expect(signedFor(preview.image)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  });

  it("takes a thumbnail only from YouTube's image host, else the one every video has", () => {
    for (const named of ['https://evil.example/x.jpg', 'http://i.ytimg.com/vi/x/hq.jpg', 'https://i.ytimg.com.evil.example/a.jpg', 'javascript:alert(1)', 42, undefined]) {
      const preview = parseYouTubeOEmbed(LINK, ID, answer({ title: 'T', thumbnail_url: named }))!;
      expect(signedFor(preview.image), String(named)).toBe(youTubeThumbnail(ID));
    }
    const other = parseYouTubeOEmbed(LINK, ID, answer({ title: 'T', thumbnail_url: `https://i.ytimg.com/vi/${ID}/maxresdefault.jpg` }))!;
    expect(signedFor(other.image)).toBe(`https://i.ytimg.com/vi/${ID}/maxresdefault.jpg`);
  });

  it("treats the answer's strings as data: cut to size, no markup, no invisible or direction-override characters", () => {
    const preview = parseYouTubeOEmbed(
      LINK,
      ID,
      answer({ title: `<b>Bold</b>‮gnp.exe​ ${'x'.repeat(400)}`, author_name: '\u0000Chan\u0007nel <script>' }),
    )!;
    expect(preview.title.startsWith('Bold gnp.exe xxx')).toBe(true);
    expect(Array.from(preview.title)).toHaveLength(160);
    expect(preview.description).toBe('Channel');
  });

  it('is nothing for an answer that is not a JSON object with a title', () => {
    for (const body of ['', 'not json', '[]', 'null', '"title"', '{"title": ""}', '{"title": 7}', '{"author_name": "x"}', '{"title": "   "}']) {
      expect(parseYouTubeOEmbed(LINK, ID, answer(body)), body).toBeNull();
    }
  });

  it('leaves the description out when there is no channel name', () => {
    const preview = parseYouTubeOEmbed(LINK, ID, answer({ title: 'T' }))!;
    expect(preview.description).toBeUndefined();
    expect(preview.siteName).toBe('YouTube');
  });
});

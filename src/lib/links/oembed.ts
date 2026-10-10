import type { LinkPreview } from '@/lib/db/types';
import { imageProxyPath } from './imageProxy';
import { cleanText, DESCRIPTION_MAX, TITLE_MAX } from './openGraph';
import { normalizeLink } from './url';

/**
 * Link previews for sites whose page can't be read for one — YouTube's head
 * is more than 512 KB of inline script before any `<title>` or og tag, so a
 * page fetch (`safeFetch`'s cap) finds nothing — read from the site's oEmbed
 * endpoint instead.
 *
 * Deny by default, as every fetch here is: a link is a YouTube video only
 * when its host is one of a fixed few and an 11-character video id is where
 * YouTube puts it; nothing else of the link goes anywhere. The request is one
 * we build ourselves, to a fixed endpoint, naming only that id
 * (`youTubeOEmbedUrl`), and it goes through `safeFetch` in its JSON mode
 * (public addresses, vetted redirects, one deadline, 64 KB, application/json
 * only). The answer is a stranger's data like a page's head: only the title
 * and the channel's name are kept, each through `cleanText`; the site name is
 * ours to say; the picture is the video's thumbnail on YouTube's own image
 * host, through the signed `/api/link-image` proxy like any preview's.
 */

export const YOUTUBE_OEMBED = 'https://www.youtube.com/oembed';
export const YOUTUBE_SITE_NAME = 'YouTube';
/** Where YouTube keeps its thumbnails; a thumbnail anywhere else is not taken. */
const THUMBNAIL_HOST = 'i.ytimg.com';
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
/** The hosts a video page lives on (youtu.be is the short link). */
const WATCH_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
/** Paths that end in the video's id: /shorts/{id}, /live/{id}, /embed/{id}, /v/{id}. */
const ID_PATH = /^\/(?:shorts|live|embed|v)\/([^/]+)\/?$/;

/** The video a link plays — its 11-character id — or null for anything that isn't plainly a YouTube video. */
export function youTubeVideoId(link: string): string | null {
  const normalized = normalizeLink(link);
  if (!normalized) return null;
  const url = new URL(normalized);
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (host === 'youtu.be') id = /^\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null;
  else if (WATCH_HOSTS.has(host)) id = url.pathname === '/watch' ? url.searchParams.get('v') : (ID_PATH.exec(url.pathname)?.[1] ?? null);
  return id && VIDEO_ID.test(id) ? id : null;
}

/** The oEmbed request for a video: the fixed endpoint, asked about the video's own watch page and nothing else. */
export function youTubeOEmbedUrl(id: string): string {
  return `${YOUTUBE_OEMBED}?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`;
}

/** The thumbnail every video has. */
export function youTubeThumbnail(id: string): string {
  return `https://${THUMBNAIL_HOST}/vi/${id}/hqdefault.jpg`;
}

/** The thumbnail the answer named, when it is one of YouTube's on its image host; else the one every video has. */
function thumbnailOf(named: unknown, id: string): string {
  const url = typeof named === 'string' ? normalizeLink(named) : null;
  return url && url.startsWith(`https://${THUMBNAIL_HOST}/`) ? url : youTubeThumbnail(id);
}

/**
 * A video's preview from its oEmbed answer (`body`, read in JSON mode): the
 * video's title, its channel's name as the description, YouTube as the site,
 * its thumbnail signed for the proxy. Null when the answer is not a JSON
 * object with a title.
 */
export function parseYouTubeOEmbed(link: string, id: string, body: Uint8Array): LinkPreview | null {
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder('utf-8').decode(body));
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const answer = data as Record<string, unknown>;
  const title = typeof answer.title === 'string' ? cleanText(answer.title, TITLE_MAX) : '';
  if (!title) return null;
  const channel = typeof answer.author_name === 'string' ? cleanText(answer.author_name, DESCRIPTION_MAX) : '';
  let image: string | null = null;
  try {
    image = imageProxyPath(thumbnailOf(answer.thumbnail_url, id));
  } catch (e) {
    // No signing key (a misconfigured deployment): a card without its picture beats no card.
    console.error('[unfurl] image', e);
  }
  return {
    url: link,
    title,
    ...(channel ? { description: channel } : {}),
    siteName: YOUTUBE_SITE_NAME,
    ...(image ? { image } : {}),
  };
}

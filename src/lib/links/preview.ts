import type { Firestore } from 'firebase-admin/firestore';
import { createMemo } from './memo';
import { parseOpenGraph } from './openGraph';
import { imageProxyPath } from './imageProxy';
import { safeFetch as defaultFetch, SafeFetchError, type SafeFetchOptions, type SafeFetchResult } from './safeFetch';
import { firstLink } from './url';

/**
 * `conversations/{pair}/messages/{id}.preview`: the card under a message that
 * holds a link. Written by the server a moment AFTER the message (after the
 * response), so a client renders a message without it and again when it
 * arrives. Old messages, and links that said nothing, have none.
 */
export interface LinkPreview {
  /** The link that was previewed: the normalized http(s) URL as written in the message (not where redirects led). */
  url: string;
  title: string;
  description?: string;
  siteName?: string;
  /** A SITE-RELATIVE signed path ('/api/link-image?u=…&s=…'); clients resolve it against their API/site origin. */
  image?: string;
}

/** Longest an unfurl may run, from the message to the written preview. */
export const UNFURL_DEADLINE_MS = 8000;
/**
 * How long an instance remembers what a link said (and, shorter, that it said
 * nothing): a link sent again and again — by one person, or by many — is
 * fetched from its site once, not once per message.
 */
export const REMEMBER_PREVIEW_MS = 10 * 60_000;
export const REMEMBER_NO_PREVIEW_MS = 2 * 60_000;
const REMEMBER_MAX = 200;

type Fetch = (url: string, options: SafeFetchOptions) => Promise<SafeFetchResult>;

/** What is remembered of links already fetched, by normalized URL (see `createMemo`). */
export function createPreviewMemo(options: { max?: number; now?: () => number } = {}) {
  return createMemo<LinkPreview | null>({
    max: options.max ?? REMEMBER_MAX,
    now: options.now,
    // An unexpected error says nothing about the page: ask again next time.
    keep: (outcome) => (!outcome.ok ? 0 : outcome.value ? REMEMBER_PREVIEW_MS : REMEMBER_NO_PREVIEW_MS),
  });
}

const sharedMemo = createPreviewMemo();

/** What a link says about itself — or null when it can't be fetched or says no title. Never throws for a page's faults. */
export async function fetchLinkPreview(link: string, options: { signal?: AbortSignal; fetch?: Fetch } = {}): Promise<LinkPreview | null> {
  let page: SafeFetchResult;
  try {
    page = await (options.fetch ?? defaultFetch)(link, { mode: 'page', signal: options.signal });
  } catch (e) {
    if (e instanceof SafeFetchError) {
      // Why, but not where: the address came out of someone's private conversation.
      console.warn('[unfurl]', e.reason);
      return null;
    }
    throw e;
  }
  const og = parseOpenGraph(page.body, { baseUrl: page.url, charset: page.charset });
  if (!og.title) return null;
  let image: string | null = null;
  try {
    image = og.image ? imageProxyPath(og.image) : null;
  } catch (e) {
    // No signing key (a misconfigured deployment): a card without its picture beats no card.
    console.error('[unfurl] image', e);
  }
  return {
    url: link,
    title: og.title,
    ...(og.description ? { description: og.description } : {}),
    ...(og.siteName ? { siteName: og.siteName } : {}),
    ...(image ? { image } : {}),
  };
}

const DOC_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Give a message its link preview: re-read it, take the first link it holds
 * and write what the page says. Does nothing — and writes nothing — for a
 * message that is gone, already has a preview, or has no link the rules take,
 * and for a page that can't be fetched or has no title. Runs after the
 * response (`afterMessageSent`), never longer than UNFURL_DEADLINE_MS.
 */
export async function unfurlMessage(
  db: Firestore,
  conversationId: string,
  messageId: string,
  deps: { fetch?: Fetch; signal?: AbortSignal; memo?: ReturnType<typeof createPreviewMemo> } = {},
): Promise<LinkPreview | null> {
  if (!DOC_ID.test(conversationId) || !DOC_ID.test(messageId)) return null;
  const ref = db.doc(`conversations/${conversationId}/messages/${messageId}`);
  const snap = await ref.get();
  if (!snap.exists || snap.get('preview') != null) return null;
  const link = firstLink(String(snap.get('text') ?? ''));
  if (!link) return null;

  const deadline = AbortSignal.timeout(UNFURL_DEADLINE_MS);
  const signal = deps.signal ? AbortSignal.any([deadline, deps.signal]) : deadline;
  const preview = await (deps.memo ?? sharedMemo).get(link, () => fetchLinkPreview(link, { signal, fetch: deps.fetch }));
  if (!preview) return null;
  try {
    // `update` fails on a document that is gone: a message deleted meanwhile just goes without.
    await ref.update({ preview });
  } catch (e) {
    if ((e as { code?: unknown }).code === 5) return null;
    throw e;
  }
  return preview;
}

import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { spend } from '@/lib/api/rateLimit';
import { ApiFailure } from '@/lib/api/v1/http';
import type { LinkPreview } from '@/lib/db/types';
import { rememberedPreview, type PreviewFetch, type PreviewMemo } from './preview';
import { linkPreviewsOf } from './previewShape';
import { standaloneLinks, STORY_PREVIEW_LIMIT } from './storyLinks';

/** Longest a card's unfurl may run, all its links together (each fetch has its own 5 s besides). */
export const STORY_UNFURL_DEADLINE_MS = 15_000;
/** How many of a card's links are fetched at once. */
export const STORY_UNFURL_CONCURRENCY = 3;

export interface UnfurlCardDeps {
  fetch?: PreviewFetch;
  memo?: PreviewMemo;
  signal?: AbortSignal;
  deadlineMs?: number;
  /**
   * Charge the author's `unfurl` budget for the links about to be fetched
   * (the publish and apply routes do; the backfill, run by the owner, does
   * not). Default true.
   */
  charge?: boolean;
}

export interface UnfurlCardResult {
  /** The story's standalone links (after the limits, see standaloneLinks). */
  links: number;
  /** Links asked of their sites this time (or of the instance's memory); the rest were stored already. */
  fetched: number;
  /** Previews the card holds now. */
  previews: number;
  /** Whether the card was written: false when nothing changed, or the card is gone or a draft. */
  written: boolean;
  /** The author's budget had no room: links not stored yet were left for next time. */
  overBudget: boolean;
}

const DOC_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Give a published card the previews of the links standing alone in its
 * story (`standaloneLinks`): `linkPreviews`, in reading order, and
 * `linkPreviewsFor`, the links they were made for — server-only fields,
 * which readers draw as cards under the paragraph that holds the link.
 *
 * Run after the response to a publish or an applied edit (and by the
 * backfill). What is stored already is reused for every link still in the
 * story — only new links are fetched, at most three at a time, all under one
 * STORY_UNFURL_DEADLINE_MS, through the instance's shared memory of what
 * links said (`rememberedPreview`) — and links no longer in it are dropped.
 * A link whose page says nothing (or can't be fetched) has no preview and is
 * tried again the next time the card is saved.
 *
 * The result is written in a transaction that re-reads the story, so an edit
 * saved meanwhile keeps only the previews of its own links (and the next
 * unfurl, which that save starts, adds the rest). Nothing is written when
 * nothing changed, and never `updatedAt` or `excerptAt`: a preview is not an
 * edit (no feed re-dates the card, no list re-reads its story). A card that
 * is gone, or still a draft, is left alone. Never throws for a page's
 * faults; never logs an address (stories can be private), only counts.
 */
export async function unfurlCardLinks(db: Firestore, cardId: string, deps: UnfurlCardDeps = {}): Promise<UnfurlCardResult> {
  const nothing: UnfurlCardResult = { links: 0, fetched: 0, previews: 0, written: false, overBudget: false };
  if (!DOC_ID.test(cardId)) return nothing;
  const ref = db.doc(`cards/${cardId}`);
  const snap = await ref.get();
  if (!snap.exists || snap.get('publishedAt') == null) return nothing;

  const links = standaloneLinks(String(snap.get('story') ?? ''));
  const stored = byUrl(linkPreviewsOf(snap.get('linkPreviews'), STORY_PREVIEW_LIMIT));
  let missing = links.filter((link) => !stored.has(link));
  let overBudget = false;
  if (missing.length && deps.charge !== false) {
    const authorId = snap.get('authorId');
    if (typeof authorId !== 'string' || !DOC_ID.test(authorId) || !(await withinBudget(db, authorId, missing.length))) {
      console.warn('[unfurl] card: over budget, links left for later:', missing.length);
      overBudget = true;
      missing = [];
    }
  }
  const fetched = await fetchAll(missing, deps);

  const outcome = await db.runTransaction(async (tx) => {
    const now = await tx.get(ref);
    if (!now.exists || now.get('publishedAt') == null) return null;
    const current = standaloneLinks(String(now.get('story') ?? ''));
    // Also what another unfurl stored meanwhile (two saves in a row).
    const storedNow = byUrl(linkPreviewsOf(now.get('linkPreviews'), STORY_PREVIEW_LIMIT));
    const previews = current
      .map((link) => fetched.get(link) ?? stored.get(link) ?? storedNow.get(link))
      .filter((p): p is LinkPreview => !!p);
    const had = now.get('linkPreviews') !== undefined || now.get('linkPreviewsFor') !== undefined;
    if (!current.length) {
      if (!had) return { previews: 0, written: false };
      tx.update(ref, { linkPreviews: FieldValue.delete(), linkPreviewsFor: FieldValue.delete() });
      return { previews: 0, written: true };
    }
    if (sameValue(now.get('linkPreviews'), previews) && sameValue(now.get('linkPreviewsFor'), current)) {
      return { previews: previews.length, written: false };
    }
    tx.update(ref, { linkPreviews: previews, linkPreviewsFor: current });
    return { previews: previews.length, written: true };
  });
  if (!outcome) return { ...nothing, links: links.length, fetched: missing.length, overBudget };
  return { links: links.length, fetched: missing.length, overBudget, ...outcome };
}

function byUrl(previews: LinkPreview[]): Map<string, LinkPreview> {
  return new Map(previews.map((p) => [p.url, p]));
}

/** Spend `weight` of the author's `unfurl` budget; false (nothing spent) when it has no room. */
async function withinBudget(db: Firestore, uid: string, weight: number): Promise<boolean> {
  try {
    await spend(db, uid, 'unfurl', weight);
    return true;
  } catch (e) {
    if (e instanceof ApiFailure && e.code === 'rate_limited') return false;
    throw e;
  }
}

/** What each link says (those that said something), STORY_UNFURL_CONCURRENCY at a time, all within the deadline. */
async function fetchAll(links: string[], deps: UnfurlCardDeps): Promise<Map<string, LinkPreview>> {
  const out = new Map<string, LinkPreview>();
  if (!links.length) return out;
  const deadline = AbortSignal.timeout(deps.deadlineMs ?? STORY_UNFURL_DEADLINE_MS);
  const signal = deps.signal ? AbortSignal.any([deadline, deps.signal]) : deadline;
  let next = 0;
  let failed = 0;
  const worker = async () => {
    while (next < links.length && !signal.aborted) {
      const link = links[next++];
      try {
        const preview = await untilAborted(rememberedPreview(link, { signal, fetch: deps.fetch, memo: deps.memo }), signal);
        if (preview) out.set(link, preview);
      } catch {
        // Not a page's ordinary fault (those come back null): the next save tries it again.
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(STORY_UNFURL_CONCURRENCY, links.length) }, worker));
  if (failed) console.warn('[unfurl] card: links failed:', failed);
  if (signal.aborted) console.warn('[unfurl] card: out of time, previews made:', out.size, 'of', links.length);
  return out;
}

/** `work`'s value, or null as soon as `signal` aborts (a fetch that ignores its signal holds nothing up). */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T | null> {
  if (signal.aborted) return Promise.resolve(null);
  return new Promise<T | null>((resolve, reject) => {
    const onAbort = () => resolve(null);
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

/** Deep equality of plain JSON-like values, whatever order an object's keys come back in. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  }
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

import { FieldPath, Timestamp, type Query, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { ApiFailure } from './http';
import type { FeedPageBody } from './schemas';

/**
 * Paging the newest-first lists (GET /feed, /users/{handle}/cards).
 *
 * A page ends at its last card's publishedAt, to the microsecond Firestore
 * keeps, and its id: cards published at the same instant (a batch import
 * gives many the same millisecond) are ordered by id, so the next page
 * resumes exactly after that card. Clients get it as an opaque
 * `nextPageToken` and send it back as `pageToken`.
 *
 * The older `cursor` / `nextCursor` stays as it was for the builds that use
 * it (a Kotlin client parses it as a date, so it can't become opaque): the
 * ISO time to the millisecond, resuming after that time — which skips cards
 * sharing the boundary's millisecond.
 */

const notAToken = () =>
  new ApiFailure('invalid_request', 'The request does not match the contract.', [{ path: 'pageToken', message: 'Not a valid page token.' }]);

export function encodePageToken(at: Timestamp, id: string): string {
  return Buffer.from(JSON.stringify([at.seconds, at.nanoseconds, id]), 'utf8').toString('base64url');
}

/** A page token back into its boundary — invalid_request when it isn't one this server made. */
export function decodePageToken(token: string): { at: Timestamp; id: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    throw notAToken();
  }
  if (!Array.isArray(parsed) || parsed.length !== 3) throw notAToken();
  const [seconds, nanos, id] = parsed as unknown[];
  if (
    !Number.isSafeInteger(seconds) ||
    !Number.isInteger(nanos) ||
    (nanos as number) < 0 ||
    (nanos as number) >= 1e9 ||
    typeof id !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(id)
  ) {
    throw notAToken();
  }
  return { at: new Timestamp(seconds as number, nanos as number), id };
}

/** Where a newest-first list resumes: after a page token's card, or after an older client's cursor time. */
export interface PageStart {
  pageToken?: string;
  cursor?: string;
}

/**
 * `q` newest first — by publishedAt, then by id (the order Firestore gives it
 * anyway, made explicit so a token can name a card) — resuming as `start`
 * says. A page token wins over a cursor.
 */
export function pageQuery(q: Query, start: PageStart = {}): Query {
  const ordered = q.orderBy('publishedAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
  if (start.pageToken) {
    const { at, id } = decodePageToken(start.pageToken);
    return ordered.startAfter(at, id);
  }
  if (start.cursor) return ordered.startAfter(Timestamp.fromDate(new Date(start.cursor)));
  return ordered;
}

/**
 * A page's way on, in both forms, from the raw query's documents (before
 * anything was filtered out of it) when it came back full; nulls at the end.
 */
export function pageEnd(docs: QueryDocumentSnapshot[], limit: number): Pick<FeedPageBody, 'nextCursor' | 'nextPageToken'> {
  const last = docs.at(-1);
  const at = last?.get('publishedAt');
  if (docs.length !== limit || !last || !(at instanceof Timestamp)) return { nextCursor: null, nextPageToken: null };
  return { nextCursor: at.toDate().toISOString(), nextPageToken: encodePageToken(at, last.id) };
}

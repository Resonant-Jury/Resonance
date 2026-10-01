/**
 * Whether a failed read is Firestore's answer that, for this viewer, there is
 * no such thing: the rules refused it (permission-denied: not theirs to see),
 * it isn't there (not-found), or the path can't name one (invalid-argument).
 *
 * Anything else — offline, a timeout, the server unavailable — says nothing
 * about the document. Reads that turn "not there" into null must throw those,
 * so the page shows a retryable state and SWR retries, instead of a
 * "doesn't exist" it then keeps.
 */
export function isAbsent(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 'permission-denied' || code === 'not-found' || code === 'invalid-argument';
}

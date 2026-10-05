/**
 * What the foot of a thread offers: the composer, or a word in its place —
 * the twin of the apps' ThreadFoot (Android) and ThreadAccess (iOS). A note
 * is a letter: it connects no one, its recipient's answer does, so a
 * conversation can hold a note from someone the viewer isn't connected with,
 * waiting (`conversations/{pair}.request`: who left it). The messages show in
 * every state; only the foot changes.
 *
 * - `composer`: connected (or not known yet, with no letter waiting): write as usual.
 * - `answer`: not connected, and the letter waiting is theirs: the composer,
 *   with a quiet line saying a reply connects the two.
 * - `awaiting`: not connected, and the letter waiting is the viewer's: a calm
 *   line that they'll see it, instead of the composer.
 * - `closed`: not connected, no letter waiting — or the viewer blocked them
 *   (nothing reaches across a block, a letter neither): "not connected" and
 *   the way to their page.
 */
export type ThreadFoot = 'composer' | 'answer' | 'awaiting' | 'closed';

/**
 * `connected` is undefined until known; `requestFrom` the letter's writer,
 * if one waits. Connected, a waiting letter is ignored (two people connected
 * some other way can still have one waiting; it counts again should that
 * connection end). Not known yet, a waiting letter says what the foot most
 * likely is — a letter mostly waits between people not connected — so the
 * writer of one never sees a composer flash up before the read answers; with
 * none, the composer shows meanwhile.
 */
export function threadFoot(
  connected: boolean | undefined,
  blocked: boolean,
  requestFrom: string | null | undefined,
  me: string | undefined,
  other: string | undefined,
): ThreadFoot {
  if (blocked) return 'closed';
  if (connected === true) return 'composer';
  if (requestFrom && requestFrom === other) return 'answer';
  if (requestFrom && requestFrom === me) return 'awaiting';
  if (connected === undefined) return 'composer';
  return 'closed';
}

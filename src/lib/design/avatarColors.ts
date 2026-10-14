/**
 * The colours a hand-drawn avatar wears until its person uploads a photo. Each
 * new profile is given one (createProfile in lib/api/v1/profile), picked by
 * the account's uid — so the same person always draws in the same colour and
 * people tell each other apart at a glance, as GitHub's identicons let them.
 * The faces the store demo and the emulator seed already wear: pastel enough
 * for the ink initials on every one. The web and both apps draw whatever the
 * profile stores, so a new colour here needs nothing of them.
 */
export const AVATAR_COLORS = [
  'oklch(88% 0.08 55)', // terracotta
  'oklch(90% 0.07 88)', // straw
  'oklch(90% 0.06 140)', // sage
  'oklch(89% 0.07 165)', // mint
  'oklch(90% 0.05 215)', // sky
  'oklch(90% 0.05 290)', // lavender
  'oklch(89% 0.07 18)', // blush
] as const;

/** What every profile wore before colours were given out (scripts/backfills/avatarColors). */
export const LEGACY_AVATAR_COLOR = 'oklch(88% 0.08 55)';

/** The account's own avatar colour: FNV-1a over the uid, so uids a character apart still land apart. */
export function avatarColorFor(uid: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < uid.length; i++) {
    h ^= uid.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return AVATAR_COLORS[(h >>> 0) % AVATAR_COLORS.length];
}

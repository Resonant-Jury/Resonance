/**
 * Hand-drawn "pen weights" — one pen for the whole app.
 *
 * The illusion of a single hand drawing every shape comes from a *constant
 * absolute line width*, not from a constant stroke-to-size ratio. A real pen
 * lays down the same physical line whether it traces a big card or a small
 * button, so small elements read as proportionally chunkier — that's correct.
 *
 * Keep structural outlines on INK and secondary marks (dividers, hatching,
 * dashed guides) one step lighter on INK_LIGHT, so the page stays the work of
 * a single pen pressed harder or softer.
 */

/** Primary structural outline: cards, FAB, profile/subnav, header curve. */
export const INK = 1.8;

/** Secondary marks drawn with a lighter hand: dividers, sub-strokes. */
export const INK_LIGHT = 1.2;

/**
 * The same pen pressed harder for a moment — focus / active states only.
 * Use as a tactile cue (a frame "re-traced" on focus), never as a resting width.
 */
export const INK_STRONG = 2.2;

/**
 * When each scene is on screen (global seconds). Neighbours overlap by the
 * cross-fade, so a scene's local time runs from 0 at `start` to
 * `end - start`, and it may use the overlap at either end for its own entrance
 * and exit. The chapter header shows from the first feature to the last.
 */
export const TIMELINE = {
  intro: { start: 0, end: 7.0 },
  write: { start: 6.4, end: 15.0 },
  visibility: { start: 14.4, end: 25.0 },
  resonate: { start: 24.4, end: 36.0 },
  notes: { start: 35.4, end: 48.2 },
  map: { start: 47.6, end: 58.6 },
  outro: { start: 58.0, end: 66.0 },
} as const;

export const DURATION = 66.0;

/** The scenes the header names, in order (its chapter marks follow them). */
export const CHAPTERS = ['write', 'visibility', 'resonate', 'notes', 'map'] as const;

/** How long the stage takes to fade a scene in over the one before it (a scene may set its own `fadeIn`). */
export const CROSS_FADE = 0.6;

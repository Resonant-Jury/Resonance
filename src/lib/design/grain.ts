/**
 * How much paper grain the story cards carry — StoryCard, MiniStoryCard and
 * EmbedStoryCard, and the apps' StoryCardView / StoryCard, which copy these.
 *
 * On a phone the card is a band with GrainOverlay laid over everything in it,
 * text and cover included, and the cover carries its own on top: that
 * doubled, over-the-text grain read as sandpaper at the old 0.08 + 0.055, so
 * both are kept light. On desktop the grain is the card's paper (ShapeGrain,
 * under the content), a touch lighter than a modal's 0.3.
 */
export const STORY_GRAIN = {
  /** GrainOverlay over the phone band: the mean darkening. */
  band: 0.045,
  /** GrainOverlay over a cover picture. */
  cover: 0.03,
  /** ShapeGrain on the desktop card's paper. */
  paper: 0.2,
} as const;

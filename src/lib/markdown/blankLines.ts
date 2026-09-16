/**
 * Blank lines that survive the Markdown round trip.
 *
 * A story is stored as Markdown, and Markdown has no way to say "leave an
 * empty line here": any run of blank lines between two blocks collapses into
 * one paragraph break. In the editor those empty paragraphs are right there on
 * screen, so a writer who pressed Enter twice to give a photo room watched the
 * gap vanish the moment the card rendered — and again when they reopened the
 * editor.
 *
 * So a deliberately empty paragraph is written out as a line holding a single
 * non-breaking space (see SpacedParagraphNode). That is ordinary Markdown
 * text: every parser keeps it, it reopens in the editor as the same
 * empty-looking line, and the reader renders it as a spacer (see
 * StoryMarkdown). Images carry their own built-in breathing room — this is
 * only for the writer who wants *more*.
 */

/** The character a deliberately blank paragraph is stored as. */
export const BLANK_PARAGRAPH = ' ';

/** True when a rendered paragraph holds nothing but blank-paragraph markers. */
export function isBlankParagraph(text: string): boolean {
  return text.length > 0 && text.replace(/[ \s]/g, '') === '';
}

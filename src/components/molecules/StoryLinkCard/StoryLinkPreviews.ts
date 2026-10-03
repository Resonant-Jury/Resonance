'use client';

import { createContext } from 'react';
import type { LinkPreview } from '@/lib/db/types';

/**
 * The previews of a story's standalone links (a card's `linkPreviews`, in
 * reading order), for StoryMarkdown to draw as link cards — provided by the
 * page that shows the story, beside CardEmbedSourceContext, so the reader's
 * Markdown components stay module-level. Without previews (null, or none
 * for a link) every link is drawn as it always was.
 */
export const StoryLinkPreviewsContext = createContext<readonly LinkPreview[] | null>(null);

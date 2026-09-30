import { CardDetailClient } from './CardDetailClient';
import { CARD_HOLD_SCRIPT } from './cardHold';
import { loadCardSeed } from './cardPageData';

/**
 * A card page. The server render (ISR, see layout.tsx) resolves the URL to its
 * card id and, for a public card, renders its story into the HTML — new
 * readers and search engines get it without waiting on the browser — then
 * the browser takes over: it re-reads the card through the rules as this
 * viewer (SWR, starting from what the server rendered) and applies what only
 * it knows, like the viewer's blocks.
 */
export default async function CardPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { slug } = await params;
  const seed = await loadCardSeed(slug);
  return (
    <>
      {/* Before the card paints: hold it in a signed-in browser until its blocks are known. */}
      {seed?.view && <script dangerouslySetInnerHTML={{ __html: CARD_HOLD_SCRIPT }} />}
      <CardDetailClient slug={slug} seed={seed} />
    </>
  );
}

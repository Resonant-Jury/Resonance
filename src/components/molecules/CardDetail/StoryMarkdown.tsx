'use client';

import Markdown, { type Components, type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import type { Element, ElementContent } from 'hast';
import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from 'react';
import { Divider } from '@/components/atoms/Divider/Divider';
import { OrganicStoryImage } from '@/components/atoms/OrganicImage/OrganicStoryImage';
import { CardEmbedLink } from '@/components/molecules/EmbedStoryCard/CardEmbedLink';
import { StoryLinkCard } from '@/components/molecules/StoryLinkCard/StoryLinkCard';
import { StoryLinkPreviewsContext } from '@/components/molecules/StoryLinkCard/StoryLinkPreviews';
import type { LinkPreview } from '@/lib/db/types';
import { isBlankParagraph } from '@/lib/markdown/blankLines';
import { SITE_HOSTS, soleLinkParagraphs } from '@/lib/links/storyLinks';
import { seedFromString } from '@/lib/design/prng';
import { storyLinkWaveVars } from '@/lib/design/storyLinkWave';
import styles from './StoryMarkdown.module.css';

/**
 * The link cards this story draws: which paragraphs (by where they start in
 * the source) are standalone links and under which key, and the previews by
 * key. Computed once per story by StoryMarkdown, read by each paragraph.
 */
interface StoryLinkCards {
  keys: ReadonlyMap<number, string>;
  previews: ReadonlyMap<string, LinkPreview>;
}
const StoryLinkCardsContext = createContext<StoryLinkCards | null>(null);

/** The paragraph's only element child (ignoring whitespace), if any. */
function soleElementChild(node: Element | undefined): Element | null {
  if (!node) return null;
  const kids = node.children.filter((c) => !(c.type === 'text' && !c.value.trim()));
  const only = kids.length === 1 ? kids[0] : null;
  return only && only.type === 'element' ? only : null;
}

function hastText(node: ElementContent): string {
  if (node.type === 'text') return node.value;
  if ('children' in node) return node.children.map(hastText).join('');
  return '';
}

/**
 * Our own hosts — the same in the server's render and the browser's (the page
 * is drawn on both): the site's names and the deployment's own address.
 */
const OWN_HOSTS: readonly string[] = (() => {
  const hosts = [...SITE_HOSTS];
  try {
    if (process.env.NEXT_PUBLIC_SITE_URL) hosts.push(new URL(process.env.NEXT_PUBLIC_SITE_URL).hostname);
  } catch {
    // Not a URL: nothing to add.
  }
  return hosts;
})();

/** A link to another site's page (http or https, a host not ours) — not a page of ours, an anchor or a mail address. */
function toOtherSite(href: string | undefined): boolean {
  if (!href || !/^https?:\/\//i.test(href)) return false;
  try {
    return !OWN_HOSTS.includes(new URL(href).hostname.replace(/\.$/, '').toLowerCase());
  } catch {
    return false;
  }
}

/** How a link to another site opens, as its link card does: a tab of its own, sending no referrer and vouching for nothing. */
const AWAY = { target: '_blank', rel: 'noopener noreferrer nofollow ugc' } as const;

const components: Components = {
  // Links wear the pen's wavy underline as a repeating background, so a link
  // that wraps gets a stroke under every line (OrganicLink's absolutely
  // positioned svg can't follow a wrapped inline box). One to another site
  // opens in a tab of its own; one to our pages stays in this one.
  a: ({ node: _node, href, children, ...rest }) => {
    return (
      <a
        {...rest}
        href={href}
        {...(toOtherSite(href) ? AWAY : {})}
        className={styles.link}
        style={storyLinkWaveVars(href ?? '') as CSSProperties}
      >
        {children}
      </a>
    );
  },
  // Replace the flat accent border with a hand-drawn vertical curve.
  blockquote: ({ children }) => (
    <blockquote>
      <Divider orientation="vertical" seed={5} color="var(--color-terracotta-light)" spacing={0} />
      <div className={styles.blockquoteBody}>{children}</div>
    </blockquote>
  ),
  // Replace the default flat rule with the theme's thin wavy pen line, with
  // generous breathing room above and below.
  hr: () => <Divider seed={23} spacing="clamp(28px, 4vw, 40px)" />,
  // Story images get the same hand-drawn curved clip as the cover, hugging
  // the photo's natural size. Spans only, so it stays valid inside <p>.
  img: ({ src, alt }) => (
    <OrganicStoryImage
      className={styles.storyImage}
      src={String(src ?? '')}
      alt={alt ?? ''}
      seed={seedFromString(String(src ?? ''))}
    />
  ),
  p: StoryParagraph,
};

/**
 * Paragraphs that hold a single card link become that card as a block (the
 * shared card a thread draws, in a link card's container); a paragraph that
 * is a single web link the server previewed becomes that page's link card; a paragraph holding a single photo becomes an image block
 * with its own breathing room (a photo should never touch the sentence above
 * it, and nobody should have to type blank lines to get that). A paragraph
 * the writer deliberately left blank renders as extra space. Everything else
 * stays prose.
 */
function StoryParagraph({ node, children }: { children?: ReactNode } & ExtraProps) {
  const cards = useContext(StoryLinkCardsContext);
  const sole = soleElementChild(node);
  if (sole?.tagName === 'a') {
    const href = String(sole.properties?.href ?? '');
    if (href.startsWith('/card/')) {
      return (
        <div className={styles.embedBlock}>
          <CardEmbedLink href={href} title={hastText(sole)} />
        </div>
      );
    }
  }
  // Which paragraphs are standalone links is the server's rule, read off the
  // same source (lib/links/storyLinks), so a bare `www.` address or one GFM
  // linkifies differently still finds its preview — or, rightly, none.
  const offset = node?.position?.start.offset;
  const key = cards && offset != null ? cards.keys.get(offset) : undefined;
  const preview = key ? cards!.previews.get(key) : undefined;
  if (preview) {
    return (
      <div className={styles.embedBlock}>
        <StoryLinkCard preview={preview} />
      </div>
    );
  }
  if (sole?.tagName === 'img') {
    return <div className={styles.imageBlock}>{children}</div>;
  }
  if (node && isBlankParagraph(node.children.map(hastText).join(''))) {
    return <div className={styles.blankLine} aria-hidden="true" />;
  }
  return <p>{children}</p>;
}

/**
 * Renders a card's story (stored as Markdown) into prose. `rehype-slug` adds
 * `id`s to headings so the Table of Contents can anchor-scroll to them. The
 * page may provide its card's link previews (StoryLinkPreviewsContext); a
 * standalone link with one is drawn as its link card.
 */
export function StoryMarkdown({ source }: { source: string }) {
  const previews = useContext(StoryLinkPreviewsContext);
  // Parsed again (as CommonMark, like the server) only when there is a preview to place.
  const cards = useMemo<StoryLinkCards | null>(
    () =>
      previews?.length
        ? { keys: soleLinkParagraphs(source), previews: new Map(previews.map((p) => [p.url, p])) }
        : null,
    [source, previews],
  );
  return (
    <div className={styles.prose}>
      <StoryLinkCardsContext.Provider value={cards}>
        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={components}>
          {source}
        </Markdown>
      </StoryLinkCardsContext.Provider>
    </div>
  );
}

import { isValidElement, type ReactNode } from 'react';
import NextLink from 'next/link';
import { penWave } from '@/lib/design/wavyPath';
import { seedFromString } from '@/lib/design/prng';
import { INK } from '@/lib/design/strokes';
import styles from './OrganicLink.module.css';

export interface OrganicLinkProps {
  href: string;
  children: ReactNode;
  /** Defaults to one derived from the href, so each link wobbles its own way (and the same way every render). */
  seed?: number;
  className?: string;
}

// Han, kana, fullwidth forms and CJK punctuation: one em a character.
const FULL_WIDTH = /[⺀-鿿豈-﫿＀-￯　-〿]/;

/** What the stroke is drawn for when the children carry no text to size it by. */
const FALLBACK_WIDTH = 120;

/** The text a link's children spell, however deep they nest (a bold word in a Markdown link). */
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

/**
 * About how wide `text` sets at 16px, in px. The link's real width is only
 * known after layout, and measuring it would take a client effect (a
 * hydration mismatch on the static policy pages, a stroke that pops in) — so
 * the stroke is drawn at this guess and the SVG stretches it to the real box.
 * The guess only decides how many crests the pen makes: being 15% off just
 * stretches their wavelength a little.
 */
function estimateWidth(text: string): number {
  let em = 0;
  for (const ch of text) {
    if (FULL_WIDTH.test(ch)) em += 1;
    else if (/[A-Z0-9]/.test(ch)) em += 0.62;
    else if (ch === '@' || ch === 'm' || ch === 'w') em += 0.9;
    else if (ch === ' ') em += 0.28;
    else em += 0.5;
  }
  return Math.round(em * 16);
}

/**
 * A text link underlined with a hand-drawn wavy pen stroke instead of the
 * browser's straight rule. Site paths navigate client-side; anything else
 * (mailto:, other sites) is a plain anchor, external ones in a new tab.
 *
 * The stroke is the pen's own wave (`penWave`, the twin of the native apps'
 * OrganicLink): a crest every ~4.5px along the link's width, sitting just
 * under the letters (see OrganicLink.module.css).
 */
export function OrganicLink({ href, children, seed, className }: OrganicLinkProps) {
  const width = estimateWidth(textOf(children)) || FALLBACK_WIDTH;
  const d = penWave(width, seed ?? seedFromString(href));
  const content = (
    <>
      <span className={styles.text}>{children}</span>
      <svg className={styles.underline} viewBox={`0 -3 ${width} 6`} preserveAspectRatio="none" aria-hidden="true">
        <path
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth={INK}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </>
  );
  const cls = [styles.link, className].filter(Boolean).join(' ');
  if (href.startsWith('/')) {
    return (
      <NextLink href={href} className={cls}>
        {content}
      </NextLink>
    );
  }
  const external = /^https?:/.test(href);
  return (
    <a href={href} className={cls} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {content}
    </a>
  );
}

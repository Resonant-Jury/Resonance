import type { ReactNode } from 'react';
import NextLink from 'next/link';
import { wavyLine } from '@/lib/design/wavyPath';
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

/**
 * A text link underlined with a hand-drawn wavy pen stroke instead of the
 * browser's straight rule. Site paths navigate client-side; anything else
 * (mailto:, other sites) is a plain anchor, external ones in a new tab.
 */
export function OrganicLink({ href, children, seed, className }: OrganicLinkProps) {
  const d = wavyLine(100, seed ?? seedFromString(href), 2.4, 5);
  const content = (
    <>
      <span className={styles.text}>{children}</span>
      <svg className={styles.underline} viewBox="0 -5 100 10" preserveAspectRatio="none" aria-hidden="true">
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

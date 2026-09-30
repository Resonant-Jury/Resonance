import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Divider } from '@/components/atoms/Divider/Divider';
import { OrganicLink } from '@/components/atoms/OrganicLink/OrganicLink';
import prose from '@/components/molecules/CardDetail/StoryMarkdown.module.css';
import type { LegalDoc } from '@/lib/legal/legalDocs';
import styles from './LegalDocument.module.css';

const components: Components = {
  a: ({ href, children }) => <OrganicLink href={String(href ?? '')}>{children}</OrganicLink>,
  hr: () => <Divider seed={23} spacing="clamp(28px, 4vw, 40px)" />,
};

/**
 * A policy page (privacy, terms, support) from docs/legal: its title, when it
 * last changed, and the Markdown in the stories' prose, with hand-drawn links.
 */
export function LegalDocument({ doc, updatedLabel }: { doc: LegalDoc; updatedLabel: string }) {
  return (
    <main className={styles.page}>
      <article className={styles.doc}>
        <header className={styles.head}>
          <h1 className={styles.title}>{doc.title}</h1>
          <p className={styles.updated}>{updatedLabel}</p>
        </header>
        <Divider seed={41} spacing="clamp(20px, 3vw, 28px)" />
        <div className={prose.prose}>
          <Markdown remarkPlugins={[remarkGfm]} components={components}>
            {doc.body}
          </Markdown>
        </div>
      </article>
    </main>
  );
}

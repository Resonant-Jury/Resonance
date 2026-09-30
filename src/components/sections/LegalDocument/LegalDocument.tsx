import { StoryMarkdown } from '@/components/molecules/CardDetail/StoryMarkdown';
import { Divider } from '@/components/atoms/Divider/Divider';
import type { LegalDocText } from '@/content/legal';
import styles from './LegalDocument.module.css';

/** A policy page (privacy, terms, support): its title, when it last changed, and the text as story prose. */
export function LegalDocument({ doc, updated }: { doc: LegalDocText; updated: string }) {
  return (
    <main className={styles.page}>
      <article className={styles.doc}>
        <header className={styles.head}>
          <h1 className={styles.title}>{doc.title}</h1>
          <p className={styles.updated}>{updated}</p>
        </header>
        <Divider seed={41} spacing="clamp(20px, 3vw, 28px)" />
        <StoryMarkdown source={doc.body} />
      </article>
    </main>
  );
}

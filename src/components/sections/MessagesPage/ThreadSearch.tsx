'use client';

import { Fragment, useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Divider } from '@/components/atoms/Divider/Divider';
import { SketchLoader } from '@/components/atoms/SketchLoader/SketchLoader';
import { searchSnippet, type SearchHit } from '@/lib/chat/search';
import type { ChatMessage } from '@/lib/chat/message';
import { seedFromId } from '@/lib/design/bubble';
import { RowWash } from './RowWash';
import styles from './Thread.module.css';

/**
 * Search in a conversation, the way LINE does it: what is typed in the
 * header lists the messages that match, newest first, over the thread; a
 * click on one puts the list away and takes the thread to that message with
 * the words marked, and the header then steps from match to match.
 */

export interface SearchResultsProps {
  query: string;
  hits: readonly SearchHit[];
  messages: readonly ChatMessage[];
  viewerId: string;
  otherHandle: string;
  /** Older messages are still being read in for the search: the hits may grow. */
  loading: boolean;
  onPick: (index: number) => void;
}

/**
 * The list of matches that covers the thread: how many (and a loader while
 * older messages are still being read in for it), then a row for each — who,
 * when, and the words around the match with the match marked — parted by
 * wavy rules. A blank query says what the field is for.
 */
export function SearchResults({ query, hits, messages, viewerId, otherHandle, loading, onPick }: SearchResultsProps) {
  const t = useTranslations('messages');
  const locale = useLocale();
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const when = useMemo(() => resultTime(locale), [locale]);

  if (!query.trim()) {
    return (
      <div className={styles.results}>
        <p className={styles.resultsHint}>{t('searchHint')}</p>
      </div>
    );
  }
  return (
    <div className={styles.results} role="region" aria-label={t('menuSearch')}>
      <div className={styles.resultsCount} aria-live="polite">
        {/* The hits grow while older messages arrive: the count says what is known so far. */}
        {(hits.length > 0 || !loading) && <span>{t('searchCount', { count: hits.length })}</span>}
        {loading && (
          <>
            <SketchLoader size={16} />
            <span>{t('searchSearching')}</span>
          </>
        )}
      </div>
      {hits.map((hit, i) => {
        const m = byId.get(hit.messageId);
        if (!m) return null;
        const mine = m.senderId === viewerId;
        const snippet = searchSnippet(m.text, hit.ranges);
        return (
          <Fragment key={hit.messageId}>
            {i > 0 && <Divider seed={131 + (i % 7) * 17} spacing={0} />}
            <button type="button" className={styles.resultRow} onClick={() => onPick(i)}>
              <RowWash seed={seedFromId(m.id, 13)} />
              <span className={styles.resultHead}>
                <span className={styles.resultWho} data-mine={mine || undefined}>
                  {mine ? t('you') : otherHandle}
                </span>
                <span className={styles.resultWhen}>{when(m.sentAt)}</span>
              </span>
              <span className={styles.resultSnippet}>{marked(snippet.text, snippet.ranges)}</span>
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}

/** The snippet's words with its matches marked. */
function marked(text: string, ranges: readonly { start: number; end: number }[]) {
  const out: React.ReactNode[] = [];
  let at = 0;
  ranges.forEach((r, i) => {
    if (r.start > at) out.push(text.slice(at, r.start));
    out.push(
      <mark key={i} className={styles.resultMark}>
        {text.slice(r.start, r.end)}
      </mark>,
    );
    at = r.end;
  });
  if (at < text.length) out.push(text.slice(at));
  return out;
}

/** When a result was written: the time today, the day this year, the day and the year before that. */
function resultTime(locale: string): (d: Date) => string {
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' });
  const day = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
  const year = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' });
  return (d) => {
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return time.format(d);
    return d.getFullYear() === now.getFullYear() ? day.format(d) : year.format(d);
  };
}

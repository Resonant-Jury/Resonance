'use client';

import { Fragment, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Field, Textarea, CharCount } from '@/components/atoms/Field/Field';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { Divider } from '@/components/atoms/Divider/Divider';
import { Icon } from '@/components/atoms/Icon';
import { useAuth } from '@/components/providers/AuthProvider';
import { useComments, useMyProfile } from '@/lib/data/hooks';
import { addComment } from '@/lib/db/firestore/client/comments';
import type { Comment, User } from '@/lib/db/types';
import styles from './CommentsSection.module.css';

const MAX = 2000;

export interface CommentsSectionProps {
  cardId: string;
  /** uid of the card's author, for the comment notification. */
  authorId: string;
}

export function CommentsSection({ cardId, authorId }: CommentsSectionProps) {
  const t = useTranslations('card');
  const locale = useLocale();
  const { user } = useAuth();
  const { data: me } = useMyProfile();
  const { data, mutate } = useComments(cardId);
  const [body, setBody] = useState('');
  const [pending, start] = useTransition();

  const comments = data?.comments ?? [];
  const authors = data?.authors ?? {};
  const trimmed = body.trim();
  const canSubmit = !!user && trimmed.length > 0 && trimmed.length <= MAX && !pending;

  function submit() {
    if (!canSubmit || !me) return;
    const text = trimmed;
    // Optimistic append so the comment shows immediately.
    const optimistic: Comment = {
      id: `tmp-${Date.now()}`,
      cardId,
      authorId: me.id,
      parentId: null,
      body: text,
      createdAt: new Date(),
    };
    const nextAuthors: Record<string, User> = { ...authors, [me.id]: me };
    mutate({ comments: [...comments, optimistic], authors: nextAuthors }, false);
    setBody('');
    start(async () => {
      try {
        await addComment(cardId, text, { authorId, fromHandle: me.handle });
        await mutate();
      } catch {
        // Roll back to the server state on failure.
        await mutate();
        setBody(text);
      }
    });
  }

  return (
    <section className={styles.section}>
      <h3 className={styles.heading}>
        <Icon name="comment" size={20} />
        {t('comments.title')}
        {comments.length > 0 && <span className={styles.count}>{comments.length}</span>}
      </h3>

      {user ? (
        <div className={styles.composer}>
          <Field
            hint={t('comments.hint')}
            trailing={<CharCount count={trimmed.length} max={MAX} />}
          >
            <Textarea
              seed={37}
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t('comments.placeholder')}
              aria-label={t('comments.title')}
            />
          </Field>
          <div className={styles.submitRow}>
            <div style={{ opacity: canSubmit ? 1 : 0.5, pointerEvents: canSubmit ? 'auto' : 'none' }}>
              <OrganicButton variant="primary" onClick={submit}>
                {pending ? '…' : t('comments.submit')}
              </OrganicButton>
            </div>
          </div>
        </div>
      ) : (
        <p className={styles.signIn}>
          <Link href="/signin" className={styles.signInLink}>
            {t('comments.signInToComment')}
          </Link>
        </p>
      )}

      {comments.length === 0 ? (
        <p className={styles.empty}>{t('comments.empty')}</p>
      ) : (
        <ul className={styles.list}>
          {comments.map((c, i) => {
            const a = authors[c.authorId];
            return (
              <Fragment key={c.id}>
                {i > 0 && <Divider seed={i * 17 + 3} spacing={6} />}
                <li className={styles.row}>
                  <HandDrawnAvatar
                    initials={a?.initials ?? '?'}
                    size={34}
                    color={a?.accentColor ?? 'oklch(88% 0.08 55)'}
                    seed={a ? Number(a.avatarSeed) || i + 1 : i + 1}
                  />
                  <div className={styles.meta}>
                    <div className={styles.metaTop}>
                      <span className={styles.name}>@{a?.handle ?? '…'}</span>
                      <span className={styles.time}>
                        {c.createdAt.toLocaleDateString(locale, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <p className={styles.body}>{c.body}</p>
                  </div>
                </li>
              </Fragment>
            );
          })}
        </ul>
      )}
    </section>
  );
}

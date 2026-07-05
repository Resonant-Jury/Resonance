'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/molecules/Modal/Modal';
import { NoteComposer } from '@/components/molecules/NoteComposer/NoteComposer';
import { CardViewerActions } from './CardViewerActions';
import { useAuth } from '@/components/providers/AuthProvider';
import { useRouter } from '@/i18n/navigation';

export interface ReadAfterAreaProps {
  cardId: string;
  cardTitle: string;
  author: { id: string; handle: string; initials: string; accentColor: string };
  coreInsight?: string;
}

/**
 * The「讀後區」— everything a reader can do after finishing a story, in one
 * container with a deliberate hierarchy: 共振 is the only primary button,
 * the note is a text link (a gentle aside), the bookmark is a quiet icon —
 * all three on one horizontal line, the note composer opening in a Modal.
 * It fades in only when scrolled to, so reading itself carries no pressure.
 *
 * Also the junction for the up/downgrade paths: note ↔ resonance drafts move
 * in both directions, so choosing the wrong door costs nothing.
 */
export function ReadAfterArea({ cardId, cardTitle, author, coreInsight }: ReadAfterAreaProps) {
  const t = useTranslations('card.note');
  const router = useRouter();
  const { user, loading } = useAuth();

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState<string | undefined>(undefined);
  const [noteNonce, setNoteNonce] = useState(0);

  // Fade in on first viewport entry (IntersectionObserver; shows immediately
  // where the API is unavailable, e.g. jsdom).
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (loading) return null;
  // The author sees no response actions on their own card (resonating with,
  // writing to, or bookmarking yourself all mean nothing).
  if (user && user.id === author.id) return null;

  function openNote(draft?: string) {
    if (!user) {
      router.push('/signin');
      return;
    }
    setNoteDraft(draft);
    setNoteNonce((n) => n + 1);
    setNoteOpen(true);
  }

  // 紙條 → 共振: hand the text up into the resonance editor.
  function handleUpgrade(text: string) {
    setNoteOpen(false);
    router.push(`/write?referenceCardId=${cardId}&story=${encodeURIComponent(text)}`);
  }

  return (
    <div
      ref={ref}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : 'translateY(10px)',
        transition: 'opacity 0.6s ease, transform 0.6s ease',
      }}
    >
      <CardViewerActions
        cardId={cardId}
        cardTitle={cardTitle}
        author={author}
        onOpenNote={() => openNote()}
      />

      {user && (
        <Modal
          open={noteOpen}
          onClose={() => setNoteOpen(false)}
          maxWidth={520}
          ariaLabel={t('label')}
        >
          <NoteComposer
            key={noteNonce}
            variant="plain"
            cardId={cardId}
            toUserId={author.id}
            initialText={noteDraft}
            onUpgrade={handleUpgrade}
            onClose={() => setNoteOpen(false)}
          />
        </Modal>
      )}
    </div>
  );
}

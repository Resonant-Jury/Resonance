'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { MessagesPage } from '@/components/sections/MessagesPage/MessagesPage';

/** Route segments arrive percent-encoded (CJK handles); decode before use. */
function decodeHandle(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function MessageThreadContent() {
  const params = useParams<{ handle: string }>();
  const search = useSearchParams();
  // A note-reply deep link (from the note notification) carries the note it
  // quotes, so the first reply lands in the thread as a quoted answer.
  const noteId = search.get('note');
  const cardId = search.get('card');
  const replyNote = noteId && cardId ? { noteId, cardId } : undefined;
  return (
    <MessagesPage activeHandle={decodeHandle(params?.handle)} replyNote={replyNote} />
  );
}

export default function MessageThread() {
  // layout.tsx opts this segment into static generation (generateStaticParams).
  // useSearchParams() triggers a client-side-rendering bailout, which throws at
  // on-demand static render ("missing-suspense-with-csr-bailout") unless it sits
  // under a Suspense boundary — so the read lives in a wrapped child.
  return (
    <Suspense>
      <MessageThreadContent />
    </Suspense>
  );
}

'use client';

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

export default function MessageThread() {
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

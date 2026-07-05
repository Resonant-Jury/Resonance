'use client';

import { useParams } from 'next/navigation';
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
  return <MessagesPage activeHandle={decodeHandle(params?.handle)} />;
}

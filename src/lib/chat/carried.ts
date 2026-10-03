import type { Card, Message, MessageLinkPreview, User } from '@/lib/db/types';
import type { MessageCard } from './cardLink';

/** What is known of a shared card: on its way, not the viewer's to see, or here (an anonymous one without its author). */
export type CardLookup =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; card: Card; author: User | null };

/**
 * What a message's bubble carries besides its words — the twin of the apps'
 * `Carried`: the card it shares once read (and the viewer's to see), its
 * stand-in while it is read; otherwise its link's preview, or its words
 * alone. A card the viewer can't see falls back: a link to it is a link again
 * (with its preview, if the server made one); a shared one shows nothing of
 * itself — and a message that was only that card shows nothing at all.
 */
export type Carried =
  | { kind: 'words' }
  | { kind: 'preview'; preview: MessageLinkPreview }
  | { kind: 'card'; card: Card; author: User | null; shared: MessageCard }
  | { kind: 'cardLoading'; shared: MessageCard }
  | { kind: 'nothing' };

/** `shared` is the card the message is about ({@link messageCard}); `lookup` what is known of it. */
export function carriedOf(message: Message, shared: MessageCard | null, lookup: CardLookup | null): Carried {
  if (shared && lookup) {
    if (lookup.status === 'ready') return { kind: 'card', card: lookup.card, author: lookup.author, shared };
    if (lookup.status === 'loading') return { kind: 'cardLoading', shared };
  }
  if (message.preview) return { kind: 'preview', preview: message.preview };
  return message.text || message.noteRef ? { kind: 'words' } : { kind: 'nothing' };
}

/**
 * The words a bubble shows with what it carries: all of them — except that a
 * card a message links to stands for its link, so a message that is the link
 * alone shows none.
 */
export function carriedWords(message: Message, carried: Carried): string {
  if ((carried.kind === 'card' || carried.kind === 'cardLoading') && carried.shared.linkOnly) return '';
  return message.text;
}

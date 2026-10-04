import type { Notification } from '@/lib/db/types';

type Bell = Pick<Notification, 'type' | 'payload'>;

/** The paths a bell row opens. */
export type BellHref = '/me' | `/card/${string}` | `/messages/${string}`;

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/**
 * A note or resonance bell on an anonymous card (`payload.anonymous`, as
 * sendNote and the resonance's reach write it): its row opens the card,
 * never a thread with whoever left it. Opening that thread would mark the
 * conversation read — their unread count there, which they can watch, dropping
 * as the card's author opened it — and a reply from it would answer the
 * anonymous card under its author's name.
 */
export function onAnonymousCard(n: Bell): boolean {
  return (n.type === 'note' || n.type === 'resonance') && n.payload.anonymous === true;
}

/**
 * Where a bell row leads — the place its push opens too (lib/push
 * `pushRoute`); null for a row with no page of its own, which only says what
 * happened. A note opens the thread with it, carrying the note so the thread
 * goes to it and the reply answers it; on an anonymous card, the card.
 */
export function bellHref(n: Bell): BellHref | null {
  const handle = str(n.payload.fromHandle);
  const cardId = str(n.payload.cardId);
  const thread = handle ? (`/messages/${handle}` as const) : null;
  if (onAnonymousCard(n)) return cardId ? `/card/${cardId}` : null;
  switch (n.type) {
    case 'invite':
      return '/me';
    case 'invite_accepted':
    case 'message':
    case 'resonance':
      return thread;
    case 'note': {
      const noteId = str(n.payload.noteId);
      if (!thread || !noteId || !cardId) return thread;
      return `${thread}?${new URLSearchParams({ note: noteId, card: cardId }).toString()}`;
    }
    case 'translation_done':
    case 'card_link':
      return cardId ? `/card/${cardId}` : null;
    default:
      return null;
  }
}

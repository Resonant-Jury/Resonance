'use client';

import { createContext, useContext, type KeyboardEvent, type MouseEvent } from 'react';
import type { OrganicMenuItem } from '@/components/molecules/OrganicMenu/OrganicMenu';
import { canReply, type ChatMessage } from '@/lib/chat/message';
import type { Carried } from '@/lib/chat/carried';
import type { RunPosition } from '@/lib/chat/rows';
import type { MessageLink } from './MessageBubble';

/** A message pressed and held: what the long-press menu lifts out of the thread, and where it was. */
export interface PressedMessage {
  message: ChatMessage;
  position: RunPosition;
  carried: Carried;
  /** The message (its quote and bubble) on the screen as it was pressed. */
  rect: DOMRect;
  /** The link its menu offers: the one under the finger, else the message's own (its preview's, or its first). */
  link: MessageLink | null;
}

/**
 * What every message of an open thread can ask of it — the same functions
 * for as long as the conversation is open, so the rows (memoized) needn't
 * draw again when anything else in the thread changes.
 */
export interface ThreadActions {
  viewerId: string;
  otherHandle: string;
  /** The thread has a composer (not a letter waiting for its answer, nor "not connected"): Reply is offered. */
  canWrite: boolean;
  /**
   * Follows a link by the thread's rules: a card of ours opens here; an
   * address easy to mistake for another (an IP, a punycode name) asks first;
   * anything else opens in a new tab. With the click's (or Enter's) event,
   * the browser's own following is stopped only when the thread takes over.
   */
  openLink(link: MessageLink, e?: MouseEvent<HTMLAnchorElement> | KeyboardEvent<HTMLAnchorElement>): void;
  reply(message: ChatMessage): void;
  /** Goes to a quote's original, reading older pages for it first when it isn't held. */
  jumpTo(messageId: string): void;
  retry(key: string): void;
  discard(key: string): void;
  copy(text: string): void;
  /** A message was pressed and held (a touch screen): it is lifted out with its menu. */
  press(pressed: PressedMessage): void;
}

export const ThreadActionsContext = createContext<ThreadActions | null>(null);

export function useThreadActions(): ThreadActions {
  const actions = useContext(ThreadActionsContext);
  if (!actions) throw new Error('A message is drawn outside of its thread.');
  return actions;
}

/** The words a message's menu rows wear (the page's own strings). */
export interface MenuLabels {
  reply: string;
  copy: string;
  openLink: string;
  copyLink: string;
  retry: string;
  discard: string;
}

/**
 * What a message's menu offers — the apps' long-press menu: Reply (a
 * delivered message), Copy (one with words), the link's Open and Copy (the
 * one under the finger, or the message's own), and for one that didn't go,
 * Retry and Delete. The hover「⋯」leaves Reply out: it has its own button
 * beside it.
 */
export function messageMenuItems(
  message: ChatMessage,
  link: MessageLink | null,
  labels: MenuLabels,
  withReply: boolean,
): OrganicMenuItem[] {
  const items: OrganicMenuItem[] = [];
  if (withReply && canReply(message)) items.push({ key: 'reply', icon: 'reply', label: labels.reply });
  if (message.text) items.push({ key: 'copy', icon: 'copy', label: labels.copy });
  if (link) {
    items.push({ key: 'open', icon: 'link', label: labels.openLink });
    items.push({ key: 'copyLink', icon: 'copy', label: labels.copyLink });
  }
  if (message.delivery === 'failed') {
    items.push({ key: 'retry', icon: 'send', label: labels.retry });
    items.push({ key: 'discard', icon: 'trash', label: labels.discard, danger: true });
  }
  return items;
}

/** Does what a message's menu row `key` says. */
export function chooseMenuItem(key: string, message: ChatMessage, link: MessageLink | null, actions: ThreadActions): void {
  if (key === 'reply') actions.reply(message);
  else if (key === 'copy') actions.copy(message.text);
  else if (key === 'open' && link) actions.openLink(link);
  else if (key === 'copyLink' && link) actions.copy(link.url);
  else if (key === 'retry') actions.retry(message.key);
  else if (key === 'discard') actions.discard(message.key);
}

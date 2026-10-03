import type { Message } from '@/lib/db/types';
import type { MessageHistory } from './history';
import type { ChatMessage } from './message';
import { isShown, outgoingMessage, type Outgoing } from './outbox';

/**
 * What a thread draws: the conversation's {@link MessageHistory} (oldest
 * first), then the viewer's own messages still on their way (the outbox, in
 * the order they were written) — the twin of the apps' ThreadMessages.
 *
 * A message sent from here is drawn the moment it is sent, under a key — its
 * client id — that the document keeps when it arrives, so the row is replaced
 * in place instead of jumping: the server makes the client id the document's
 * id, and where an older server gave the document another id, the answer to
 * the send (`serverId`) tells which document is whose and the key is carried
 * over to it from then on.
 *
 * The same message object comes back for a message that didn't change, so the
 * rows drawn for it needn't draw again.
 */
export class ThreadMessages {
  /** Document id → the key it is drawn under, for the messages sent from here whose document has an id of its own. */
  private readonly keys = new Map<string, string>();
  private delivered = new WeakMap<Message, ChatMessage>();
  private onItsWay = new WeakMap<Outgoing, ChatMessage>();

  /** The thread's messages: all of `history`, then the ones of `outgoing` whose document isn't in it yet. */
  build(history: MessageHistory<unknown>, outgoing: readonly Outgoing[]): ChatMessage[] {
    for (const m of outgoing) {
      if (m.serverId && m.serverId !== m.clientId) this.keys.set(m.serverId, m.clientId);
    }
    const drawn = history.messages.map((m) => this.wrap(m));
    for (const m of outgoing) {
      if (isShown(m, history)) continue;
      let message = this.onItsWay.get(m);
      if (!message) this.onItsWay.set(m, (message = outgoingMessage(m)));
      drawn.push(message);
    }
    return drawn;
  }

  /** The conversation is gone or started afresh: nothing is carried over. */
  clear(): void {
    this.keys.clear();
    this.delivered = new WeakMap();
    this.onItsWay = new WeakMap();
  }

  private wrap(message: Message): ChatMessage {
    const key = this.keys.get(message.id) ?? message.id;
    const held = this.delivered.get(message);
    if (held && held.key === key) return held;
    const drawn: ChatMessage = { ...message, key, delivery: 'delivered' };
    this.delivered.set(message, drawn);
    return drawn;
  }
}

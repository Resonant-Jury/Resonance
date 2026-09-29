'use client';

/**
 * Ask the server to push a bell row this browser just wrote to its
 * recipient's phone (POST /api/notifications/{id}/push; only the row's
 * sender may, while it's fresh). Fire-and-forget: the row is what matters,
 * the buzz is a courtesy. Writes that go through /api/v1 push on their own.
 */
export function ringNotification(id: string): void {
  void fetch(`/api/notifications/${encodeURIComponent(id)}/push`, { method: 'POST', credentials: 'same-origin' }).catch(() => {});
}

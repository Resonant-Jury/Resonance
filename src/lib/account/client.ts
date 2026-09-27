'use client';

/**
 * Browser side of account deletion + data export (server: src/lib/account,
 * routes under /api/account). Deletion is scheduled with a grace period;
 * see src/lib/account/deletion.ts.
 */

export interface ScheduledDeletion {
  requestedAt: string;
  purgeAfter: string;
}

async function call(method: 'GET' | 'POST' | 'DELETE'): Promise<ScheduledDeletion | null> {
  const res = await fetch('/api/account/deletion', { method });
  if (!res.ok) throw new Error(`Account deletion ${method} failed (${res.status})`);
  const { deletion } = (await res.json()) as { deletion: ScheduledDeletion | null };
  return deletion;
}

export const getMyAccountDeletion = () => call('GET');
export const scheduleMyAccountDeletion = () => call('POST');
export const cancelMyAccountDeletion = () => call('DELETE');

/** Fetch the backup JSON and hand it to the browser as a file download. */
export async function downloadMyData(): Promise<void> {
  const res = await fetch('/api/account/export');
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const name =
    /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'resonance-backup.json';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

'use client';

export async function requestRevalidate(paths: string[]): Promise<void> {
  if (!paths.length) return;
  try {
    await fetch('/api/revalidate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paths }),
    });
  } catch {
    // best-effort: ISR will refresh on next interval anyway
  }
}

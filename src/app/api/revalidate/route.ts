import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { revalidateLocalized } from '@/lib/api/revalidate';

const ALLOWED_PREFIXES = ['/home', '/me', '/card/', '/u/', '/settings'];

function isAllowedPath(path: string): boolean {
  if (!path.startsWith('/')) return false;
  return ALLOWED_PREFIXES.some((prefix) =>
    prefix.endsWith('/') ? path.startsWith(prefix) : path === prefix || path.startsWith(`${prefix}/`)
  );
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { paths?: string[] } | null;
  const paths = body?.paths?.filter(isAllowedPath) ?? [];
  if (!paths.length) return NextResponse.json({ ok: true, revalidated: [] });

  // Routes are locale-prefixed (localePrefix: 'always'), so a logical path
  // like `/home` lives at `/en/home` and `/zh-TW/home`: each is revalidated
  // in every locale, otherwise nothing matches.
  return NextResponse.json({ ok: true, revalidated: revalidateLocalized(paths) });
}

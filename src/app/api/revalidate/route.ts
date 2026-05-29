import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { routing } from '@/i18n/routing';

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
  // like `/home` lives at `/en/home` and `/zh-TW/home`. Expand each path to
  // every locale before revalidating, otherwise nothing matches.
  const revalidated: string[] = [];
  for (const path of paths) {
    for (const locale of routing.locales) {
      const localized = `/${locale}${path}`;
      revalidatePath(localized);
      revalidated.push(localized);
    }
  }
  return NextResponse.json({ ok: true, revalidated });
}

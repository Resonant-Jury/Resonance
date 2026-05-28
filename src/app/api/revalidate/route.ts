import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getCurrentUser, usingMockAuth } from '@/lib/auth';

const ALLOWED_PREFIXES = ['/home', '/me', '/card/', '/u/', '/settings'];

function isAllowedPath(path: string): boolean {
  if (!path.startsWith('/')) return false;
  return ALLOWED_PREFIXES.some((prefix) =>
    prefix.endsWith('/') ? path.startsWith(prefix) : path === prefix || path.startsWith(`${prefix}/`)
  );
}

export async function POST(req: Request) {
  if (!usingMockAuth()) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { paths?: string[] } | null;
  const paths = body?.paths?.filter(isAllowedPath) ?? [];
  if (!paths.length) return NextResponse.json({ ok: true, revalidated: [] });

  for (const path of paths) {
    revalidatePath(path);
  }
  return NextResponse.json({ ok: true, revalidated: paths });
}

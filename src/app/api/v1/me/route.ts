import { NextResponse } from 'next/server';
import { parse, withUser } from '@/lib/api/v1/http';
import { createProfile, updateProfile } from '@/lib/api/v1/profile';
import { CreateProfileRequest, UpdateProfileRequest } from '@/lib/api/v1/schemas';
import { getMe } from '@/lib/api/v1/service';
import { profilePagePaths, revalidateLocalized } from '@/lib/api/revalidate';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { OWN, cachedJson } from '@/lib/api/v1/cache';

export const dynamic = 'force-dynamic';

/** GET /api/v1/me — the signed-in account (see openapi/v1/openapi.json). */
export const GET = withUser(async (user, req) => cachedJson(req, await getMe(getAdminDb(), user.id), OWN));

/** POST /api/v1/me — onboarding: create the profile (201), or return the existing one (200). */
export const POST = withUser(async (user, req) => {
  const input = parse(CreateProfileRequest, await req.json().catch(() => null));
  const { me, created } = await createProfile(getAdminDb(), user, input);
  if (created) revalidateProfile(me.handle);
  return NextResponse.json(me, { status: created ? 201 : 200 });
});

/** PATCH /api/v1/me — change the profile fields sent. */
export const PATCH = withUser(async (user, req) => {
  const input = parse(UpdateProfileRequest, await req.json().catch(() => null));
  const { me, previousHandle } = await updateProfile(getAdminDb(), user.id, input);
  // The public page is cached under the pen name — and under the old one after a rename.
  revalidateProfile(me.handle, previousHandle);
  return NextResponse.json(me);
});

function revalidateProfile(...handles: (string | null)[]) {
  revalidateLocalized(handles.flatMap(profilePagePaths));
}

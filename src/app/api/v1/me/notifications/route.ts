import { NextResponse } from 'next/server';
import { parse, withUser } from '@/lib/api/v1/http';
import { UpdateNotificationSettingsRequest } from '@/lib/api/v1/schemas';
import { OWN, cachedJson } from '@/lib/api/v1/cache';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { getNotificationSettings, updateNotificationSettings } from '@/lib/push/settings';

export const dynamic = 'force-dynamic';

/** GET /api/v1/me/notifications — the pushes this account asked for (see lib/push/settings). */
export const GET = withUser(async (user, req) => cachedJson(req, await getNotificationSettings(getAdminDb(), user.id), OWN));

/** PATCH /api/v1/me/notifications — turn the switches sent on or off; answers the settings as they are now. */
export const PATCH = withUser(async (user, req) => {
  const input = parse(UpdateNotificationSettingsRequest, await req.json().catch(() => null));
  return NextResponse.json(await updateNotificationSettings(getAdminDb(), user.id, input));
});

import { NextResponse } from 'next/server';
import { ApiFailure, parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { InstallationIdParam, RegisterDeviceRequest } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { registerDevice, unregisterDevice } from '@/lib/push/devices';

export const dynamic = 'force-dynamic';

/** PUT /api/v1/me/devices/{installationId} — this install's push token, now yours (see registerDevice). */
export const PUT = withUser(async (user, req, ctx: RouteContext<'installationId'>) => {
  const id = parse(InstallationIdParam, await routeParam(ctx, 'installationId'));
  const body = await req.json().catch(() => {
    throw new ApiFailure('invalid_request', 'The body must be JSON.');
  });
  await registerDevice(getAdminDb(), user.id, id, parse(RegisterDeviceRequest, body));
  return new NextResponse(null, { status: 204 });
});

/** DELETE /api/v1/me/devices/{installationId} — on sign-out: no more pushes to this install. */
export const DELETE = withUser(async (user, _req, ctx: RouteContext<'installationId'>) => {
  const id = parse(InstallationIdParam, await routeParam(ctx, 'installationId'));
  await unregisterDevice(getAdminDb(), user.id, id);
  return new NextResponse(null, { status: 204 });
});

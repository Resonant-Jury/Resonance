import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import type { AuthUser } from '@/lib/auth/types';
import type { ApiErrorBody } from './schemas';

type Code = ApiErrorBody['error']['code'];

const STATUS: Record<Code, number> = {
  unauthenticated: 401,
  invalid_request: 400,
  forbidden: 403,
  blocked: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  internal: 500,
};

/** A failure a v1 handler can throw; rendered as the ApiError body. */
export class ApiFailure extends Error {
  constructor(
    readonly code: Code,
    message: string,
    readonly issues?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

/** A failure is never kept: the next ask may well succeed (see ./cache). */
export function apiError(code: Code, message: string, issues?: { path: string; message: string }[]) {
  const body: ApiErrorBody = { error: { code, message, ...(issues ? { issues } : {}) } };
  return NextResponse.json(body, { status: STATUS[code], headers: { 'Cache-Control': 'no-store' } });
}

export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiFailure(
      'invalid_request',
      'The request does not match the contract.',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}

/** Requests this instance has served: the first one paid for its cold start. */
let served = 0;

/**
 * Where an answer's time went, for measuring from the outside (region,
 * transport, cold starts): `auth` (verifying the caller), `app` (the
 * handler: mostly Firestore round trips) and `cold` on an instance's first
 * request. Durations only — nothing the caller couldn't time itself.
 */
function timed(res: Response, auth: number, app: number | null, cold: boolean): Response {
  const parts = [`auth;dur=${auth.toFixed(1)}`, ...(app === null ? [] : [`app;dur=${app.toFixed(1)}`]), ...(cold ? ['cold'] : [])];
  try {
    res.headers.append('Server-Timing', parts.join(', '));
  } catch {
    // A response with immutable headers just goes without.
  }
  return res;
}

/**
 * Wrap a v1 handler: require a user (session cookie or `Authorization:
 * Bearer <Firebase ID token>`), map ApiFailure to its status, and never leak
 * internals on unexpected errors. Reads (GET) accept this instance's recent
 * answer on whether the session was revoked; every write asks Firebase Auth
 * (see "Revocation" in lib/auth/firebase/server). When Firebase Auth can't
 * be asked the answer is 500, not 401: the app must not sign its user out.
 * Every answer says where its time went (`Server-Timing`, see timed()).
 */
export function withUser<A extends unknown[]>(handler: (user: AuthUser, req: Request, ...rest: A) => Promise<Response>) {
  return async (req: Request, ...rest: A): Promise<Response> => {
    const cold = served++ === 0;
    const start = performance.now();
    const read = req.method === 'GET' || req.method === 'HEAD';
    let user: AuthUser | null;
    try {
      user = await getCurrentUser({ revocation: read ? 'cached' : 'live' });
    } catch (e) {
      console.error('[api/v1] auth', e);
      return timed(apiError('internal', 'Something went wrong.'), performance.now() - start, null, cold);
    }
    const authed = performance.now();
    if (!user) return timed(apiError('unauthenticated', 'Sign in, or send a Firebase ID token as a Bearer token.'), authed - start, null, cold);
    let res: Response;
    try {
      res = await handler(user, req, ...rest);
    } catch (e) {
      if (e instanceof ApiFailure) res = apiError(e.code, e.message, e.issues);
      else {
        console.error('[api/v1]', e);
        res = apiError('internal', 'Something went wrong.');
      }
    }
    return timed(res, authed - start, performance.now() - authed, cold);
  };
}

/** Next.js passes a dynamic route's params as a promise. */
export interface RouteContext<K extends string> {
  params: Promise<Record<K, string>>;
}

/** A dynamic route segment, percent-decoded (a pen name may be written in any script). */
export async function routeParam<K extends string>(ctx: RouteContext<K>, name: K): Promise<string> {
  const raw = (await ctx.params)[name] ?? '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

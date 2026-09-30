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

export function apiError(code: Code, message: string, issues?: { path: string; message: string }[]) {
  const body: ApiErrorBody = { error: { code, message, ...(issues ? { issues } : {}) } };
  return NextResponse.json(body, { status: STATUS[code] });
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

/**
 * Wrap a v1 handler: require a user (session cookie or `Authorization:
 * Bearer <Firebase ID token>`), map ApiFailure to its status, and never leak
 * internals on unexpected errors. Reads (GET) accept this instance's recent
 * answer on whether the session was revoked; every write asks Firebase Auth
 * (see "Revocation" in lib/auth/firebase/server). When Firebase Auth can't
 * be asked the answer is 500, not 401: the app must not sign its user out.
 */
export function withUser<A extends unknown[]>(handler: (user: AuthUser, req: Request, ...rest: A) => Promise<Response>) {
  return async (req: Request, ...rest: A): Promise<Response> => {
    const read = req.method === 'GET' || req.method === 'HEAD';
    let user: AuthUser | null;
    try {
      user = await getCurrentUser({ revocation: read ? 'cached' : 'live' });
    } catch (e) {
      console.error('[api/v1] auth', e);
      return apiError('internal', 'Something went wrong.');
    }
    if (!user) return apiError('unauthenticated', 'Sign in, or send a Firebase ID token as a Bearer token.');
    try {
      return await handler(user, req, ...rest);
    } catch (e) {
      if (e instanceof ApiFailure) return apiError(e.code, e.message, e.issues);
      console.error('[api/v1]', e);
      return apiError('internal', 'Something went wrong.');
    }
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

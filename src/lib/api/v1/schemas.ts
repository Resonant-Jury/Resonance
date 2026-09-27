import { z } from 'zod';

/**
 * The versioned API contract for the native apps (and anything else outside
 * the web client). These Zod schemas are the single source of truth: routes
 * validate with them, and `npm run api:openapi` turns them into
 * openapi/v1/openapi.json, from which the Swift and Kotlin clients are
 * generated. Changing a schema is changing the contract — additive only
 * within v1 (new optional fields, new endpoints); clients must tolerate
 * fields they do not know.
 */
export const apiRegistry = z.registry<{ id: string }>();

function named<T extends z.ZodType>(schema: T, id: string, description?: string): T {
  const s = (description ? schema.describe(description) : schema) as T;
  apiRegistry.add(s, { id });
  return s;
}

export const ErrorCode = named(
  z.enum(['unauthenticated', 'invalid_request', 'forbidden', 'blocked', 'not_found', 'conflict', 'rate_limited', 'internal']),
  'ErrorCode',
);

export const ApiError = named(
  z.object({
    error: z.object({
      code: ErrorCode,
      message: z.string(),
      /** Field-level problems for `invalid_request`. */
      issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    }),
  }),
  'ApiError',
  'Every non-2xx response has this shape.',
);

export const Me = named(
  z.object({
    id: z.string(),
    handle: z.string(),
    initials: z.string(),
    accentColor: z.string(),
    bio: z.string().nullable(),
    avatarUrl: z.string().nullable(),
  }),
  'Me',
  'The signed-in account.',
);

export const Author = named(
  z.object({
    id: z.string(),
    handle: z.string(),
    initials: z.string(),
    accentColor: z.string(),
  }),
  'Author',
);

export const FeedCard = named(
  z.object({
    id: z.string(),
    slug: z.string().nullable(),
    title: z.string(),
    excerpt: z.string(),
    tags: z.array(z.string()),
    publishedAt: z.string().describe('ISO 8601'),
    /** Null for anonymous cards: the byline is never revealed. */
    author: Author.nullable(),
  }),
  'FeedCard',
);

export const FeedPage = named(
  z.object({
    cards: z.array(FeedCard),
    /** Pass back as `cursor` for the next page; null at the end. */
    nextCursor: z.string().nullable(),
  }),
  'FeedPage',
);

export const INVITE_MESSAGE_MAX = 500;

/**
 * A user or card id as the client sends it. Ids become Firestore document
 * paths on the server, so a `/` would let a caller point a read at another
 * user's subcollection (e.g. `alice/blocks/bob`); Firebase uids and
 * auto-ids never contain one.
 */
const DocId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/, 'Not a valid id.');

// Optional request fields accept `null` as "absent": generated clients differ
// (Swift omits a nil field, Kotlin's kotlinx.serialization sends `null`).
export const CreateInviteRequest = named(
  z.object({
    toUserId: DocId,
    message: z.string().trim().min(1).max(INVITE_MESSAGE_MAX),
    referenceCardId: DocId.nullish(),
  }),
  'CreateInviteRequest',
);

export const CreateInviteResponse = named(z.object({ id: z.string() }), 'CreateInviteResponse');

export const FeedQuery = z.object({
  limit: z.coerce.number().int().min(1).max(30).default(12),
  cursor: z.iso.datetime().optional(),
});

export type ApiErrorBody = z.infer<typeof ApiError>;
export type MeBody = z.infer<typeof Me>;
export type FeedCardBody = z.infer<typeof FeedCard>;
export type FeedPageBody = z.infer<typeof FeedPage>;
export type CreateInviteInput = z.infer<typeof CreateInviteRequest>;

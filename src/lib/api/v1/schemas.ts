import { z } from 'zod';

/**
 * The versioned API contract for the native apps (and anything else outside
 * the web client). These Zod schemas are the single source of truth: routes
 * validate with them, and `npm run api:openapi` turns them into
 * openapi/v1/openapi.json, from which the Swift and Kotlin clients are
 * generated. Changing a schema is changing the contract — additive only
 * within v1 (new optional fields, new endpoints); clients must tolerate
 * fields they do not know.
 *
 * Response enums are the exception to "additive": a generated client decodes
 * an enum into a closed type, and one value it does not know fails the whole
 * answer (a feed page, a profile) — so adding a value to an enum a response
 * carries (visibility, primaryLocale, status, …) is a breaking change within
 * v1, and the server never sends anything else: what it reads from Firestore
 * is normalized to the documented values first (`visibilityOf` in
 * ./present). Request enums may grow (an old client just never sends the
 * new value).
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

export const AccountDeletionStatus = named(
  z.object({
    requestedAt: z.iso.datetime(),
    /** When the account is purged; signing in before then can cancel it. */
    purgeAfter: z.iso.datetime(),
  }),
  'AccountDeletionStatus',
  'A scheduled deletion of the account (what GET /api/account/deletion answers as `deletion`).',
);

export const Me = named(
  z.object({
    id: z.string(),
    handle: z.string(),
    initials: z.string(),
    accentColor: z.string(),
    bio: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    /** ISO 3166 code (e.g. TW) or free text; null when never set. */
    region: z.string().nullable(),
    primaryLocale: z.enum(['en', 'zh-TW']).nullable(),
    /** When the pen name last changed (the settings hint: once every 30 days). */
    handleChangedAt: z.iso.datetime().nullable(),
    /**
     * The account's scheduled deletion (the undo banner shows until
     * `purgeAfter`), null when none — so the app needs no second request.
     * Absent only from servers older than the field.
     */
    deletion: AccountDeletionStatus.nullable().optional(),
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
    avatarUrl: z.string().nullable(),
    /** Seeds the hand-drawn avatar's wobble, so it matches the web. */
    avatarSeed: z.string().nullable(),
    verified: z.boolean(),
    region: z.string().nullable(),
  }),
  'Author',
);

export const FeedCard = named(
  z.object({
    id: z.string(),
    slug: z.string().nullable(),
    title: z.string(),
    /** Plain text (Markdown stripped), at most 96 characters as on the web's story cards. */
    excerpt: z.string(),
    tags: z.array(z.string()),
    /** ISO 8601; null for a draft (only its author ever sees one). */
    publishedAt: z.string().nullable(),
    /**
     * Null for anonymous cards: the byline is never revealed — except to the
     * author, in their own card box (which marks the card `anonymous`).
     */
    author: Author.nullable(),
    anonymous: z.boolean(),
    visibility: z.enum(['public', 'connections', 'private']),
    imageUrl: z.string().nullable(),
    imageLabel: z.string().nullable(),
    /** The cover's dominant hue, which picks the card's palette (lib/design/dominantHue). */
    accentHue: z.number().nullable(),
    readMinutes: z.number().int(),
    /** The card this one resonates with (a response card), if any. */
    referenceCardId: z.string().nullable(),
    /** Recommended feed only: why this card was picked for the reader. */
    reason: z.string().nullable(),
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

export const CardList = named(z.object({ cards: z.array(FeedCard) }), 'CardList');

export const RecommendedFeed = named(
  z.object({
    cards: z.array(FeedCard),
    /**
     * `fresh`: today's picks. `stale`: earlier picks, or a quick first pass
     * without reasons, while today's are being prepared — asking again a
     * minute or so later brings them. Absent means `fresh`. No other value
     * is added within v1.
     */
    status: z
      .enum(['fresh', 'stale'])
      .optional()
      .describe("fresh: today's picks. stale: earlier (or quick, reason-less) picks while today's are prepared; ask again later. Absent: fresh."),
  }),
  'RecommendedFeed',
  "Today's picks (a CardList, plus whether they are today's).",
);

export const CardDetail = named(
  z.object({
    card: FeedCard,
    /** The story, as stored: Markdown (see src/lib/markdown/editorSchema.ts). */
    story: z.string(),
    visibility: z.enum(['public', 'connections', 'private']),
    anonymous: z.boolean(),
    resonanceCount: z.number().int(),
    /** The insight the recommender distilled from the story, if indexed. */
    coreInsight: z.string().nullable(),
    /** The viewer wrote this card. */
    isOwner: z.boolean(),
    /** The card this one responds to, when the viewer may see it. */
    referenceCard: FeedCard.nullable(),
    // The card page's lists, when asked for with `include` (absent otherwise):
    // each is exactly what its own endpoint answers this viewer.
    /** `include=resonances`: GET /cards/{id}/resonances. */
    resonances: CardList.optional(),
    /** `include=related`: GET /cards/{id}/related. */
    related: CardList.optional(),
    /** `include=links`: GET /cards/{id}/links (empty unless the viewer wrote the card). */
    links: CardList.optional(),
    /**
     * `include=embeds`: the cards the story embeds (a card link standing alone
     * in its paragraph), in reading order, each once — those the viewer may
     * read, minus authors they blocked. Match a link's /card/{key} to a card's
     * slug or id; a link with no card here is drawn as a plain link.
     */
    embeds: CardList.optional(),
  }),
  'CardDetail',
);

export const Profile = named(
  z.object({
    author: Author,
    bio: z.string().nullable(),
    joinedAt: z.string().describe('ISO 8601'),
    /** Public, attributed cards, counted like the web's profile (its first 40). */
    cardCount: z.number().int(),
    isSelf: z.boolean(),
    isConnected: z.boolean(),
    /** The viewer blocked this person: their cards are not listed. */
    isBlocked: z.boolean(),
    /** `include=cards`: the first page of GET /users/{handle}/cards (with this request's `limit`). */
    cards: FeedPage.optional(),
    /** `include=links`: GET /users/{handle}/links. */
    links: CardList.optional(),
  }),
  'Profile',
);

/**
 * A user or card id as the client sends it. Ids become Firestore document
 * paths on the server, so a `/` would let a caller point a read at another
 * user's subcollection (e.g. `alice/blocks/bob`); Firebase uids and
 * auto-ids never contain one.
 */
const DocId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/, 'Not a valid id.');

// Optional request fields accept `null` as "absent": generated clients differ
// (Swift omits a nil field, Kotlin's kotlinx.serialization sends `null`).

/** The web's limits: a pen name of 2–20 characters (any script), an 80-character bio. */
export const HANDLE_MIN = 2;
export const HANDLE_MAX = 20;
export const BIO_MAX = 80;

/**
 * A pen name as it is saved: trimmed, 2–20 characters, any script — but never
 * a path or query (it is the /u/{handle} segment), no control characters,
 * and nothing Firestore can't take as its reservation's id (`..`, `__…__`).
 */
const Handle = z
  .string()
  .trim()
  .min(HANDLE_MIN)
  .max(HANDLE_MAX)
  .regex(/^[^/?#\\\p{Cc}]+$/u, 'Not a valid pen name.')
  .refine((h) => h !== '..' && !/^__.*__$/.test(h.toLowerCase()), 'Not a valid pen name.');
const Locale = z.enum(['en', 'zh-TW']);
const Region = z.string().trim().min(1).max(40);

export const CreateProfileRequest = named(
  z.object({ handle: Handle, region: Region, primaryLocale: Locale }),
  'CreateProfileRequest',
  'Onboarding: the pen name, region and writing language of a new account.',
);

export const UpdateProfileRequest = named(
  z.object({
    handle: Handle.nullish(),
    /** An empty string clears the bio. */
    bio: z.string().trim().max(BIO_MAX).nullish(),
    region: Region.nullish(),
    primaryLocale: Locale.nullish(),
  }),
  'UpdateProfileRequest',
  'Only the fields sent change.',
);

export const UpdateCardRequest = named(
  z.object({
    visibility: z.enum(['public', 'connections', 'private']).nullish(),
    anonymous: z.boolean().nullish(),
  }),
  'UpdateCardRequest',
  'Your card\'s visibility and byline; only the fields sent change.',
);

export const PublishResponse = named(
  z.object({
    id: z.string(),
    /** The English URL slug; null if generating it failed (the card is live at its id). */
    slug: z.string().nullable(),
    /** False when it was already live (publishing again never re-dates a card). */
    firstPublish: z.boolean(),
  }),
  'PublishResponse',
);

export const ApplyEditResponse = named(
  z.object({
    id: z.string(),
    /** Where the card lives: its English slug, or null (it is served at its id). */
    slug: z.string().nullable(),
    /** False when there was no pending edit to apply (applying twice changes nothing). */
    applied: z.boolean(),
  }),
  'ApplyEditResponse',
);

/** The web's limits (client/notes.ts, client/messages.ts; mirrored in firestore.rules). */
export const NOTE_TEXT_MAX = 2000;
export const MESSAGE_TEXT_MAX = 2000;

export const SendNoteRequest = named(
  z.object({
    cardId: DocId,
    text: z.string().trim().min(1).max(NOTE_TEXT_MAX),
  }),
  'SendNoteRequest',
  "A note to a card's author (the server finds the author — anonymous cards too).",
);

export const SendNoteResponse = named(z.object({ id: z.string() }), 'SendNoteResponse');

export const NoteRef = named(z.object({ cardId: DocId, noteId: DocId }), 'NoteRef', 'The note a message answers.');

export const SendMessageRequest = named(
  z.object({
    /** The other person's user id. */
    to: DocId,
    /** May be empty when a card is attached. */
    text: z.string().trim().max(MESSAGE_TEXT_MAX),
    /** A card attached to the message (its id). */
    cardRef: DocId.nullish(),
    noteRef: NoteRef.nullish(),
  }),
  'SendMessageRequest',
);

export const SendMessageResponse = named(
  z.object({
    /** conversations/{id}: the two user ids, sorted, joined by "_". */
    conversationId: z.string(),
    id: z.string(),
  }),
  'SendMessageResponse',
);

export const AcceptInviteResponse = named(
  z.object({
    /** connections/{id}: the two user ids, sorted, joined by "_". */
    connectionId: z.string(),
  }),
  'AcceptInviteResponse',
);

export const RegisterDeviceRequest = named(
  z.object({
    /** The FCM registration token (iOS: FCM's token for the APNs one). */
    token: z.string().min(1).max(4096),
    platform: z.enum(['ios', 'android']),
    /** The app's UI language — pushes are written in it ("zh…" reads zh-TW, anything else en). */
    locale: z.string().max(35).nullish(),
    appVersion: z.string().max(40).nullish(),
  }),
  'RegisterDeviceRequest',
  "This install's push token. Register after sign-in and whenever the token or the app's language changes.",
);

/** firestore.rules' cap on a report's details (REPORT_DETAIL_MAX on the web). */
export const REPORT_DETAIL_MAX = 1000;

const ReportReason = z.enum(['spam', 'harassment', 'hate', 'sexual', 'self_harm', 'violence', 'other']);

export const ReportCardRequest = named(
  z.object({
    reason: ReportReason,
    detail: z.string().trim().max(REPORT_DETAIL_MAX).nullish(),
  }),
  'ReportCardRequest',
  "Report a card — anonymous ones too: the server knows its author, the app doesn't.",
);

export const CreateReportRequest = named(
  z.object({
    /** `user`: a person (their profile). `message`: a message someone sent you. Cards: POST /cards/{key}/report. */
    targetType: z.enum(['user', 'message']),
    /** `user`: their user id. `message`: the message's id — or the conversation's own id, to report it as a whole. */
    targetId: DocId,
    /** `message`: the conversation it is in (conversations/{id}). */
    conversationId: DocId.nullish(),
    reason: ReportReason,
    detail: z.string().trim().max(REPORT_DETAIL_MAX).nullish(),
  }),
  'CreateReportRequest',
  'Report a person or a message. The server keeps a copy of what was reported, so deleting it later erases no evidence.',
);

export const CreateReportResponse = named(z.object({ id: z.string() }), 'CreateReportResponse');

export const HandleAvailability = named(
  z.object({ handle: z.string(), available: z.boolean() }),
  'HandleAvailability',
  'Whether a pen name is free (your own counts as free).',
);

export const FeedQuery = z.object({
  limit: z.coerce.number().int().min(1).max(30).default(12),
  cursor: z.iso.datetime().optional(),
});

/** A comma-separated list of names (`include=a,b`): the known ones, as a set; unknown names are ignored. */
function includeList<const T extends readonly string[]>(names: T) {
  return z
    .string()
    .max(200)
    .optional()
    .transform((v) => new Set((v ?? '').split(',').map((n) => n.trim()).filter((n): n is T[number] => (names as readonly string[]).includes(n))));
}

/** What GET /cards/{key} can bring along (`include=`). */
export const CARD_INCLUDES = ['resonances', 'related', 'links', 'embeds'] as const;
export const CardDetailQuery = z.object({ include: includeList(CARD_INCLUDES) });

/** What GET /users/{handle} can bring along (`include=`), and the included cards page's size. */
export const PROFILE_INCLUDES = ['cards', 'links'] as const;
export const ProfileQuery = z.object({ include: includeList(PROFILE_INCLUDES), limit: FeedQuery.shape.limit });

/** The card box's shelves (the web's me page). */
export const CardBoxTab = z.enum(['published', 'private', 'draft', 'resonated', 'linked', 'bookmarks']);
export const CardBoxQuery = z.object({ tab: CardBoxTab });

/** A card's URL segment: its English slug or (older cards) its document id. */
export const CardKey = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/, 'Not a valid card.');
export const CardIdParam = DocId;
/** GET /cards?keys=: at most this many slugs or ids at once. */
export const CARD_KEYS_MAX = 30;
export const CardKeysQuery = z.object({
  keys: z
    .string()
    .transform((v) => v.split(',').map((k) => k.trim()).filter(Boolean))
    .pipe(z.array(CardKey).min(1).max(CARD_KEYS_MAX)),
});
export const InviteIdParam = DocId;
export const NotificationIdParam = DocId;
/** An app install's own stable id (a UUID it keeps; Firebase Installations' id also fits). */
export const InstallationIdParam = z.string().regex(/^[A-Za-z0-9_.:-]{8,128}$/, 'Not a valid installation id.');
/** Pen names may be any script (2–20 characters); never a path. */
export const HandleParam = z.string().trim().min(1).max(40).regex(/^[^/?#]+$/, 'Not a valid handle.');

export type ApiErrorBody = z.infer<typeof ApiError>;
export type MeBody = z.infer<typeof Me>;
export type FeedCardBody = z.infer<typeof FeedCard>;
export type FeedPageBody = z.infer<typeof FeedPage>;
export type RecommendedFeedBody = z.infer<typeof RecommendedFeed>;
export type AuthorBody = z.infer<typeof Author>;
export type CardDetailBody = z.infer<typeof CardDetail>;
export type ProfileBody = z.infer<typeof Profile>;
export type CardBoxTabName = z.infer<typeof CardBoxTab>;
export type CreateProfileInput = z.infer<typeof CreateProfileRequest>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileRequest>;
export type ReportCardInput = z.infer<typeof ReportCardRequest>;
export type CreateReportInput = z.infer<typeof CreateReportRequest>;
export type UpdateCardInput = z.infer<typeof UpdateCardRequest>;
export type CardListBody = z.infer<typeof CardList>;
export type CardInclude = (typeof CARD_INCLUDES)[number];
export type ProfileInclude = (typeof PROFILE_INCLUDES)[number];

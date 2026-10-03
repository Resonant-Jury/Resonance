import { z } from 'zod';
import { apiRegistry, CARD_INCLUDES, CARD_KEYS_MAX, CardBoxTab, PROFILE_INCLUDES } from './schemas';

type Json = Record<string, unknown>;

const ref = (id: string) => ({ $ref: `#/components/schemas/${id}` });
const json = (schema: Json) => ({ content: { 'application/json': { schema } } });
const errors = (...codes: number[]) =>
  Object.fromEntries(codes.map((c) => [String(c), { description: 'Error', ...json(ref('ApiError')) }]));
const pathParam = (name: string, description: string) => ({ name, in: 'path', required: true, description, schema: { type: 'string' } });
const pageParams = [
  { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 30, default: 12 } },
  {
    name: 'cursor',
    in: 'query',
    required: false,
    description: "A page's `nextCursor` (to the millisecond: cards sharing it can be skipped). Prefer `pageToken`.",
    schema: { type: 'string', format: 'date-time' },
  },
  {
    name: 'pageToken',
    in: 'query',
    required: false,
    description: "A page's `nextPageToken`: resumes exactly after its last card. Wins over `cursor`.",
    schema: { type: 'string', maxLength: 512 },
  },
];
const get = (operationId: string, summary: string, schema: string, extra: Json = {}, errorCodes = [400, 401, 404]) => ({
  get: { operationId, summary, ...extra, responses: { '200': { description: 'OK', ...json(ref(schema)) }, ...errors(...errorCodes) } },
});
const cardId = pathParam('key', 'The card id');
const handle = pathParam('handle', 'Pen name (any script)');
const include = (names: readonly string[], what: string) => ({
  name: 'include',
  in: 'query',
  required: false,
  description: `${what}, comma-separated (e.g. \`${names.join(',')}\`): ${names.join(', ')}. Unknown names are ignored.`,
  schema: { type: 'string' },
});

/**
 * OpenAPI 3.0 for /api/v1, built from the Zod schemas in ./schemas.
 * (3.0 rather than 3.1: both the Swift and the Kotlin generators handle it fully.)
 */
export function buildOpenApi(): Json {
  const { schemas } = z.toJSONSchema(apiRegistry, {
    target: 'openapi-3.0',
    uri: (id) => `#/components/schemas/${id}`,
  }) as { schemas: Record<string, Json> };

  // Components are referenced, not identified: drop JSON Schema `$id`s. And
  // drop `additionalProperties: false` — v1 grows by adding fields, so
  // clients must not reject ones they don't know yet.
  // And an optional reference with nothing beside it is the reference itself
  // (Zod wraps it in a one-item allOf, which the generators turn into a
  // wrapper type for no reason).
  const clean = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(clean);
    if (node && typeof node === 'object') {
      const { allOf } = node as { allOf?: unknown[] };
      if (Object.keys(node).length === 1 && Array.isArray(allOf) && allOf.length === 1) return clean(allOf[0]);
      const out: Json = {};
      for (const [k, v] of Object.entries(node)) {
        if (k === '$id' || (k === 'additionalProperties' && v === false)) continue;
        out[k] = clean(v);
      }
      return out;
    }
    return node;
  };
  const components = Object.fromEntries(Object.entries(schemas).map(([k, v]) => [k, clean(v)]));

  return {
    openapi: '3.0.3',
    info: {
      title: 'Resonance API',
      version: '1.0.0',
      description:
        'The versioned API for the native apps. Authenticate with `Authorization: Bearer <Firebase ID token>` ' +
        '(the web uses its session cookie). Additive changes only within v1.',
    },
    servers: [{ url: '/api/v1' }],
    security: [{ firebaseIdToken: [] }],
    paths: {
      '/me': {
        get: {
          operationId: 'getMe',
          summary: 'The signed-in account',
          responses: { '200': { description: 'OK', ...json(ref('Me')) }, ...errors(401, 404) },
        },
        post: {
          operationId: 'createProfile',
          summary: 'Onboarding: create your profile (an existing one comes back unchanged, unless it has no pen name yet)',
          description:
            'A profile without a pen name — made before onboarding asked for one — takes the one sent (reserved, `409` when taken) ' +
            'with the region and writing language sent, keeping the rest; it then comes back `200`. Reaching anyone ' +
            '(a note, a message, a resonance that rings) takes a pen name.',
          requestBody: { required: true, ...json(ref('CreateProfileRequest')) },
          responses: {
            '200': { description: 'Already had a profile (named now, if it had no pen name)', ...json(ref('Me')) },
            '201': { description: 'Created', ...json(ref('Me')) },
            ...errors(400, 401, 409),
          },
        },
        patch: {
          operationId: 'updateProfile',
          summary: 'Change your pen name, bio, region or writing language',
          requestBody: { required: true, ...json(ref('UpdateProfileRequest')) },
          responses: { '200': { description: 'OK', ...json(ref('Me')) }, ...errors(400, 401, 404, 409) },
        },
      },
      '/handles/{handle}': get('getHandleAvailability', 'Whether a pen name is free', 'HandleAvailability', {
        parameters: [handle],
      }, [400, 401]),
      '/me/cards': get('getCardBox', 'One shelf of your card box', 'CardList', {
        parameters: [
          { name: 'tab', in: 'query', required: true, schema: { type: 'string', enum: [...CardBoxTab.options] } },
        ],
      }, [400, 401]),
      '/me/cardbox': get('getCardBoxShelves', 'Several shelves of your card box at once', 'CardBox', {
        description: 'Each shelf asked for comes back exactly as `/me/cards?tab=` answers it; shelves not asked for are absent.',
        parameters: [
          {
            name: 'shelves',
            in: 'query',
            required: true,
            description: `Shelves, comma-separated (e.g. \`published,private,draft\`): ${CardBoxTab.options.join(', ')}. Unknown names are ignored.`,
            schema: { type: 'string', maxLength: 200 },
          },
        ],
      }, [400, 401]),
      '/feed': get('getFeed', 'Latest public cards, newest first (named cards of people you blocked are left out)', 'FeedPage', {
        description: 'Anonymous cards come without a byline, and a block never leaves one out: that would name its author.',
        parameters: pageParams,
      }, [400, 401]),
      '/feed/recommended': get('getRecommendedFeed', "Today's picks for you, each with the reason it was picked", 'RecommendedFeed', {
        description:
          'Answers at once from the latest picks. While today\'s are being prepared `status` is `stale` ' +
          '(earlier picks, or a quick first pass without reasons); ask again a little later for `fresh` ones.',
      }, [401]),
      '/cards': get('getCards', 'Several cards at once, by slug or id, as list summaries (no story)', 'CardList', {
        description:
          'In the order asked, each card once; cards you may not read, named cards by someone you blocked, and unknown keys are ' +
          'left out. Anonymous cards come without a byline, and a block never leaves one out (nor any list or feed): that would ' +
          'name its author.',
        parameters: [
          {
            name: 'keys',
            in: 'query',
            required: true,
            description: `Card slugs or ids, comma-separated (1–${CARD_KEYS_MAX})`,
            schema: { type: 'string' },
          },
        ],
      }, [400, 401]),
      '/cards/{key}': {
        ...get('getCard', 'A card you may read, by slug or id, with its story', 'CardDetail', {
          description:
            'With `include`, the lists its page shows come along — each exactly what its own endpoint answers ' +
            '(`resonances`, `related`, `links`) — and `embeds`: the cards its story embeds.',
          parameters: [pathParam('key', 'The card slug, or (older cards) its id'), include(CARD_INCLUDES, 'Lists to bring along')],
        }),
        patch: {
          operationId: 'updateCard',
          summary: "Change your card's visibility and/or anonymity (only the fields sent)",
          description:
            'A published resonance made public under your name — published private, connections-only or anonymous, it reached ' +
            "no one — reaches the original's author after the response, as publishing it so would have: you two connected " +
            '(not when the original is anonymous), their bell rung — once per reader and card, whatever path rang it first; ' +
            'never across a block, nor without a pen name. The answer never waits on it. An anonymous card is public or ' +
            'private: a change that would leave it anonymous and for connections only is `400 invalid_request` ("An anonymous ' +
            'card is public or private."); a card already that way stays so until either field changes.',
          parameters: [pathParam('key', 'The card id')],
          requestBody: { required: true, ...json(ref('UpdateCardRequest')) },
          responses: { '200': { description: 'The card as your card box shows it', ...json(ref('FeedCard')) }, ...errors(400, 401, 404) },
        },
        delete: {
          operationId: 'deleteCard',
          summary: 'Delete your card, draft or published (a retry after success is 404)',
          parameters: [pathParam('key', 'The card id')],
          responses: { '204': { description: 'Deleted' }, ...errors(400, 401, 404) },
        },
      },
      '/cards/{key}/resonances': {
        ...get('getCardResonances', 'Public cards written in response to this one', 'CardList', { parameters: [cardId] }),
        post: {
          operationId: 'resonateWithCard',
          summary: 'Make one of your published public cards a resonance of this one (connects you and rings its author, as publishing one does)',
          description:
            'A card answers one card, and you answer a card with one of yours: `409 conflict` when the card already answers another, ' +
            'or another of your cards already answers this one. Asking again with the same card is `changed: false` and rings no one. ' +
            'An anonymous card connects no one and rings no one; an anonymous original rings its author but connects no one. ' +
            'A block either way is `403 blocked` for a named original; an anonymous one is answered all the same, and the block ' +
            'keeps it from reaching anyone. A card public under your name needs your pen name (`403 forbidden`).',
          parameters: [cardId],
          requestBody: { required: true, ...json(ref('ResonateRequest')) },
          responses: { '200': { description: 'OK', ...json(ref('ResonateResponse')) }, ...errors(400, 401, 403, 404, 409, 429) },
        },
      },
      '/cards/{key}/resonances/{cardId}': {
        delete: {
          operationId: 'unresonateCard',
          summary: 'Your card stops answering this one and stays as a card of its own (204 whether or not it still did)',
          parameters: [pathParam('key', 'The card id it answers'), pathParam('cardId', 'Your card id')],
          responses: { '204': { description: 'It no longer answers this card' }, ...errors(400, 401, 404) },
        },
      },
      '/cards/{key}/related': get('getRelatedCards', 'A few recent cards sharing its tags', 'CardList', { parameters: [cardId] }),
      '/cards/{key}/publish': {
        post: {
          operationId: 'publishCard',
          summary: 'Publish your card: stamps it once, gives it its slug, and lets a resonance reach its original',
          description:
            "A resonance published public under your name reaches the original's author, the first time only: you two connected " +
            '(not when the original is anonymous) and their bell rung — once per reader and card, whatever path rang it first; ' +
            'never across a block, nor without a pen name. A private, connections-only or anonymous one reaches no one. Either ' +
            'way the card is published: reaching out never fails it. An anonymous card is public or private: a draft set to be ' +
            'anonymous and for connections only is `400 invalid_request` ("An anonymous card is public or private.") and stays a draft.',
          parameters: [pathParam('key', 'The card id')],
          responses: { '200': { description: 'OK', ...json(ref('PublishResponse')) }, ...errors(400, 401, 404) },
        },
      },
      '/cards/{key}/edits/apply': {
        post: {
          operationId: 'applyCardEdit',
          summary: 'Apply your pending edit (cards/{id}/edits/current) to your published card, and clear it',
          description:
            "An edit that makes a published resonance public under your name reaches the original's author after the response, " +
            'as a PATCH doing so would (see updateCard). An edit that would leave the card anonymous and for connections only is ' +
            '`400 invalid_request` ("An anonymous card is public or private."), the card and the edit left as they were — unless ' +
            'the card already is so and the edit keeps both.',
          parameters: [pathParam('key', 'The card id')],
          responses: { '200': { description: 'OK', ...json(ref('ApplyEditResponse')) }, ...errors(400, 401, 404) },
        },
      },
      '/cards/{key}/report': {
        post: {
          operationId: 'reportCard',
          summary: 'Report a card you can see (its author, anonymous or not, is filled in by the server)',
          parameters: [pathParam('key', 'The card slug, or its id')],
          requestBody: { required: true, ...json(ref('ReportCardRequest')) },
          responses: { '201': { description: 'Created', ...json(ref('CreateReportResponse')) }, ...errors(400, 401, 404) },
        },
      },
      '/reports': {
        post: {
          operationId: 'createReport',
          summary: 'Report a person or a message sent to you (the server keeps a copy of what was reported)',
          requestBody: { required: true, ...json(ref('CreateReportRequest')) },
          responses: { '201': { description: 'Created', ...json(ref('CreateReportResponse')) }, ...errors(400, 401, 404) },
        },
      },
      '/cards/{key}/links': get('getCardLinks', 'Cards linking to it (empty unless you wrote it)', 'CardList', { parameters: [cardId] }),
      '/users/{handle}': get('getProfile', "A person's profile as you see it", 'Profile', {
        description: 'With `include`, what `/cards` (its first page, of `limit` cards) and `/links` answer come along.',
        parameters: [handle, include(PROFILE_INCLUDES, 'Lists to bring along'), pageParams[0]],
      }),
      '/users/{handle}/cards': get('getProfileCards', 'Their public cards, newest first (never anonymous ones)', 'FeedPage', {
        parameters: [handle, ...pageParams],
      }),
      '/users/{handle}/links': get('getProfileLinks', "Cards by others that link to theirs", 'CardList', { parameters: [handle] }),
      '/invites/{id}/accept': {
        post: {
          operationId: 'acceptInvite',
          summary: "Accept a legacy invite sent to you: connects you two and rings its sender's bell (accepting again changes nothing)",
          description:
            '`409 conflict` once it is no longer open: declined, withdrawn, or past its `expiresAt` (it is closed as `expired` then, ' +
            'so inboxes should list only invites before their date). `403 forbidden` without a pen name; `403 blocked` across a ' +
            'block either way.',
          parameters: [pathParam('id', 'The invite id')],
          responses: { '200': { description: 'OK', ...json(ref('AcceptInviteResponse')) }, ...errors(400, 401, 403, 404, 409) },
        },
      },
      '/notes': {
        post: {
          operationId: 'sendNote',
          summary:
            "Send a note to a card's author: rings them and lands in your conversation as a message (`kind: 'note'`, " +
            '`cardRef` = the card). A note is a letter: it connects no one. Between two people not connected it waits in ' +
            'the conversation (`request: { from, cardId, at, count }`) until the author answers it with a message, which ' +
            'connects you (so does a note of theirs to you while yours waits); at most 3 wait unanswered, then 409 ' +
            '`conflict` ("Wait for them to reply."). On an anonymous card: the bell only — no conversation, no connection; ' +
            'across a block it is answered 201 all the same and delivered to no one (a refusal would name its author)',
          requestBody: { required: true, ...json(ref('SendNoteRequest')) },
          responses: { '201': { description: 'Created', ...json(ref('SendNoteResponse')) }, ...errors(400, 401, 403, 404, 409) },
        },
      },
      '/messages': {
        post: {
          operationId: 'sendMessage',
          summary:
            'Message someone you are connected with (opens the conversation; its first message rings their bell), or answer ' +
            "a note they left you while you weren't (`request.from` is them): that answer connects you",
          description:
            '`403 forbidden` when you are not connected (and no letter of theirs waits), or have no pen name yet ' +
            '("Choose a pen name first.", asked before anything else); `403 blocked` across a block either way. `noteRef` names a ' +
            'note they left you, on the card it names — anything else is `400` ("That is not a note they left you.").',
          requestBody: { required: true, ...json(ref('SendMessageRequest')) },
          responses: { '201': { description: 'Created', ...json(ref('SendMessageResponse')) }, ...errors(400, 401, 403, 404) },
        },
      },
      '/me/devices/{installationId}': {
        put: {
          operationId: 'registerDevice',
          summary: "Register this install's push token (it moves to you if someone else was signed in on it)",
          parameters: [pathParam('installationId', "The install's own stable id (8–128 of A–Z a–z 0–9 _ . : -)")],
          requestBody: { required: true, ...json(ref('RegisterDeviceRequest')) },
          responses: { '204': { description: 'Registered' }, ...errors(400, 401) },
        },
        delete: {
          operationId: 'unregisterDevice',
          summary: 'On sign-out: stop pushing to this install',
          parameters: [pathParam('installationId', "The install's own stable id")],
          responses: { '204': { description: 'Removed (or it was not yours)' }, ...errors(400, 401) },
        },
      },
    },
    components: {
      securitySchemes: { firebaseIdToken: { type: 'http', scheme: 'bearer', bearerFormat: 'Firebase ID token' } },
      schemas: components,
    },
  };
}

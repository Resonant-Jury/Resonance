import { z } from 'zod';
import { apiRegistry } from './schemas';

type Json = Record<string, unknown>;

const ref = (id: string) => ({ $ref: `#/components/schemas/${id}` });
const json = (schema: Json) => ({ content: { 'application/json': { schema } } });
const errors = (...codes: number[]) =>
  Object.fromEntries(codes.map((c) => [String(c), { description: 'Error', ...json(ref('ApiError')) }]));
const pathParam = (name: string, description: string) => ({ name, in: 'path', required: true, description, schema: { type: 'string' } });
const pageParams = [
  { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 30, default: 12 } },
  { name: 'cursor', in: 'query', required: false, schema: { type: 'string', format: 'date-time' } },
];
const get = (operationId: string, summary: string, schema: string, extra: Json = {}, errorCodes = [400, 401, 404]) => ({
  get: { operationId, summary, ...extra, responses: { '200': { description: 'OK', ...json(ref(schema)) }, ...errors(...errorCodes) } },
});
const cardId = pathParam('key', 'The card id');
const handle = pathParam('handle', 'Pen name (any script)');

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
  const clean = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(clean);
    if (node && typeof node === 'object') {
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
      },
      '/me/cards': get('getCardBox', 'One shelf of your card box', 'CardList', {
        parameters: [
          { name: 'tab', in: 'query', required: true, schema: { type: 'string', enum: ['published', 'private', 'draft', 'resonated', 'linked', 'bookmarks'] } },
        ],
      }, [400, 401]),
      '/feed': get('getFeed', 'Latest public cards, newest first (authors you blocked are left out)', 'FeedPage', { parameters: pageParams }, [400, 401]),
      '/feed/recommended': get('getRecommendedFeed', "Today's picks for you, each with the reason it was picked", 'CardList', {}, [401]),
      '/cards/{key}': get('getCard', 'A card you may read, by slug or id, with its story', 'CardDetail', {
        parameters: [pathParam('key', 'The card slug, or (older cards) its id')],
      }),
      '/cards/{key}/resonances': get('getCardResonances', 'Public cards written in response to this one', 'CardList', { parameters: [cardId] }),
      '/cards/{key}/related': get('getRelatedCards', 'A few recent cards sharing its tags', 'CardList', { parameters: [cardId] }),
      '/cards/{key}/links': get('getCardLinks', 'Cards linking to it (empty unless you wrote it)', 'CardList', { parameters: [cardId] }),
      '/users/{handle}': get('getProfile', "A person's profile as you see it", 'Profile', { parameters: [handle] }),
      '/users/{handle}/cards': get('getProfileCards', 'Their public cards, newest first (never anonymous ones)', 'FeedPage', {
        parameters: [handle, ...pageParams],
      }),
      '/users/{handle}/links': get('getProfileLinks', "Cards by others that link to theirs", 'CardList', { parameters: [handle] }),
      '/invites': {
        post: {
          operationId: 'createInvite',
          summary: 'Invite someone to connect (3 a day)',
          requestBody: { required: true, ...json(ref('CreateInviteRequest')) },
          responses: {
            '201': { description: 'Created', ...json(ref('CreateInviteResponse')) },
            ...errors(400, 401, 403, 404, 409, 429),
          },
        },
      },
    },
    components: {
      securitySchemes: { firebaseIdToken: { type: 'http', scheme: 'bearer', bearerFormat: 'Firebase ID token' } },
      schemas: components,
    },
  };
}

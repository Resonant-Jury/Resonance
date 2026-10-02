/**
 * What every language of the store screenshot world has in common: the shapes
 * (a world is people, cards, one conversation, bell rows, a draft and a thought
 * map), the thought map's geometry, and a check that a world is sound. The
 * words themselves live in zh-TW.ts and en.ts; both carry the same card ids and
 * the same relationships, so one capture plan fits either.
 */

export type DemoLang = 'zh-TW' | 'en';

export interface Writer {
  uid: string;
  handle: string;
  bio: string;
  region: string;
  accent: string;
  joinedDaysAgo: number;
}

export interface CardSpec {
  id: string;
  author: string;
  title: string;
  paragraphs: string[];
  tags: string[];
  hue: number;
  /** Minutes ago it was published. */
  ago: number;
  reads: number;
  /** The card this one responds to (a resonance). */
  ref?: string;
}

/** The viewer's own unfinished card, for the Write screen. */
export interface DemoDraft {
  id: string;
  title: string;
  story: string[];
  /** Minutes ago it was last edited. */
  ago: number;
}

export interface DemoMessage {
  from: string;
  text: string;
  /** Minutes ago. */
  ago: number;
  /** A card of the sender's shared in the message. */
  cardRef?: string;
}

/** A bell row for the viewer; the sender's pen name is filled in from `from` when it is seeded. */
export interface DemoNotification {
  id: string;
  type: 'card_link' | 'resonance' | 'message';
  /** The sender's uid. */
  from: string;
  ago: number;
  read?: boolean;
  /** The rest of the payload: the cards the row points at. */
  extra: Record<string, unknown>;
}

export interface DemoWorld {
  lang: DemoLang;
  /** The languages the people's cards are auto-translated into (users/{uid}.autoTranslateTo). */
  autoTranslateTo: DemoLang[];
  viewer: Writer;
  writers: Writer[];
  cards: CardSpec[];
  draft: DemoDraft;
  /** One of the viewer's cards linked from a writer's card (the bell's card_link, the card box's "linked" shelf). */
  cardLink: { source: string; target: string; ago: number };
  /** The writer the viewer's one conversation is with, and the card it began on. */
  partner: string;
  originCardId: string;
  messages: DemoMessage[];
  notifications: DemoNotification[];
  map: DemoThoughtMap;
}

export interface DemoThoughtMap {
  zones: Array<{ id: string; title: string; hue: number; x: number; y: number; w: number; h: number }>;
  nodes: Array<{ cardId: string; x: number; y: number; zone: string }>;
  edges: Array<{ source: string; target: string; label: string }>;
}

/**
 * The viewer's thought map: two labelled zones, six of her cards, three
 * labelled arrows. Only the zone titles and arrow labels are words; the cards
 * and the geometry are the same in every language. (Nodes are 232 x 178; a
 * zone's header sits 70 above its first row, as in seed-emulator.ts. The two
 * cards of a row are 90 apart, so the arrow between them, its label and the
 * arrowhead all show.)
 */
export function thoughtMap(
  titles: { alone: string; remembered: string },
  labels: { later: string; missing: string; extends: string },
): DemoThoughtMap {
  return {
    zones: [
      { id: 'g-alone', title: titles.alone, hue: 88, x: -40, y: -70, w: 610, h: 514 },
      { id: 'g-remembered', title: titles.remembered, hue: 55, x: -40, y: 530, w: 610, h: 514 },
    ],
    nodes: [
      { cardId: 'first-lamp-in-my-rental', x: 0, y: 0, zone: 'g-alone' },
      { cardId: 'hotpot-for-one', x: 322, y: 20, zone: 'g-alone' },
      { cardId: 'the-43rd-minute', x: 161, y: 226, zone: 'g-alone' },
      { cardId: 'mothers-phone-call', x: 0, y: 600, zone: 'g-remembered' },
      { cardId: 'rice-cooker-is-waiting-too', x: 322, y: 620, zone: 'g-remembered' },
      { cardId: 'sunday-market', x: 161, y: 826, zone: 'g-remembered' },
    ],
    edges: [
      { source: 'first-lamp-in-my-rental', target: 'hotpot-for-one', label: labels.later },
      { source: 'the-43rd-minute', target: 'mothers-phone-call', label: labels.missing },
      { source: 'mothers-phone-call', target: 'rice-cooker-is-waiting-too', label: labels.extends },
    ],
  };
}

/** The web's limits on a pen name and a bio (lib/api/v1/schemas.ts Handle, BIO_MAX). */
const HANDLE_MIN = 2;
const HANDLE_MAX = 20;
const BIO_MAX = 80;

/** Whether `handle` would be accepted as a pen name by POST /api/v1/me. */
export function validHandle(handle: string): boolean {
  return (
    handle === handle.trim() &&
    handle.length >= HANDLE_MIN &&
    handle.length <= HANDLE_MAX &&
    /^[^/?#\\\p{Cc}]+$/u.test(handle) &&
    handle !== '..' &&
    !/^__.*__$/.test(handle.toLowerCase())
  );
}

/** Throws when a world would seed something the app refuses or points at something that is not there. */
export function checkWorld(world: DemoWorld): void {
  const people = [world.viewer, ...world.writers];
  const uids = new Set(people.map((p) => p.uid));
  if (uids.size !== people.length) throw new Error(`${world.lang}: two people share a uid`);
  const handles = new Set(people.map((p) => p.handle.toLowerCase()));
  if (handles.size !== people.length) throw new Error(`${world.lang}: two people share a pen name`);
  for (const p of people) {
    if (!validHandle(p.handle)) throw new Error(`${world.lang}: "${p.handle}" is not a valid pen name`);
    if (p.bio.length > BIO_MAX) throw new Error(`${world.lang}: ${p.uid}'s bio is over ${BIO_MAX} characters`);
  }

  const cardIds = new Set(world.cards.map((c) => c.id));
  if (cardIds.size !== world.cards.length) throw new Error(`${world.lang}: a card id is used twice`);
  for (const c of world.cards) {
    if (!uids.has(c.author)) throw new Error(`${world.lang}: ${c.id} has an unknown author ${c.author}`);
    if (c.ref && !cardIds.has(c.ref)) throw new Error(`${world.lang}: ${c.id} responds to an unknown card ${c.ref}`);
  }

  const known = (id: string, what: string) => {
    if (!cardIds.has(id)) throw new Error(`${world.lang}: ${what} names an unknown card ${id}`);
  };
  known(world.cardLink.source, 'the card link');
  known(world.cardLink.target, 'the card link');
  known(world.originCardId, 'the conversation');
  for (const m of world.messages) {
    if (m.from !== world.viewer.uid && m.from !== world.partner) throw new Error(`${world.lang}: a message is from ${m.from}, who is not in the conversation`);
    if (m.cardRef) known(m.cardRef, 'a message');
  }
  if (!world.writers.some((w) => w.uid === world.partner)) throw new Error(`${world.lang}: the conversation partner ${world.partner} is not a writer`);
  for (const n of world.notifications) {
    if (!uids.has(n.from)) throw new Error(`${world.lang}: ${n.id} is from an unknown person ${n.from}`);
    for (const value of Object.values(n.extra)) if (typeof value === 'string') known(value, n.id);
  }

  const zones = new Set(world.map.zones.map((z) => z.id));
  for (const n of world.map.nodes) {
    known(n.cardId, 'a thought-map node');
    if (!zones.has(n.zone)) throw new Error(`${world.lang}: node ${n.cardId} is in an unknown zone ${n.zone}`);
  }
  const nodeIds = new Set(world.map.nodes.map((n) => n.cardId));
  for (const e of world.map.edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) throw new Error(`${world.lang}: edge ${e.source} -> ${e.target} joins a card that is not on the map`);
  }
}

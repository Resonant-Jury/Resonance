export type Locale = 'zh-TW' | 'en' | 'ja' | 'ko' | 'es';
export type Visibility = 'public' | 'connections' | 'private';

export interface CardTranslation {
  title: string;
  thoughtCore: string;
  story: string;
  aiGenerated: true;
}

export interface CardMedia {
  type: 'image' | 'video';
  url: string;
  label?: string;
}

export interface Card {
  id: string;
  authorId: string;
  /** URL slug (English, generated from the title at publish). Absent on drafts. */
  slug?: string;
  thoughtCore: string;
  story: string;
  tags: string[];
  media?: CardMedia;
  originalLocale: Locale;
  translations: Partial<Record<Locale, CardTranslation>>;
  visibility: Visibility;
  referenceCardId?: string;
  publishedAt: Date | null;
  readCount: number;
  resonanceCount: number;
  inviteCount: number;
  /** derived: accent hue seed for organic UI */
  accentHue?: number;
  /**
   * When the recommendation pipeline last extracted this card's insight
   * signature and wrote its vectors. Absent → never indexed (or re-index due
   * after an edit). See {@link InsightSignature}.
   */
  indexedAt?: Date | null;
  /**
   * The card's extracted "insight signature" — the structured distillation the
   * recommender embeds (not the raw story). Stored back on the card so reads
   * (rerank, "why this resonates") don't re-run the LLM. See `src/lib/recommend`.
   */
  signature?: InsightSignature;
  /**
   * Published without attribution (ux §6). Rendering-level anonymity: every
   * card surface hides the byline and the card never appears on the author's
   * public profile; notes/resonance notifications still reach the author
   * privately. NOTE: `authorId` stays on the doc (rules can't redact fields),
   * so this shields identity from the UI and all API responses, not from
   * someone reading raw Firestore documents.
   */
  anonymous?: boolean;
}

/**
 * The structured distillation of a card produced once at write-time by a single
 * LLM call. We embed `coreInsight` and `situation` (two retrieval channels) —
 * NOT the raw text — so two pieces that share a *realization* (creative-startup
 * failure vs. sports injury, both "I tied my self-worth to outcomes") land near
 * each other even when their wording is far apart.
 */
export interface InsightSignature {
  /** The transferable realization at the heart of the piece. */
  coreInsight: string;
  /** Why the author wrote it (to record / to comfort others / to vent…). */
  intent: string;
  /** The lived circumstance the insight arose from. */
  situation: string;
  /** Coarse life area, e.g.「自我認同 / 職涯」. */
  lifeDomain: string;
  /** Emotional colour, e.g.「釋懷中帶著不甘」. */
  emotionalRegister: string;
  /**
   * 0–1 — how much genuine, transferable insight the piece carries. Below
   * {@link INSIGHT_INDEX_THRESHOLD} the card is stored but kept out of the
   * recommendation candidate pool.
   */
  insightScore: number;
}

export interface User {
  id: string;
  handle: string;
  bio?: string;
  region: string;
  primaryLocale: Locale;
  autoTranslateTo: Locale[];
  verified: boolean;
  phoneHash: string;
  avatarSeed: string;
  /** uploaded avatar image URL (public R2 object); falls back to initials */
  avatarUrl?: string;
  /** display initials (derived from handle) */
  initials: string;
  /** accent color token or oklch value */
  accentColor: string;
  joinedAt: Date;
  handleChangedAt: Date;
  /**
   * Just-in-time hint display counts, keyed by hint name (see `src/lib/hints.ts`).
   * Synced from localStorage so hints stay dismissed across devices. The user
   * doc is public, but these are only innocuous UI counters.
   */
  hintsSeen?: Record<string, number>;
}

export interface Connection {
  id: string;
  userIds: [string, string];
  establishedAt: Date;
  muted?: { by: string }[];
}

export interface Invite {
  id: string;
  fromUserId: string;
  toUserId: string;
  message: string;
  referenceCardId?: string;
  status: 'pending' | 'accepted' | 'expired' | 'withdrawn';
  expiresAt: Date;
  createdAt: Date;
}

export interface Resonance {
  id: string;
  cardId: string;
  userId: string;
  note?: string;
  createdAt: Date;
}

/**
 * A private note (小紙條) from a reader to a card's author — the "speak to the
 * author" layer of the three-layer response structure. No audience, no counts,
 * never a recommendation signal.
 */
export interface Note {
  id: string;
  /** The card the note responds to. */
  cardId: string;
  fromUserId: string;
  /** The card's author — the only person who can read it besides the sender. */
  toUserId: string;
  text: string;
  createdAt: Date;
  readAt: Date | null;
}

/**
 * A private bookmark (收藏) — the "speak to yourself" layer. Stored under
 * `users/{uid}/bookmarks/{cardId}` (doc id == card id, so toggling is
 * idempotent). Owner-only; never counted, never notified.
 */
export interface Bookmark {
  cardId: string;
  createdAt: Date;
}

export interface CardLink {
  id: string;
  /** The viewer's own card doing the linking. */
  sourceCardId: string;
  /** uid of the viewer who created the link. */
  sourceAuthorId: string;
  /** The card being linked to (the article being viewed). */
  targetCardId: string;
  /** uid of the target card's author (denormalized for profile-level queries). */
  targetAuthorId: string;
  createdAt: Date;
}

/**
 * A card placed on the owner's thought map (Zettelkasten board). Doc id == the
 * card id, so a card can sit on the map at most once. Stored under
 * `thoughtMaps/{uid}/nodes` — owner-only.
 */
export interface ThoughtMapNode {
  id: string;
  cardId: string;
  /** World-space position of the node's top-left corner. */
  x: number;
  y: number;
  /** The group (category region) this node currently sits inside, if any. */
  groupId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A directed, labeled arrow between two cards on the thought map. Doc id is
 * deterministic: `{sourceCardId}_{targetCardId}` (re-linking is idempotent).
 */
export interface ThoughtMapEdge {
  id: string;
  sourceCardId: string;
  targetCardId: string;
  /** What the relation means, e.g.「支持」「反例」「延伸自」. */
  label: string;
  createdAt: Date;
}

/** A named category region on the thought map that nodes can be filed into. */
export interface ThoughtMapGroup {
  id: string;
  title: string;
  /** OKLCH hue tinting the region (matches the card palette hues). */
  hue: number;
  x: number;
  y: number;
  w: number;
  h: number;
  createdAt: Date;
}

export interface Notification {
  id: string;
  userId: string;
  type:
    | 'invite'
    | 'invite_accepted'
    | 'resonance_summary'
    | 'translation_done'
    | 'invite_expired'
    | 'resonance'
    | 'note'
    | 'card_link';
  payload: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
}

/**
 * One entry in a user's daily recommended feed. The feed API returns these
 * (lightweight — id + reason, no card content); the client resolves the card
 * itself through the visibility-enforced `getCardById` path.
 */
export interface RecommendationItem {
  cardId: string;
  /** Which channel matched best — `insight` (same realization) or `situation` (same lived experience). */
  channel: 'insight' | 'situation';
  /** The strong model's one-line「為什麼這篇可能對你有共鳴」. */
  reason: string;
  /** Final ranking score (higher = better fit). */
  score: number;
}

export type NewCard = Omit<Card, 'id' | 'publishedAt' | 'readCount' | 'resonanceCount' | 'inviteCount' | 'translations'> & {
  publishedAt?: Date | null;
  translations?: Card['translations'];
};

export type NewInvite = Omit<Invite, 'id' | 'status' | 'expiresAt' | 'createdAt'>;

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
  embedding?: number[];
  referenceCardId?: string;
  publishedAt: Date | null;
  readCount: number;
  resonanceCount: number;
  inviteCount: number;
  /** derived: accent hue seed for organic UI */
  accentHue?: number;
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
  /** display initials (derived from handle) */
  initials: string;
  /** accent color token or oklch value */
  accentColor: string;
  joinedAt: Date;
  handleChangedAt: Date;
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

export interface Comment {
  id: string;
  cardId: string;
  /** uid of the commenter. */
  authorId: string;
  /** Reserved for future threaded replies; always null in the current one-level design. */
  parentId: string | null;
  body: string;
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

export interface Notification {
  id: string;
  userId: string;
  type:
    | 'invite'
    | 'resonance_summary'
    | 'translation_done'
    | 'invite_expired'
    | 'resonance'
    | 'comment'
    | 'card_link';
  payload: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
}

export type NewCard = Omit<Card, 'id' | 'publishedAt' | 'readCount' | 'resonanceCount' | 'inviteCount' | 'translations'> & {
  publishedAt?: Date | null;
  translations?: Card['translations'];
};

export type NewInvite = Omit<Invite, 'id' | 'status' | 'expiresAt' | 'createdAt'>;

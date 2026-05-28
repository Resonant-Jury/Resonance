import { CARDS, RESONANCES } from '@/lib/mock/data';
import type { Card, NewCard } from '../types';
import type { CardBoxTab, ICardRepository } from '../interfaces';

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v), (k, val) => {
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) return new Date(val);
    return val;
  });
}

function canSee(card: Card, viewerId: string | null): boolean {
  if (card.visibility === 'public') return true;
  if (viewerId == null) return false;
  if (card.authorId === viewerId) return true;
  // NOTE: simplified — in MVP `connections` cards visible to all logged-in mock users
  if (card.visibility === 'connections') return true;
  return false;
}

export class MockCardRepository implements ICardRepository {
  async findById(id: string, viewerId: string | null): Promise<Card | null> {
    const c = CARDS.find((x) => x.id === id);
    if (!c) return null;
    if (!canSee(c, viewerId)) return null;
    return clone(c);
  }

  async findDailyFeed(userId: string): Promise<Card[]> {
    // Deterministic daily selection: 6 public cards not authored by viewer.
    const pool = CARDS.filter(
      (c) => c.visibility === 'public' && c.publishedAt && c.authorId !== userId
    );
    return clone(pool.slice(0, 6));
  }

  async findLatestPublishedFeed(limit: number, cursor?: Date): Promise<Card[]> {
    const pool = CARDS.filter(
      (c) =>
        c.visibility === 'public' &&
        c.publishedAt &&
        (!cursor || c.publishedAt < cursor)
    ).sort((a, b) => {
      const aTime = a.publishedAt?.getTime() ?? 0;
      const bTime = b.publishedAt?.getTime() ?? 0;
      return bTime - aTime;
    });
    return clone(pool.slice(0, limit));
  }

  async findRelated(cardId: string, limit: number): Promise<Card[]> {
    const base = CARDS.find((c) => c.id === cardId);
    if (!base) return [];
    const pool = CARDS.filter(
      (c) => c.id !== cardId && c.visibility === 'public' && c.publishedAt
    );
    return clone(pool.slice(0, limit));
  }

  async findByAuthor(authorId: string, tab: CardBoxTab): Promise<Card[]> {
    const mine = CARDS.filter((c) => c.authorId === authorId);
    if (tab === 'published')
      return clone(mine.filter((c) => c.publishedAt && c.visibility !== 'private'));
    if (tab === 'private')
      return clone(mine.filter((c) => c.publishedAt && c.visibility === 'private'));
    if (tab === 'draft') return clone(mine.filter((c) => !c.publishedAt));
    if (tab === 'resonated') {
      const ids = new Set(RESONANCES.filter((r) => r.userId === authorId).map((r) => r.cardId));
      return clone(CARDS.filter((c) => ids.has(c.id)));
    }
    return [];
  }

  async create(data: NewCard): Promise<Card> {
    const c: Card = {
      id: `c-${Math.random().toString(36).slice(2, 9)}`,
      translations: {},
      readCount: 0,
      resonanceCount: 0,
      inviteCount: 0,
      publishedAt: null,
      ...data,
    };
    CARDS.push(c);
    return clone(c);
  }

  async update(id: string, patch: Partial<Card>): Promise<Card> {
    const idx = CARDS.findIndex((c) => c.id === id);
    if (idx < 0) throw new Error(`Card ${id} not found`);
    CARDS[idx] = { ...CARDS[idx], ...patch };
    return clone(CARDS[idx]);
  }

  async publish(id: string): Promise<Card> {
    return this.update(id, { publishedAt: new Date() });
  }

  async deleteDraft(id: string, authorId: string): Promise<void> {
    const idx = CARDS.findIndex((c) => c.id === id && c.authorId === authorId && !c.publishedAt);
    if (idx >= 0) CARDS.splice(idx, 1);
  }
}

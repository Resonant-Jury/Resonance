import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { CardBoxTab, ICardRepository } from '../interfaces';
import type { Card, NewCard } from '../types';
import { ForbiddenError, NotFoundError } from '../errors';
import { getAdminDb } from './admin';
import { fromDate, mapCard } from './mapper';

function cleanCard(data: NewCard) {
  return {
    ...data,
    translations: data.translations ?? {},
    readCount: 0,
    resonanceCount: 0,
    inviteCount: 0,
    publishedAt: fromDate(data.publishedAt ?? null),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function cleanPatch(patch: Partial<Card>) {
  const next: Record<string, unknown> = { ...patch, updatedAt: FieldValue.serverTimestamp() };
  if ('id' in next) delete next.id;
  if ('publishedAt' in next) next.publishedAt = fromDate(patch.publishedAt ?? null);
  return next;
}

export class FirestoreCardRepository implements ICardRepository {
  private collection() {
    return getAdminDb().collection('cards');
  }

  async findById(id: string, viewerId: string | null): Promise<Card | null> {
    const snap = await this.collection().doc(id).get();
    if (!snap.exists) return null;
    const card = mapCard(snap.id, snap.data() ?? {});
    if (card.visibility === 'public') return card;
    if (!viewerId) return null;
    if (card.authorId === viewerId) return card;
    if (card.visibility === 'connections') {
      const pair = [card.authorId, viewerId].sort().join('_');
      const conn = await getAdminDb().collection('connections').doc(pair).get();
      return conn.exists ? card : null;
    }
    return null;
  }

  async findDailyFeed(userId: string): Promise<Card[]> {
    const snap = await this.collection()
      .where('visibility', '==', 'public')
      .where('publishedAt', '!=', null)
      .orderBy('publishedAt', 'desc')
      .limit(12)
      .get();
    return snap.docs
      .map((doc) => mapCard(doc.id, doc.data()))
      .filter((card) => card.authorId !== userId);
  }

  async findLatestPublishedFeed(limit: number, cursor?: Date): Promise<Card[]> {
    let query = this.collection()
      .where('visibility', '==', 'public')
      .where('publishedAt', '!=', null)
      .orderBy('publishedAt', 'desc')
      .limit(limit);

    if (cursor) query = query.startAfter(Timestamp.fromDate(cursor));

    const snap = await query.get();
    return snap.docs.map((doc) => mapCard(doc.id, doc.data()));
  }

  async findRelated(cardId: string, limit: number): Promise<Card[]> {
    const base = await this.collection().doc(cardId).get();
    const tags = ((base.data()?.tags ?? []) as string[]).slice(0, 5);
    let snap = await this.collection()
      .where('visibility', '==', 'public')
      .where('publishedAt', '!=', null)
      .orderBy('publishedAt', 'desc')
      .limit(limit + 6)
      .get();
    let cards = snap.docs.map((doc) => mapCard(doc.id, doc.data())).filter((card) => card.id !== cardId);
    if (tags.length) {
      cards = cards.sort((a, b) => {
        const as = a.tags.filter((tag) => tags.includes(tag)).length;
        const bs = b.tags.filter((tag) => tags.includes(tag)).length;
        return bs - as;
      });
    }
    return cards.slice(0, limit);
  }

  async findByAuthor(authorId: string, tab: CardBoxTab): Promise<Card[]> {
    if (tab === 'resonated') {
      const resonances = await getAdminDb()
        .collection('resonances')
        .where('userId', '==', authorId)
        .orderBy('createdAt', 'desc')
        .limit(30)
        .get();
      const cards = await Promise.all(
        resonances.docs.map((doc) => this.findById(String(doc.data().cardId), authorId))
      );
      return cards.filter((card): card is Card => Boolean(card));
    }

    let snap = await this.collection()
      .where('authorId', '==', authorId)
      .orderBy('publishedAt', 'desc')
      .limit(40)
      .get();
    let cards = snap.docs.map((doc) => mapCard(doc.id, doc.data()));
    if (tab === 'published') cards = cards.filter((card) => card.publishedAt && card.visibility !== 'private');
    if (tab === 'private') cards = cards.filter((card) => card.publishedAt && card.visibility === 'private');
    if (tab === 'draft') cards = cards.filter((card) => !card.publishedAt);
    return cards;
  }

  async create(data: NewCard): Promise<Card> {
    const doc = await this.collection().add(cleanCard(data));
    const snap = await doc.get();
    return mapCard(snap.id, snap.data() ?? {});
  }

  async update(id: string, patch: Partial<Card>): Promise<Card> {
    const ref = this.collection().doc(id);
    await ref.set(cleanPatch(patch), { merge: true });
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundError(`Card ${id} not found`);
    return mapCard(snap.id, snap.data() ?? {});
  }

  async publish(id: string): Promise<Card> {
    return this.update(id, { publishedAt: new Date() });
  }

  async deleteDraft(id: string, authorId: string): Promise<void> {
    const snap = await this.collection().doc(id).get();
    if (!snap.exists) return;
    const card = mapCard(snap.id, snap.data() ?? {});
    if (card.authorId !== authorId) throw new ForbiddenError();
    if (card.publishedAt) throw new ForbiddenError('Only drafts can be deleted');
    await snap.ref.delete();
  }
}

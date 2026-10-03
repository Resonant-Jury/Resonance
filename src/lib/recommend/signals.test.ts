import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { getEngagedAuthorIds } from './signals';

// The reader's resonances (their cards answering others) and the cards they
// answer, as the Admin SDK hands them over: a query of the reader's own cards
// and one batched read of the originals.
function fakeDb(cards: Record<string, Record<string, unknown>>): Firestore {
  const snap = (id: string, fields?: string[]) => {
    const whole = cards[id];
    const data = whole && fields ? Object.fromEntries(fields.filter((f) => f in whole).map((f) => [f, whole[f]])) : whole;
    return { id, exists: !!whole, get: (f: string) => data?.[f], data: () => data };
  };
  const collection = () => ({
    doc: (id: string) => ({ id }),
    where: (_field: string, _op: string, uid: string) => ({
      select: () => ({
        limit: () => ({
          get: async () => ({
            docs: Object.keys(cards).filter((id) => cards[id].authorId === uid).map((id) => snap(id, ['referenceCardId'])),
          }),
        }),
      }),
    }),
  });
  const getAll = async (...args: unknown[]) => {
    const last = args.at(-1) as { fieldMask?: string[] } | { id: string };
    const refs = ('fieldMask' in last ? args.slice(0, -1) : args) as { id: string }[];
    const mask = 'fieldMask' in last ? last.fieldMask : undefined;
    return refs.map((r) => snap(r.id, mask));
  };
  return { collection, getAll } as unknown as Firestore;
}

describe('getEngagedAuthorIds', () => {
  it('names the authors whose named cards the reader answered — never the author of an anonymous one, nor the reader', async () => {
    const db = fakeDb({
      // Bob's named card and his anonymous one; Carol's anonymous card.
      bobNamed: { authorId: 'bob', anonymous: false },
      bobMasked: { authorId: 'bob', anonymous: true },
      carolMasked: { authorId: 'carol', anonymous: true },
      erinOld: { authorId: 'erin' }, // older than the field: named
      mine: { authorId: 'alice' },
      // Alice's answers.
      a1: { authorId: 'alice', referenceCardId: 'bobNamed' },
      a2: { authorId: 'alice', referenceCardId: 'bobMasked' },
      a3: { authorId: 'alice', referenceCardId: 'carolMasked' },
      a4: { authorId: 'alice', referenceCardId: 'erinOld' },
      a5: { authorId: 'alice', referenceCardId: 'mine' },
      a6: { authorId: 'alice', referenceCardId: 'gone' },
      // Dana answered only Carol's anonymous card: no author boosted.
      d1: { authorId: 'dana', referenceCardId: 'carolMasked' },
    });
    expect([...(await getEngagedAuthorIds('alice', db))].sort()).toEqual(['bob', 'erin']);
    expect([...(await getEngagedAuthorIds('dana', db))]).toEqual([]);
  });
});

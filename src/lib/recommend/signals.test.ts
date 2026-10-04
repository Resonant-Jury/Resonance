import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { getEngagedAuthorIds, namedCardIds } from './signals';

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
      select: (...fields: string[]) => ({
        limit: () => ({
          get: async () => ({
            docs: Object.keys(cards).filter((id) => cards[id].authorId === uid).map((id) => snap(id, fields)),
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

/** A resonance as its original's list shows it: published, public, under its writer's name. */
const shown = { publishedAt: new Date('2026-09-01T00:00:00Z'), visibility: 'public', anonymous: false };

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
      a1: { authorId: 'alice', referenceCardId: 'bobNamed', ...shown },
      a2: { authorId: 'alice', referenceCardId: 'bobMasked', ...shown },
      a3: { authorId: 'alice', referenceCardId: 'carolMasked', ...shown },
      a4: { authorId: 'alice', referenceCardId: 'erinOld', ...shown },
      a5: { authorId: 'alice', referenceCardId: 'mine', ...shown },
      a6: { authorId: 'alice', referenceCardId: 'gone', ...shown },
      // Dana answered only Carol's anonymous card: no author boosted.
      d1: { authorId: 'dana', referenceCardId: 'carolMasked', ...shown },
    });
    expect([...(await getEngagedAuthorIds('alice', db))].sort()).toEqual(['bob', 'erin']);
    expect([...(await getEngagedAuthorIds('dana', db))]).toEqual([]);
  });

  // Review: a draft answering anyone's card counted, so a reader could point
  // the boost at any author they liked — then watch what it lifted.
  it('counts only an answer its original shows: published, public and under the reader\'s name', async () => {
    const db = fakeDb({
      bobNamed: { authorId: 'bob', anonymous: false },
      carolNamed: { authorId: 'carol', anonymous: false },
      danNamed: { authorId: 'dan', anonymous: false },
      erinNamed: { authorId: 'erin', anonymous: false },
      fayNamed: { authorId: 'fay', anonymous: false },
      draft: { authorId: 'alice', referenceCardId: 'bobNamed', ...shown, publishedAt: null },
      hidden: { authorId: 'alice', referenceCardId: 'carolNamed', ...shown, visibility: 'private' },
      circle: { authorId: 'alice', referenceCardId: 'danNamed', ...shown, visibility: 'connections' },
      masked: { authorId: 'alice', referenceCardId: 'erinNamed', ...shown, anonymous: true },
      standing: { authorId: 'alice', referenceCardId: 'fayNamed', ...shown },
    });
    expect([...(await getEngagedAuthorIds('alice', db))]).toEqual(['fay']);
  });
});

describe('namedCardIds', () => {
  it('keeps the cards under their author\'s name, as they are now — never an anonymous one, nor one gone', async () => {
    const db = fakeDb({
      named: { authorId: 'bob', anonymous: false },
      older: { authorId: 'bob' },
      masked: { authorId: 'bob', anonymous: true },
    });
    expect([...(await namedCardIds(['named', 'older', 'masked', 'gone', 'named'], db))].sort()).toEqual(['named', 'older']);
    expect([...(await namedCardIds([], db))]).toEqual([]);
  });
});

import { FieldPath, type DocumentData, type Firestore, type Query, type QueryDocumentSnapshot } from 'firebase-admin/firestore';

/**
 * A downloadable copy of everything the user wrote — offered before account
 * deletion ("download a backup first") and useful on its own. Only the user's
 * own words: other people's messages and notes are not included.
 *
 * It is made as a stream of JSON text (exportAccountJson): the collections
 * are read a page at a time and written out as they come, so a prolific
 * writer's backup neither sits whole in the function's memory nor runs into
 * the platform's limit on a buffered response body (about 4.5 MB on Vercel).
 */
export interface AccountExport {
  exportedAt: string;
  profile: DocumentData | null;
  cards: DocumentData[];
  bookmarks: DocumentData[];
  thoughtMap: { nodes: DocumentData[]; edges: DocumentData[]; groups: DocumentData[] };
  notesSent: DocumentData[];
  messagesSent: DocumentData[];
}

/** Documents read per query page (a card can hold a long story). */
const PAGE = 100;

/** Firestore Timestamps → ISO strings so the file is plain JSON. */
function plain(value: unknown): unknown {
  if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
  }
  return value;
}

const row = (d: QueryDocumentSnapshot) => ({ id: d.id, ...(plain(d.data()) as DocumentData) });

/** `q` a page at a time, in document id order. */
async function* pages(q: Query): AsyncGenerator<QueryDocumentSnapshot[]> {
  let after: string | null = null;
  for (;;) {
    let page = q.orderBy(FieldPath.documentId()).limit(PAGE);
    if (after) page = page.startAfter(after);
    const snap = await page.get();
    if (snap.empty) return;
    yield snap.docs;
    if (snap.size < PAGE) return;
    after = snap.docs[snap.size - 1].id;
  }
}

/** A JSON array of rows, a page at a time. */
async function* array(...sources: AsyncIterable<DocumentData[]>[]): AsyncGenerator<string> {
  let first = true;
  yield '[';
  for (const source of sources) {
    for await (const rows of source) {
      if (!rows.length) continue;
      yield (first ? '' : ',') + rows.map((r) => JSON.stringify(r)).join(',');
      first = false;
    }
  }
  yield ']';
}

async function* rows(q: Query, extra: Record<string, unknown> = {}): AsyncGenerator<DocumentData[]> {
  for await (const docs of pages(q)) yield docs.map((d) => ({ ...extra, ...row(d) }));
}

/**
 * What a note of yours on an anonymous card keeps in your export: your words
 * and the card you left them on — not whom they reached (its author is no
 * one's to know, and a note withheld across a block reached no one) nor
 * whether they were read. A note on a card under its author's name keeps both,
 * as a card's page names them anyway; the card is read as it is now, so one
 * made anonymous since, or deleted (it may have been anonymous), keeps neither.
 */
const NOTE_OMIT = ['toUserId', 'readAt'] as const;

/** Your notes, a page at a time, each with whom it reached only when its card names its author (NOTE_OMIT). */
async function* noteRows(db: Firestore, uid: string): AsyncGenerator<DocumentData[]> {
  for await (const docs of pages(db.collection('notes').where('fromUserId', '==', uid))) {
    const ids = [...new Set(docs.map((d) => d.get('cardId')).filter((id): id is string => typeof id === 'string' && !!id && !id.includes('/')))];
    const cards = ids.length ? await db.getAll(...ids.map((id) => db.doc(`cards/${id}`)), { fieldMask: ['anonymous'] }) : [];
    const named = new Set(cards.filter((c) => c.exists && c.get('anonymous') !== true).map((c) => c.id));
    yield docs.map((d) => {
      const r: DocumentData = row(d);
      if (!named.has(d.get('cardId'))) for (const key of NOTE_OMIT) delete r[key];
      return r;
    });
  }
}

/**
 * The export, as JSON text in pieces (an AccountExport once joined). The
 * first piece comes after the profile is read, so a caller that waits for it
 * before answering turns a failure to start into an error status rather
 * than a broken file.
 */
export async function* exportAccountJson(db: Firestore, uid: string, now = new Date()): AsyncGenerator<string> {
  const user = db.collection('users').doc(uid);
  const map = db.collection('thoughtMaps').doc(uid);
  const profile = await user.get();
  yield `{"exportedAt":${JSON.stringify(now.toISOString())},"profile":${JSON.stringify(profile.exists ? plain(profile.data()) : null)}`;

  yield ',"cards":';
  yield* array(rows(db.collection('cards').where('authorId', '==', uid)));
  yield ',"bookmarks":';
  yield* array(rows(user.collection('bookmarks')));
  yield ',"thoughtMap":{"nodes":';
  yield* array(rows(map.collection('nodes')));
  yield ',"edges":';
  yield* array(rows(map.collection('edges')));
  yield ',"groups":';
  yield* array(rows(map.collection('groups')));
  yield '},"notesSent":';
  yield* array(noteRows(db, uid));

  yield ',"messagesSent":';
  const conversations = await db.collection('conversations').where('participants', 'array-contains', uid).select().get();
  yield* array(
    ...conversations.docs.map((c) => rows(c.ref.collection('messages').where('senderId', '==', uid), { conversationId: c.id })),
  );
  yield '}';
}

/** The whole export as one object (what the streamed file parses to). */
export async function exportAccountData(db: Firestore, uid: string, now = new Date()): Promise<AccountExport> {
  let text = '';
  for await (const piece of exportAccountJson(db, uid, now)) text += piece;
  return JSON.parse(text) as AccountExport;
}

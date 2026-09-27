import type { DocumentData, Firestore, QuerySnapshot } from 'firebase-admin/firestore';

/**
 * A downloadable copy of everything the user wrote — offered before account
 * deletion ("download a backup first") and useful on its own. Only the user's
 * own words: other people's messages and notes are not included.
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

function rows(snap: QuerySnapshot): DocumentData[] {
  return snap.docs.map((d) => ({ id: d.id, ...(plain(d.data()) as DocumentData) }));
}

export async function exportAccountData(db: Firestore, uid: string, now = new Date()): Promise<AccountExport> {
  const user = db.collection('users').doc(uid);
  const map = db.collection('thoughtMaps').doc(uid);
  const [profile, cards, bookmarks, nodes, edges, groups, notes, conversations] = await Promise.all([
    user.get(),
    db.collection('cards').where('authorId', '==', uid).get(),
    user.collection('bookmarks').get(),
    map.collection('nodes').get(),
    map.collection('edges').get(),
    map.collection('groups').get(),
    db.collection('notes').where('fromUserId', '==', uid).get(),
    db.collection('conversations').where('participants', 'array-contains', uid).get(),
  ]);

  const perConversation = await Promise.all(
    conversations.docs.map(async (c) => {
      const sent = await c.ref.collection('messages').where('senderId', '==', uid).get();
      return rows(sent).map((m) => ({ conversationId: c.id, ...m }));
    }),
  );

  return {
    exportedAt: now.toISOString(),
    profile: profile.exists ? (plain(profile.data()) as DocumentData) : null,
    cards: rows(cards),
    bookmarks: rows(bookmarks),
    thoughtMap: { nodes: rows(nodes), edges: rows(edges), groups: rows(groups) },
    notesSent: rows(notes),
    messagesSent: perConversation.flat(),
  };
}

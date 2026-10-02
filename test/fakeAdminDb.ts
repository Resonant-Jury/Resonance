// A tiny in-memory stand-in for the Admin SDK's Firestore, for suites that
// render server code (pages, route handlers) without the emulator: documents
// by path, `doc(path).get()` / `.set()`, `collection(name).doc(id)` and
// equality `where(...).limit(n).get()`. Store timestamps as firebase-admin
// `Timestamp`s so the real mappers convert them. Every read path is recorded
// in `reads`, so a test can prove a document was never read.
import type { Firestore } from 'firebase-admin/firestore';

type Data = Record<string, unknown>;

export interface FakeAdminDb {
  db: Firestore;
  docs: Record<string, Data>;
  reads: string[];
}

export function fakeAdminDb(docs: Record<string, Data>): FakeAdminDb {
  const reads: string[] = [];
  const snap = (path: string) => {
    const data = docs[path];
    return {
      id: path.split('/').pop()!,
      exists: data !== undefined,
      data: () => data,
      get: (field: string) => data?.[field],
    };
  };
  const docRef = (path: string) => ({
    get: async () => {
      reads.push(path);
      return snap(path);
    },
    // A plain replace (FieldValue sentinels are stored as they are).
    set: async (data: Data) => {
      docs[path] = data;
    },
  });
  const db = {
    doc: docRef,
    collection: (name: string) => ({
      doc: (id: string) => docRef(`${name}/${id}`),
      where: (field: string, op: string, value: unknown) => {
        if (op !== '==') throw new Error(`fakeAdminDb: unsupported operator ${op}`);
        const run = async (max = Infinity) => {
          reads.push(`${name}?${field}==${String(value)}`);
          const hits = Object.keys(docs)
            .filter((p) => p.startsWith(`${name}/`) && p.split('/').length === 2 && docs[p][field] === value)
            .slice(0, max)
            .map(snap);
          return { docs: hits, empty: hits.length === 0, size: hits.length };
        };
        return { get: () => run(), limit: (n: number) => ({ get: () => run(n) }) };
      },
    }),
  };
  return { db: db as unknown as Firestore, docs, reads };
}

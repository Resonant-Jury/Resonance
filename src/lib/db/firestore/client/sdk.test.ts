import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Firestore Lite under the client modules: its requests are mocked, each
// resolving only when the test says so, to see what waits for what.

type Pending = { name: string; resolve: (v?: unknown) => void; reject: (e: unknown) => void };
const { started, call, batch } = vi.hoisted(() => {
  const started: Pending[] = [];
  const call = (name: string) => () =>
    new Promise((resolve, reject) => {
      started.push({ name, resolve, reject });
    });
  const batch = { set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn(call('commit')) };
  return { started, call, batch };
});

vi.mock('firebase/firestore/lite', () => ({
  getDoc: vi.fn(call('getDoc')),
  getDocs: vi.fn(call('getDocs')),
  setDoc: vi.fn(call('setDoc')),
  updateDoc: vi.fn(call('updateDoc')),
  deleteDoc: vi.fn(call('deleteDoc')),
  addDoc: vi.fn(call('addDoc')),
  runTransaction: vi.fn(call('runTransaction')),
  writeBatch: vi.fn(() => batch),
  doc: vi.fn(),
}));

import { addDoc, deleteDoc, getDoc, getDocs, runTransaction, setDoc, updateDoc, writeBatch } from './sdk';

/** Let every promise callback that can run, run. */
const settle = () => new Promise((r) => setTimeout(r, 0));
const names = () => started.map((p) => p.name);
const ref = {} as never;

beforeEach(async () => {
  // Finish whatever an earlier test left in flight, so each starts with a clear queue.
  while (started.length) {
    started.splice(0).forEach((p) => p.resolve());
    await settle();
  }
  vi.clearAllMocks();
});

describe('writes', () => {
  it('reach Firestore one at a time, in the order they were made', async () => {
    const first = updateDoc(ref, { x: 1 });
    const second = updateDoc(ref, { x: 2 });
    const third = setDoc(ref, { x: 3 });
    await settle();
    expect(names()).toEqual(['updateDoc']); // the second waits for the first

    started[0].resolve();
    await first;
    await settle();
    expect(names()).toEqual(['updateDoc', 'updateDoc']);

    started[1].resolve();
    await second;
    await settle();
    expect(names()).toEqual(['updateDoc', 'updateDoc', 'setDoc']);
    started[2].resolve();
    await third;
  });

  it('a batch commits in its turn, and its staged writes go to the real batch', async () => {
    const write = deleteDoc(ref);
    const b = writeBatch({} as never);
    b.set(ref, { a: 1 }).update(ref, { b: 2 });
    b.delete(ref);
    const committed = b.commit();
    await settle();
    expect(batch.set).toHaveBeenCalledWith(ref, { a: 1 });
    expect(batch.update).toHaveBeenCalledWith(ref, { b: 2 });
    expect(batch.delete).toHaveBeenCalledWith(ref);
    expect(names()).toEqual(['deleteDoc']);

    started[0].resolve();
    await write;
    await settle();
    expect(names()).toEqual(['deleteDoc', 'commit']);
    started[1].resolve();
    await committed;
  });

  it("don't wait on a write that failed", async () => {
    const failing = addDoc(ref, {});
    const next = runTransaction({} as never, async () => 'done');
    await settle();
    started[0].reject(new Error('permission-denied'));
    await expect(failing).rejects.toThrow('permission-denied');
    await settle();
    expect(names()).toEqual(['addDoc', 'runTransaction']);
    started[1].resolve('done');
    await expect(next).resolves.toBe('done');
  });
});

describe('reads', () => {
  it('wait for the writes made before them, so they show them', async () => {
    const write = setDoc(ref, { story: 'new' });
    const read = getDocs(ref);
    const one = getDoc(ref);
    await settle();
    expect(names()).toEqual(['setDoc']);

    started[0].resolve();
    await write;
    await settle();
    expect(names().sort()).toEqual(['getDoc', 'getDocs', 'setDoc']);
    started.slice(1).forEach((p) => p.resolve('snapshot'));
    await expect(read).resolves.toBe('snapshot');
    await expect(one).resolves.toBe('snapshot');
  });

  it("don't hold up the writes made after them", async () => {
    const read = getDoc(ref);
    const write = updateDoc(ref, { x: 1 });
    await settle();
    expect(names().sort()).toEqual(['getDoc', 'updateDoc']);
    started.forEach((p) => p.resolve());
    await Promise.all([read, write]);
  });
});

describe('the full SDK', () => {
  // Lite is the point: one static import of 'firebase/firestore' anywhere in
  // the browser's data layer puts the full SDK back on every page.
  it('is imported only by the realtime module, which loads on demand', () => {
    const dir = __dirname;
    const sources = [
      ...readdirSync(dir)
        .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
        .map((f) => join(dir, f)),
      resolve(dir, '../../../data/hooks.ts'),
    ];
    const full = sources.filter((f) => /from 'firebase\/firestore'/.test(readFileSync(f, 'utf8')));
    expect(full.map((f) => f.slice(dir.length + 1))).toEqual(['realtime.ts']);
    // …and nothing reaches it but listen.ts' dynamic import (a type-only import is erased).
    const reach = sources.filter((f) => /^import (?!type )[^;]*from '\.\/realtime'/m.test(readFileSync(f, 'utf8')));
    expect(reach.map((f) => f.slice(dir.length + 1))).toEqual([]);
    expect(readFileSync(join(dir, 'listen.ts'), 'utf8')).toContain("import('./realtime')");
  });
});

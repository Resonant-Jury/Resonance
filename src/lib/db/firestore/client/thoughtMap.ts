'use client';

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { ThoughtMapEdge, ThoughtMapGroup, ThoughtMapNode } from '@/lib/db/types';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { getClientDb } from './init';

function requireUid(): string {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  return uid;
}

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(0);
}

function nodesCol() {
  return collection(getClientDb(), 'thoughtMaps', requireUid(), 'nodes');
}
function edgesCol() {
  return collection(getClientDb(), 'thoughtMaps', requireUid(), 'edges');
}
function groupsCol() {
  return collection(getClientDb(), 'thoughtMaps', requireUid(), 'groups');
}

function mapNode(id: string, data: Record<string, unknown>): ThoughtMapNode {
  return {
    id,
    cardId: String(data.cardId ?? id),
    x: Number(data.x ?? 0),
    y: Number(data.y ?? 0),
    groupId: (data.groupId as string | null) ?? undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function mapEdge(id: string, data: Record<string, unknown>): ThoughtMapEdge {
  return {
    id,
    sourceCardId: String(data.sourceCardId),
    targetCardId: String(data.targetCardId),
    label: String(data.label ?? ''),
    createdAt: toDate(data.createdAt),
  };
}

function mapGroup(id: string, data: Record<string, unknown>): ThoughtMapGroup {
  return {
    id,
    title: String(data.title ?? ''),
    hue: Number(data.hue ?? 55),
    x: Number(data.x ?? 0),
    y: Number(data.y ?? 0),
    w: Number(data.w ?? 320),
    h: Number(data.h ?? 240),
    createdAt: toDate(data.createdAt),
  };
}

export interface ThoughtMapData {
  nodes: ThoughtMapNode[];
  edges: ThoughtMapEdge[];
  groups: ThoughtMapGroup[];
}

/** The viewer's whole map in one read — boards stay small enough to load whole. */
export async function loadMyThoughtMap(): Promise<ThoughtMapData> {
  const [nodes, edges, groups] = await Promise.all([
    getDocs(nodesCol()),
    getDocs(edgesCol()),
    getDocs(groupsCol()),
  ]);
  return {
    nodes: nodes.docs.map((d) => mapNode(d.id, d.data())),
    edges: edges.docs.map((d) => mapEdge(d.id, d.data())),
    groups: groups.docs.map((d) => mapGroup(d.id, d.data())),
  };
}

/** Place a card on the map. Doc id == card id so re-adding is idempotent. */
export async function addMapNode(cardId: string, x: number, y: number): Promise<void> {
  const batch = writeBatch(getClientDb());
  batch.set(doc(nodesCol(), cardId), {
    cardId,
    x,
    y,
    groupId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function moveMapNode(
  cardId: string,
  x: number,
  y: number,
  groupId: string | null,
): Promise<void> {
  await updateDoc(doc(nodesCol(), cardId), { x, y, groupId, updatedAt: serverTimestamp() });
}

/** Batched position update — used when dragging a group moves its members. */
export async function moveMapNodes(
  moves: { cardId: string; x: number; y: number }[],
): Promise<void> {
  if (moves.length === 0) return;
  const batch = writeBatch(getClientDb());
  for (const m of moves) {
    batch.update(doc(nodesCol(), m.cardId), { x: m.x, y: m.y, updatedAt: serverTimestamp() });
  }
  await batch.commit();
}

/** Batched membership update after a group is resized/deleted or a node lands. */
export async function setNodeGroups(
  changes: { cardId: string; groupId: string | null }[],
): Promise<void> {
  if (changes.length === 0) return;
  const batch = writeBatch(getClientDb());
  for (const c of changes) {
    batch.update(doc(nodesCol(), c.cardId), { groupId: c.groupId, updatedAt: serverTimestamp() });
  }
  await batch.commit();
}

/** Take a card off the map, removing every arrow touching it. */
export async function removeMapNode(cardId: string): Promise<void> {
  const [out, into] = await Promise.all([
    getDocs(query(edgesCol(), where('sourceCardId', '==', cardId))),
    getDocs(query(edgesCol(), where('targetCardId', '==', cardId))),
  ]);
  const batch = writeBatch(getClientDb());
  batch.delete(doc(nodesCol(), cardId));
  for (const d of [...out.docs, ...into.docs]) batch.delete(d.ref);
  await batch.commit();
}

export function edgeId(sourceCardId: string, targetCardId: string): string {
  return `${sourceCardId}_${targetCardId}`;
}

/** Draw an arrow between two cards on the map. Idempotent per direction. */
export async function createMapEdge(
  sourceCardId: string,
  targetCardId: string,
  label = '',
): Promise<string> {
  if (sourceCardId === targetCardId) throw new Error('Self-link');
  const id = edgeId(sourceCardId, targetCardId);
  const batch = writeBatch(getClientDb());
  batch.set(doc(edgesCol(), id), {
    sourceCardId,
    targetCardId,
    label,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  return id;
}

export async function updateMapEdgeLabel(id: string, label: string): Promise<void> {
  await updateDoc(doc(edgesCol(), id), { label });
}

export async function removeMapEdge(id: string): Promise<void> {
  await deleteDoc(doc(edgesCol(), id));
}

export async function createMapGroup(input: {
  title: string;
  hue: number;
  x: number;
  y: number;
  w: number;
  h: number;
}): Promise<string> {
  const ref = doc(groupsCol());
  const batch = writeBatch(getClientDb());
  batch.set(ref, { ...input, createdAt: serverTimestamp() });
  await batch.commit();
  return ref.id;
}

export async function updateMapGroup(
  id: string,
  patch: Partial<Pick<ThoughtMapGroup, 'title' | 'hue' | 'x' | 'y' | 'w' | 'h'>>,
): Promise<void> {
  await updateDoc(doc(groupsCol(), id), patch);
}

/** Delete a group region; member nodes stay on the map but become unfiled. */
export async function removeMapGroup(id: string): Promise<void> {
  const members = await getDocs(query(nodesCol(), where('groupId', '==', id)));
  const batch = writeBatch(getClientDb());
  batch.delete(doc(groupsCol(), id));
  for (const d of members.docs) {
    batch.update(d.ref, { groupId: null, updatedAt: serverTimestamp() });
  }
  await batch.commit();
}

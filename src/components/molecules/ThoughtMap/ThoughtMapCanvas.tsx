'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { HandDrawnDashedSurface } from '@/components/atoms/HandDrawnDashedBorder/HandDrawnDashedBorder';
import { Icon } from '@/components/atoms/Icon';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { TagPill } from '@/components/atoms/TagPill/TagPill';
import { Divider } from '@/components/atoms/Divider/Divider';
import { Input } from '@/components/atoms/Field/Field';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { arrowHeadPath, organicEdgePath } from '@/lib/design/edgePath';
import { seedFromString } from '@/lib/design/prng';
import { INK, INK_LIGHT, INK_STRONG } from '@/lib/design/strokes';
import type { Card } from '@/lib/db/types';
import type { MyThoughtMap } from '@/lib/data/hooks';
import {
  addMapNode,
  createMapEdge,
  createMapGroup,
  edgeId,
  moveMapNode,
  moveMapNodes,
  removeMapEdge,
  removeMapGroup,
  removeMapNode,
  setNodeGroups,
  updateMapEdgeLabel,
  updateMapGroup,
} from '@/lib/db/firestore/client/thoughtMap';
import {
  containingGroupId,
  dragMembership,
  fitCamera,
  inflateRect,
  nodeRect,
  rectCenter,
  rectContains,
  screenToWorld,
  zoomAt,
  NODE_H,
  NODE_W,
  type Camera,
} from './mapMath';
import { ThoughtMapNode, nodeHue } from './ThoughtMapNode';
import styles from './ThoughtMap.module.css';

const GROUP_HUES = [88, 215, 290, 140, 55, 18];
const GRID = 26;

interface NodeState {
  cardId: string;
  x: number;
  y: number;
  groupId: string | null;
}
interface EdgeState {
  id: string;
  sourceCardId: string;
  targetCardId: string;
  label: string;
}
interface GroupState {
  id: string;
  title: string;
  hue: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

type Selection = { kind: 'node' | 'edge' | 'group'; id: string } | null;

type Drag =
  | { kind: 'pan'; px: number; py: number; camX: number; camY: number; moved: boolean }
  | { kind: 'node'; id: string; dx: number; dy: number; px: number; py: number; moved: boolean }
  | {
      kind: 'group';
      id: string;
      dx: number;
      dy: number;
      members: { id: string; dx: number; dy: number }[];
      px: number;
      py: number;
      moved: boolean;
    }
  | { kind: 'resize'; id: string; px: number; py: number; moved: boolean }
  | { kind: 'link'; sourceId: string };

const swallow = (err: unknown) => console.error('[thoughtMap] persist failed', err);

export interface ThoughtMapCanvasProps {
  data: MyThoughtMap;
  style?: CSSProperties;
  /**
   * Edge-to-edge mode: drops the rounded hand-drawn card frame so the dotted
   * ground bleeds to the container's edges, and nudges the top toolbar below
   * the app header. Used by the full-screen map page and the write workspace.
   */
  flush?: boolean;
}

/**
 * The Heptabase-style board: pan/zoom camera, draggable card nodes, labeled
 * organic arrows and category regions. State is optimistic-local; every
 * gesture that settles (drag end, label blur, …) writes through to the
 * owner's `thoughtMaps` subcollections.
 */
export function ThoughtMapCanvas({ data, style, flush = false }: ThoughtMapCanvasProps) {
  const t = useTranslations('me.thoughtMap');
  const router = useRouter();

  const [nodes, setNodes] = useState<Record<string, NodeState>>(() =>
    Object.fromEntries(
      data.nodes.map((n) => [
        n.cardId,
        { cardId: n.cardId, x: n.x, y: n.y, groupId: n.groupId ?? null },
      ]),
    ),
  );
  const [edges, setEdges] = useState<Record<string, EdgeState>>(() =>
    Object.fromEntries(
      data.edges.map((e) => [
        e.id,
        { id: e.id, sourceCardId: e.sourceCardId, targetCardId: e.targetCardId, label: e.label },
      ]),
    ),
  );
  const [groups, setGroups] = useState<Record<string, GroupState>>(() =>
    Object.fromEntries(
      data.groups.map((g) => [
        g.id,
        { id: g.id, title: g.title, hue: g.hue, x: g.x, y: g.y, w: g.w, h: g.h },
      ]),
    ),
  );

  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, s: 1 });
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  const [selection, setSelection] = useState<Selection>(null);
  const [linkDraft, setLinkDraft] = useState<{ sourceId: string; wx: number; wy: number } | null>(
    null,
  );
  const [trayOpen, setTrayOpen] = useState(false);
  const [panning, setPanning] = useState(false);
  /** Card being dragged right now — its group lights up like a drop folder. */
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState('');
  /** Group whose title is being edited in place (on the region itself). */
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupTitleDraft, setGroupTitleDraft] = useState('');

  const dragRef = useRef<Drag | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const { w: vw, h: vh } = useElementSize(viewportRef);
  const fittedRef = useRef(false);

  // Frame the existing content once the viewport has a size.
  useEffect(() => {
    if (fittedRef.current || !vw || !vh) return;
    fittedRef.current = true;
    const rects = [
      ...Object.values(nodes).map(nodeRect),
      ...Object.values(groups).map((g) => ({ x: g.x, y: g.y, w: g.w, h: g.h })),
    ];
    setCamera(fitCamera(rects, vw, vh));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vw, vh]);

  // Wheel: trackpad/wheel pans, ctrl/cmd (and pinch) zooms about the cursor.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      setCamera((cam) =>
        e.ctrlKey || e.metaKey
          ? zoomAt(cam, px, py, Math.exp(-e.deltaY * 0.002))
          : { ...cam, x: cam.x - e.deltaX, y: cam.y - e.deltaY },
      );
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Sync the inspector's text field whenever the selection changes.
  useEffect(() => {
    if (selection?.kind === 'edge') setLabelDraft(edges[selection.id]?.label ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  const groupRects = useMemo(() => Object.values(groups), [groups]);

  const localPoint = (e: { clientX: number; clientY: number }) => {
    const r = viewportRef.current!.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  };

  const capture = (e: ReactPointerEvent) => {
    // Capture keeps fast drags from escaping the viewport; some browsers throw
    // for already-released pointers, and losing capture only degrades softly.
    try {
      viewportRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  const markMoved = (drag: { px: number; py: number; moved: boolean }, px: number, py: number) => {
    if (!drag.moved && Math.hypot(px - drag.px, py - drag.py) > 4) drag.moved = true;
  };

  // --- gesture starts -------------------------------------------------------

  const startPan = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const { px, py } = localPoint(e);
    dragRef.current = { kind: 'pan', px, py, camX: camera.x, camY: camera.y, moved: false };
    capture(e);
    setPanning(true);
  };

  const startNodeDrag = (id: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const { px, py } = localPoint(e);
    const w = screenToWorld(cameraRef.current, px, py);
    const n = nodes[id];
    dragRef.current = { kind: 'node', id, dx: w.x - n.x, dy: w.y - n.y, px, py, moved: false };
    setDragNodeId(id);
    capture(e);
  };

  const startLink = (id: string) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const { px, py } = localPoint(e);
    const w = screenToWorld(cameraRef.current, px, py);
    dragRef.current = { kind: 'link', sourceId: id };
    setLinkDraft({ sourceId: id, wx: w.x, wy: w.y });
    capture(e);
  };

  const startGroupDrag = (id: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const { px, py } = localPoint(e);
    const w = screenToWorld(cameraRef.current, px, py);
    const g = groups[id];
    const members = Object.values(nodes)
      .filter((n) => n.groupId === id)
      .map((n) => ({ id: n.cardId, dx: w.x - n.x, dy: w.y - n.y }));
    dragRef.current = { kind: 'group', id, dx: w.x - g.x, dy: w.y - g.y, members, px, py, moved: false };
    capture(e);
  };

  const startResize = (id: string) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const { px, py } = localPoint(e);
    dragRef.current = { kind: 'resize', id, px, py, moved: false };
    capture(e);
  };

  // --- gesture progress / end -----------------------------------------------

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const { px, py } = localPoint(e);
    const w = screenToWorld(cameraRef.current, px, py);
    switch (drag.kind) {
      case 'pan':
        markMoved(drag, px, py);
        setCamera((cam) => ({ ...cam, x: drag.camX + (px - drag.px), y: drag.camY + (py - drag.py) }));
        break;
      case 'node':
        markMoved(drag, px, py);
        setNodes((prev) => {
          const cur = prev[drag.id];
          const pos = { x: w.x - drag.dx, y: w.y - drag.dy };
          // Folder hysteresis: stay filed (and clipped) while overlapping the
          // region, adopt a region only once fully inside it.
          const groupId = dragMembership(
            { ...pos, w: NODE_W, h: NODE_H },
            cur.groupId,
            groupRects,
          );
          return { ...prev, [drag.id]: { ...cur, ...pos, groupId } };
        });
        break;
      case 'group': {
        markMoved(drag, px, py);
        setGroups((prev) => ({
          ...prev,
          [drag.id]: { ...prev[drag.id], x: w.x - drag.dx, y: w.y - drag.dy },
        }));
        setNodes((prev) => {
          const next = { ...prev };
          for (const m of drag.members) {
            next[m.id] = { ...next[m.id], x: w.x - m.dx, y: w.y - m.dy };
          }
          return next;
        });
        break;
      }
      case 'resize':
        markMoved(drag, px, py);
        setGroups((prev) => {
          const g = prev[drag.id];
          return {
            ...prev,
            [drag.id]: {
              ...g,
              w: Math.max(NODE_W + 60, w.x - g.x),
              h: Math.max(NODE_H + 80, w.y - g.y),
            },
          };
        });
        break;
      case 'link':
        setLinkDraft({ sourceId: drag.sourceId, wx: w.x, wy: w.y });
        break;
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setPanning(false);
    setDragNodeId(null);
    if (!drag) return;
    const { px, py } = localPoint(e);
    const w = screenToWorld(cameraRef.current, px, py);

    switch (drag.kind) {
      case 'pan':
        if (!drag.moved) {
          setSelection(null);
          setTrayOpen(false);
        }
        break;
      case 'node': {
        if (!drag.moved) {
          setSelection({ kind: 'node', id: drag.id });
          break;
        }
        const n = nodes[drag.id];
        const pos = { x: w.x - drag.dx, y: w.y - drag.dy };
        // The live membership was maintained move-by-move; resolve once more
        // from the final position and persist.
        const groupId = dragMembership(
          { ...pos, w: NODE_W, h: NODE_H },
          n?.groupId ?? null,
          groupRects,
        );
        setNodes((prev) => ({ ...prev, [drag.id]: { ...prev[drag.id], ...pos, groupId } }));
        if (n) moveMapNode(drag.id, pos.x, pos.y, groupId).catch(swallow);
        break;
      }
      case 'group': {
        if (!drag.moved) {
          // A plain click on the title starts renaming right on the region.
          setSelection({ kind: 'group', id: drag.id });
          setGroupTitleDraft(groups[drag.id]?.title ?? '');
          setEditingGroupId(drag.id);
          break;
        }
        const g = { x: w.x - drag.dx, y: w.y - drag.dy };
        updateMapGroup(drag.id, g).catch(swallow);
        moveMapNodes(
          drag.members.map((m) => ({ cardId: m.id, x: w.x - m.dx, y: w.y - m.dy })),
        ).catch(swallow);
        break;
      }
      case 'resize': {
        const g = groups[drag.id];
        if (g) {
          updateMapGroup(drag.id, { w: g.w, h: g.h }).catch(swallow);
          reconcileMemberships();
        }
        break;
      }
      case 'link': {
        setLinkDraft(null);
        const target = Object.values(nodes).find(
          (n) => n.cardId !== drag.sourceId && rectContains(nodeRect(n), w),
        );
        if (!target) break;
        const id = edgeId(drag.sourceId, target.cardId);
        if (edges[id]) {
          setSelection({ kind: 'edge', id });
          break;
        }
        setEdges((prev) => ({
          ...prev,
          [id]: { id, sourceCardId: drag.sourceId, targetCardId: target.cardId, label: '' },
        }));
        setSelection({ kind: 'edge', id });
        createMapEdge(drag.sourceId, target.cardId).catch(swallow);
        break;
      }
    }
  };

  /** After a region changes shape, re-file every node by containment. */
  const reconcileMemberships = () => {
    setNodes((prev) => {
      const changes: { cardId: string; groupId: string | null }[] = [];
      const next = { ...prev };
      for (const n of Object.values(prev)) {
        const gid = containingGroupId(rectCenter(nodeRect(n)), Object.values(groups));
        if (gid !== n.groupId) {
          next[n.cardId] = { ...n, groupId: gid };
          changes.push({ cardId: n.cardId, groupId: gid });
        }
      }
      if (changes.length) setNodeGroups(changes).catch(swallow);
      return changes.length ? next : prev;
    });
  };

  // --- actions ---------------------------------------------------------------

  const addCard = (card: Card) => {
    const center = screenToWorld(cameraRef.current, vw / 2, vh / 2);
    const count = Object.keys(nodes).length;
    const pos = {
      x: center.x - NODE_W / 2 + (count % 5) * 28,
      y: center.y - NODE_H / 2 + (count % 5) * 22,
    };
    const groupId = containingGroupId(
      { x: pos.x + NODE_W / 2, y: pos.y + NODE_H / 2 },
      groupRects,
    );
    setNodes((prev) => ({ ...prev, [card.id]: { cardId: card.id, ...pos, groupId } }));
    // Close the picker so the freshly placed card (it lands at the viewport
    // center, right where the picker sits) is immediately visible.
    setTrayOpen(false);
    addMapNode(card.id, pos.x, pos.y)
      .then(() => (groupId ? setNodeGroups([{ cardId: card.id, groupId }]) : undefined))
      .catch(swallow);
  };

  const addGroup = async () => {
    const center = screenToWorld(cameraRef.current, vw / 2, vh / 2);
    const input = {
      title: t('newGroup'),
      hue: GROUP_HUES[Object.keys(groups).length % GROUP_HUES.length],
      x: center.x - 230,
      y: center.y - 170,
      w: 460,
      h: 340,
    };
    try {
      const id = await createMapGroup(input);
      setGroups((prev) => ({ ...prev, [id]: { id, ...input } }));
      setSelection({ kind: 'group', id });
      // A fresh region starts in rename mode — the name is the first decision.
      setGroupTitleDraft(input.title);
      setEditingGroupId(id);
    } catch (err) {
      swallow(err);
    }
  };

  const clearSelectionOf = (kind: 'node' | 'edge' | 'group', id: string) =>
    setSelection((s) => (s?.kind === kind && s.id === id ? null : s));

  const removeNodeById = (id: string) => {
    clearSelectionOf('node', id);
    setNodes((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setEdges((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(([, e]) => e.sourceCardId !== id && e.targetCardId !== id),
      ),
    );
    removeMapNode(id).catch(swallow);
  };

  const removeEdgeById = (id: string) => {
    clearSelectionOf('edge', id);
    setEdges((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    removeMapEdge(id).catch(swallow);
  };

  const removeGroupById = (id: string) => {
    clearSelectionOf('group', id);
    if (editingGroupId === id) setEditingGroupId(null);
    setGroups((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setNodes((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([k, n]) => [
          k,
          n.groupId === id ? { ...n, groupId: null } : n,
        ]),
      ),
    );
    removeMapGroup(id).catch(swallow);
  };

  const removeSelection = () => {
    if (!selection) return;
    const { kind, id } = selection;
    if (kind === 'node') removeNodeById(id);
    else if (kind === 'edge') removeEdgeById(id);
    else removeGroupById(id);
  };

  // Delete/Backspace removes the selected node/arrow/region — unless the user
  // is typing in the inspector's text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (!selection) return;
      e.preventDefault();
      removeSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, nodes, edges, groups]);

  const commitLabel = () => {
    if (selection?.kind === 'edge') {
      const v = labelDraft.trim();
      setEdges((prev) => ({ ...prev, [selection.id]: { ...prev[selection.id], label: v } }));
      updateMapEdgeLabel(selection.id, v).catch(swallow);
    }
  };

  /** Commit the in-place group rename (blur / Enter). */
  const commitGroupTitle = () => {
    const id = editingGroupId;
    if (!id) return;
    setEditingGroupId(null);
    if (!groups[id]) return;
    const v = groupTitleDraft.trim() || t('newGroup');
    setGroups((prev) => ({ ...prev, [id]: { ...prev[id], title: v } }));
    updateMapGroup(id, { title: v }).catch(swallow);
  };

  const openCard = (card: Card) => {
    router.push(card.publishedAt ? `/card/${card.slug ?? card.id}` : `/write/${card.id}`);
  };

  const zoom = (factor: number) => setCamera((cam) => zoomAt(cam, vw / 2, vh / 2, factor));
  const fit = () => {
    const rects = [
      ...Object.values(nodes).map(nodeRect),
      ...Object.values(groups).map((g) => ({ x: g.x, y: g.y, w: g.w, h: g.h })),
    ];
    setCamera(fitCamera(rects, vw, vh));
  };

  // --- derived render data ----------------------------------------------------

  const trayCards = useMemo(
    () =>
      Object.values(data.cards)
        .filter((c) => !nodes[c.id])
        .sort(
          (a, b) => (b.publishedAt?.getTime() ?? Infinity) - (a.publishedAt?.getTime() ?? Infinity),
        ),
    [data.cards, nodes],
  );

  const linkTargetId = useMemo(() => {
    if (!linkDraft) return null;
    const p = { x: linkDraft.wx, y: linkDraft.wy };
    return (
      Object.values(nodes).find(
        (n) => n.cardId !== linkDraft.sourceId && rectContains(nodeRect(n), p),
      )?.cardId ?? null
    );
  }, [linkDraft, nodes]);

  const isEmpty = Object.keys(nodes).length === 0 && Object.keys(groups).length === 0;

  // The draft arrow inherits its source card's hue, so the stroke you pull out
  // visibly belongs to that card (matches the node's own border color).
  const linkSourceCard = linkDraft ? data.cards[linkDraft.sourceId] : undefined;
  const linkColor = linkSourceCard
    ? `oklch(52% 0.11 ${nodeHue(linkSourceCard)})`
    : 'var(--color-terracotta)';

  const renderNode = (n: NodeState, x: number, y: number) => {
    const card = data.cards[n.cardId];
    if (!card) return null;
    return (
      <ThoughtMapNode
        key={n.cardId}
        card={card}
        x={x}
        y={y}
        selected={selection?.kind === 'node' && selection.id === n.cardId}
        linkTarget={linkTargetId === n.cardId}
        dragging={dragNodeId === n.cardId}
        onPointerDown={startNodeDrag(n.cardId)}
        onStartLink={startLink(n.cardId)}
        onOpen={() => openCard(card)}
        onRemove={() => removeNodeById(n.cardId)}
        linkHandleLabel={t('linkHandle')}
        openLabel={t('open')}
        removeLabel={t('removeFromMap')}
      />
    );
  };

  const { w: boardW, h: boardH } = useElementSize(boardRef);

  return (
    <div
      ref={boardRef}
      className={[styles.board, flush && styles.flush].filter(Boolean).join(' ')}
      data-linking={linkDraft ? true : undefined}
      style={style}
    >
      {!flush && (
        <HandDrawnBorder
          w={boardW}
          h={boardH}
          R={26}
          seed={47}
          fillColor="var(--color-card-bg)"
          strokeColor="var(--field-border)"
          strokeWidth={INK_LIGHT}
          curve={0.6}
        />
      )}
      <div
        ref={viewportRef}
        className={styles.viewport}
        data-panning={panning || undefined}
        style={{
          backgroundPosition: `${camera.x}px ${camera.y}px`,
          backgroundSize: `${GRID * camera.s}px ${GRID * camera.s}px`,
        }}
        onPointerDown={startPan}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className={styles.world}
          style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.s})` }}
        >
          {Object.values(groups).map((g) => {
            const sel = selection?.kind === 'group' && selection.id === g.id;
            // The folder lights up while a dragged card is filed in it.
            const hot = dragNodeId != null && nodes[dragNodeId]?.groupId === g.id;
            return (
              <div
                key={g.id}
                className={styles.groupBox}
                style={{ left: g.x, top: g.y, width: g.w, height: g.h, pointerEvents: 'none' }}
              >
                <HandDrawnBorder
                  w={g.w}
                  h={g.h}
                  R={34}
                  seed={seedFromString(g.id)}
                  fillColor={`oklch(96.5% 0.032 ${g.hue} / ${hot ? 0.92 : 0.78})`}
                  strokeColor={sel || hot ? `oklch(45% 0.1 ${g.hue})` : `oklch(60% 0.085 ${g.hue})`}
                  strokeWidth={sel || hot ? INK_STRONG : INK_LIGHT}
                  curve={0.6}
                  cornerOffset={5}
                />
                {editingGroupId === g.id ? (
                  <input
                    className={styles.groupTitleInput}
                    style={{ pointerEvents: 'auto' }}
                    value={groupTitleDraft}
                    placeholder={t('groupTitlePlaceholder')}
                    autoFocus
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setGroupTitleDraft(e.target.value)}
                    onBlur={commitGroupTitle}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      else if (e.key === 'Escape') setEditingGroupId(null);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div
                    className={styles.groupTitle}
                    style={{ pointerEvents: 'auto' }}
                    onPointerDown={startGroupDrag(g.id)}
                  >
                    {g.title}
                  </div>
                )}
                <button
                  type="button"
                  className={styles.groupDelete}
                  style={{ pointerEvents: 'auto' }}
                  aria-label={t('deleteGroup')}
                  title={t('deleteGroup')}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => removeGroupById(g.id)}
                >
                  <Icon name="trash" size={15} />
                </button>
                <button
                  type="button"
                  className={styles.groupResize}
                  style={{ pointerEvents: 'auto' }}
                  aria-label={t('resizeGroup')}
                  onPointerDown={startResize(g.id)}
                />
              </div>
            );
          })}

          {/* 1×1, not 0×0 — Chrome skips painting a zero-sized svg entirely,
              overflow: visible notwithstanding. */}
          <svg className={styles.edgeLayer} width={1} height={1} aria-hidden="true">
            {Object.values(edges).map((edge) => {
              const s = nodes[edge.sourceCardId];
              const target = nodes[edge.targetCardId];
              if (!s || !target) return null;
              const seed = seedFromString(edge.id);
              const geo = organicEdgePath(nodeRect(s), nodeRect(target), seed);
              const sel = selection?.kind === 'edge' && selection.id === edge.id;
              // Selection darkens the ink rather than jumping to the accent.
              const color = sel ? 'oklch(28% 0.05 60)' : 'oklch(46% 0.045 60)';
              return (
                <g key={edge.id}>
                  <path
                    d={geo.d}
                    className={styles.edgeHit}
                    stroke="transparent"
                    strokeWidth={16}
                    fill="none"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelection({ kind: 'edge', id: edge.id });
                    }}
                  />
                  <path
                    d={geo.d}
                    stroke={color}
                    strokeWidth={sel ? INK_STRONG : INK_LIGHT}
                    fill="none"
                    strokeLinecap="round"
                  />
                  <path
                    d={arrowHeadPath(geo.end, geo.endAngle, 13, seed + 7)}
                    stroke={color}
                    strokeWidth={sel ? INK_STRONG : INK_LIGHT}
                    fill="none"
                    strokeLinecap="round"
                  />
                </g>
              );
            })}
          </svg>

          {Object.values(edges).map((edge) => {
            const s = nodes[edge.sourceCardId];
            const target = nodes[edge.targetCardId];
            if (!s || !target) return null;
            const sel = selection?.kind === 'edge' && selection.id === edge.id;
            if (!edge.label && !sel) return null;
            const geo = organicEdgePath(nodeRect(s), nodeRect(target), seedFromString(edge.id));
            return (
              <div
                key={`label-${edge.id}`}
                className={styles.edgeLabelWrap}
                style={{ left: geo.mid.x, top: geo.mid.y }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <TagPill
                  size="sm"
                  color={sel ? 'oklch(88% 0.03 60)' : 'oklch(94% 0.02 75)'}
                  onClick={() => setSelection({ kind: 'edge', id: edge.id })}
                >
                  {edge.label || t('edgeLabelPlaceholder')}
                </TagPill>
              </div>
            );
          })}

          {/* Filed cards render inside their region's clip layer, so dragging
              one across the boundary crops it folder-style until it's fully
              out. Free cards render directly in the world. */}
          {Object.values(groups).map((g) => {
            const members = Object.values(nodes).filter((n) => n.groupId === g.id);
            if (members.length === 0) return null;
            return (
              <div
                key={`clip-${g.id}`}
                className={styles.groupClip}
                style={{ left: g.x, top: g.y, width: g.w, height: g.h }}
              >
                {members.map((n) => renderNode(n, n.x - g.x, n.y - g.y))}
              </div>
            );
          })}
          {Object.values(nodes)
            .filter((n) => !n.groupId || !groups[n.groupId])
            .map((n) => renderNode(n, n.x, n.y))}

          {/* Topmost hint layer: the live draft arrow and docking points. */}
          {/* 1×1, not 0×0 — Chrome skips painting a zero-sized svg entirely,
              overflow: visible notwithstanding. */}
          <svg className={styles.edgeLayer} width={1} height={1} aria-hidden="true">
            {linkDraft &&
              nodes[linkDraft.sourceId] &&
              (() => {
                const srcRect = nodeRect(nodes[linkDraft.sourceId]);
                const seed = seedFromString(linkDraft.sourceId);
                // Once the cursor reaches a card, the arrow docks onto its
                // facing edge — previewing exactly the connection to come.
                const geo =
                  linkTargetId && nodes[linkTargetId]
                    ? organicEdgePath(srcRect, nodeRect(nodes[linkTargetId]), seed)
                    : organicEdgePath(
                        srcRect,
                        { x: linkDraft.wx - 1, y: linkDraft.wy - 1, w: 2, h: 2 },
                        seed,
                      );
                return (
                  <g>
                    <path
                      d={geo.d}
                      stroke={linkColor}
                      strokeWidth={INK_STRONG}
                      strokeDasharray={linkTargetId ? undefined : '7 6'}
                      fill="none"
                      strokeLinecap="round"
                    />
                    <path
                      d={arrowHeadPath(geo.end, geo.endAngle, 15, seed + 7)}
                      stroke={linkColor}
                      strokeWidth={INK_STRONG}
                      fill="none"
                      strokeLinecap="round"
                    />
                  </g>
                );
              })()}
            {linkDraft &&
              Object.values(nodes)
                .filter(
                  (n) =>
                    n.cardId !== linkDraft.sourceId &&
                    rectContains(inflateRect(nodeRect(n), 90), {
                      x: linkDraft.wx,
                      y: linkDraft.wy,
                    }),
                )
                .map((n) => {
                  const r = nodeRect(n);
                  const docked = linkTargetId === n.cardId;
                  const pts: [number, number][] = [
                    [r.x + r.w / 2, r.y],
                    [r.x + r.w, r.y + r.h / 2],
                    [r.x + r.w / 2, r.y + r.h],
                    [r.x, r.y + r.h / 2],
                  ];
                  return pts.map(([cx, cy], i) => (
                    <circle
                      key={`${n.cardId}-dock-${i}`}
                      cx={cx}
                      cy={cy}
                      r={docked ? 7 : 5.5}
                      fill={docked ? linkColor : 'var(--color-card-bg)'}
                      stroke={linkColor}
                      strokeWidth={INK}
                    />
                  ));
                })}
          </svg>
        </div>
      </div>

      {/* toolbar */}
      <div className={styles.toolbar}>
        <OrganicButton variant="outline" size="sm" onClick={() => void addGroup()}>
          <Icon name="frame" size={15} /> {t('addGroup')}
        </OrganicButton>
        <OrganicButton variant="primary" size="sm" onClick={() => setTrayOpen((v) => !v)}>
          <Icon name="plus" size={15} /> {t('addCard')}
        </OrganicButton>
      </div>

      {/* zoom cluster */}
      <div className={styles.zoomCluster}>
        <button type="button" className={styles.iconButton} aria-label={t('zoomOut')} onClick={() => zoom(1 / 1.25)}>
          <Icon name="minus" size={16} />
        </button>
        <span className={styles.zoomPct}>{Math.round(camera.s * 100)}%</span>
        <button type="button" className={styles.iconButton} aria-label={t('zoomIn')} onClick={() => zoom(1.25)}>
          <Icon name="plus" size={16} />
        </button>
        <button type="button" className={styles.iconButton} aria-label={t('zoomFit')} onClick={fit}>
          <Icon name="eye" size={16} />
        </button>
      </div>

      {/* inspector for the selected arrow (label editing lives here) */}
      {selection && selection.kind === 'edge' && (
        <div className={styles.inspector}>
          <HandDrawnDashedSurface seed={61} state="idle" fillColor="var(--color-card-bg)">
            <div className={styles.inspectorRow}>
              <Input
                variant="subtle"
                className={styles.inspectorInput}
                value={labelDraft}
                placeholder={t('edgeLabelPlaceholder')}
                onChange={(e) => setLabelDraft(e.target.value)}
                onBlur={commitLabel}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                autoFocus
              />
              <button
                type="button"
                className={styles.iconButton}
                aria-label={t('deleteEdge')}
                onClick={removeSelection}
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          </HandDrawnDashedSurface>
        </div>
      )}

      {/* card picker — centered over the board, dismissed by the backdrop */}
      {trayOpen && (
        <div
          className={styles.trayBackdrop}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setTrayOpen(false);
          }}
        >
        <div className={styles.tray}>
          <HandDrawnDashedSurface seed={29} state="idle" fillColor="var(--color-card-bg)">
            <div className={styles.trayInner}>
              <div className={styles.trayTitle}>{t('trayTitle')}</div>
              <Divider seed={31} spacing={4} />
              {trayCards.length === 0 ? (
                <p className={styles.trayEmpty}>{t('trayEmpty')}</p>
              ) : (
                trayCards.map((c) => (
                  <button key={c.id} type="button" className={styles.trayRow} onClick={() => addCard(c)}>
                    <Icon name={c.publishedAt ? 'cards' : 'pen'} size={15} />
                    <span className={styles.trayRowTitle}>{c.thoughtCore}</span>
                    <Icon name="plus" size={14} />
                  </button>
                ))
              )}
            </div>
          </HandDrawnDashedSurface>
        </div>
        </div>
      )}

      {isEmpty && !trayOpen && (
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>{t('empty')}</p>
          <OrganicButton variant="primary" onClick={() => setTrayOpen(true)}>
            <Icon name="plus" size={16} /> {t('addCard')}
          </OrganicButton>
        </div>
      )}
    </div>
  );
}

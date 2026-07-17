'use client';

import {
  Fragment,
  useEffect,
  useLayoutEffect,
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
import { useElementSize } from '@/lib/hooks/useElementSize';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { arrowHeadPath, organicEdgePath } from '@/lib/design/edgePath';
import { seedFromString } from '@/lib/design/prng';
import { wavyLine } from '@/lib/design/wavyPath';
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
  fitCamera,
  inflateRect,
  majorityGroupId,
  nodeRect,
  rectContains,
  resolveOverlap,
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
      /** Press began on the title — a second stationary click there renames. */
      fromTitle: boolean;
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
  /**
   * Takes over「開啟卡片」: the host decides where the card opens (the write
   * workspace shows it in its own right pane). Without it the canvas
   * navigates to the card page / editor.
   */
  onOpenCard?: (card: Card) => void;
}

/**
 * The Heptabase-style board: pan/zoom camera, draggable card nodes, labeled
 * organic arrows and category regions. State is optimistic-local; every
 * gesture that settles (drag end, label blur, …) writes through to the
 * owner's `thoughtMaps` subcollections.
 */
export function ThoughtMapCanvas({ data, style, flush = false, onOpenCard }: ThoughtMapCanvasProps) {
  const t = useTranslations('me.thoughtMap');
  const router = useRouter();
  const isMobile = useIsMobile(640);

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
  /** Edge whose label is being edited in place (on the arrow's own pill). */
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
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

  const startGroupDrag = (id: string, fromTitle = false) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const { px, py } = localPoint(e);
    const w = screenToWorld(cameraRef.current, px, py);
    const g = groups[id];
    const members = Object.values(nodes)
      .filter((n) => n.groupId === id)
      .map((n) => ({ id: n.cardId, dx: w.x - n.x, dy: w.y - n.y }));
    dragRef.current = { kind: 'group', id, dx: w.x - g.x, dy: w.y - g.y, members, px, py, moved: false, fromTitle };
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
          // Majority rule: the card files into (and clips against) a region
          // only while more than half of it sits inside — half out means out.
          const groupId = majorityGroupId({ ...pos, w: NODE_W, h: NODE_H }, groupRects);
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
        // Translucent cards must not rest on top of each other: settle the
        // drop into the nearest clear spot, then re-file from where it landed.
        const pos = resolveOverlap(
          { x: w.x - drag.dx, y: w.y - drag.dy, w: NODE_W, h: NODE_H },
          Object.values(nodes)
            .filter((o) => o.cardId !== drag.id)
            .map(nodeRect),
        );
        const groupId = majorityGroupId({ ...pos, w: NODE_W, h: NODE_H }, groupRects);
        setNodes((prev) => ({ ...prev, [drag.id]: { ...prev[drag.id], ...pos, groupId } }));
        if (n) moveMapNode(drag.id, pos.x, pos.y, groupId).catch(swallow);
        break;
      }
      case 'group': {
        if (!drag.moved) {
          // First stationary click anywhere on the region selects (focuses)
          // it — dragging is then obviously live. Renaming asks for a second
          // click on the title of an already-selected region, so a click
          // meant to grab the region never traps the pointer in an input.
          const wasSelected = selection?.kind === 'group' && selection.id === drag.id;
          setSelection({ kind: 'group', id: drag.id });
          if (wasSelected && drag.fromTitle) {
            setGroupTitleDraft(groups[drag.id]?.title ?? '');
            setEditingGroupId(drag.id);
          }
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
        // A fresh arrow starts in label-edit mode right on the arrow itself —
        // naming the relation is the first decision (same as a new region).
        setLabelDraft('');
        setEditingEdgeId(id);
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
        const gid = majorityGroupId(nodeRect(n), Object.values(groups));
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
    // Stagger from the viewport center, then shove out of any card already
    // sitting there — new cards never land on top of existing ones.
    const pos = resolveOverlap(
      {
        x: center.x - NODE_W / 2 + (count % 5) * 28,
        y: center.y - NODE_H / 2 + (count % 5) * 22,
        w: NODE_W,
        h: NODE_H,
      },
      Object.values(nodes).map(nodeRect),
    );
    const groupId = majorityGroupId({ ...pos, w: NODE_W, h: NODE_H }, groupRects);
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
    if (editingEdgeId === id) setEditingEdgeId(null);
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

  /** Begin renaming an arrow in place, on its own label pill. */
  const startEdgeEdit = (id: string) => {
    setSelection({ kind: 'edge', id });
    setLabelDraft(edges[id]?.label ?? '');
    setEditingEdgeId(id);
  };

  /** Commit the in-place arrow label (blur / Enter). */
  const commitEdgeLabel = () => {
    const id = editingEdgeId;
    if (!id) return;
    setEditingEdgeId(null);
    if (!edges[id]) return;
    const v = labelDraft.trim();
    setEdges((prev) => ({ ...prev, [id]: { ...prev[id], label: v } }));
    updateMapEdgeLabel(id, v).catch(swallow);
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
    if (onOpenCard) {
      onOpenCard(card);
      return;
    }
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
  const resonatedIds = useMemo(() => new Set(data.resonatedIds), [data.resonatedIds]);

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
                data-selected={sel || undefined}
                style={{
                  left: g.x,
                  top: g.y,
                  width: g.w,
                  height: g.h,
                  pointerEvents: 'none',
                  '--group-hue': g.hue,
                } as CSSProperties}
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
                {/* Whole-region grab surface: a click selects (focuses) the
                    region, press-and-move drags it with its cards. Cards and
                    arrows stay interactive — they render in later layers. */}
                <div
                  className={styles.groupHit}
                  style={{ pointerEvents: 'auto' }}
                  onPointerDown={startGroupDrag(g.id)}
                />
                {editingGroupId === g.id ? (
                  <GroupTitleEditor
                    value={groupTitleDraft}
                    placeholder={t('groupTitlePlaceholder')}
                    hue={g.hue}
                    seed={seedFromString(g.id)}
                    onChange={setGroupTitleDraft}
                    onCommit={commitGroupTitle}
                    onCancel={() => setEditingGroupId(null)}
                  />
                ) : (
                  <div
                    className={styles.groupTitle}
                    style={{ pointerEvents: 'auto' }}
                    onPointerDown={startGroupDrag(g.id, true)}
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
                    strokeWidth={sel ? INK_STRONG : INK}
                    fill="none"
                    strokeLinecap="round"
                  />
                  <path
                    d={arrowHeadPath(geo.end, geo.endAngle, 13, seed + 7)}
                    stroke={color}
                    strokeWidth={sel ? INK_STRONG : INK}
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
            const editing = editingEdgeId === edge.id;
            if (!edge.label && !sel && !editing) return null;
            const geo = organicEdgePath(nodeRect(s), nodeRect(target), seedFromString(edge.id));
            return (
              <div
                key={`label-${edge.id}`}
                className={styles.edgeLabelWrap}
                style={{ left: geo.mid.x, top: geo.mid.y }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {editing ? (
                  <EdgeLabelEditor
                    value={labelDraft}
                    placeholder={t('edgeLabelPlaceholder')}
                    deleteLabel={t('deleteEdge')}
                    seed={seedFromString(edge.id)}
                    onChange={setLabelDraft}
                    onCommit={commitEdgeLabel}
                    onCancel={() => setEditingEdgeId(null)}
                    onDelete={() => removeEdgeById(edge.id)}
                  />
                ) : (
                  /* One tap on the pill grows it into the editing badge —
                     input focused, delete riding inside on the right. */
                  <TagPill
                    size="sm"
                    color={sel ? 'oklch(88% 0.03 60)' : 'oklch(94% 0.02 75)'}
                    onClick={() => startEdgeEdit(edge.id)}
                  >
                    {edge.label || t('edgeLabelPlaceholder')}
                  </TagPill>
                )}
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

          {/* Region rims re-inked above the cards: the same wobbly path drawn
              stroke-only, so a card resting against (or sliding across) the
              boundary tucks under the folder's edge instead of covering it. */}
          {Object.values(groups).map((g) => {
            const sel = selection?.kind === 'group' && selection.id === g.id;
            const hot = dragNodeId != null && nodes[dragNodeId]?.groupId === g.id;
            return (
              <div
                key={`outline-${g.id}`}
                className={styles.groupOutline}
                style={{ left: g.x, top: g.y, width: g.w, height: g.h }}
              >
                <HandDrawnBorder
                  w={g.w}
                  h={g.h}
                  R={34}
                  seed={seedFromString(g.id)}
                  strokeColor={sel || hot ? `oklch(45% 0.1 ${g.hue})` : `oklch(60% 0.085 ${g.hue})`}
                  strokeWidth={sel || hot ? INK_STRONG : INK_LIGHT}
                  curve={0.6}
                  cornerOffset={5}
                />
              </div>
            );
          })}

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

      {/* toolbar — phones drop to one-word labels so the pair fits beside the
          zoom cluster without crowding the board */}
      <div className={styles.toolbar}>
        <OrganicButton variant="outline" size="sm" onClick={() => void addGroup()}>
          <Icon name="frame" size={15} /> {isMobile ? t('addGroupShort') : t('addGroup')}
        </OrganicButton>
        <OrganicButton variant="primary" size="sm" onClick={() => setTrayOpen((v) => !v)}>
          <Icon name="plus" size={15} /> {isMobile ? t('addCardShort') : t('addCard')}
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
                trayCards.map((c, i) => (
                  <Fragment key={c.id}>
                    {/* Notification-modal language: rows part with a wavy pen
                        rule, no boxed hover region. */}
                    {i > 0 && <Divider seed={31 + i * 7} spacing={0} />}
                    <button type="button" className={styles.trayRow} onClick={() => addCard(c)}>
                      <Icon
                        name={resonatedIds.has(c.id) ? 'wave' : c.publishedAt ? 'cards' : 'pen'}
                        size={15}
                      />
                      <span className={styles.trayRowTitle}>{c.thoughtCore}</span>
                      <Icon name="plus" size={14} />
                    </button>
                  </Fragment>
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

interface EdgeLabelEditorProps {
  value: string;
  placeholder: string;
  deleteLabel: string;
  seed: number;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onDelete: () => void;
}

/**
 * In-place arrow rename: one tap grows the label pill into a slightly larger
 * badge holding both the text field and the delete button — everything about
 * the connection lives inside its own outline. A hidden mirror span measures
 * the typed width and the hand-drawn badge is redrawn to hug it.
 */
function EdgeLabelEditor({
  value,
  placeholder,
  deleteLabel,
  seed,
  onChange,
  onCommit,
  onCancel,
  onDelete,
}: EdgeLabelEditorProps) {
  const mirrorRef = useRef<HTMLSpanElement>(null);
  const [textW, setTextW] = useState(0);
  useLayoutEffect(() => {
    setTextW(mirrorRef.current?.offsetWidth ?? 0);
  }, [value, placeholder]);

  const h = 28;
  const w = Math.max(72, textW + 16) + 26 + 12;
  return (
    <div className={styles.edgeLabelEdit} style={{ width: w, height: h }}>
      <HandDrawnBorder
        w={w}
        h={h}
        R={h / 2}
        seed={seed + 5}
        fillColor="oklch(88% 0.03 60)"
        strokeColor="oklch(46% 0.045 60)"
        strokeWidth={INK_LIGHT}
      />
      <input
        className={styles.edgeLabelInput}
        value={value}
        placeholder={placeholder}
        autoFocus
        onFocus={(e) => e.target.select()}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          else if (e.key === 'Escape') onCancel();
        }}
      />
      {/* preventDefault keeps the input's blur-commit from racing the delete. */}
      <button
        type="button"
        className={styles.edgeBadgeDelete}
        aria-label={deleteLabel}
        title={deleteLabel}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onDelete}
      >
        <Icon name="trash" size={13} />
      </button>
      <span ref={mirrorRef} className={styles.edgeLabelMirror} aria-hidden>
        {value || placeholder}
      </span>
    </div>
  );
}

interface GroupTitleEditorProps {
  value: string;
  placeholder: string;
  hue: number;
  seed: number;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

/**
 * In-place region rename. Instead of an input-wide dotted rule, a hand-drawn
 * wavy underline follows the text itself: a hidden mirror span measures the
 * typed width, and the curve is redrawn to match — the pen stops where the
 * words stop.
 */
function GroupTitleEditor({ value, placeholder, hue, seed, onChange, onCommit, onCancel }: GroupTitleEditorProps) {
  const mirrorRef = useRef<HTMLSpanElement>(null);
  const [textW, setTextW] = useState(0);
  useLayoutEffect(() => {
    setTextW(mirrorRef.current?.offsetWidth ?? 0);
  }, [value, placeholder]);

  const w = Math.max(32, textW + 8);
  const underline = useMemo(
    () => wavyLine(w, seed + 17, 1.7, Math.max(3, Math.round(w / 46))),
    [w, seed],
  );

  return (
    <div
      className={styles.groupTitleEdit}
      style={{ pointerEvents: 'auto' }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <input
        className={styles.groupTitleInput}
        value={value}
        placeholder={placeholder}
        autoFocus
        onFocus={(e) => e.target.select()}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          else if (e.key === 'Escape') onCancel();
        }}
      />
      <span ref={mirrorRef} className={styles.groupTitleMirror} aria-hidden>
        {value || placeholder}
      </span>
      <svg
        className={styles.groupTitleUnderline}
        width={w}
        height={6}
        viewBox={`0 0 ${w} 6`}
        aria-hidden
      >
        <path
          d={underline}
          transform="translate(0,3)"
          fill="none"
          stroke={`oklch(48% 0.09 ${hue})`}
          strokeWidth={INK_LIGHT}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

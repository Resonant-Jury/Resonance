'use client';

import { ReactNode, useEffect, useRef } from 'react';
import {
  type Oklab,
  type Paint,
  type SeedBlob,
  blobsAt,
  createWorld,
  makeGrid,
  paintColours,
  parseOklch,
  sampleField,
  step,
  traceContours,
} from '@/lib/design/driftingBlobs';
import styles from './DriftingBlobs.module.css';

/** A colour the blobs may take (a tokens.css variable) and how strongly it shows. */
export interface DriftPaint {
  color: string;
  alpha: number;
}

export interface DriftingBlobsProps {
  /** Colours the blobs that come in later are drawn from. */
  palette: readonly DriftPaint[];
  /**
   * The still blobs the server renders (and reduced motion keeps). Each one
   * marked `data-drift="dx,dy"` (its direction of drift) with
   * `data-drift-color` (its tokens.css variable) becomes a live blob where it
   * lies, at its own opacity, and fades away as the live ones take over.
   */
  children: ReactNode;
}

/** Field samples every FIELD px, colour samples every COLOUR px (CSS pixels). */
const FIELD = 6;
const COLOUR = 20;
const FPS = 30;
/** Paper grain over the blobs: ≈ the old OrganiBlob's grain at its opacity. */
const GRAIN = 0.28;
const GRAIN_SCALE = 1.5;
/** How much of a stand-in's box its blob's own radius is (OrganiBlob's paths reach ~0.42 of their size). */
const STAND_IN_RADIUS = 0.42;

const FALLBACK: Oklab = [0.88, 0.04, 0.06];

/**
 * Soft grained blobs drifting behind a section (the landing hero): one
 * canvas, no library — the motion is `lib/design/driftingBlobs`. Sits in a
 * positioned parent, under its content, and reads the pointer over that
 * parent to deepen the blob under it.
 */
export function DriftingBlobs({ palette, children }: DriftingBlobsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const css = getComputedStyle(root);
    const lab = (name: string) => parseOklch(css.getPropertyValue(name)) ?? FALLBACK;
    const paints: Paint[] = palette.map((p) => ({ ink: lab(p.color), alpha: p.alpha }));
    const box = root.getBoundingClientRect();
    let width = Math.max(1, box.width);
    let height = Math.max(1, box.height);

    const seeds: SeedBlob[] = [];
    root.querySelectorAll<HTMLElement>('[data-drift]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      const [dx, dy] = (el.dataset.drift ?? '1,0').split(',').map(Number);
      seeds.push({
        x: r.left - box.left + r.width / 2,
        y: r.top - box.top + r.height / 2,
        R: r.width * STAND_IN_RADIUS,
        paint: { ink: lab(el.dataset.driftColor ?? ''), alpha: Number(getComputedStyle(el).opacity) || 0.3 },
        drift: [dx || 0, dy || 0],
      });
    });

    const world = createWorld({
      width,
      height,
      seed: Math.floor(Math.random() * 9973) + 1,
      palette: paints,
      paper: lab('--color-cream'),
      blobs: seeds,
    });

    let field = makeGrid(width, height, FIELD);
    let colours = makeGrid(width, height, COLOUR);
    const colourCanvas = document.createElement('canvas');
    const colourCtx = colourCanvas.getContext('2d');
    let colourData: ImageData | null = null;
    let dpr = 1;

    const size = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      field = makeGrid(width, height, FIELD);
      colours = makeGrid(width, height, COLOUR);
      colourCanvas.width = colours.nx;
      colourCanvas.height = colours.ny;
      colourData = colourCtx?.createImageData(colours.nx, colours.ny) ?? null;
      world.width = width;
      world.height = height;
    };
    size();

    // Paper grain, made once: black specks of random strength.
    const noise = document.createElement('canvas');
    noise.width = noise.height = 160;
    const noiseCtx = noise.getContext('2d');
    if (noiseCtx) {
      const img = noiseCtx.createImageData(160, 160);
      for (let i = 0; i < img.data.length; i += 4) img.data[i + 3] = 255 * 0.4 * ((Math.random() + Math.random()) / 2);
      noiseCtx.putImageData(img, 0, 0);
    }
    const grain = ctx.createPattern(noise, 'repeat');

    let pointer: { x: number; y: number } | null = null;
    const host = root.parentElement ?? root;
    const onMove = (e: PointerEvent) => {
      pointer = e.pointerType === 'mouse' ? { x: e.clientX, y: e.clientY } : null;
    };
    const onLeave = () => {
      pointer = null;
    };
    host.addEventListener('pointermove', onMove, { passive: true });
    host.addEventListener('pointerleave', onLeave, { passive: true });

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      sampleField(world, field);
      const loops = traceContours(field);
      if (!loops.length) return;
      const outline = new Path2D();
      for (const l of loops) {
        // Quadratic curves through the midpoints of the traced polygon.
        const n = l.length / 2;
        const mx = (i: number) => (l[2 * i] + l[2 * ((i + 1) % n)]) / 2;
        const my = (i: number) => (l[2 * i + 1] + l[2 * ((i + 1) % n) + 1]) / 2;
        outline.moveTo(mx(n - 1), my(n - 1));
        for (let i = 0; i < n; i++) outline.quadraticCurveTo(l[2 * i], l[2 * i + 1], mx(i), my(i));
        outline.closePath();
      }
      ctx.save();
      ctx.clip(outline, 'evenodd');
      if (colourCtx && colourData) {
        paintColours(world, colours, colourData.data);
        colourCtx.putImageData(colourData, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        const c = colours.cell;
        ctx.drawImage(colourCanvas, colours.x0 - c / 2, colours.y0 - c / 2, colours.nx * c, colours.ny * c);
      }
      if (grain) {
        ctx.globalAlpha = GRAIN;
        ctx.scale(GRAIN_SCALE, GRAIN_SCALE);
        ctx.fillStyle = grain;
        ctx.fillRect(0, 0, width / GRAIN_SCALE, height / GRAIN_SCALE);
      }
      ctx.restore();
    };

    let raf = 0;
    let last = 0;
    let onScreen = true;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 1000 / FPS - 2) return;
      const dt = last ? (now - last) / 1000 : 0;
      last = now;
      if (pointer) {
        const r = root.getBoundingClientRect();
        world.hovered = blobsAt(world, pointer.x - r.left, pointer.y - r.top);
      } else if (world.hovered.size) {
        world.hovered = new Set();
      }
      step(world, dt);
      draw();
    };
    const run = () => {
      if (raf || !onScreen || document.hidden) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };
    const halt = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    draw();
    root.dataset.live = '';
    run();

    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) run();
      else halt();
    });
    io.observe(root);
    const onVisibility = () => (document.hidden ? halt() : run());
    document.addEventListener('visibilitychange', onVisibility);
    const ro = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect;
      if (!w || !h || (Math.abs(w - width) < 1 && Math.abs(h - height) < 1)) return;
      width = w;
      height = h;
      size();
      draw();
    });
    ro.observe(root);

    return () => {
      halt();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      delete root.dataset.live;
    };
  }, [palette]);

  return (
    <div ref={rootRef} className={styles.root} aria-hidden="true">
      {children}
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
}

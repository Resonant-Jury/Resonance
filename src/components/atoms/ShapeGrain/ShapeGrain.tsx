'use client';

import { useId } from 'react';

export interface ShapeGrainProps {
  w: number;
  h: number;
  d: string;
  opacity?: number;
  frequency?: number;
  seed?: number;
  zIndex?: number;
}

export function ShapeGrain({
  w,
  h,
  d,
  opacity = 0.2,
  frequency = 0.9,
  seed = 1,
  zIndex = 0,
}: ShapeGrainProps) {
  const id = useId().replace(/:/g, '');
  if (!w || !h || !d) return null;
  return (
    <svg
      aria-hidden="true"
      className="res-shape-fade-in"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        zIndex,
        overflow: 'visible',
      }}
    >
      <defs>
        <filter id={`sg-${id}`} x="0%" y="0%" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency={frequency}
            numOctaves={2}
            stitchTiles="stitch"
            seed={seed}
          />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="linear" slope={opacity} />
          </feComponentTransfer>
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <clipPath id={`sgc-${id}`}>
          <path d={d} />
        </clipPath>
      </defs>
      <g clipPath={`url(#sgc-${id})`}>
        <path d={d} fill="black" filter={`url(#sg-${id})`} />
      </g>
    </svg>
  );
}
